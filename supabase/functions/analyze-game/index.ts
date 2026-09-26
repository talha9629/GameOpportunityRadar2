import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw new Error('Authentication required.');

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

    const appleResponse = await fetch(endpoint, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.1' } });
    if (!appleResponse.ok) throw new Error(`Apple metadata request failed (${appleResponse.status}).`);
    const payload = await appleResponse.json();
    const item = payload?.results?.[0];
    if (!item?.trackId || !item?.trackName || !item?.trackViewUrl) throw new Error('No matching iOS game was found.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: existingStore } = await supabase
      .from('store_apps')
      .select('id, game_id')
      .eq('platform', 'ios')
      .eq('store_id', String(item.trackId))
      .maybeSingle();

    let gameId = existingStore?.game_id as string | undefined;
    if (!gameId) {
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({ canonical_name: item.trackName, publisher: item.sellerName ?? item.artistName ?? null })
        .select('id')
        .single();
      if (gameError) throw gameError;
      gameId = game.id;

      const { error: storeError } = await supabase.from('store_apps').insert({
        game_id: gameId,
        platform: 'ios',
        store_id: String(item.trackId),
        store_url: item.trackViewUrl,
      });
      if (storeError) throw storeError;
    }

    const { data: observation, error: observationError } = await supabase
      .from('observations')
      .insert({
        game_id: gameId,
        origin: 'official_public',
        source_name: 'Apple iTunes Search/Lookup',
        source_url: endpoint,
        raw_value: item,
      })
      .select('id')
      .single();
    if (observationError) throw observationError;

    const directFindings = [
      ['publisher', 'Publisher', item.sellerName ?? item.artistName ?? 'Unknown'],
      ['rating', 'Current store rating', item.averageUserRating != null ? String(item.averageUserRating) : 'Unknown'],
      ['rating_count', 'Rating count', item.userRatingCount != null ? String(item.userRatingCount) : 'Unknown'],
      ['release_date', 'Release date', item.releaseDate ?? 'Unknown'],
      ['version_release_date', 'Current version release', item.currentVersionReleaseDate ?? 'Unknown'],
    ];

    const responseFindings = [];
    for (const [key, label, value] of directFindings) {
      const coverage = value === 'Unknown' ? 'unknown' : 'verified';
      const { data: finding, error: findingError } = await supabase
        .from('findings')
        .insert({
          game_id: gameId,
          key,
          label,
          value: { text: value },
          origin: 'official_public',
          interpretation: 'direct',
          coverage,
          confidence: coverage === 'verified' ? 1 : 0,
        })
        .select('id, review_state')
        .single();
      if (findingError) throw findingError;
      await supabase.from('finding_evidence').insert({ finding_id: finding.id, observation_id: observation.id });
      responseFindings.push({
        id: finding.id,
        key,
        label,
        value,
        origin: 'official_public',
        interpretation: 'direct',
        coverage,
        reviewState: finding.review_state,
        confidence: coverage === 'verified' ? 1 : 0,
        evidenceLabel: 'Apple store metadata captured in this analysis run',
      });
    }

    const game = {
      platform: 'ios',
      storeId: String(item.trackId),
      canonicalName: item.trackName,
      publisher: item.sellerName ?? item.artistName ?? null,
      storeUrl: item.trackViewUrl,
      iconUrl: item.artworkUrl512 ?? item.artworkUrl100 ?? null,
      description: item.description ?? null,
      rating: typeof item.averageUserRating === 'number' ? item.averageUserRating : null,
      ratingCount: Number.isInteger(item.userRatingCount) ? item.userRatingCount : null,
      releaseDate: item.releaseDate ?? null,
      currentVersionReleaseDate: item.currentVersionReleaseDate ?? null,
      screenshots: Array.isArray(item.screenshotUrls) ? item.screenshotUrls : [],
    };

    return Response.json({
      game,
      findings: responseFindings,
      unknowns: [
        'Core mechanic has not been gameplay-verified.',
        'Monetization placement is unknown until store/gameplay evidence is added.',
        'Meta progression and retention systems are unknown until Deep Verify.',
        'Competitor family has not been human-confirmed.',
        'Download/revenue performance is not available from this official Apple metadata source.',
      ],
      sourceMode: 'automated',
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected analysis failure.';
    return Response.json({ error: 'ANALYSIS_FAILED', message }, { status: 400, headers: corsHeaders });
  }
});
