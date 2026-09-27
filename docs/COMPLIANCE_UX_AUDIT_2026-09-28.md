# Game Opportunity Radar 2.0 — Compliance & UX Audit

Date: 2026-09-28

This report closes the audit raised against the earlier `PRODUCT_AUTHORITY.md`. The product authority was revised first so the repository is evaluated against the actual approved Radar roadmap rather than deleting valid later-stage work that had outgrown the original M1-only charter.

## 1. Authority resolution

`docs/PRODUCT_AUTHORITY.md` now defines the complete phased product:

- **M1 — Analyze a Game**
- **M2 — Opportunity Radar**
- **M3 — Deconstructor & Verification**
- **M4 — Platform Expansion**
- **M5 — Governance & Decision Support**

M1 remains the vertical-slice acceptance gate. Later-stage code is allowed on `main` when it is explicitly milestone-scoped, provenance-safe, and does not weaken M1.

The approved workflow is:

**RADAR → ANALYZE → VERIFY → LIBRARY / DECISION**

## 2. Removed / archived items

### Removed from `main`

1. `render.yaml`
   - Reason: duplicate frontend deployment configuration.
   - Resolution: GitHub Pages/PWA is the canonical frontend deployment.

2. `src/DeepVerify.tsx`
   - Reason: obsolete unrouted legacy implementation.
   - Canonical replacements:
     - `src/DeepVerifyWorkspace.tsx` for generated Apple verification sessions.
     - `src/StorefrontDeepVerifyWorkspace.tsx` for manual storefront-qualified verification.

### Intentionally retained

Applied Supabase migrations were **not deleted**. They are production database history and must remain in source control even when the capabilities they introduced belong to later milestones.

Later-stage Radar, verification, storefront, and Policy Watch code was retained because the revised Product Authority now explicitly classifies those capabilities under M2–M5.

No files were archived merely to satisfy the old M1-only document.

## 3. AppBrain resolution

AppBrain is retained as an **optional M4 Platform Expansion provider**.

It is not an M1 dependency.

`APPBRAIN_DAILY_CREDIT_CAP: '0'` remains in CI only to exercise the zero-credit / unconfigured / fail-closed research path. This is deliberate: CI proves the product does not fabricate Google Play evidence when AppBrain is unavailable.

Production rules remain:

- paid-provider use is optional;
- provider credentials cannot block unrelated milestones;
- AppBrain positions/estimates remain visibly attributed to AppBrain;
- missing AppBrain access remains `unconfigured`/unknown rather than zero or not-ranked;
- successful Google Play discovery requires the complete declared provider depth.

## 4. Canonical component decisions

### Analyze

- **Canonical M1 analyzer:** `src/Analyze.tsx`
- **Retained wrapper:** `src/PlatformAnalyzePage.tsx`

`PlatformAnalyzePage.tsx` is not a second Analyze implementation. It is the platform router/boundary that delegates Apple M1 analysis to `Analyze.tsx` and provides separately scoped later-stage platform modes.

### Deep Verify

- **Generated Apple queue sessions:** `src/DeepVerifyWorkspace.tsx`
- **Manual storefront-qualified verification:** `src/StorefrontDeepVerifyWorkspace.tsx`
- **Deleted:** `src/DeepVerify.tsx` legacy unrouted implementation

Generated sessions remain Apple-only because the current generated verification queue is Apple-derived. Manual verification may use Apple App Store, Google Play, or Amazon Appstore identities.

### Verification Queue

- `src/VerificationQueuePage.tsx` — loading/error/orchestration page
- `src/VerificationQueuePanel.tsx` — queue renderer
- `src/VerificationResolutionPanel.tsx` — human resolution workflow

These were retained because they are composition layers with different responsibilities, not duplicate competing implementations.

## 5. Navigation rebuild

The old presentation exposed nine near-equal destinations plus a five-button mobile bar and `More` overflow.

The rebuilt workflow has four primary stages:

1. **Radar**
   - Radar / Today
   - Trend Signals
2. **Analyze**
   - Analyze Game
   - Competitors
   - Review Samples
3. **Verify**
   - Verify Queue
   - Deep Verify
4. **Library**
   - Saved Dossiers
   - Policy Watch

Mobile bottom navigation is now exactly:

**Radar · Analyze · Verify · Library**

There is no `More` overflow.

The desktop sidebar preserves secondary capabilities under the workflow stage where they are naturally used.

