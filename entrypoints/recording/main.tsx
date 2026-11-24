// Review page: previews the finished recording and downloads it. Opened by the background worker
// as recording.html?id=<recording id>; the video itself is read from IndexedDB.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  deleteRecording,
  getRecording,
  purgeOldRecordings,
  type StoredRecording,
} from '@/lib/recordingStore';
import './style.css';

const extensionFor = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fileName(rec: StoredRecording) {
  const d = new Date(rec.createdAt);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const device = rec.deviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `device-lab-${device || 'device'}-${stamp}.${extensionFor(rec.mimeType)}`;
}

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

function formatSize(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function App() {
  const id = new URLSearchParams(location.search).get('id');
  const [rec, setRec] = useState<StoredRecording | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('This page needs a recording to show.');
      return;
    }
    let objectUrl: string | undefined;
    getRecording(id)
      .then((found) => {
        if (!found) {
          setError('This recording is no longer available. Recordings are kept for 24 hours.');
          return;
        }
        objectUrl = URL.createObjectURL(found.blob);
        setRec(found);
        setUrl(objectUrl);
      })
      .catch(() => setError('Could not open the recording.'));
    void purgeOldRecordings().catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (error) {
    return (
      <main>
        <h1>Your recording</h1>
        <p class="error" role="alert">
          {error}
        </p>
      </main>
    );
  }
  if (!rec || !url) {
    return (
      <main>
        <h1>Your recording</h1>
        <p class="meta">Loading…</p>
      </main>
    );
  }
  if (done) {
    return (
      <main>
        <h1>Recording removed</h1>
        <p class="meta">You can close this tab.</p>
      </main>
    );
  }

  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(rec);
    a.click();
  };
  const discard = async () => {
    await deleteRecording(rec.id).catch(() => {});
    setDone(true);
  };

  return (
    <main>
      <h1>Your recording</h1>
      <p class="meta">
        {rec.deviceName} · {rec.width}×{rec.height} · {formatDuration(rec.durationMs)} ·{' '}
        {formatSize(rec.blob.size)} · {extensionFor(rec.mimeType).toUpperCase()}
        {rec.hasAudio ? ' · with audio' : ''}
      </p>
      <div class="player">
        <video src={url} controls />
      </div>
      <div class="actions">
        <button type="button" class="primary" onClick={download}>
          Download
        </button>
        <button type="button" class="secondary" onClick={discard}>
          Discard
        </button>
      </div>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
