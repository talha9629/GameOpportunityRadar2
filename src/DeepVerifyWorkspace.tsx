import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
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
  listDeepVerifyVideos,
  loadDeepVerifyVideo,
  registerDeepVerifyYoutube,
  reviewDeepVerifyEvent,
  uploadDeepVerifyVideo,
} from './api';
import {
  DEEP_VERIFY_ALLOWED_MIME_TYPES,
  DEEP_VERIFY_MAX_BYTES,
  formatTimestamp,
  parseTimestampInput,
  validateUploadEvidence,
  type DeepVerifyVerificationSession,
  type DeepVerifyVideoPayload,
  type DeepVerifyVideoSummary,
} from './deepVerify';
import {
  purgeExpiredDeepVerifySources,
  runDeepVerifyAnalysis,
} from './deepVerifyProvider';
import type { Coverage, Interpretation, ReviewState } from './domain';
import './deepVerify.css';
import './deepVerifyProvider.css';

const GEMINI_DIRECT_URL_MAX_BYTES = 100_000_000;

const eventTypes = [
  ['mechanic', 'Mechanic'],
  ['controls', 'Controls'],
  ['camera', 'Camera'],
  ['ui', 'UI / UX'],
  ['progression', 'Progression'],
  ['monetization', 'Monetization'],
  ['content', 'Content'],
  ['difficulty', 'Difficulty'],
  ['bug', 'Bug / performance'],
  ['other', 'Other'],
] as const;

type ManualEventKey = (typeof eventTypes)[number][0];

function humanBytes(bytes: number | null) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function humanCost(value: number) {
  if (value <= 0) return '$0.00 / unreported';
  if (value < 0.01) return `<$0.01`;
  return `$${value.toFixed(2)}`;
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

async function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      cleanup();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(() => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        reject(new Error('Could not verify this video duration. Convert it to MP4/WebM and try again.'));
      } else {
        resolve(video.duration);
      }
    });
    video.onerror = () => finish(() => reject(new Error('The browser could not read this video metadata. Convert it to MP4/WebM and try again.')));
    video.src = url;
  });
}

function EventReviewButtons({
  state,
  busy,
  onReview,
}: {
  state: ReviewState;
  busy: boolean;
  onReview: (state: ReviewState) => void;
}) {
  return <div className="deep-review-actions">
    <button disabled={busy || state === 'human_confirmed'} onClick={() => onReview('human_confirmed')}>Confirm</button>
    <button disabled={busy || state === 'needs_more_evidence'} onClick={() => onReview('needs_more_evidence')}>Need evidence</button>
    <button disabled={busy || state === 'human_rejected'} onClick={() => onReview('human_rejected')}>Reject</button>
  </div>;
}

function VerificationSessionBlock({ session, saved = false }: { session: DeepVerifyVerificationSession; saved?: boolean }) {
  return <div className="deep-analysis-unknowns">
    <strong>{saved ? 'Linked verification session' : 'Verification session to link'} · {session.sessionId}</strong>
    <p>{saved
      ? 'This evidence record preserves the exact queue snapshot below. The gaps remain unresolved until findings from this source are reviewed against them.'
      : 'Saving this source will preserve the exact queue snapshot below. Collecting footage does not by itself resolve any gap.'}</p>
    <ul>{session.unknowns.map((unknown, index) => <li key={session.taskIds[index]}>
      {unknown} <code>{session.taskIds[index]}</code>
    </li>)}</ul>
    <small>Research queue snapshot: {new Date(session.researchGeneratedAt).toLocaleString()}</small>
  </div>;
}

