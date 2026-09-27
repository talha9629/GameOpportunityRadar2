import { createHash } from 'node:crypto';

// v3 keeps the v2 text normalization rules but changes snapshot identity to be
// normalization-version aware. This prevents an unchanged text hash from
// making an older snapshot file appear to have been produced by a newer normalizer.
export const POLICY_NORMALIZATION_VERSION = 3;

function decodeEntities(value) {
  const named = new Map([
    ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' '],
    ['ndash', '–'], ['mdash', '—'], ['hellip', '…'], ['rsquo', '’'], ['lsquo', '‘'],
    ['rdquo', '”'], ['ldquo', '“'], ['middot', '·'],
  ]);
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

export function normalizePolicyHtml(html) {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let value = mainMatch?.[1] ?? html;
  value = value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|tr|section|article|div|dt|dd|table|ul|ol)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');

  value = decodeEntities(value).replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  const lines = value.split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^(skip to (main )?content|sign in|send feedback)$/i.test(line));

  const compact = [];
  for (const line of lines) {
    if (compact.at(-1) !== line) compact.push(line);
  }
  return compact.join('\n').trim();
}

function stripGoogleHelpChrome(normalizedText) {
  const footerMarkers = [
    '\nWas this helpful?\n',
    '\nNeed more help?\n',
  ];
  let cutAt = -1;
  for (const marker of footerMarkers) {
    const index = normalizedText.indexOf(marker);
    if (index >= 0 && (cutAt < 0 || index < cutAt)) cutAt = index;
  }
  return (cutAt >= 0 ? normalizedText.slice(0, cutAt) : normalizedText).trim();
}

export function normalizePolicySourceHtml(source, html) {
  const normalized = normalizePolicyHtml(html);
  return source?.vendor === 'google' ? stripGoogleHelpChrome(normalized) : normalized;
}

export function policyTextHash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
