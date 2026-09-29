import { AlertTriangle, ArrowDown, ArrowUp, Clock3, Minus, Search, Sparkles } from 'lucide-react';
import type { ResearchChange, ResearchDigest } from './researchDigest';
import './researchDigest.css';

function ChangeIcon({ type }: { type: string }) {
  if (/^EXACT_[37]D_COMPARISON_AVAILABLE$/.test(type)) return <Clock3 size={15} />;
  if (/INCREASED|EXPANDED|IMPROVED|NEW_TO/.test(type)) return <ArrowUp size={15} />;
  if (/DECREASED|CONTRACTED|DECLINED|DROPPED/.test(type)) return <ArrowDown size={15} />;
  return <Minus size={15} />;
}

function changeLabel(type: string) {
  const labels: Record<string, string> = {
    PRIORITY_INCREASED: 'Research priority increased',
    PRIORITY_DECREASED: 'Research priority decreased',
    NEW_TO_RESEARCH_QUEUE: 'New to research queue',
    DROPPED_FROM_RESEARCH_QUEUE: 'Dropped from research queue',
    CROSS_MARKET_EXPANDED: 'Cross-market presence expanded',
    CROSS_MARKET_CONTRACTED: 'Cross-market presence contracted',
    BEST_RANK_IMPROVED: 'Best rank improved',
    BEST_RANK_DECLINED: 'Best rank declined',
    EXACT_3D_COMPARISON_AVAILABLE: 'Exact 3-day comparison available',
    EXACT_7D_COMPARISON_AVAILABLE: 'Exact 7-day comparison available',
  };
  return labels[type] ?? type.replaceAll('_', ' ').toLowerCase();
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function metricLine(change: ResearchChange) {
  if (change.type === 'PRIORITY_INCREASED' || change.type === 'PRIORITY_DECREASED') {
    return change.previous != null && change.current != null && change.delta != null
      ? `priority ${change.previous} → ${change.current} (${signed(change.delta)})`
      : 'priority changed';
  }
  if (change.type === 'BEST_RANK_IMPROVED' || change.type === 'BEST_RANK_DECLINED') {
    return change.previous != null && change.current != null && change.delta != null
      ? `best #${change.previous} → #${change.current} (${signed(change.delta)} ranks)`
      : 'best rank changed';
  }
  if (change.type === 'CROSS_MARKET_EXPANDED' || change.type === 'CROSS_MARKET_CONTRACTED') {
    return change.previous != null && change.current != null
      ? `${change.previous} → ${change.current} healthy markets`
      : 'market presence changed';
  }
  if (change.type === 'NEW_TO_RESEARCH_QUEUE') {
    const bits = [
      change.currentQueueRank != null ? `queue #${change.currentQueueRank}` : null,
      change.current != null ? `priority ${change.current}` : null,
      change.currentBestRank != null ? `best #${change.currentBestRank}` : null,
      change.currentMarketCount != null ? `${change.currentMarketCount} markets` : null,
    ].filter(Boolean);
    return bits.join(' · ') || 'new deterministic queue candidate';
  }
  if (change.type === 'DROPPED_FROM_RESEARCH_QUEUE') {
    const bits = [
      change.previousQueueRank != null ? `was queue #${change.previousQueueRank}` : null,
      change.previous != null ? `priority ${change.previous}` : null,
      change.previousBestRank != null ? `best #${change.previousBestRank}` : null,
      change.previousMarketCount != null ? `${change.previousMarketCount} markets` : null,
    ].filter(Boolean);
    return bits.join(' · ') || 'no longer in deterministic top-12 queue';
  }
  if (/^EXACT_[37]D_COMPARISON_AVAILABLE$/.test(change.type)) {
    const days = change.type.includes('7D') ? 7 : 3;
    return `${days}d exact comparison now available${change.currentBestRank != null ? ` · current best #${change.currentBestRank}` : ''}`;
  }
  return change.evidence[0] ?? 'Observed queue change';
}

export function ResearchDigestPanel({ digest, onAnalyze }: { digest: ResearchDigest; onAnalyze: (appId: string) => void }) {
  if (digest.status === 'history_pending') {
    return <section className="panel digest-panel digest-pending">
      <div className="section-heading"><div><h2>Daily Change Digest</h2><p>Exact-date comparison only. No synthetic “yesterday” is created.</p></div><span><Clock3 size={14} /> history pending</span></div>
      <div className="digest-empty"><AlertTriangle size={18} /><div><strong>No daily change claims yet.</strong><span>The exact comparison snapshot for {digest.comparisonDate} does not exist, so Radar reports zero changes rather than guessing them.</span></div></div>
    </section>;
  }

  const attention = digest.changes.filter((change) => change.significance === 'attention');
  const displayChanges = [...attention, ...digest.changes.filter((change) => change.significance === 'info')].slice(0, 12);

  return <section className="panel digest-panel">
    <div className="section-heading">
      <div><h2>Daily Change Digest</h2><p>Observed differences versus the exact {digest.comparisonDate} research queue. Each row is factual triage context, not a success forecast or an independent trend classification.</p></div>
      <span>{digest.summary.attentionCount} attention · {digest.summary.changeCount} total</span>
    </div>
    <div className="digest-kpis">
      <span><b>{digest.summary.newCandidates}</b> new</span>
      <span><b>{digest.summary.droppedCandidates}</b> dropped</span>
      <span><b>{digest.summary.marketChanges}</b> market shifts</span>
      <span><b>{digest.summary.comparisonAvailabilityEvents}</b> exact windows opened</span>
    </div>
    {displayChanges.length === 0 ? <div className="digest-empty"><Sparkles size={18} /><div><strong>No material queue changes.</strong><span>The exact daily comparison completed, but none crossed the digest thresholds.</span></div></div> : <div className="digest-list">
      {displayChanges.map((change, index) => <article key={`${change.type}-${change.appId}-${index}`} className={`digest-change ${change.significance}`}>
        <div className="digest-change-direction"><ChangeIcon type={change.type} /></div>
        {change.iconUrl ? <img className="digest-app-icon" src={change.iconUrl} alt="" /> : <div className="digest-app-icon placeholder" />}
        <div className="digest-change-main">
          <strong>{change.name}</strong>
          <span className="digest-publisher">{change.publisher ?? 'Publisher unavailable'}</span>
          <small>{changeLabel(change.type)}</small>
        </div>
        <div className="digest-change-detail">
          <strong>{metricLine(change)}</strong>
          <div className="digest-evidence-list">{change.evidence.slice(0, 2).map((evidence, evidenceIndex) => <span key={evidenceIndex}>{evidence}</span>)}</div>
        </div>
        <button onClick={() => onAnalyze(change.appId)} aria-label={`Analyze ${change.name}`}><Search size={14} /> Analyze</button>
      </article>)}
    </div>}
  </section>;
}
