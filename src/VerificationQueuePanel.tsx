import { Clock3, Database, ExternalLink, SearchCheck, Users, Video } from 'lucide-react';
import type { VerificationCaptureSession, VerificationQueue, VerificationTask } from './verificationQueue';
import {
  evidenceCountForSession,
  latestEvidenceForSession,
  type VerificationSessionEvidence,
} from './verificationEvidence';
import {
  resolvedTaskCount,
  type VerificationTaskResolution,
} from './verificationResolution';
import {
  discoveryForSession,
  type GameplayDiscovery,
  type GameplayDiscoverySession,
} from './gameplayDiscovery';
import './verificationQueue.css';

function TaskIcon({ task }: { task: VerificationTask }) {
  if (task.evidenceType === 'deep_verify_video') return <Video size={16} />;
  if (task.evidenceType === 'competitor_map') return <Users size={16} />;
  if (task.evidenceType === 'exact_rank_history') return <Clock3 size={16} />;
  if (task.evidenceType === 'third_party_estimate') return <Database size={16} />;
  return <SearchCheck size={16} />;
}

function stateLabel(task: VerificationTask) {
  if (task.automationState === 'auto_waiting') return 'AUTOMATED';
  if (task.automationState === 'optional_external') return 'OPTIONAL';
  if (task.automationState === 'ready_for_human_review') return 'HUMAN REVIEW';
  return 'EVIDENCE NEEDED';
}

function SourceSuggestions({ discovery }: { discovery: GameplayDiscoverySession }) {
  if (discovery.status !== 'found' || discovery.candidates.length === 0) return null;
  return <div className="verification-source-suggestions">
    <div>
      <strong>Suggested public gameplay sources</strong>
      <span>Search candidates only · public availability checked · content not yet verified</span>
    </div>
    {discovery.candidates.map((candidate) => <a key={candidate.url} href={candidate.url} target="_blank" rel="noreferrer">
      <ExternalLink size={14} />
      <span>
        <b>{candidate.title}</b>
        {candidate.channelName && <small>{candidate.channelName}</small>}
        {candidate.snippet && <small>{candidate.snippet}</small>}
        {candidate.availabilityVerifiedAt && <small>Public availability checked {new Date(candidate.availabilityVerifiedAt).toLocaleString()}</small>}
      </span>
    </a>)}
  </div>;
}

function CaptureSession({
  session,
  evidence,
  resolutions,
  discovery,
  onDeepVerify,
}: {
  session: VerificationCaptureSession;
  evidence: VerificationSessionEvidence[];
  resolutions: VerificationTaskResolution[];
  discovery: GameplayDiscoverySession | null;
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
}) {
  const latest = latestEvidenceForSession(evidence, session.sessionId);
  const evidenceCount = evidenceCountForSession(evidence, session.sessionId);
  const resolvedCount = resolvedTaskCount(resolutions, session.taskIds);
  const fullyResolved = resolvedCount === session.taskCount;

  return <div className={`verification-session impact-${session.impact} ${latest ? 'has-evidence' : ''} ${fullyResolved ? 'is-resolved' : ''}`}>
    <div className="verification-order">S{session.sessionOrder}</div>
    <div className="verification-icon"><Video size={16} /></div>
    <div className="verification-copy">
      <div className="verification-title">
        <strong>{session.name}</strong>
        <span>{fullyResolved
          ? `HUMAN RESOLVED · ${resolvedCount}/${session.taskCount} GAPS`
          : latest
            ? `EVIDENCE COLLECTED · ${resolvedCount}/${session.taskCount} RESOLVED`
            : `ONE CAPTURE · ${session.taskCount} GAPS`}</span>
      </div>
      <b>{fullyResolved
        ? 'All atomic gaps were explicitly resolved from human-confirmed findings'
        : latest
          ? 'Source saved; unresolved gaps still require human review'
          : session.actionLabel}</b>
      <ul className="verification-session-unknowns">
        {session.unknowns.map((unknown, index) => {
          const resolved = resolutions.find((row) => row.taskId === session.taskIds[index] && row.state === 'resolved');
          return <li key={session.taskIds[index]}>{resolved ? `Resolved: ${unknown}` : unknown}</li>;
        })}
      </ul>
      {!latest && discovery && <SourceSuggestions discovery={discovery} />}
      <small>{fullyResolved
        ? 'This is an owner review overlay. The canonical generated queue remains unchanged and the cited source/findings remain the evidence authority.'
        : latest
          ? `Latest linked source saved ${new Date(latest.createdAt).toLocaleString()}. Saving a source alone never resolves a gap.`
          : session.why}</small>
    </div>
    <div className="verification-action">
      <span>{session.impact} impact</span>
      <button onClick={() => onDeepVerify(session, latest?.videoId)}>{latest ? 'Open saved evidence' : 'Collect evidence'}</button>
      {latest && <em>{latest.sourceType === 'upload' ? 'Private upload' : 'YouTube source'} · {latest.status.replaceAll('_', ' ')}</em>}
      {!latest && discovery?.status === 'found' && <em>{discovery.candidates.length} public source suggestion{discovery.candidates.length === 1 ? '' : 's'}</em>}
    </div>
  </div>;
}

