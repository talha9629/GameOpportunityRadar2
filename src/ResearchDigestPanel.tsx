import { AlertTriangle, ArrowDown, ArrowUp, Clock3, Minus, Sparkles } from 'lucide-react';
import type { ResearchDigest } from './researchDigest';

function ChangeIcon({ type }: { type: string }) {
  if (/INCREASED|EXPANDED|IMPROVED|MATURED|NEW_TO/.test(type)) return <ArrowUp size={15} />;
  if (/DECREASED|CONTRACTED|DECLINED|DROPPED/.test(type)) return <ArrowDown size={15} />;
  return <Minus size={15} />;
}

export function ResearchDigestPanel({ digest, onAnalyze }: { digest: ResearchDigest; onAnalyze: (appId: string) => void }) {
  if (digest.status === 'history_pending') {
    return <section className="panel digest-panel digest-pending">
      <div className="section-heading"><div><h2>Daily Change Digest</h2><p>Exact-date comparison only. No synthetic “yesterday” is created.</p></div><span><Clock3 size={14} /> history pending</span></div>
      <div className="digest-empty"><AlertTriangle size={18} /><div><strong>No September-style change claims yet.</strong><span>The exact comparison snapshot for {digest.comparisonDate} does not exist, so Radar reports zero changes rather than guessing them.</span></div></div>
    </section>;
  }

  const attention = digest.changes.filter((change) => change.significance === 'attention');
  const displayChanges = [...attention, ...digest.changes.filter((change) => change.significance === 'info')].slice(0, 10);

  return <section className="panel digest-panel">
    <div className="section-heading">
      <div><h2>Daily Change Digest</h2><p>What materially changed since the exact {digest.comparisonDate} research queue.</p></div>
      <span>{digest.summary.attentionCount} attention · {digest.summary.changeCount} total</span>
    </div>
    <div className="digest-kpis">
      <span><b>{digest.summary.newCandidates}</b> new</span>
      <span><b>{digest.summary.droppedCandidates}</b> dropped</span>
      <span><b>{digest.summary.marketChanges}</b> market shifts</span>
      <span><b>{digest.summary.maturityEvents}</b> maturity events</span>
    </div>
    {displayChanges.length === 0 ? <div className="digest-empty"><Sparkles size={18} /><div><strong>No material queue changes.</strong><span>The exact daily comparison completed, but none crossed the digest thresholds.</span></div></div> : <div className="digest-list">
      {displayChanges.map((change, index) => <button key={`${change.type}-${change.appId}-${index}`} className={`digest-change ${change.significance}`} onClick={() => onAnalyze(change.appId)}>
        <ChangeIcon type={change.type} />
        <span className="digest-change-main"><strong>{change.name}</strong><small>{change.type.replaceAll('_', ' ')}</small></span>
        <span className="digest-evidence">{change.evidence[0]}</span>
      </button>)}
    </div>}
  </section>;
}
