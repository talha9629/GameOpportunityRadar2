import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileVideo2,
  Link2,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  addDeepVerifyEvent,
  createDeepVerifyPreviewUrl,
  deleteDeepVerifyEvent,
  deleteDeepVerifyVideo,
  reviewDeepVerifyEvent,
} from './api';
import {
  DEEP_VERIFY_ALLOWED_MIME_TYPES,
  DEEP_VERIFY_MAX_BYTES,
  formatTimestamp,
  parseTimestampInput,
  validateUploadEvidence,
  type DeepVerifyVideoPayload,
  type DeepVerifyVideoSummary,
} from './deepVerify';
import { runDeepVerifyAnalysis } from './deepVerifyProvider';
import {
  listStorefrontDeepVerifyVideos,
  loadStorefrontDeepVerifyVideo,
  registerStorefrontDeepVerifyYoutube,
  uploadStorefrontDeepVerifyVideo,
} from './storefrontDeepVerifyApi';
import { STOREFRONT_META, type Storefront } from './storeIdentity';
import type { Coverage, Interpretation, ReviewState } from './domain';
import './deepVerify.css';
import './deepVerifyProvider.css';

const GEMINI_DIRECT_URL_MAX_BYTES = 100_000_000;

async function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error('Could not verify this video duration.'));
      else resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('The browser could not read this video metadata.'));
    };
    video.src = url;
  });
}

