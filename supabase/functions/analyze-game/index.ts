import { z } from 'npm:zod@4.1.11';

const InputSchema = z.object({ input: z.string().trim().min(2).max(500) });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function appleIdFromInput(input: string) {
  const match = input.match(/id(\d{5,})/i) ?? input.match(/^\d{5,}$/);
  return Array.isArray(match) ? (match[1] ?? match[0]) : null;
}

function isGooglePlayInput(input: string) {
  return /play\.google\.com|^[a-zA-Z][\w]*(?:\.[\w]+){2,}$/.test(input);
}

function matches(description: string, candidates: Array<[string, RegExp]>) {
  return candidates.filter(([, pattern]) => pattern.test(description)).map(([label]) => label);
}

function listingFindings(description: string) {
  const mechanics = matches(description, [
    ['Sudoku-like', /\bsudoku\b/i], ['Minesweeper-like', /\bminesweeper\b/i], ['Puzzle', /\bpuzzle\b/i],
    ['Merge', /\bmerge\b/i], ['Sorting', /\bsort(?:ing)?\b/i], ['Parking', /\bparking\b/i],
    ['Runner', /\brunner\b/i], ['Idle', /\bidle\b/i], ['Tycoon', /\btycoon\b/i],
    ['Hidden object', /hidden object/i], ['Word', /\bword\b/i], ['Physics', /\bphysics\b/i],
    ['Destruction', /\bdestruct(?:ion|ive)\b/i],
  ]);
  const controls = matches(description, [
    ['Double tap', /double[- ]tap/i], ['Tap', /\btap\b/i], ['Swipe', /\bswipe\b/i], ['Drag', /\bdrag\b/i],
  ]);
  const systems = matches(description, [
    ['Daily content', /daily (?:puzzle|challenge|reward|quest|mission)/i], ['Leaderboard', /leaderboard/i],
    ['Offline play', /offline|no internet required/i], ['Multiplayer', /multiplayer/i], ['Collection', /collect(?:ion|ible|ing)/i],
    ['Upgrade system', /upgrade/i], ['Levels', /\blevels?\b/i], ['Lives/hearts', /\bhearts?\b|\blives\b/i],
  ]);
  const monetization = matches(description, [
    ['Ads mentioned', /\bads?\b|advertis/i], ['In-app purchases mentioned', /in[- ]app purchase|\biap\b/i],
    ['No-interruption ad claim', /non[- ]intrusive ads|zero interruptions/i],
  ]);

  const groups: Array<[string, string, string[]]> = [
    ['listing_mechanics', 'Publisher-described mechanics', mechanics],
    ['listing_controls', 'Publisher-described controls', controls],
    ['listing_systems', 'Publisher-described systems', systems],
    ['listing_monetization', 'Publisher-described monetization', monetization],
  ];

  return groups.filter(([, , values]) => values.length > 0).map(([key, label, values]) => ({
    id: crypto.randomUUID(),
    key,
    label,
    value: values.join(', '),
    origin: 'official_public',
    interpretation: 'direct',
    coverage: 'partial',
    reviewState: 'unreviewed',
    confidence: 0.8,
    evidenceLabel: 'Explicit wording in the publisher-provided App Store description; gameplay verification still required',
  }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = InputSchema.parse(await request.json());
    if (isGooglePlayInput(body.input)) {
      return Response.json({
        error: 'ANDROID_ASSISTED_REQUIRED',
        message: 'Automatic Google Play competitor enrichment is intentionally not implemented yet. Add AppBrain/selective evidence instead of scraping or inventing Android data.',
      }, { status: 422, headers: corsHeaders });
    }

    const appleId = appleIdFromInput(body.input);
    const endpoint = appleId
      ? `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&country=us`
      : `https://itunes.apple.com/search?term=${encodeURIComponent(body.input)}&entity=software&country=us&limit=5`;

    const appleResponse = await fetch(endpoint, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.2' } });
    if (!appleResponse.ok) throw new Error(`Apple metadata request failed (${appleResponse.status}).`);
    const payload = await appleResponse.json();
    const item = payload?.results?.[0];
    if (!item?.trackId || !item?.trackName || !item?.trackViewUrl) throw new Error('No matching iOS game was found.');

    const directFindings = [
      ['publisher', 'Publisher', item.sellerName ?? item.artistName ?? 'Unknown'],
      ['rating', 'Current store rating', item.averageUserRating != null ? String(item.averageUserRating) : 'Unknown'],
      ['rating_count', 'Rating count', item.userRatingCount != null ? String(item.userRatingCount) : 'Unknown'],
      ['release_date', 'Release date', item.releaseDate ?? 'Unknown'],
      ['version_release_date', 'Current version release', item.currentVersionReleaseDate ?? 'Unknown'],
    ].map(([key, label, value]) => {
      const coverage = value === 'Unknown' ? 'unknown' : 'verified';
      return {
        id: crypto.randomUUID(), key, label, value, origin: 'official_public', interpretation: 'direct', coverage,
        reviewState: 'unreviewed', confidence: coverage === 'verified' ? 1 : 0,
        evidenceLabel: 'Apple store metadata returned in this analysis request',
      };
    });

    const description = typeof item.description === 'string' ? item.description : '';
    const game = {
      platform: 'ios', storeId: String(item.trackId), canonicalName: item.trackName,
      publisher: item.sellerName ?? item.artistName ?? null, storeUrl: item.trackViewUrl,
      iconUrl: item.artworkUrl512 ?? item.artworkUrl100 ?? null, description: description || null,
      rating: typeof item.averageUserRating === 'number' ? item.averageUserRating : null,
      ratingCount: Number.isInteger(item.userRatingCount) ? item.userRatingCount : null,
      releaseDate: item.releaseDate ?? null, currentVersionReleaseDate: item.currentVersionReleaseDate ?? null,
      screenshots: Array.isArray(item.screenshotUrls) ? item.screenshotUrls : [],
    };

    return Response.json({
      game,
      findings: [...directFindings, ...listingFindings(description)],
      unknowns: [
        'Core mechanic has not been gameplay-verified.',
        'Monetization placement and frequency are unknown until gameplay evidence is added.',
        'Meta progression and retention systems are only partially observable from the listing.',
        'Competitor family and differentiation room have not been human-confirmed.',
        'Momentum and saturation require chart/trend history and are not inferred from listing popularity.',
        'Download/revenue performance is not available from this official Apple metadata source.',
      ],
      sourceMode: 'automated',
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected analysis failure.';
    return Response.json({ error: 'ANALYSIS_FAILED', message }, { status: 400, headers: corsHeaders });
  }
});
