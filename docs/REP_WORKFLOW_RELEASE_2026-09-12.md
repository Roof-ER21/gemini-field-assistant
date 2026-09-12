# Rep workflow reliability — 2026-09-12

## Changes

- Email: save successful drafts before optional explanations; preserve a previous draft on regeneration failure; keep generated content usable when local history storage fails; synchronize edited previews and copied text; clear stale template content and ignore superseded template loads.
- Email: responsive single-column phone layout, readable generation and details controls, named inputs, and an explicit reminder that opening the email app does not send anything. A phrase check is labeled a language check, not a guarantee that an email is safe or legally compliant.
- Knowledge: apply category/state/division filters to all views and searches, ignore superseded results, support literal punctuation in full-text searches, and offer retry on document-loading failures.
- Susan: restore the question to the composer after a failed response without exposing raw provider errors in the reply.
- Agnes: select a script belonging to the current division; remove script-content debug logs; include Veteran and Just Listen in existing statistics; adapt voice-detection frame settings to the installed SDK's millisecond API.

## Evidence and boundaries

- Local field UI tests: 23 passing; hardening: 23 passing; authentication: 99 passing (requires local listener permission).
- Scoped type checking, lint, formatting, production build, and poisoned client credential scan passed. The credential scan inspected 228 artifacts with zero failures.
- Local browser, fictional data: an email remained usable after the optional explanation failed; generated layout had no horizontal overflow at 320, 390, and 1440 pixels, with two columns only on desktop. Knowledge layout checked at 390 pixels.
- Production Agnes synthetic smoke: a short-lived token connected to the configured Live model and received audio. This is not microphone, roleplay scoring, or recording-history end-to-end proof.
- Browser fixture APIs intentionally replace production APIs and block external requests; this is not a console-clean production claim. No customer emails were sent.
- Hugging Face rotation was completed separately on the existing production release. Both primary services authenticate with the replacement; the old provider token record was deleted. No post-deletion HTTP rejection test of that old token was captured. Authentication is not proof of HF inference compatibility.
- This document records local readiness, not deployment. The PR and Railway deployment records determine released status.

## Deferred

- Direct rep navigation to Email awaits the owner's choice; current navigation and role access are unchanged.
- Persist unsent/edited drafts across navigation and reload; validate full mobile microphone and scoring journeys; review knowledge freshness and regulatory email content; validate the HF inference fallback endpoint.
- Existing manager analytics completion-rate assumptions, large bundles, broader dependency findings, and legacy repository-wide lint/type coverage remain separate work.
- Backup Sus remains frozen: no upgrade, deployment, or replacement credentials. Its upgrade note is in the owner's pickup file.
