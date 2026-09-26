# Owner authentication bootstrap

Radar keeps analysis publicly viewable for now, but database writes are owner-only. The browser never creates new users (`shouldCreateUser: false`), the database uses per-user RLS, and the `save_dossier` RPC is executable only by the `authenticated` role.

This is a one-time Supabase Dashboard setup for the first owner account.

## 1. Configure the production redirect

Open the Supabase project **Game Opportunity Radar 2** (`gajkwzgxfjlvdbzrvdqn`).

Go to **Authentication → URL Configuration**.

Set the Site URL to:

`https://talha9629.github.io/GameOpportunityRadar2/`

Add the same URL to the allowed Redirect URLs:

`https://talha9629.github.io/GameOpportunityRadar2/`

## 2. Create the owner user

Go to **Authentication → Users**.

Use **Invite user** (or the current equivalent Supabase UI action) for the email address that will own the Radar workspace. Complete the invitation from that inbox.

Do not enable anonymous ownership or create database rows manually in `auth.users`.

## 3. Disable public email signup

After the owner exists, go to **Authentication → Providers → Email** and disable new-user email signup / account creation. Keep email magic-link sign-in enabled.

Radar also passes `shouldCreateUser: false`, so the UI will only sign in an already-existing owner.

## 4. Sign in from Radar

Open:

`https://talha9629.github.io/GameOpportunityRadar2/`

Use the **Owner email → Sign in to save** control in the top navigation. Open the magic link from the owner inbox.

The Analyze screen should then show **Owner cloud session active** and enable **Save dossier**.

## Acceptance test

1. Analyze Meowdoku using Apple ID `6761760135`.
2. Review at least one finding.
3. Leave unknown score dimensions as unknown unless evidence exists.
4. Click **Save dossier**.
5. Confirm the UI reports a saved cloud run ID.
6. Verify Supabase has one or more rows in `games`, `observations`, `findings`, `analysis_runs`, and `scorecards` for the authenticated owner.

The save operation is atomic through `public.save_dossier(jsonb, jsonb, jsonb)`: the dossier, findings, evidence links, analysis run, and scorecard commit together or the transaction fails.