function discoveryBudgetLabel(discovery: GameplayDiscovery) {
  const provider = discovery.provider;
  if (provider.key === 'tavily') {
    return `Tavily Basic · ${provider.requestsUsedThisRun}/${provider.dailyRequestCap} request cap`;
  }
  if (provider.key === 'gemini_google_search') {
    return `${provider.name}${provider.model ? ` · ${provider.model}` : ''} · ${provider.requestsUsedThisRun}/${provider.dailyRequestCap} grounded prompts · ${provider.searchQueriesUsedThisRun} Google Search quer${provider.searchQueriesUsedThisRun === 1 ? 'y' : 'ies'} reported`;
  }
  return 'No discovery provider configured';
}

export function VerificationQueuePanel({
  queue,
  evidence,
  resolutions,
  discovery,
  evidenceError = null,
  resolutionError = null,
  discoveryError = null,
  onDeepVerify,
  onCompetitors,
}: {
  queue: VerificationQueue;
  evidence: VerificationSessionEvidence[];
  resolutions: VerificationTaskResolution[];
  discovery: GameplayDiscovery | null;
  evidenceError?: string | null;
  resolutionError?: string | null;
  discoveryError?: string | null;
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
  onCompetitors: () => void;
}) {
  const nonVideoActionable = queue.tasks
    .filter((task) => task.evidenceType !== 'deep_verify_video' && task.automationState !== 'optional_external')
    .slice(0, 12);
  const sessionsWithEvidence = queue.captureSessions.filter((session) => evidenceCountForSession(evidence, session.sessionId) > 0).length;
  const fullyResolvedSessions = queue.captureSessions.filter((session) => resolvedTaskCount(resolutions, session.taskIds) === session.taskCount).length;
  const resolvedVideoTasks = resolvedTaskCount(resolutions, queue.captureSessions.flatMap((session) => session.taskIds));
  const sessionsWithSuggestions = discovery?.sessions.filter((session) => session.status === 'found' && session.candidates.length > 0).length ?? 0;

  return <section className="panel verification-queue-panel">
    <div className="section-heading">
      <div>
        <h2>Automated Verification Queue</h2>
        <p>Every atomic task remains traceable to an explicit unresolved unknown. Related gameplay gaps are grouped into one capture session per candidate to reduce repeated evidence collection.</p>
      </div>
      <span>{queue.summary.taskCount} atomic tasks</span>
    </div>

    <div className="verification-summary">
      <span><b>{queue.summary.captureSessionCount}</b> capture sessions</span>
      <span><b>{queue.summary.groupedEvidenceTaskCount}</b> gameplay gaps</span>
      <span><b>{resolvedVideoTasks}</b> human-resolved video tasks</span>
      <span><b>{fullyResolvedSessions}</b> fully resolved sessions</span>
      <span><b>{sessionsWithEvidence}</b> sessions with evidence</span>
      <span><b>{sessionsWithSuggestions}</b> sessions with source suggestions</span>
      <span><b>{queue.summary.autoWaiting}</b> automated waiting</span>
    </div>

    {discovery && <div className="verification-discovery-status">
      <span>Public gameplay discovery · <b>{discovery.provider.status}</b></span>
      <span>{discoveryBudgetLabel(discovery)}</span>
      <span>Suggestions never resolve evidence gaps automatically.</span>
    </div>}
    {discovery?.provider.status === 'unconfigured' && <div className="verification-progress-warning">Optional public gameplay discovery is not configured in GitHub Actions. Add <code>TAVILY_API_KEY</code>, or reuse the existing Gemini credential as a GitHub Actions secret named <code>GEMINI_API_KEY</code>. Radar will prefer Tavily when both exist and otherwise use Gemini Google Search grounding. The Verification Queue and Deep Verify remain usable without either.</div>}
    {discovery && ['partial', 'failed'].includes(discovery.provider.status) && <div className="verification-progress-warning">Public gameplay discovery was {discovery.provider.status}. Existing verification work remains valid; failed searches did not create or resolve evidence.</div>}
    {evidenceError && <div className="verification-progress-warning">Generated verification work is still available, but owner evidence progress could not be loaded: {evidenceError}</div>}
    {resolutionError && <div className="verification-progress-warning">Generated verification work and saved evidence are still available, but human task resolutions could not be loaded: {resolutionError}</div>}
    {discoveryError && <div className="verification-progress-warning">Verification work remains available, but public gameplay suggestions are unavailable: {discoveryError}</div>}

    <div className="verification-session-heading">
      <div><strong>Evidence collection sessions</strong><span>One representative gameplay/menu capture can be reviewed against every atomic gap listed in that session. Owner evidence and resolution overlays never rewrite the generated queue.</span></div>
      <b>{queue.captureSessions.length - fullyResolvedSessions} session{queue.captureSessions.length - fullyResolvedSessions === 1 ? '' : 's'} still have open gaps</b>
    </div>
    <div className="verification-list verification-session-list">
      {queue.captureSessions.map((session) => <CaptureSession
        key={session.sessionId}
        session={session}
        evidence={evidence}
        resolutions={resolutions}
        discovery={discoveryForSession(discovery, session.sessionId)}
        onDeepVerify={onDeepVerify}
      />)}
    </div>

    <div className="verification-session-heading secondary">
      <div><strong>Other verification work</strong><span>Relationship judgments stay human-reviewed; exact rank history keeps collecting automatically.</span></div>
    </div>
    <div className="verification-list">
      {nonVideoActionable.map((task) => <div className={`verification-task impact-${task.impact}`} key={task.taskId}>
        <div className="verification-order">#{task.verificationOrder}</div>
        <div className="verification-icon"><TaskIcon task={task} /></div>
        <div className="verification-copy">
          <div className="verification-title"><strong>{task.name}</strong><span>{stateLabel(task)}</span></div>
          <b>{task.actionLabel}</b>
          <p>{task.unknown}</p>
          <small>{task.why}</small>
        </div>
        <div className="verification-action">
          <span>{task.impact} impact</span>
          {task.evidenceType === 'competitor_map' && <button onClick={onCompetitors}>Open Competitors</button>}
          {task.evidenceType === 'exact_rank_history' && <em>No manual action</em>}
        </div>
      </div>)}
    </div>

    <p className="verification-boundary">Search candidates are third-party public source suggestions, not gameplay findings. Public availability checks only prove that the YouTube URL was reachable through oEmbed at collection time; they do not verify what the video contains. Human resolved means an owner explicitly cited a category-matched timestamped finding already marked human-confirmed. Evidence collection alone never resolves a task. The canonical generated queue remains immutable and all resolution state is stored separately with source provenance.</p>
  </section>;
}
