// Finished recordings live in IndexedDB (extension origin) so the offscreen recorder can hand a
// large video to the review page without sending it through messages. Nothing leaves the device.
const DB_NAME = 'device-lab-recordings';
const STORE = 'recordings';
/** Recordings nobody downloaded or discarded are removed after this long. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredRecording {
  id: string;
  blob: Blob;
  /** MIME type the recorder produced, e.g. `video/mp4;codecs=avc1`. */
  mimeType: string;
  deviceName: string;
  createdAt: number;
  durationMs: number;
  width: number;
  height: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the database.'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('The database request failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('The database request was cancelled.'));
    });
  } finally {
    db.close();
  }
}

export async function saveRecording(recording: StoredRecording): Promise<void> {
  await run('readwrite', (store) => store.put(recording));
}

export async function getRecording(id: string): Promise<StoredRecording | undefined> {
  return run<StoredRecording | undefined>('readonly', (store) => store.get(id));
}

export async function deleteRecording(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/** Removes recordings older than a day. Best effort. */
export async function purgeOldRecordings(): Promise<void> {
  const all = await run<StoredRecording[]>('readonly', (store) => store.getAll());
  const cutoff = Date.now() - MAX_AGE_MS;
  await Promise.all(all.filter((r) => r.createdAt < cutoff).map((r) => deleteRecording(r.id)));
}
