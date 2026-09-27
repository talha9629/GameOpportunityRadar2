import { describe, expect, it } from 'vitest';
import { resolveAuthRedirectUrl } from './authRedirect';

describe('resolveAuthRedirectUrl', () => {
  it('preserves a GitHub Pages repository subpath for relative Vite bases', () => {
    expect(resolveAuthRedirectUrl('./', 'https://talha9629.github.io/GameOpportunityRadar2/#today'))
      .toBe('https://talha9629.github.io/GameOpportunityRadar2/');
  });

  it('resolves from the current app path rather than the origin root', () => {
    expect(resolveAuthRedirectUrl('./', 'https://example.com/tools/radar/index.html'))
      .toBe('https://example.com/tools/radar/');
  });

  it('keeps root-hosted deployments at the root', () => {
    expect(resolveAuthRedirectUrl('./', 'http://localhost:5173/'))
      .toBe('http://localhost:5173/');
  });
});
