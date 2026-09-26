import { AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Search, ShieldAlert, Video } from 'lucide-react';
import { isDeepVerifyTopCandidateAction, normalizeDataHealthAction, type DataHealth } from './dataHealth';
import { requestDeepVerifyByAppId } from './navigation';

function StateIcon({ state }: { state: string }) {
  if (state === 'healthy') return <CheckCircle2 size={16} />;
  if (state === 'blocked') return <ShieldAlert size={16} />;
  if (state === 'maturing' || state === 'optional') return <Clock3 size={16} />;
  return <AlertTriangle size={16} />;
}

function actionLabel(action: string) {
  return normalizeDataHealthAction(action).toLowerCase().replaceAll('_', ' ');
}

export function DataHealthPanel({ health, onAnalyze }: { health: DataHealth; onAnalyze: (appId: string) => void }) {
  const overallLabel = health.overall.replaceAll('_', ' ');
  return <section className={`panel data-health-panel ${health.overall}`}>
    <div className="section-heading">
      <div><h2>Data Health</h2><p>Can today’s automated evidence be trusted before you make a research decision?</p></div>
      <span className="health-overall"><DatabaseZap size={15} /> {overallLabel}</span>
    </div>
    <div className="health-components">
      {health.components.map((item) => <article key={item.id} className={`health-component ${item.state}`}>
        <div className="health-component-head"><StateIcon state={item.state} /><strong>{item.label}</strong><span>{item.state}</span></div>
        <div className="health-facts">{item.facts.slice(0, 4).map((fact) => <small key={fact}>{fact}</small>)}</div>
        {item.action && <p>{item.action}</p>}
      </article>)}
    </div>
    <div className="health-actions">
      <div><strong>Next factual actions</strong><span>Derived from missing or degraded evidence—not from an AI success prediction.</span></div>
      {health.recommendedActions.length === 0 ? <span className="health-no-action">No evidence-pipeline action is currently required.</span> : health.recommendedActions.slice(0, 4).map((action) => {
        if (action.appId && isDeepVerifyTopCandidateAction(action.action)) {
          return <button key={`${action.action}-${action.appId}`} onClick={() => requestDeepVerifyByAppId(action.appId!)}><Video size={14} /><span><b>{actionLabel(action.action)}</b><small>{action.name} · {action.why}</small></span></button>;
        }
        if (action.appId) {
          return <button key={`${action.action}-${action.appId}`} onClick={() => onAnalyze(action.appId!)}><Search size={14} /><span><b>{actionLabel(action.action)}</b><small>{action.name} · {action.why}</small></span></button>;
        }
        return <div key={action.action} className="health-action-static"><span><b>{actionLabel(action.action)}</b><small>{action.why}</small></span></div>;
      })}
    </div>
  </section>;
}
