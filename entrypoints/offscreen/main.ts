// Offscreen recorder. A service worker cannot run MediaRecorder, so the background worker hands
// this hidden page a tabCapture stream id. The tab video is cropped to one device's screen on a
// canvas and recorded; the finished file goes to IndexedDB for the review page.
import type {
  OffscreenMessage,
  OffscreenStartResponse,
  OffscreenStopResponse,
  RecordStartOptions,
} from '@/lib/messages';
import { saveRecording } from '@/lib/recordingStore';

/**
 * Quality presets. `longSide` is the most video pixels along the longer side (a smaller device is
 * never scaled up); `bpp` is bits per pixel per frame, which sets the bitrate.
 */
const QUALITY = {
  good: { longSide: 1280, bpp: 0.08 }, // HD 720p
  better: { longSide: 1920, bpp: 0.1 }, // Full HD 1080p
  best: { longSide: 2560, bpp: 0.12 }, // 2K 1440p
} as const;
const MIN_BITRATE = 1_500_000;
/** Above this a screen recording gets bigger, not visibly better. */
const MAX_BITRATE = 12_000_000;
const AUDIO_BITRATE = 128_000;
/**
 * In order of preference. MP4 (H.264) plays everywhere. For WebM, VP8 comes before VP9: without a
 * hardware encoder VP9 costs several times more CPU, which is what made long recordings heavy.
 */
const VIDEO_MIME_TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
];
/** With a sound track the codec list names the audio codec too (AAC for MP4, Opus for WebM). */
const AUDIO_MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=opus',
];
/** If the encoder never reports that it finished, give up waiting after this long. */
const STOP_TIMEOUT_MS = 15_000;

// MediaStreamTrackProcessor (Chrome's "breakout box") is not in TypeScript's DOM types yet.
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<VideoFrame>;
}

/** Where video frames come from: the size of the tab video, and a way to receive each frame. */
interface FrameSource {
  width: number;
  height: number;
  /** Calls `draw` with each new frame until `stop()`. */
  start(draw: (frame: CanvasImageSource) => void): void;
  stop(): void;
}

/**
 * Preferred: frames are handed over only when the tab actually produces one (a still page sends
 * few), and each frame is released right after it is drawn. No hidden <video> element.
 */
async function processorSource(track: MediaStreamTrack): Promise<FrameSource> {
  const reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 2 }).readable.getReader();
  const first = await reader.read();
  if (first.done || !first.value) throw new Error('The tab video did not start.');
  let pending: VideoFrame | null = first.value;
  let stopped = false;
  return {
    width: first.value.displayWidth,
    height: first.value.displayHeight,
    start(draw) {
      void (async () => {
        try {
          while (!stopped) {
            const frame: VideoFrame | null =
              pending ?? ((await reader.read()).value as VideoFrame | undefined) ?? null;
            pending = null;
            if (!frame) break; // the track ended
            try {
              if (!stopped) draw(frame);
            } finally {
              frame.close(); // frames hold GPU memory: always release them
            }
          }
        } catch {
          // The reader was cancelled by stop().
        }
      })();
    },
    stop() {
      stopped = true;
      pending?.close();
      pending = null;
      void reader.cancel().catch(() => {});
    },
  };
}

/** Fallback for browsers without MediaStreamTrackProcessor: a muted <video> and a timer. */
async function videoSource(stream: MediaStream, fps: number): Promise<FrameSource> {
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((resolve) =>
      video.addEventListener('loadedmetadata', () => resolve(), { once: true }),
    );
  }
  let timer = 0;
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    start(draw) {
      draw(video);
      timer = window.setInterval(() => draw(video), 1000 / fps);
    },
    stop() {
      window.clearInterval(timer);
      video.pause();
      video.srcObject = null;
    },
  };
}

interface Session {
  stream: MediaStream;
  source: FrameSource;
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  startedAt: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Stops the audio sources and closes the audio mixer. */
  releaseAudio: () => void;
  options: RecordStartOptions;
}

let session: Session | null = null;

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

