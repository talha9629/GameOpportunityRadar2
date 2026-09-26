# Game Opportunity Radar 2.0

Cloud-first internal decision-support system for mobile-game opportunity research.

## Product goal

Answer: **What mobile-game opportunity is worth investigating or prototyping now, why, what evidence supports it, what remains unknown, and what is the next cheapest action that reduces uncertainty?**

Radar is not a clone generator, revenue predictor, or automatic game-selection engine.

## Current milestone

**M0 + M1: Foundation + Analyze a Game vertical slice**

Implemented in this repository:
- React + TypeScript + Vite web app
- live Supabase Postgres/RLS backend
- evidence/provenance model
- session-local human review lifecycle for findings
- Apple App Store resolver via Supabase Edge Function
- explicit assisted/manual state for unsupported Android enrichment
- Zod validation at external boundaries
- GitHub CI and dependency-audit workflows
- GitHub Pages deployment

## Temporary public-preview mode

The current M1 build opens directly without sign-in. The public `analyze-game` Edge Function is intentionally **read-only/stateless**: it fetches official Apple metadata and returns structured evidence, but it does not read from or write to the private Radar database tables. Finding review actions are session-local in the browser for now.

This mode is temporary. Authenticated persistence will return when saved dossiers/history become part of the active milestone.

## Architecture

Frontend: React/Vite/TypeScript
Backend: Supabase Postgres/RLS/Edge Functions
Source of truth: GitHub
Scheduled jobs: GitHub Actions (later milestones)
Heavy jobs: GitHub Actions first, Modal only when justified

## Cloud backend

Supabase project: `Game Opportunity Radar 2`
Region: `ap-south-1`
Edge Function: `analyze-game` public/read-only for the current preview
RLS: private per-user ownership remains enabled on Radar tables

## Environment

Configure these public frontend variables in the deployment environment:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never commit service-role keys or provider secrets.

## Commands

```bash
npm ci
npm run typecheck
npm run build
npm run test
```

## Product rule

A feature is not DONE because backend code exists. It is DONE only when the user can trigger it through the normal product workflow, inspect its result, see its evidence/uncertainty, and take the intended action.

See `docs/PRODUCT_AUTHORITY.md` for implementation rules and V1 boundaries.
