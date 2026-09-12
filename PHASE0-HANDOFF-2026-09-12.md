# SA21 Phase 0 release handoff

Prepared locally on `fix/sa21-phase0-hardening-2026-09-12`, from `main` at `7e3699d`.
No push, deployment, provider call, rotation, or auth rollout flag change performed.

## Incident status

The original pickup reported four public provider keys. Production has NOT been
reverified or repaired in this session. Treat those keys as compromised until revoked.

The patch removes provider-key `define` entries AND automatic `VITE_*` exposure.
Public settings are explicitly retained. Browser generation uses an authenticated,
rate-limited server proxy; streaming stays streaming. Live voice uses the existing
ephemeral-token route, refreshed per new TTS connection. The new generation route
requires a verified app session even while global Stage 2 remains off. No global
session, header-trust, reauth, allowlist, or service-worker logic changed.

The existing `/api/susan/live-token` authorization policy is unchanged. This patch
does not claim to finish the separate header-trust/security rollout.

## Other Phase 0 repairs

- Root and exact index route precede immutable static serving. SW/manifest revalidate.
- Lead forms show success only after an accepted HTTP response; failures preserve
  controls, show an accessible error, and re-enable retry. Text/check/radio drafts
  survive reload in this tab for 24 hours; file selections do not survive reload.
- Nullable numeric displays in all six cited components show `N/A`, including numeric
  strings and non-finite values, without inventing a measurement of zero.
- Preview is noindex; invented review and hardcoded 5.0 average removed.
- Existing logo supplied as the OG image on RoofCheck and both profile renderers.
- Push panel links and three install shortcuts now select their destination.
- Company welcome video stays in an inert template on phones and reduced-motion
  devices; an existing project image appears instead. Image compression remains later work.
- Build-time credential scan, fake-key injection test, and GitHub hardening workflow.
  Full ESLint/Prettier/stylelint/UI-ratchet work is still Phase 1.

## Evidence and limits

- `rtk npm run build`: exit 0; frontend build, 217-artifact scan, server TypeScript build.
- `rtk npm run test:hardening`: exit 0; 17 tests (SDK proxy, session enforcement,
  streaming, sanitized errors, null fields, lead success/failure, links, cache order,
  phone/desktop video behavior).
- `rtk npm run test:client-secrets`: exit 0; all historical provider variable names
  injected with fake markers, 217 artifacts scanned, zero failures. No secret values printed.
- `rtk npm run test:auth`: exit 0; 99 tests after allowing localhost mock listeners.
  First sandboxed run failed with `listen EPERM`; no auth implementation change was needed.
- `rtk proxy npx tsc --noEmit --pretty false`: exit 2. Existing JSX in
  `examples/susan-chat-example.ts:252` prevents repo-wide checking. Same source exists
  at the base commit. The repository is not type-clean.
- Live signed-in photo/chat/voice smoke testing and deployed CI remain UNVERIFIED.
  No paid provider request or real homeowner lead was created by tests.

## Exact release sequence (Ahmed owns deployment and rotation)

1. Review and deploy this branch's code to Susan 21. Do not rotate first.
2. From the matching build checkout, run:
   `rtk proxy node scripts/verify-live-client.mjs https://sa21.theroofdocs.com`
   This requires all three update files and every emitted JS chunk to match the
   scanned local build; it reports no source or key values. If public build settings
   differ on Railway, use the matching deployment artifacts before comparing.
3. Verify signed-in image analysis, chat, transcription, and live voice. Verify the
   homeowner form on a controlled test profile; avoid creating real leads casually.
4. Revoke/rotate all exposed provider keys. Old cached bundles remain compromised;
   serving a clean new bundle does not remove old copies. Verify provider functions again.

Do not roll back to a key-inlining build after rotation.

## Pending decisions/work

The 318 CTA was deliberately retained pending confirmation that it is a tracking DID.
Phase 1 awaits theme direction, toggle retention, product name, and company spelling.
Pricing, warranty term, and ownership of rep pages remain undecided. The wider design,
offline, inspection persistence, accessibility, and asset-storage backlog remains in
`/Users/a21/PICKUP-sa21-design-2026-09-12.md`.
