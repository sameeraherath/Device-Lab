// Typed messages sent from the content script to the background worker.
export type RuntimeMessage =
  | { type: 'close' } // last window closed: drop the header rule
  | { type: 'capture' }; // take a PNG screenshot of the tab's visible area

export type CaptureResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

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
