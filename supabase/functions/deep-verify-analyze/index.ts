import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { z } from 'npm:zod@4.1.11';

const InputSchema = z.object({ videoId: z.string().uuid() });

const EventKeySchema = z.enum([
  'mechanic', 'controls', 'camera', 'ui', 'progression', 'monetization',
  'content', 'difficulty', 'bug', 'other',
]);

const GeminiResultSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  events: z.array(z.object({
    eventKey: EventKeySchema,
    label: z.string().trim().min(1).max(120),
    claim: z.string().trim().min(1).max(4000),
    startSeconds: z.number().min(0).max(1800),
    endSeconds: z.number().min(0).max(1800).nullable(),
    confidence: z.number().min(0).max(1),
    evidenceNote: z.string().trim().max(1000),
  }).superRefine((event, context) => {
    if (event.endSeconds != null && event.endSeconds < event.startSeconds) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['endSeconds'], message: 'endSeconds precedes startSeconds' });
    }
  })).max(40),
  unknowns: z.array(z.string().trim().min(1).max(500)).max(30),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resultJsonSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'A concise summary of what this specific footage positively demonstrates. Never state that an unobserved feature is absent.',
    },
    events: {
      type: 'array',
      description: 'Timestamped positive observations from the first 30 minutes only. Omit anything not sufficiently supported.',
      items: {
        type: 'object',
        properties: {
          eventKey: { type: 'string', enum: EventKeySchema.options },
          label: { type: 'string' },
          claim: { type: 'string' },
          startSeconds: { type: 'number' },
          endSeconds: { type: ['number', 'null'] },
          confidence: { type: 'number' },
          evidenceNote: { type: 'string' },
        },
        required: ['eventKey', 'label', 'claim', 'startSeconds', 'endSeconds', 'confidence', 'evidenceNote'],
      },
    },
    unknowns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Important questions this footage does not resolve. Phrase these as unknowns, never as absent features.',
    },
  },
  required: ['summary', 'events', 'unknowns'],
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const candidate = step as Record<string, unknown>;
    if (candidate.type !== 'model_output' || !Array.isArray(candidate.content)) continue;
    for (const content of candidate.content) {
      if (!content || typeof content !== 'object') continue;
      const block = content as Record<string, unknown>;
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) return block.text;
    }
  }
  throw new Error('Gemini completed without a text output block.');
}

function currentPublishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch { /* fall through to legacy key */ }
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (!legacy) throw new Error('Supabase publishable key is unavailable in the Edge Function environment.');
  return legacy;
}

