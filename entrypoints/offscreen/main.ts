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

const FPS = 30;
/** Roughly 0.1 bit per pixel per frame: about 6 Mbps at 1080p. Quality presets replace this later. */
const BITS_PER_PIXEL = 0.1;
const MIN_BITRATE = 2_000_000;
const MAX_BITRATE = 20_000_000;
/** In order of preference. MP4 plays everywhere; WebM is the fallback. */
const MIME_TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

interface Session {
  stream: MediaStream;
  video: HTMLVideoElement;
  timer: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  startedAt: number;
  width: number;
  height: number;
  options: RecordStartOptions;
}

let session: Session | null = null;

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

async function start(streamId: string, options: RecordStartOptions): Promise<void> {
  if (session) throw new Error('A recording is already running.');

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        // Ask for the tab's full pixel size, so a device shown at 100% is recorded sharp.
        maxWidth: 8192,
        maxHeight: 8192,
      },
    },
  } as unknown as MediaStreamConstraints;
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth) {
      await new Promise<void>((resolve) =>
        video.addEventListener('loadedmetadata', () => resolve(), { once: true }),
      );
    }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }

  // The video is in device pixels; the device's rectangle is in CSS px of the viewport.
  const scale = video.videoWidth / options.viewport.w;
  const { rect, trim } = options;
  const sx = Math.max(0, Math.ceil(rect.x * scale - 1e-6) + trim);
  const sy = Math.max(0, Math.ceil(rect.y * scale - 1e-6) + trim);
  const sw = Math.min(
    video.videoWidth - sx,
    Math.floor((rect.x + rect.w) * scale + 1e-6) - sx - trim,
  );
  const sh = Math.min(
    video.videoHeight - sy,
    Math.floor((rect.y + rect.h) * scale + 1e-6) - sy - trim,
  );
  if (sw < 16 || sh < 16) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('The device is too small or off screen to record.');
  }
  // H.264 needs even sizes.
  const width = even(sw);
  const height = even(sh);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.drawImage(video, sx, sy, width, height, 0, 0, width, height);
  const timer = window.setInterval(
    () => ctx.drawImage(video, sx, sy, width, height, 0, 0, width, height),
    1000 / FPS,
  );

  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(canvas.captureStream(FPS), {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: Math.min(
      MAX_BITRATE,
      Math.max(MIN_BITRATE, Math.round(width * height * FPS * BITS_PER_PIXEL)),
    ),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);

  session = {
    stream,
    video,
    timer,
    recorder,
    chunks,
    mimeType: recorder.mimeType || mimeType || 'video/webm',
    startedAt: Date.now(),
    width,
    height,
    options,
  };
}

async function stop(): Promise<string> {
  const s = session;
  if (!s) throw new Error('No recording is running.');
  session = null;

  const stopped = new Promise<void>((resolve) => {
    s.recorder.onstop = () => resolve();
  });
  if (s.recorder.state !== 'inactive') s.recorder.stop();
  await stopped;
  window.clearInterval(s.timer);
  s.stream.getTracks().forEach((t) => t.stop());
  s.video.srcObject = null;

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
  });
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
