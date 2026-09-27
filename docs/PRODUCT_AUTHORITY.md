# Radar 2.0 Product Authority

This file governs implementation decisions until superseded by an explicitly approved revision.

## Product mission
Game Opportunity Radar 2.0 is an evidence-first mobile-game market intelligence and decision-support system for an indie developer.

Its job is to help answer one practical question:

**What deserves investigation, verification, watching, passing on, or prototyping next — and why?**

Radar is not a clone generator and must never claim that market evidence predicts success.

The core operating rule is:

**REAL EVIDENCE → EXPLICIT UNKNOWNS → VERIFICATION → HUMAN REVIEW → DECISION**

Never:

**AI GUESS → FAKE CONFIDENCE → BUILD THIS**

## Primary outcome
Radar should improve the decision to **PROTOTYPE, VERIFY, WATCH, TOO LATE, or PASS** on a mobile-game opportunity.

## Non-negotiable rules
1. GitHub `main` is the source of truth. No hidden local-only production code.
2. A feature is not DONE until the user can trigger it in the normal UI, inspect the result, see evidence/uncertainty, and take the intended action.
3. Unknown is valid. Never fill missing facts to make an analysis look complete.
4. Observed facts, third-party estimates, human input, and AI inference remain separate evidence classes.
5. External/API/AI payloads must validate before entering canonical tables.
6. Partial collection success is persisted; one failing source must not discard successful observations.
7. Human-review states must have explicit transitions. No permanent unreviewed dead ends.
8. Competitor relation labels are suggestions until human-confirmed.
9. Correlation may generate hypotheses, never causal claims without supporting evidence.
10. Never recommend copying protected branding, store presentation, characters, art, UI, or other protected expression.
11. App/store rank is not downloads, revenue, retention, or demand. Never silently substitute one for another.
12. AI inference is not human-confirmed evidence.
13. Absence in footage or supplied samples is not evidence that a feature never exists.
14. Storefront identity and source provenance must remain explicit. Apple, Google Play, Amazon Appstore, and cross-platform views must not silently reuse one another's evidence.
15. Historical gaps are not interpolated. Missing observations remain missing.
16. Provider-specific estimates must remain visibly attributed to that provider.
17. New work must map to an approved milestone below. Later-stage capabilities may remain on `main` if they are correctly scoped, gated, and do not weaken earlier acceptance criteria.

## Milestone authority

### M1 — Analyze a Game
Goal: turn one iOS store listing into an inspectable, evidence-backed dossier.

Required capabilities:
- identify an iOS game from App Store URL, numeric ID, or title;
- force explicit title selection when search is ambiguous;
- capture/store raw Apple metadata observation;
- create direct findings linked to that observation;
- keep publisher claims distinct from verified gameplay facts;
- expose human confirm/reject/needs-evidence actions;
- display explicit unknowns;
- preserve source observation time and provenance;
- save/reopen owner dossiers without changing evidence meaning;
- return an explicit assisted/manual result for unsupported Android enrichment;
- remain understandable on mobile without hover-only explanations.

M1 is the vertical-slice acceptance gate. Later milestones may exist in production, but major expansion should not hide an M1 usability failure.

### M2 — Opportunity Radar
Goal: identify titles and movement worth investigating without inventing demand or success signals.

Authorized capabilities:
- official Apple chart collection;
- exact-date historical snapshots;
- trend/movement signals with explicit history maturity;
- research queue / candidate routing;
- data health and source freshness;
- Today/Radar views;
- watch/investigate/verify routing based on deterministic evidence contracts.

Rules:
- no historical interpolation;
- `not ranked` is valid only when a complete declared chart was successfully observed;
- insufficient history must remain `INSUFFICIENT_DATA`;
- rank movement is evidence of chart movement only, not downloads/revenue/success.

### M3 — Deconstructor & Verification
Goal: understand what a game appears to do, identify unresolved evidence gaps, and turn those gaps into reviewable verification work.

Authorized capabilities:
- competitor mapping with human-confirmed relationships;
- differentiation/saturation evidence mapping;
- manually supplied player-review sample analysis;
- verification queue;
- Deep Verify using private footage or public references;
- timestamped findings;
- AI-assisted finding drafts that remain distinct from human review;
- explicit verification-task resolution and provenance locks.

Rules:
- supplied review samples describe only that sample;
- competitor relevance remains suggested until human-confirmed;
- no unauthorized video downloading/rehosting;
- footage can support observed-presence claims, not universal absence claims.

### M4 — Platform Expansion
Goal: extend research beyond Apple without borrowing Apple evidence or pretending incomparable provider metrics are equivalent.

