import { ChevronDown } from 'lucide-react';
import './evidence-legend.css';

export function EvidenceLegend() {
  return <details className="evidence-legend panel">
    <summary>
      <span>
        <strong>How to read these signals</strong>
        <small>Rank movement, exact-history windows, visibility, and trend states</small>
      </span>
      <ChevronDown size={18} aria-hidden="true" />
    </summary>
    <div className="evidence-legend-grid">
      <section>
        <h3>Rank movement</h3>
        <p><b>↑ N</b> moved up N chart places since the previous comparable observation.</p>
        <p><b>↓ N</b> moved down N places. <b>NEW</b> entered the observed range. <b>—</b> means no rank change.</p>
      </section>
      <section>
        <h3>Exact-history windows</h3>
        <p><b>1d / 3d / 7d +N</b> compares exact dated observations only.</p>
        <p><b>?</b> required history is missing. <b>!</b> that market failed collection. <b>SRC</b> source classes are incompatible, so no movement is inferred. <b>IN</b> means the title was not present in the same tracked range on the comparison date.</p>
      </section>
      <section>
        <h3>Visibility</h3>
        <p><b>VIS N%</b> is bounded rank visibility inside the observed chart depth. It is not download share, revenue share, market share, or probability of success.</p>
      </section>
      <section>
        <h3>Trend state</h3>
        <p><b>RISING / DECLINING / EMERGING / STABLE</b> summarize exact observed rank history only.</p>
        <p><b>INSUFFICIENT DATA</b> means the evidence gate is not met yet. Radar does not interpolate missing days.</p>
      </section>
    </div>
  </details>;
}