async function start(streamId: string, options: RecordStartOptions): Promise<void> {
  if (session) throw new Error('A recording is already running.');
  const FPS = options.fps === 60 ? 60 : 30;

  const tabSource = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } };
  const constraints = {
    // The page's own sound, when asked for. Chrome mutes a captured tab, so it is played back below.
    audio: options.pageAudio ? tabSource : false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        // Exactly the tab's own pixel size. Asking for more makes Chrome render the whole tab at a
        // higher scale (HiDPI capture), which multiplies the work for the whole recording.
        maxWidth: Math.max(16, Math.round(options.viewport.w * options.dpr)),
        maxHeight: Math.max(16, Math.round(options.viewport.h * options.dpr)),
        maxFrameRate: FPS,
      },
    },
  } as unknown as MediaStreamConstraints;
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  // Everything acquired from here on is released if starting fails part way.
  let source: FrameSource | null = null;
  let micStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  const releaseAudio = () => {
    micStream?.getTracks().forEach((t) => t.stop());
    void audioContext?.close().catch(() => {});
    micStream = null;
    audioContext = null;
  };
  const releaseAll = () => {
    source?.stop();
    releaseAudio();
    stream.getTracks().forEach((t) => t.stop());
  };

  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('The tab video did not start.');
    source =
      'MediaStreamTrackProcessor' in window
        ? await processorSource(track)
        : await videoSource(stream, FPS);

    // Sound: the page's audio and/or the microphone, mixed into one track.
    let mixedTrack: MediaStreamTrack | null = null;
    const pageTracks = stream.getAudioTracks();
    if (options.mic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        // The permission page grants this once; the recorder page cannot ask by itself.
        if (e instanceof DOMException && /NotAllowed|Security/.test(e.name)) {
          throw new Error('MIC_DENIED', { cause: e });
        }
        if (e instanceof DOMException && e.name === 'NotFoundError') {
          throw new Error('No microphone was found. Connect one or turn the microphone off.', {
            cause: e,
          });
        }
        throw e;
      }
    }
    if (pageTracks.length > 0 || micStream) {
      audioContext = new AudioContext();
      await audioContext.resume();
      const mix = audioContext.createMediaStreamDestination();
      if (pageTracks.length > 0) {
        const page = audioContext.createMediaStreamSource(new MediaStream(pageTracks));
        page.connect(mix);
        page.connect(audioContext.destination); // keep the page audible while it is captured
      }
      if (micStream) audioContext.createMediaStreamSource(micStream).connect(mix);
      mixedTrack = mix.stream.getAudioTracks()[0] ?? null;
    }

    // The video is in device pixels; the device's rectangle is in CSS px of the viewport. The
    // video normally covers the whole viewport with its scrollbar (innerWidth); use the width
    // without the scrollbar instead if that matches the video better.
    const scaleFor = (cssWidth: number) => source!.width / cssWidth;
    const scale = [options.viewport.w, options.viewport.clientW]
      .map(scaleFor)
      .reduce((best, s) => (Math.abs(s - options.dpr) < Math.abs(best - options.dpr) ? s : best));
    const { rect, trim } = options;
    const sx = Math.max(0, Math.ceil(rect.x * scale - 1e-6) + trim);
    const sy = Math.max(0, Math.ceil(rect.y * scale - 1e-6) + trim);
    const sw = Math.min(
      source.width - sx,
      Math.floor((rect.x + rect.w) * scale + 1e-6) - sx - trim,
    );
    const sh = Math.min(
      source.height - sy,
      Math.floor((rect.y + rect.h) * scale + 1e-6) - sy - trim,
    );
    if (sw < 16 || sh < 16) throw new Error('The device is too small or off screen to record.');

    // Shrink to the chosen quality (never enlarge), keeping the shape. H.264 needs even sizes.
    const preset = QUALITY[options.quality] ?? QUALITY.good;
    const fit = Math.min(1, preset.longSide / Math.max(sw, sh));
    const width = even(sw * fit);
    const height = even(sh * fit);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const hasAudio = mixedTrack !== null;
    const mimeType =
      [...(hasAudio ? AUDIO_MIME_TYPES : []), ...VIDEO_MIME_TYPES].find((t) =>
        MediaRecorder.isTypeSupported(t),
      ) ?? '';
    // The canvas stream sends a frame whenever the canvas is drawn, at most FPS a second.
    const output = canvas.captureStream(FPS);
    if (mixedTrack) output.addTrack(mixedTrack);
    const recorder = new MediaRecorder(output, {
      ...(mimeType ? { mimeType } : {}),
      ...(hasAudio ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
      videoBitsPerSecond: Math.min(
        MAX_BITRATE,
        Math.max(MIN_BITRATE, Math.round(width * height * FPS * preset.bpp)),
      ),
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    source.start((frame) => ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, width, height));
    recorder.start(1000);

    session = {
      stream,
      source,
      recorder,
      chunks,
      mimeType: recorder.mimeType || mimeType || 'video/webm',
      startedAt: Date.now(),
      width,
      height,
      hasAudio,
      releaseAudio,
      options,
    };
  } catch (e) {
    releaseAll();
    throw e;
  }
}

async function stop(): Promise<string> {
  const s = session;
  if (!s) throw new Error('No recording is running.');
  session = null;

  // Stop feeding frames and end the tab capture first, so Chrome stops capturing (and the encoder
  // stops getting new work) right away; then let the encoder finish what it already has.
  s.source.stop();
  s.stream.getVideoTracks().forEach((t) => t.stop());

  const stopped = new Promise<void>((resolve) => {
    s.recorder.onstop = () => resolve();
    s.recorder.onerror = () => resolve();
  });
  if (s.recorder.state !== 'inactive') s.recorder.stop();
  await Promise.race([stopped, new Promise<void>((r) => setTimeout(r, STOP_TIMEOUT_MS))]);

  s.stream.getTracks().forEach((t) => t.stop());
  s.releaseAudio();

  if (s.chunks.length === 0) throw new Error('Nothing was recorded.');
  const id = crypto.randomUUID();
  await saveRecording({
    id,
    blob: new Blob(s.chunks, { type: s.mimeType }),
    mimeType: s.mimeType,
    deviceName: s.options.deviceName,
    createdAt: Date.now(),
    durationMs: Date.now() - s.startedAt,
    width: s.width,
    height: s.height,
    hasAudio: s.hasAudio,
  });
  s.chunks.length = 0;
  return id;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

browser.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  if (message.type === 'offscreen-start') {
    start(message.streamId, message.options)
      .then(() => sendResponse({ ok: true } satisfies OffscreenStartResponse))
      .catch((e: unknown) =>
        sendResponse({ ok: false, error: errorText(e) } satisfies OffscreenStartResponse),
      );
    return true;
  }
  if (message.type === 'offscreen-stop') {
    stop()
      .then((id) => sendResponse({ ok: true, id } satisfies OffscreenStopResponse))
      .catch((e: unknown) =>
        sendResponse({ ok: false, error: errorText(e) } satisfies OffscreenStopResponse),
      );
    return true;
  }
});