function paidStandardEstimate(model: string, usage: Record<string, unknown> | undefined) {
  if (!usage) return 0;
  const inputTokens = Number(usage.total_input_tokens ?? 0);
  const outputTokens = Number(usage.total_output_tokens ?? 0);
  const thoughtTokens = Number(usage.total_thought_tokens ?? 0);
  const prices = model === 'gemini-3.8-flash'
    ? { input: 0.75, output: 3.75 }
    : { input: 0.30, output: 2.50 };
  return (inputTokens * prices.input + (outputTokens + thoughtTokens) * prices.output) / 1_000_000;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let runId: string | null = null;
  let videoId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return response({
        error: 'PROVIDER_UNCONFIGURED',
        message: 'Gemini video analysis is installed but GEMINI_API_KEY has not been configured in Supabase Edge Function secrets.',
      }, 503);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return response({ error: 'AUTH_REQUIRED', message: 'Owner sign-in is required.' }, 401);

    supabase = createClient(Deno.env.get('SUPABASE_URL')!, currentPublishableKey(), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return response({ error: 'AUTH_REQUIRED', message: 'Owner session is invalid or expired.' }, 401);

    const input = InputSchema.parse(await request.json());
    videoId = input.videoId;

    const { data: video, error: videoError } = await supabase
      .from('deep_verify_videos')
      .select('id, game_id, label, source_type, storage_path, external_url, mime_type, size_bytes, duration_seconds, status')
      .eq('id', videoId)
      .single();
    if (videoError || !video) return response({ error: 'EVIDENCE_NOT_FOUND', message: 'Deep Verify evidence was not found.' }, 404);

    if (video.status === 'analyzing') return response({ error: 'ANALYSIS_IN_PROGRESS', message: 'This evidence is already being analyzed.' }, 409);
    if (video.status === 'completed') return response({ error: 'ALREADY_ANALYZED', message: 'This evidence already has a completed automated analysis.' }, 409);
    if (video.source_type === 'upload' && Number(video.size_bytes ?? 0) > 100_000_000) {
      return response({
        error: 'HEAVY_WORKER_REQUIRED',
        message: 'Private uploads over 100 MB require the Gemini Files API heavy-worker path. The evidence remains safely stored and can still be reviewed manually.',
      }, 422);
    }

    let videoUri: string;
    if (video.source_type === 'youtube_url') {
      if (!video.external_url) throw new Error('YouTube evidence has no source URL.');
      videoUri = video.external_url;
    } else {
      if (!video.storage_path) throw new Error('Uploaded evidence has no storage path.');
      const { data: signed, error: signedError } = await supabase.storage.from('deep-verify').createSignedUrl(video.storage_path, 30 * 60);
      if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Could not create a temporary evidence URL.');
      videoUri = signed.signedUrl;
    }

    const model = Deno.env.get('GEMINI_VIDEO_MODEL')?.trim() || 'gemini-3.8-flash';
    const { data: run, error: runError } = await supabase.from('analysis_runs').insert({
      owner_id: userData.user.id,
      game_id: video.game_id,
      video_id: video.id,
      run_type: 'deep_verify_video',
      provider: 'gemini',
      model,
      prompt_version: 'deep-verify-video-v1',
      status: 'running',
      estimated_cost_usd: 0,
    }).select('id').single();
    if (runError || !run?.id) throw runError ?? new Error('Could not create an analysis run.');
    runId = String(run.id);

    const { error: analyzingError } = await supabase.from('deep_verify_videos').update({
      status: 'analyzing', provider: 'gemini', model, error_code: null, error_message: null, updated_at: new Date().toISOString(),
    }).eq('id', video.id);
    if (analyzingError) throw analyzingError;

    const prompt = `You are verifying gameplay evidence for an evidence-first mobile-game research tool. Analyze ONLY what this video positively supports.

Rules:
- Treat this footage as an incomplete sample, never as exhaustive proof of the whole game.
- Never conclude that a mechanic, monetization element, feature, or system is absent merely because it is not shown.
- If the footage does not resolve something important, put it in unknowns.
- Only report events you can ground to a visible or audible moment.
- Use timestamps within the first 30 minutes only. startSeconds/endSeconds are seconds from the beginning.
- For controls, distinguish visible input/touch evidence from inferred controls. If touch input is not visible, say so in evidenceNote and lower confidence.
- For monetization, only report ads, purchases, currencies, offers, or paywalls that are actually visible/audible.
- Keep claims concrete and development-relevant: core/secondary mechanics, controls, camera, UI, progression, monetization, content burden clues, difficulty, bugs/performance.
- Do not identify a game as a clone/follower or make causal success claims from footage.
- Return at most 40 high-signal events. Prefer fewer strong observations over weak speculation.`;

    const videoInput: Record<string, unknown> = {
      type: 'video',
      uri: videoUri,
      processing: 'agentic',
    };
    if (video.source_type === 'upload' && video.mime_type) videoInput.mime_type = video.mime_type;

    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        input: [videoInput, { type: 'text', text: prompt }],
        generation_config: { thinking_level: 'low', temperature: 0.1 },
        response_format: { type: 'text', mime_type: 'application/json', schema: resultJsonSchema },
      }),
    });

    const geminiPayload = await geminiResponse.json() as Record<string, unknown>;
    if (!geminiResponse.ok) {
      const upstreamMessage = typeof geminiPayload.message === 'string'
        ? geminiPayload.message
        : JSON.stringify(geminiPayload).slice(0, 1000);
      throw new Error(`Gemini request failed (${geminiResponse.status}): ${upstreamMessage}`);
    }
    if (geminiPayload.status && geminiPayload.status !== 'completed') {
      throw new Error(`Gemini interaction ended with status ${String(geminiPayload.status)}.`);
    }

    const result = GeminiResultSchema.parse(JSON.parse(extractOutputText(geminiPayload)));
    const origin = video.source_type === 'upload' ? 'user_capture' : 'third_party_public';

    if (result.events.length > 0) {
      const { error: insertError } = await supabase.from('deep_verify_events').insert(result.events.map((event) => ({
        owner_id: userData.user.id,
        video_id: video.id,
        analysis_run_id: runId,
        event_key: event.eventKey,
        label: event.label,
        claim: event.claim,
        start_seconds: event.startSeconds,
        end_seconds: event.endSeconds,
        origin,
        interpretation: 'ai_inferred',
        coverage: 'partial',
        review_state: 'unreviewed',
        confidence: event.confidence,
        evidence_note: event.evidenceNote,
      })));
      if (insertError) throw insertError;
    }

    const usage = geminiPayload.usage && typeof geminiPayload.usage === 'object'
      ? geminiPayload.usage as Record<string, unknown>
      : undefined;
    const estimatedCostUsd = paidStandardEstimate(model, usage);
    const completedAt = new Date().toISOString();

    const { error: completeRunError } = await supabase.from('analysis_runs').update({
      status: 'completed',
      completed_at: completedAt,
      estimated_cost_usd: estimatedCostUsd,
      dossier_snapshot: {
        kind: 'deep_verify_video_v1',
        summary: result.summary,
        unknowns: result.unknowns,
        interactionId: typeof geminiPayload.id === 'string' ? geminiPayload.id : null,
        usage: usage ?? null,
      },
    }).eq('id', runId);
    if (completeRunError) throw completeRunError;

    const deletionEligibleAt = video.source_type === 'upload'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { error: completeVideoError } = await supabase.from('deep_verify_videos').update({
      status: 'completed',
      provider: 'gemini',
      model,
      error_code: null,
      error_message: null,
      delete_after: deletionEligibleAt,
      updated_at: completedAt,
    }).eq('id', video.id);
    if (completeVideoError) throw completeVideoError;

    return response({
      ok: true,
      videoId: video.id,
      runId,
      model,
      summary: result.summary,
      unknowns: result.unknowns,
      eventCount: result.events.length,
      estimatedCostUsd,
      deletionEligibleAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Deep Verify analysis failure.';
    if (supabase && runId) {
      await supabase.from('analysis_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), dossier_snapshot: { kind: 'deep_verify_video_v1', error: message },
      }).eq('id', runId);
    }
    if (supabase && videoId) {
      await supabase.from('deep_verify_videos').update({
        status: 'failed', error_code: 'ANALYSIS_FAILED', error_message: message.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq('id', videoId);
    }
    return response({ error: 'ANALYSIS_FAILED', message }, 400);
  }
});
