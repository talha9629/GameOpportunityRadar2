import { PLATFORM_META, TRACKED_APPLE_MARKETS, type PlatformScope } from './platformScope';

export function PlatformContextPanel({ scope }: { scope: PlatformScope }) {
  const meta = PLATFORM_META[scope];
  return <section className="panel platform-context">
    <div className="platform-context-head">
      <div>
        <div className="eyebrow">RESEARCH SCOPE</div>
        <h2>{meta.label}</h2>
        <p>{meta.description}</p>
      </div>
      <span className="platform-badge">{meta.status.replaceAll('_', ' ')}</span>
    </div>
    {(scope === 'apple' || scope === 'cross') && <>
      <div className="market-strip" aria-label="Tracked Apple storefronts">
        {TRACKED_APPLE_MARKETS.map((market) => <span className="market-chip" key={market.code}><b>{market.short}</b>{market.label}</span>)}
      </div>
      <div className="platform-source-note"><strong>Market ≠ platform.</strong> These four markets are country storefronts for the Apple App Store: United States, United Kingdom, Canada, and Australia. Google Play and Amazon Fire use separate source coverage and are never inferred from these Apple ranks.</div>
    </>}
  </section>;
}