Authorized capabilities:
- Google Play research through approved providers such as AppBrain;
- Amazon Appstore / Fire research where evidence is available;
- storefront-qualified persistence and evidence libraries;
- cross-platform coverage views;
- optional Tavily/Gemini source discovery;
- optional paid intelligence providers when explicitly configured and budget-capped.

Rules:
- platform/storefront identity is mandatory for persisted evidence;
- Apple rank data must never populate Google/Amazon fields;
- Google Play provider positions/estimates must remain attributed to the provider;
- missing provider access is `unconfigured`/unknown, not zero or not-ranked;
- paid-provider use must be optional, explicit, and budget-bounded.

### M5 — Governance & Decision Support
Goal: help the developer make and revisit decisions using durable evidence, policy awareness, and explicit uncertainty.

Authorized capabilities:
- Policy Watch using official sources;
- stability-confirmed policy change detection;
- richer decision support and prototype/watch/pass workflows;
- saved decision history;
- policy/data-health warnings that influence confidence without fabricating facts.

Rules:
- dynamic page chrome must not become a confirmed policy change;
- policy confirmation requires comparable, stable observations with provenance;
- AI interpretation cannot itself become a confirmed policy fact.

## Explicitly out of scope unless separately approved
- automated game generation;
- clone generation;
- autonomous gameplay agents that make final human-review decisions;
- causal claims from correlation alone;
- scraping or bypassing access controls where an approved source/API is unavailable;
- public multi-tenant SaaS expansion unless explicitly chartered;
- copying protected branding, characters, art, UI, store presentation, or other protected expression.

## Product UX authority
Radar is a decision-support tool, not an internal engineering dashboard. A screen must make clear:
1. **What am I looking at?**
2. **What evidence supports it?**
3. **What is still unknown?**
4. **What should I do next?**

Therefore:
- meaningful states may not depend on hover-only tooltips;
- badges/status codes must have a visible or tap-accessible legend/glossary;
- mobile touch usage is first-class;
- navigation should reflect the user workflow rather than implementation modules;
- duplicate implementations of the same user-facing capability should be consolidated;
- shared visual tokens should define the product palette, spacing, and radii rather than incidental per-file values.

## Navigation principle
The product workflow is:

**RADAR → ANALYZE → VERIFY → LIBRARY / DECISION**

Top-level navigation should stay close to that workflow. Sub-capabilities such as Trends, Saved Dossiers, Competitors, Review Samples, Deep Verify, and Policy Watch should be grouped under the workflow stage where the user naturally needs them instead of all competing as equal destinations.

## Deployment authority
- GitHub Pages/PWA is the canonical frontend deployment unless this document is explicitly revised.
- The installable PWA is the everyday mobile app path and should receive normal web/UI updates without reinstalling.
- Android APK builds remain a native compatibility/test artifact unless native functionality requires a dedicated distribution channel.
- Duplicate frontend deployment configurations should not remain active without a documented reason.

## Provider authority
- First-party/official sources are preferred when they can answer the question.
- AppBrain is an optional M4 provider, not an M1 dependency.
- Tavily/Gemini source discovery is optional enrichment and must fail closed.
- Provider credentials must never be required for unrelated milestones to function.
- CI may exercise unconfigured/zero-credit behavior, but it must not imply that paid-provider data is part of M1 acceptance.

## Acceptance targets

### M1 acceptance anchor
Use **Meowdoku (Apple ID 6761760135)** as the first vertical-slice acceptance case.

M1 passes only when:
- the exact title resolves correctly;
- official Apple provenance is visible;
- raw source capture is available for new runs;
- direct findings are inspectable;
- publisher/listing inference is visibly separated from verified facts;
- unknowns remain explicit;
- human review actions work;
- save/restore preserves meaning;
- no download/revenue/performance claim is fabricated from listing/rank data;
- the dossier is easy to understand on a touch-only mobile device without relying on hover.

If this dossier does not make uncertainty/evidence clearer than a normal manual chat, improve M1 before adding another major product capability.

### Later-milestone acceptance
Each later milestone must have its own deterministic acceptance fixtures and a human-readable UX acceptance pass. Automated schema/CI success alone is not sufficient to call a user-facing feature DONE.

## Change-control rule
When implementation outgrows this authority, revise this document first. Do not delete valid product work merely because an older milestone section did not yet authorize it; instead classify it under an approved later milestone, keep strict boundaries between milestones, and remove only code that is duplicate, obsolete, unsafe, or unsupported by the product mission.
