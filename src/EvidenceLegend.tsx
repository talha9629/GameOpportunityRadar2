import { ChevronDown } from 'lucide-react';
import './evidence-legend.css';

type LegendMode = 'market' | 'analysis' | 'all';

export function EvidenceLegend({ mode = 'market' }: { mode?: LegendMode }) {
  const showMarket = mode === 'market' || mode === 'all';
  const showAnalysis = mode === 'analysis' || mode === 'all';

  return <details className="evidence-legend panel">
    <summary>
      <span>
        <strong>How to read this evidence</strong>
        <small>{showMarket && showAnalysis
          ? 'Source, review, rank, history, visibility, and trend states'
          : showAnalysis
            ? 'Evidence coverage, interpretation, and human review states'
            : 'Rank movement, exact-history windows, visibility, and trend states'}</small>
      </span>
      <ChevronDown size={18} aria-hidden="true" />
    </summary>
    <div className="evidence-legend-grid">
      {showAnalysis && <>
        <section>
          <h3>Evidence coverage</h3>
          <p><b>Verified</b> means the claim is directly supported by the cited source. <b>Partial</b> means the source supports only part of the claim.</p>
          <p><b>Inferred</b> is interpretation rather than a direct source fact. <b>Unknown</b> means Radar does not have admissible evidence yet.</p>
        </section>
        <section>
          <h3>Human review</h3>
          <p><b>Unreviewed</b> has not been decided by you. <b>Human confirmed</b> accepts the cited finding. <b>Human rejected</b> rejects it.</p>
          <p><b>Needs more evidence</b> keeps the claim unresolved and routes it toward verification rather than pretending certainty.</p>
        </section>
        <section>
          <h3>Source & interpretation</h3>
          <p><b>Official public</b> identifies first-party public source material. Third-party estimates stay labeled as third-party.</p>
          <p><b>Direct</b> means the source explicitly says/shows it. <b>AI inferred</b> or <b>human inferred</b> are interpretations and never become direct facts automatically.</p>
        </section>
        <section>
          <h3>Confidence</h3>
          <p>Confidence describes how strongly the current source supports that finding. It is <b>not</b> probability that the game will succeed.</p>
          <p>Unknown market dimensions stay unknown until their own evidence exists.</p>
        </section>
      </>}

      {showMarket && <>
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
      </>}
    </div>
  </details>;
}
