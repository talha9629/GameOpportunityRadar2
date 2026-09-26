# Game Opportunity Radar 2.0

Cloud-first internal decision-support system for mobile-game opportunity research.

## Product goal

Answer: **What mobile-game opportunity is worth investigating or prototyping now, why, what evidence supports it, what remains unknown, and what is the next cheapest action that reduces uncertainty?**

Radar is not a clone generator, revenue predictor, or automatic game-selection engine.

## Current milestone

**M0 + M1: Foundation + Analyze a Game vertical slice**

Implemented in this repository:
- React + TypeScript + Vite web app
- Supabase-ready schema and RLS
- evidence/provenance model
- human review lifecycle for findings
- Apple App Store resolver via Supabase Edge Function
- explicit assisted/manual state for unsupported Android enrichment
- Zod validation at external boundaries
- CI build/type checks

## Architecture

Frontend: React/Vite/TypeScript
Backend: Supabase Postgres/Auth/RLS/Edge Functions
Source of truth: GitHub
Scheduled jobs: GitHub Actions (later milestones)
Heavy jobs: GitHub Actions first, Modal only when justified

## Environment

Copy `.env.example` to `.env` for local development or configure equivalent deployment variables:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never commit service-role keys or provider secrets.

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run test
```

## Product rule

A feature is not DONE because backend code exists. It is DONE only when the user can trigger it through the normal product workflow, inspect its result, see its evidence/uncertainty, and take the intended action.

See `docs/PRODUCT_AUTHORITY.md` for implementation rules and V1 boundaries.
