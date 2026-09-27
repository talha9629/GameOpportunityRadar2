import { PLATFORM_META, type PlatformScope } from './platformScope';
import './platform-scope.css';

const scopes: PlatformScope[] = ['cross', 'apple', 'google_play', 'amazon_fire'];

export function PlatformScopeSelector({
  value,
  onChange,
}: {
  value: PlatformScope;
  onChange: (scope: PlatformScope) => void;
}) {
  return <div className="platform-scope-selector" aria-label="Research platform">
    <span>Platform</span>
    <div className="platform-scope-buttons">
      {scopes.map((scope) => {
        const meta = PLATFORM_META[scope];
        return <button
          key={scope}
          className={`${value === scope ? 'active' : ''} status-${meta.status}`}
          onClick={() => onChange(scope)}
          title={meta.description}
          aria-pressed={value === scope}
        >
          {meta.shortLabel}
        </button>;
      })}
    </div>
  </div>;
}