The header browser-history back/forward buttons were removed. Native browser/PWA navigation and the app router remain the navigation authority.

## 6. Legend / glossary and touch UX

One reusable `EvidenceLegend` component now covers both market and analysis evidence semantics.

### Market mode explains

- rank movement (`↑`, `↓`, `NEW`, `—`);
- exact-history windows (`1d`, `3d`, `7d`);
- status codes `?`, `!`, `SRC`, `IN`;
- bounded `VIS N%` rank visibility;
- trend states and `INSUFFICIENT DATA`;
- the fact that rank/visibility are not downloads, revenue, market share, or success probability.

### Analysis mode explains

- Verified / Partial / Inferred / Unknown;
- Unreviewed / Human confirmed / Human rejected / Needs more evidence;
- source classes and direct vs AI/human inference;
- confidence as evidence support, not probability of commercial success.

The legend is tap-accessible and is used on Radar, Trends, and Analyze.

Load-bearing hover-only meanings were removed. Today trend reasons and research-priority rationale are tap-accessible. Store actions and Google Play competitor links are visibly labeled. Platform descriptions no longer rely on `title=` hover behavior.

The remaining two UI `title=` attributes are redundant Deep Verify delete/lock hints whose state is already visible inline; they are not the only carrier of meaningful information.

## 7. Design-system color migration

A repeatable CI audit (`scripts/audit-ux-literals.mjs`) measures raw CSS colors and TSX/JSX `title=` usage.

### Measured before state

- CSS files: 19
- distinct normalized hex colors: **275**
- UI `title=` attributes: **19** (20 raw matches including `document.title`)
- no shared design-token file

### Measured after state

- distinct normalized hex colors: **20**
- distinct hex colors outside `src/design-tokens.css`: **0**
- every other stylesheet contains **zero raw hex literals**
- one deliberate centralized palette defines surfaces, text, accent, semantic states, spacing, radii, and minimum touch size

Result:

**275 → 20 distinct colors**

The palette is now centralized instead of incidental.

## 8. Deployment resolution

Canonical frontend deployment:

**GitHub Pages + installable PWA**

The stale Render static-site config was removed.

The PWA remains the everyday mobile application path and receives normal web/UI changes without reinstalling. Android APK builds remain a native compatibility/test gate unless native functionality later requires a separate distribution channel.

## 9. Meowdoku M1 acceptance result

Acceptance anchor:

**Meowdoku — Apple ID `6761760135`**

A fresh production workflow ran after the compliance/UX merge against the live Supabase `analyze-game` endpoint.

### Automated backend result: PASS

Observed production result:

- exact title resolved: **Meowdoku!**
- findings: **9**
- explicit unknowns: **6**
- raw Apple source required and present by acceptance contract
- source observation timestamp required
- listing-derived findings required
- no forbidden rank→download/revenue/population fabrication allowed

The same production run also passed:

- Royal Smash! - Physics Puzzle — 7 findings / 6 unknowns
- Colony Flow! — 8 findings / 6 unknowns

### Mobile UX result: NOT YET CLAIMED AS PASSED

The M1 workflow now records its scope as `automated_backend` and explicitly states that automation cannot prove:

- touch readability;
- information hierarchy;
- human comprehension;
- ease of deciding what to do next on a physical mobile device.

The Analyze UI has been improved for that manual acceptance:

1. identify the exact title;
2. read the evidence legend;
3. follow a visible recommended reading order;
4. inspect source provenance;
5. review findings;
6. keep unresolved items explicit;
7. change scorecard values only when evidence justifies them.

M1 should be called fully accepted only after the Meowdoku dossier also passes a real touch/mobile human-readability check.

## 10. Current compliance status

Completed:

- product authority aligned to real roadmap;
- later-stage work formally milestone-scoped;
- AppBrain classified as optional M4 provider;
- duplicate Render deployment removed;
- true legacy Deep Verify duplicate removed;
- navigation reduced to four workflow stages;
- header back/forward duplication removed;
- reusable evidence legend implemented;
- load-bearing hover-only UX removed;
- CSS palette centralized from 275 to 20 colors;
- Meowdoku production backend acceptance passed;
- acceptance workflow now distinguishes backend success from mobile UX acceptance.

Remaining acceptance work:

- perform the human/touch-only Meowdoku readability pass on the deployed PWA;
- fix any comprehension/friction issues found by that pass before treating M1 as fully accepted.
