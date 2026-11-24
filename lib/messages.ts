// Typed messages sent from the content script to the background worker.
export type RuntimeMessage =
  | { type: 'close' } // last window closed: drop the header rule
  | { type: 'capture' } // take a PNG screenshot of the tab's visible area
  | { type: 'record-start'; options: RecordStartOptions } // start recording one device's screen
  | { type: 'record-stop' }; // stop the recording and open the review page

export type CaptureResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

/** Rectangle in CSS pixels, relative to the tab's viewport. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RecordStartOptions {
  /** The device screen to record, in CSS px relative to the viewport. */
  rect: ViewRect;
  /** The tab's viewport in CSS px, to turn the video's pixels back into CSS px. */
  viewport: { w: number; h: number };
  /** Name used in the review page and the file name. */
  deviceName: string;
  /**
   * Video pixels to leave out on every side. A device shown scaled down is smoothed across about
   * one more pixel at its edges, so 1 keeps those blended edge pixels out of the video.
   */
  trim: number;
}

export type RecordResponse = { ok: true } | { ok: false; error: string };

// Messages between the background worker and the offscreen recorder. `target` keeps them from
// being handled by any other extension page.
export type OffscreenMessage =
  | {
      target: 'offscreen';
      type: 'offscreen-start';
      streamId: string;
      options: RecordStartOptions;
    }
  | { target: 'offscreen'; type: 'offscreen-stop' };

export type OffscreenStartResponse = { ok: true } | { ok: false; error: string };
export type OffscreenStopResponse = { ok: true; id: string } | { ok: false; error: string };

export function sendMessage(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {});
}

/** Asks the background worker for a screenshot of the visible tab (a PNG data URL). */
export async function captureTab(): Promise<CaptureResponse> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'capture',
    } satisfies RuntimeMessage)) as CaptureResponse | undefined;
    return response ?? { ok: false, error: 'The capture service did not answer.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Asks the background worker to start or stop recording; answers when it is done. */
export async function sendRecordMessage(
  message: Extract<RuntimeMessage, { type: 'record-start' | 'record-stop' }>,
): Promise<RecordResponse> {
  try {
    const response = (await browser.runtime.sendMessage(message)) as RecordResponse | undefined;
    return response ?? { ok: false, error: 'The recording service did not answer.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