function humanBytes(bytes: number | null) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function StorefrontDeepVerifyWorkspace({
  storefront,
  ownerEmail = null,
}: {
  storefront: Storefront;
  ownerEmail?: string | null;
}) {
  const meta = STOREFRONT_META[storefront];
  const [sourceMode, setSourceMode] = useState<'upload' | 'youtube'>('upload');
  const [label, setLabel] = useState('');
  const [storeId, setStoreId] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [saved, setSaved] = useState<DeepVerifyVideoSummary[]>([]);
  const [selected, setSelected] = useState<DeepVerifyVideoPayload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState('');
  const [startTime, setStartTime] = useState('0:00');
  const [interpretation, setInterpretation] = useState<Interpretation>('direct');
  const [coverage, setCoverage] = useState<Coverage>('verified');
  const [confidence, setConfidence] = useState('0.90');

  async function refreshSaved() {
    if (!ownerEmail) {
      setSaved([]);
      return;
    }
    try {
      setSaved(await listStorefrontDeepVerifyVideos(storefront));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Deep Verify evidence.');
    }
  }

  async function openEvidence(videoId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setPreviewUrl(null);
    try {
      const payload = await loadStorefrontDeepVerifyVideo(storefront, videoId);
      setSelected(payload);
      if (payload.sourceType === 'upload' && payload.storagePath && !payload.sourceDeletedAt) {
        setPreviewUrl(await createDeepVerifyPreviewUrl(payload.storagePath));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this evidence record.');
    } finally {
      setBusy(false);
    }
  }

  async function reloadSelected() {
    if (!selected) return;
    const payload = await loadStorefrontDeepVerifyVideo(storefront, selected.videoId);
    setSelected(payload);
    if (payload.sourceType === 'upload' && payload.storagePath && !payload.sourceDeletedAt) {
      try { setPreviewUrl(await createDeepVerifyPreviewUrl(payload.storagePath)); }
      catch { setPreviewUrl(null); }
    } else setPreviewUrl(null);
    await refreshSaved();
  }

  useEffect(() => {
    setSelected(null);
    setPreviewUrl(null);
    setLabel('');
    setStoreId('');
    setYoutubeUrl('');
    setFile(null);
    setFileDuration(null);
    setMessage(null);
    setError(null);
    void refreshSaved();
    // Component is keyed by storefront in App; this remains a defensive reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storefront, ownerEmail]);

  async function chooseFile(next: File | null) {
    setFile(null);
    setFileDuration(null);
    setError(null);
    if (!next) return;
    if (next.size < 1 || next.size > DEEP_VERIFY_MAX_BYTES) {
      setError(next.size > DEEP_VERIFY_MAX_BYTES ? 'Deep Verify accepts videos up to 500 MB.' : 'The selected video is empty.');
      return;
    }
    if (!DEEP_VERIFY_ALLOWED_MIME_TYPES.includes(next.type as (typeof DEEP_VERIFY_ALLOWED_MIME_TYPES)[number])) {
      setError('Use MP4, MOV, WebM, or M4V video evidence.');
      return;
    }
    try {
      const duration = await readVideoDuration(next);
      validateUploadEvidence({ sizeBytes: next.size, mimeType: next.type, durationSeconds: duration });
      setFile(next);
      setFileDuration(duration);
      if (!label.trim()) setLabel(next.name.replace(/\.[^.]+$/, '').slice(0, 160));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not validate this video.');
    }
  }

  async function saveEvidence() {
    if (!ownerEmail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const videoId = sourceMode === 'upload'
        ? file && fileDuration != null
          ? await uploadStorefrontDeepVerifyVideo(storefront, label, storeId, file, fileDuration)
          : (() => { throw new Error('Choose a validated video first.'); })()
        : await registerStorefrontDeepVerifyYoutube(storefront, label, storeId, youtubeUrl);
      setMessage(`Evidence saved to ${meta.label} workspace · ${videoId.slice(0, 8)}`);
      await refreshSaved();
      await openEvidence(videoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this evidence.');
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runDeepVerifyAnalysis(selected.videoId);
      setMessage(`Gemini ${result.model} produced ${result.eventCount} timestamped finding${result.eventCount === 1 ? '' : 's'}. AI findings remain unreviewed.`);
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deep Verify analysis failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveFinding() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await addDeepVerifyEvent(selected.videoId, {
        eventKey: 'mechanic',
        label: 'Manual observation',
        claim,
        startSeconds: parseTimestampInput(startTime),
        endSeconds: null,
        origin: selected.sourceType === 'upload' ? 'user_capture' : 'third_party_public',
        interpretation,
        coverage,
        confidence: Number(confidence),
        evidenceNote: null,
      });
      setClaim('');
      setMessage('Timestamped finding saved.');
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this timestamped finding.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewEvent(eventId: string, state: ReviewState) {
    try {
      await reviewDeepVerifyEvent(eventId, state);
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update review state.');
    }
  }

  async function removeFinding(eventId: string) {
    if (!window.confirm('Delete this timestamped finding?')) return;
    try {
      await deleteDeepVerifyEvent(eventId);
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this finding.');
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm('Delete this evidence record and its source file if present?')) return;
    setBusy(true);
    try {
      await deleteDeepVerifyVideo(selected);
      setSelected(null);
      setPreviewUrl(null);
      await refreshSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this evidence record.');
    } finally {
      setBusy(false);
    }
  }

  const providerTooLarge = selected?.sourceType === 'upload' && (selected.sizeBytes ?? 0) > GEMINI_DIRECT_URL_MAX_BYTES;
  const providerDisabled = !selected || !ownerEmail || providerTooLarge || Boolean(selected.sourceDeletedAt) || selected.status === 'completed' || busy;

  return <section className="deep-shell">
    <header className="deep-heading">
      <div>
        <div className="eyebrow">MANUAL DEEP VERIFY · {meta.label.toUpperCase()}</div>
        <h1>Turn gameplay footage into inspectable evidence.</h1>
        <p>This workspace is isolated to {meta.label}. Public YouTube references are not downloaded or rehosted, and AI findings never become human-confirmed automatically.</p>
      </div>
      <button onClick={() => void refreshSaved()} disabled={!ownerEmail || busy}><RefreshCcw size={16} /> Refresh</button>
    </header>

    <div className="deep-boundary-banner">
      <ShieldCheck size={19} />
      <div><strong>Storefront-qualified evidence</strong><span>Saved sources retain storefront + store ID provenance. Switching stores cannot relabel this evidence as belonging to another storefront.</span></div>
    </div>

    <section className="panel deep-ingest-panel">
      <div className="deep-source-tabs">
        <button className={sourceMode === 'upload' ? 'active' : ''} onClick={() => setSourceMode('upload')}><FileVideo2 size={16} /> Private upload</button>
        <button className={sourceMode === 'youtube' ? 'active' : ''} onClick={() => setSourceMode('youtube')}><Link2 size={16} /> Public YouTube URL</button>
      </div>
      <div className="deep-fields two-up">
        <label><span>Evidence label</span><input value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} placeholder="Gameplay verification" /></label>
        <label><span>{meta.idLabel} (optional)</span><input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder={storefront === 'apple_app_store' ? '6503697761' : storefront === 'google_play' ? 'com.example.game' : 'Amazon app ID / package'} /></label>
      </div>
      {sourceMode === 'upload'
        ? <label className="deep-file-picker"><CloudUpload size={20} /><span><strong>{file?.name ?? 'Choose gameplay recording'}</strong><small>MP4 / MOV / WebM / M4V · max 500 MB · max 30 min</small></span><input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} /></label>
        : <label className="deep-url-field"><span>Public YouTube URL</span><input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>}
      <div className="deep-ingest-footer">
        <p>{ownerEmail ? `Evidence will be stored in your ${meta.label} workspace.` : 'Owner sign-in is required before evidence can be persisted.'}</p>
        <button className="primary" disabled={!ownerEmail || busy || !label.trim() || (sourceMode === 'upload' ? !file || fileDuration == null : !youtubeUrl.trim())} onClick={() => void saveEvidence()}>{busy ? 'Working…' : 'Save evidence'}</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {message && <div className="deep-success"><CheckCircle2 size={17} /> {message}</div>}
    </section>

    {ownerEmail && <section className="panel deep-library-panel">
      <div className="section-heading"><div><h2>{meta.shortLabel} evidence library</h2><p>Only records qualified to this storefront appear here.</p></div><span>{saved.length} source{saved.length === 1 ? '' : 's'}</span></div>
      {saved.length === 0 ? <p>No Deep Verify evidence saved for {meta.label} yet.</p> : <div className="deep-library-list">{saved.map((item) => <button key={item.videoId} className={selected?.videoId === item.videoId ? 'selected' : ''} disabled={busy} onClick={() => void openEvidence(item.videoId)}><span><strong>{item.label}</strong><small>{item.canonicalName ?? (item.storeId ? `${meta.idLabel} ${item.storeId}` : 'Unlinked evidence')}</small></span><span><b>{item.status.replaceAll('_', ' ')}</b><small>{item.eventCount} finding{item.eventCount === 1 ? '' : 's'}</small></span></button>)}</div>}
    </section>}

    {selected && <>
      <section className="panel deep-selected-panel">
        <div className="section-heading"><div><div className="eyebrow">SELECTED · {meta.label.toUpperCase()}</div><h2>{selected.label}</h2><p>{selected.canonicalName ?? (selected.storeId ? `${meta.idLabel} ${selected.storeId}` : 'Unlinked evidence')}</p></div><button className="danger-action" disabled={busy} onClick={() => void removeSelected()}><Trash2 size={16} /> Delete</button></div>
        <div className="deep-meta-grid"><div><span>Source</span><strong>{selected.sourceType === 'upload' ? 'Private upload' : 'Public YouTube URL'}</strong></div><div><span>Status</span><strong>{selected.status.replaceAll('_', ' ')}</strong></div><div><span>Duration</span><strong>{selected.durationSeconds != null ? formatTimestamp(selected.durationSeconds) : 'Unknown'}</strong></div><div><span>Size</span><strong>{humanBytes(selected.sizeBytes)}</strong></div></div>
        {selected.sourceType === 'upload' ? previewUrl ? <video className="deep-video" controls preload="metadata" src={previewUrl} /> : <div className="deep-preview-placeholder"><PlayCircle size={22} /> Private preview unavailable.</div> : selected.externalUrl && <a className="deep-external-link" href={selected.externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open public YouTube source</a>}
      </section>

      <section className="panel deep-provider-panel deep-provider-live"><div><div className="eyebrow">AUTOMATED VIDEO ANALYSIS</div><h3>Gemini evidence pass</h3><p>Provider observations are stored as AI inference and remain unreviewed until a human explicitly reviews them.</p>{providerTooLarge && <p className="deep-provider-warning">Uploads over 100 MB remain usable for manual evidence but need the separate Gemini Files API worker for automated analysis.</p>}</div><button className="primary" disabled={providerDisabled} onClick={() => void runAnalysis()}><Sparkles size={16} /> {selected.status === 'completed' ? 'Analysis complete' : 'Run Gemini analysis'}</button></section>

      <section className="panel deep-event-editor">
        <div className="section-heading"><div><h2>Add timestamped observation</h2><p>Record only what the footage supports. Missing footage is not evidence that a feature is absent.</p></div></div>
        <div className="deep-event-grid"><label><span>Start</span><input value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label><span>Interpretation</span><select value={interpretation} onChange={(e) => setInterpretation(e.target.value as Interpretation)}><option value="direct">Directly visible</option><option value="human_inferred">Human inference</option></select></label><label><span>Coverage</span><select value={coverage} onChange={(e) => setCoverage(e.target.value as Coverage)}><option value="verified">Verified</option><option value="partial">Partial</option><option value="inferred">Inferred</option></select></label><label><span>Confidence 0–1</span><input type="number" min="0" max="1" step="0.05" value={confidence} onChange={(e) => setConfidence(e.target.value)} /></label></div>
        <label className="deep-claim-field"><span>Observation</span><textarea value={claim} maxLength={4000} onChange={(e) => setClaim(e.target.value)} /></label>
        <div className="deep-event-footer"><span>Every finding preserves source, interpretation, coverage, confidence, and human review state.</span><button className="primary" disabled={busy || !claim.trim()} onClick={() => void saveFinding()}>Save finding</button></div>
      </section>

      <section className="panel deep-events-panel"><div className="section-heading"><div><h2>Timestamped findings</h2><p>AI and manual observations remain distinguishable.</p></div><span>{selected.events.length} findings</span></div>{selected.events.length === 0 ? <p>No timestamped findings yet.</p> : <div className="deep-event-list">{selected.events.map((event) => <article key={event.eventId} className={`deep-event-card ${event.interpretation === 'ai_inferred' ? 'deep-event-ai' : ''}`}><div className="deep-event-top"><div><span className="deep-time">{formatTimestamp(event.startSeconds)}</span><strong>{event.label}</strong></div><button className="icon-danger" onClick={() => void removeFinding(event.eventId)}><Trash2 size={15} /></button></div><p>{event.claim}</p><div className="finding-meta"><span>{event.origin}</span><span>{event.interpretation}</span><span>{event.coverage}</span><span>{Math.round(event.confidence * 100)}%</span><span className={`badge-${event.reviewState}`}>{event.reviewState.replaceAll('_', ' ')}</span></div><div className="deep-review-actions"><button disabled={event.reviewState === 'human_confirmed'} onClick={() => void reviewEvent(event.eventId, 'human_confirmed')}>Confirm</button><button disabled={event.reviewState === 'needs_more_evidence'} onClick={() => void reviewEvent(event.eventId, 'needs_more_evidence')}>Need evidence</button><button disabled={event.reviewState === 'human_rejected'} onClick={() => void reviewEvent(event.eventId, 'human_rejected')}>Reject</button></div></article>)}</div>}</section>
    </>}
  </section>;
}
