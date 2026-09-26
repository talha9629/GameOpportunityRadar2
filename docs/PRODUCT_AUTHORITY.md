# Radar 2.0 Product Authority

This file governs implementation decisions until superseded by an explicitly approved revision.

## Primary outcome
Radar should improve the decision to PROTOTYPE, VERIFY, WATCH, TOO LATE, or PASS on a mobile-game opportunity.

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

## M1 scope
Analyze a Game only:
- identify an iOS game from URL, numeric ID, or title;
- capture/store raw Apple metadata observation;
- create direct findings linked to that observation;
- expose human confirm/reject/needs-evidence actions;
- display explicit unknowns;
- return an explicit assisted/manual result for unsupported Android enrichment.

## Not M1
No automated review scraping, paid intelligence providers, mechanic clustering, YouTube downloading, autonomous gameplay agent, causal clone analysis, public SaaS, or automated game generation.

## Acceptance target
Use Meowdoku as the first vertical-slice acceptance case. If the dossier cannot make uncertainty/evidence clearer than a normal manual chat, improve M1 before adding more automation.
