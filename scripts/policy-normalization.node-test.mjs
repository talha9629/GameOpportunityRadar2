import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePolicySourceHtml, POLICY_NORMALIZATION_VERSION } from './policy-normalization.mjs';

const googleSource = { vendor: 'google' };
const appleSource = { vendor: 'apple' };

function googlePage(body, dynamicToken) {
  return `<main><h1>Ads</h1><p>${body}</p><h2>Was this helpful?</h2><p>Search</p><p>Main menu</p><p>${dynamicToken}</p><p>true</p></main>`;
}

test('policy normalization version is explicit', () => {
  assert.equal(POLICY_NORMALIZATION_VERSION, 2);
});

test('Google dynamic Help Center footer tokens do not change normalized policy evidence', () => {
  const first = normalizePolicySourceHtml(googleSource, googlePage('Interstitial ads must be dismissible.', '3448803100020895341'));
  const second = normalizePolicySourceHtml(googleSource, googlePage('Interstitial ads must be dismissible.', '12472115077303170337'));
  assert.equal(first, second);
  assert.equal(first, 'Ads\nInterstitial ads must be dismissible.');
});

test('Google policy-body edits still change normalized policy evidence', () => {
  const first = normalizePolicySourceHtml(googleSource, googlePage('Interstitial ads must be dismissible.', '111'));
  const second = normalizePolicySourceHtml(googleSource, googlePage('Interstitial ads must be dismissible within 15 seconds.', '222'));
  assert.notEqual(first, second);
});

test('Apple content is not truncated by Google-specific Help Center markers', () => {
  const normalized = normalizePolicySourceHtml(appleSource, '<main><h1>Review</h1><p>Rule A</p><h2>Was this helpful?</h2><p>Rule B</p></main>');
  assert.match(normalized, /Rule B/);
});