export function DeepVerifyWorkspace({
  ownerEmail = null,
  initialStoreId = '',
  initialLabel = '',
  initialVideoId = null,
  verificationSession = null,
}: {
  ownerEmail?: string | null;
  initialStoreId?: string;
  initialLabel?: string;
  initialVideoId?: string | null;
  verificationSession?: DeepVerifyVerificationSession | null;
}) {
  const [sourceMode, setSourceMode] = useState<'upload' | 'youtube'>('upload');
  const [label, setLabel] = useState(initialLabel);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [readingMetadata, setReadingMetadata] = useState(false);
  const [saved, setSaved] = useState<DeepVerifyVideoSummary[]>([]);
  const [selected, setSelected] = useState<DeepVerifyVideoPayload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [eventBusyId, setEventBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [eventKey, setEventKey] = useState<ManualEventKey>('mechanic');
  const [claim, setClaim] = useState('');
  const [startTime, setStartTime] = useState('0:00');
  const [endTime, setEndTime] = useState('');
  const [interpretation, setInterpretation] = useState<Interpretation>('direct');
  const [coverage, setCoverage] = useState<Coverage>('verified');
  const [confidence, setConfidence] = useState('0.90');
  const [evidenceNote, setEvidenceNote] = useState('');

  const selectedEventLabel = useMemo(
    () => eventTypes.find(([key]) => key === eventKey)?.[1] ?? 'Other',
    [eventKey],
  );

  async function refreshSaved(runRetentionCleanup = true) {
    if (!ownerEmail) {
      setSaved([]);
      return;
    }
    try {
      if (runRetentionCleanup) {
        const removed = await purgeExpiredDeepVerifySources();
        if (removed > 0) {
          setMessage(`${removed} expired private source file${removed === 1 ? '' : 's'} removed; extracted findings were retained.`);
        }
      }
      setSaved(await listDeepVerifyVideos());
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
      const payload = await loadDeepVerifyVideo(videoId);
      setSelected(payload);
      if (payload.sourceType === 'upload' && payload.storagePath && !payload.sourceDeletedAt) {
        try {
          setPreviewUrl(await createDeepVerifyPreviewUrl(payload.storagePath));
        } catch (previewError) {
          setError(previewError instanceof Error ? previewError.message : 'Could not create a private preview URL.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this evidence record.');
    } finally {
      setBusy(false);
    }
  }

  async function reloadSelected() {
    if (!selected) return;
    const payload = await loadDeepVerifyVideo(selected.videoId);
    setSelected(payload);
    if (payload.sourceType === 'upload' && payload.storagePath && !payload.sourceDeletedAt) {
      try {
        setPreviewUrl(await createDeepVerifyPreviewUrl(payload.storagePath));
      } catch {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
    await refreshSaved(false);
  }

  useEffect(() => {
    setSelected(null);
    setPreviewUrl(null);
    setError(null);
    void refreshSaved(true);
    if (ownerEmail && initialVideoId) void openEvidence(initialVideoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerEmail, initialVideoId]);

  async function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setFileDuration(null);
    setError(null);
    setMessage(null);
    if (!nextFile) return;
    if (nextFile.size < 1 || nextFile.size > DEEP_VERIFY_MAX_BYTES) {
      setError(nextFile.size > DEEP_VERIFY_MAX_BYTES ? 'Deep Verify accepts videos up to 500 MB.' : 'The selected video is empty.');
      setFile(null);
      return;
    }
    if (!DEEP_VERIFY_ALLOWED_MIME_TYPES.includes(nextFile.type as (typeof DEEP_VERIFY_ALLOWED_MIME_TYPES)[number])) {
      setError('Use MP4, MOV, WebM, or M4V video evidence.');
      setFile(null);
      return;
    }
    setReadingMetadata(true);
    try {
      const duration = await readVideoDuration(nextFile);
      validateUploadEvidence({ sizeBytes: nextFile.size, mimeType: nextFile.type, durationSeconds: duration });
      setFileDuration(duration);
      if (!label.trim()) setLabel(nextFile.name.replace(/\.[^.]+$/, '').slice(0, 160));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not validate this video.');
      setFile(null);
    } finally {
      setReadingMetadata(false);
    }
  }

  async function saveEvidence() {
    if (!ownerEmail) return;
    setSavingEvidence(true);
    setError(null);
    setMessage(null);
    try {
      let videoId: string;
      if (sourceMode === 'upload') {
        if (!file || fileDuration == null) throw new Error('Choose a validated video first.');
        videoId = await uploadDeepVerifyVideo(label, storeId, file, fileDuration, verificationSession);
      } else {
        videoId = await registerDeepVerifyYoutube(label, storeId, youtubeUrl, verificationSession);
      }
      setMessage(`Evidence saved${verificationSession ? ' with verification-session provenance' : ''} · ${videoId.slice(0, 8)}`);
      await refreshSaved(false);
      await openEvidence(videoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this evidence.');
    } finally {
      setSavingEvidence(false);
    }
  }

  async function runProviderAnalysis() {
    if (!selected) return;
    setAnalyzing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await runDeepVerifyAnalysis(selected.videoId);
      setMessage(`Gemini ${result.model} produced ${result.eventCount} timestamped finding${result.eventCount === 1 ? '' : 's'} · estimated ${humanCost(result.estimatedCostUsd)}.`);
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deep Verify analysis failed.');
      try { await reloadSelected(); } catch { /* preserve provider error */ }
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveTimestampedEvent() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const startSeconds = parseTimestampInput(startTime);
      const endSeconds = endTime.trim() ? parseTimestampInput(endTime) : null;
      const confidenceValue = Number(confidence);
      await addDeepVerifyEvent(selected.videoId, {
        eventKey,
        label: selectedEventLabel,
        claim,
        startSeconds,
        endSeconds,
        origin: selected.sourceType === 'upload' ? 'user_capture' : 'third_party_public',
        interpretation,
        coverage,
        confidence: confidenceValue,
        evidenceNote: evidenceNote.trim() || null,
      });
      setClaim('');
      setEvidenceNote('');
      setEndTime('');
      setMessage('Timestamped evidence saved.');
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this timestamped finding.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewEvent(eventId: string, state: ReviewState) {
    setEventBusyId(eventId);
    setError(null);
    setMessage(null);
    try {
      await reviewDeepVerifyEvent(eventId, state);
      await reloadSelected();
      setMessage(`Finding marked ${state.replaceAll('_', ' ')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update finding review state.');
    } finally {
      setEventBusyId(null);
    }
  }

  async function removeEvent(eventId: string) {
    if (!window.confirm('Delete this timestamped finding?')) return;
    setEventBusyId(eventId);
    setError(null);
    try {
      await deleteDeepVerifyEvent(eventId);
      await reloadSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this finding.');
    } finally {
      setEventBusyId(null);
    }
  }

  async function removeSelectedEvidence() {
    if (!selected || !window.confirm('Delete this evidence record, its findings, and its uploaded source file if still present?')) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDeepVerifyVideo(selected);
      setSelected(null);
      setPreviewUrl(null);
      setMessage('Evidence record deleted.');
      await refreshSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this evidence.');
    } finally {
      setBusy(false);
    }
  }

  const providerTooLarge = selected?.sourceType === 'upload' && (selected.sizeBytes ?? 0) > GEMINI_DIRECT_URL_MAX_BYTES;
  const providerSourceGone = selected?.sourceType === 'upload' && Boolean(selected.sourceDeletedAt);
  const providerAlreadyCompleted = selected?.status === 'completed';
  const providerInProgress = selected?.status === 'analyzing' || analyzing;
  const providerDisabled = !selected || !ownerEmail || providerTooLarge || providerSourceGone || providerAlreadyCompleted || providerInProgress;

  return <section className="deep-shell">
    <header className="deep-heading">
      <div>
        <div className="eyebrow">DEEP VERIFY</div>
        <h1>Turn gameplay footage into inspectable evidence.</h1>
        <p>Upload a private recording or reference a public YouTube video. Manual and AI findings remain distinguishable, timestamped, reviewable, and traceable to the source.</p>
      </div>
      <button onClick={() => void refreshSaved(true)} disabled={!ownerEmail || busy || analyzing}><RefreshCcw size={16} /> Refresh</button>
    </header>

    <div className="deep-boundary-banner">
      <ShieldCheck size={19} />
      <div>
        <strong>Evidence boundary</strong>
        <span>Uploads use a private Supabase bucket and short-lived signed preview URLs. Public YouTube sources are referenced by URL; Radar does not download or rehost them.</span>
      </div>
    </div>

    {verificationSession && <div className="deep-boundary-banner">
      <Clock3 size={19} />
      <VerificationSessionBlock session={verificationSession} />
    </div>}

    <section className="panel deep-ingest-panel">
      <div className="deep-source-tabs">
        <button className={sourceMode === 'upload' ? 'active' : ''} onClick={() => setSourceMode('upload')}><FileVideo2 size={16} /> Private upload</button>
        <button className={sourceMode === 'youtube' ? 'active' : ''} onClick={() => setSourceMode('youtube')}><Link2 size={16} /> Public YouTube URL</button>
      </div>
      <div className="deep-fields two-up">
        <label><span>Evidence label</span><input value={label} maxLength={160} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Colony Flow gameplay verification" /></label>
        <label><span>Apple ID / saved game link {verificationSession ? '(session target)' : '(optional)'}</span><input value={storeId} readOnly={Boolean(verificationSession)} onChange={(event) => setStoreId(event.target.value)} placeholder="6761760135" /></label>
      </div>
      {sourceMode === 'upload'
        ? <div className="deep-upload-row">
            <label className="deep-file-picker"><CloudUpload size={20} /><span><strong>{file?.name ?? 'Choose gameplay recording'}</strong><small>MP4 / MOV / WebM / M4V · max 500 MB · max 30 min</small></span><input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /></label>
            <div className="deep-file-state"><span>Size <b>{file ? humanBytes(file.size) : '—'}</b></span><span>Duration <b>{readingMetadata ? 'Reading…' : fileDuration != null ? formatTimestamp(fileDuration) : '—'}</b></span></div>
          </div>
        : <label className="deep-url-field"><span>Public YouTube URL</span><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>}
      <div className="deep-ingest-footer">
        <p>{ownerEmail
          ? verificationSession
            ? `Evidence will be stored for ${ownerEmail} and linked to ${verificationSession.taskIds.length} exact verification task${verificationSession.taskIds.length === 1 ? '' : 's'}.`
            : `Evidence will be stored for ${ownerEmail}.`
          : 'Owner sign-in is required before evidence can be persisted.'}</p>
        <button className="primary" disabled={!ownerEmail || savingEvidence || !label.trim() || (sourceMode === 'upload' ? !file || fileDuration == null : !youtubeUrl.trim())} onClick={() => void saveEvidence()}>{savingEvidence ? 'Saving…' : sourceMode === 'upload' ? 'Upload evidence' : 'Save YouTube source'}</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {message && <div className="deep-success"><CheckCircle2 size={17} /> {message}</div>}
    </section>

    {ownerEmail && <section className="panel deep-library-panel">
      <div className="section-heading"><div><h2>Evidence library</h2><p>Owner-only records available across devices.</p></div><span>{saved.length} source{saved.length === 1 ? '' : 's'}</span></div>
      {saved.length === 0
        ? <p>No Deep Verify evidence saved yet.</p>
        : <div className="deep-library-list">{saved.map((item) => <button key={item.videoId} className={selected?.videoId === item.videoId ? 'selected' : ''} disabled={busy || analyzing} onClick={() => void openEvidence(item.videoId)}>
            <span><strong>{item.label}</strong><small>{item.canonicalName ?? (item.storeId ? `Apple ID ${item.storeId}` : item.sourceType === 'upload' ? item.originalName : 'YouTube source')}</small></span>
            <span><b>{statusLabel(item.status)}</b><small>{item.eventCount} timestamped finding{item.eventCount === 1 ? '' : 's'}</small></span>
            <span><small>{new Date(item.createdAt).toLocaleString()}</small></span>
          </button>)}</div>}
    </section>}

    {selected && <>
      <section className="panel deep-selected-panel">
        <div className="section-heading">
          <div><div className="eyebrow">SELECTED EVIDENCE</div><h2>{selected.label}</h2><p>{selected.canonicalName ?? (selected.storeId ? `Apple ID ${selected.storeId}` : 'Unlinked evidence')}</p></div>
          <button className="danger-action" disabled={busy || analyzing} onClick={() => void removeSelectedEvidence()}><Trash2 size={16} /> Delete record</button>
        </div>
        <div className="deep-meta-grid">
          <div><span>Source</span><strong>{selected.sourceType === 'upload' ? 'Private upload' : 'Public YouTube URL'}</strong></div>
          <div><span>Status</span><strong>{statusLabel(selected.status)}</strong></div>
          <div><span>Duration</span><strong>{selected.durationSeconds != null ? formatTimestamp(selected.durationSeconds) : 'Unknown'}</strong></div>
          <div><span>Size</span><strong>{humanBytes(selected.sizeBytes)}</strong></div>
        </div>
        {selected.verificationSession && <VerificationSessionBlock session={selected.verificationSession} saved />}
        {selected.sourceType === 'upload'
          ? selected.sourceDeletedAt
            ? <div className="deep-source-expired"><ShieldCheck size={20} /><div><strong>Source file expired</strong><span>Removed {new Date(selected.sourceDeletedAt).toLocaleString()}. Timestamped findings and analysis history remain.</span></div></div>
            : previewUrl
              ? <video className="deep-video" controls preload="metadata" src={previewUrl} />
              : <div className="deep-preview-placeholder"><PlayCircle size={22} /> Private preview unavailable.</div>
          : selected.externalUrl && <a className="deep-external-link" href={selected.externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open public YouTube source</a>}
      </section>

      <section className="panel deep-provider-panel deep-provider-live">
        <div>
          <div className="eyebrow">AUTOMATED VIDEO ANALYSIS</div>
          <h3>{selected.latestAnalysis ? `${selected.latestAnalysis.provider} · ${selected.latestAnalysis.model ?? 'model unknown'}` : 'Gemini evidence pass'}</h3>
          <p>AI observations are stored as <code>ai_inferred</code>, <code>partial</code>, and <code>unreviewed</code>. They do not become human-confirmed evidence until you review them below.</p>
          {providerTooLarge && <p className="deep-provider-warning">This private upload is over 100 MB. It remains usable for manual evidence, but automated analysis needs the separate Gemini Files API worker.</p>}
          {providerSourceGone && <p className="deep-provider-warning">The uploaded source has expired, so a new automated analysis cannot be started.</p>}
          {selected.status === 'failed' && selected.errorMessage && <p className="deep-provider-warning">Last attempt: {selected.errorMessage}</p>}
        </div>
        <button className="primary" disabled={providerDisabled} onClick={() => void runProviderAnalysis()}><Sparkles size={16} /> {providerInProgress ? 'Analyzing…' : providerAlreadyCompleted ? 'Analysis complete' : 'Run Gemini analysis'}</button>
      </section>

      {selected.latestAnalysis && <section className="panel deep-analysis-result">
        <div className="section-heading"><div><h2>Latest automated analysis</h2><p>Provider output remains subordinate to source evidence and human review.</p></div><span>{humanCost(selected.latestAnalysis.estimatedCostUsd)}</span></div>
        <div className="deep-analysis-meta">
          <span>Model <b>{selected.latestAnalysis.model ?? '—'}</b></span>
          <span>Status <b>{selected.latestAnalysis.status}</b></span>
          <span>Completed <b>{selected.latestAnalysis.completedAt ? new Date(selected.latestAnalysis.completedAt).toLocaleString() : '—'}</b></span>
        </div>
        {selected.latestAnalysis.summary && <div className="deep-analysis-summary"><strong>What this footage supports</strong><p>{selected.latestAnalysis.summary}</p></div>}
        <div className="deep-analysis-unknowns">
          <strong>Still unknown from this footage</strong>
          {selected.latestAnalysis.unknowns.length === 0 ? <p>No provider-supplied unknowns.</p> : <ul>{selected.latestAnalysis.unknowns.map((unknown, index) => <li key={`${index}-${unknown}`}>{unknown}</li>)}</ul>}
        </div>
      </section>}

      {selected.sourceType === 'upload' && selected.deleteAfter && !selected.sourceDeletedAt && <div className="deep-retention-note">
        <Clock3 size={18} />
        <span>Source-file retention: eligible for deletion after {new Date(selected.deleteAfter).toLocaleString()}. Cleanup occurs on the next signed-in Radar refresh after that time; the evidence record and extracted findings remain.</span>
      </div>}

      <section className="panel deep-event-editor">
        <div className="section-heading"><div><h2>Add manual timestamped observation</h2><p>Record only what this footage supports. A missing feature in the footage is not evidence that the game lacks it.</p></div><Clock3 size={20} /></div>
        <div className="deep-event-grid">
          <label><span>Category</span><select value={eventKey} onChange={(event) => setEventKey(event.target.value as ManualEventKey)}>{eventTypes.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label><span>Start</span><input value={startTime} onChange={(event) => setStartTime(event.target.value)} placeholder="1:23" /></label>
          <label><span>End (optional)</span><input value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="1:31" /></label>
          <label><span>Interpretation</span><select value={interpretation} onChange={(event) => setInterpretation(event.target.value as Interpretation)}><option value="direct">Directly visible</option><option value="human_inferred">Human inference</option></select></label>
          <label><span>Coverage</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as Coverage)}><option value="verified">Verified</option><option value="partial">Partial</option><option value="inferred">Inferred</option></select></label>
          <label><span>Confidence 0–1</span><input type="number" min="0" max="1" step="0.05" value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>
        </div>
        <label className="deep-claim-field"><span>Observation</span><textarea value={claim} maxLength={4000} onChange={(event) => setClaim(event.target.value)} placeholder="e.g. At 1:23 the player drags a block horizontally; release snaps it into the empty lane." /></label>
        <label className="deep-note-field"><span>Evidence note (optional)</span><input value={evidenceNote} maxLength={1000} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="What makes this direct vs inferred?" /></label>
        <div className="deep-event-footer"><span>Origin is stored as <code>{selected.sourceType === 'upload' ? 'user_capture' : 'third_party_public'}</code>.</span><button className="primary" disabled={busy || analyzing || !claim.trim()} onClick={() => void saveTimestampedEvent()}>Save timestamped finding</button></div>
      </section>

      <section className="panel deep-events-panel">
        <div className="section-heading"><div><h2>Timestamped findings</h2><p>Every finding preserves source, interpretation, coverage, confidence, review state, and review timestamp.</p></div><span>{selected.events.length} findings</span></div>
        {selected.events.length === 0
          ? <p>No timestamped findings yet.</p>
          : <div className="deep-event-list">{selected.events.map((event) => <article key={event.eventId} className={`deep-event-card ${event.interpretation === 'ai_inferred' ? 'deep-event-ai' : ''}`}>
              <div className="deep-event-top">
                <div><span className="deep-time">{formatTimestamp(event.startSeconds)}{event.endSeconds != null ? `–${formatTimestamp(event.endSeconds)}` : ''}</span><strong>{event.label}</strong>{event.interpretation === 'ai_inferred' && <span className="deep-ai-badge"><Sparkles size={12} /> AI inferred</span>}</div>
                <button className="icon-danger" disabled={eventBusyId === event.eventId || analyzing} onClick={() => void removeEvent(event.eventId)} title="Delete finding"><Trash2 size={15} /></button>
              </div>
              <p>{event.claim}</p>
              <div className="finding-meta"><span>{event.origin}</span><span>{event.interpretation}</span><span>{event.coverage}</span><span>{Math.round(event.confidence * 100)}% confidence</span><span className={`badge-${event.reviewState}`}>{event.reviewState.replaceAll('_', ' ')}</span></div>
              {event.reviewedAt && <small className="deep-reviewed-at">Reviewed {new Date(event.reviewedAt).toLocaleString()}</small>}
              {event.evidenceNote && <div className="deep-note">{event.evidenceNote}</div>}
              <EventReviewButtons state={event.reviewState} busy={eventBusyId === event.eventId || analyzing} onReview={(state) => void reviewEvent(event.eventId, state)} />
            </article>)}</div>}
      </section>

      {selected.sourceType === 'upload' && (selected.sizeBytes ?? 0) > GEMINI_DIRECT_URL_MAX_BYTES && <div className="deep-retention-note"><AlertTriangle size={18} /><span>Uploads between 100 MB and 500 MB are accepted as private evidence, but the current Gemini direct-URL path cannot analyze them. The next provider phase is a Files API worker; no result is fabricated in the meantime.</span></div>}
    </>}
  </section>;
}
