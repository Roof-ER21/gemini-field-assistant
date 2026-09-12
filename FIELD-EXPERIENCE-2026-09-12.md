# SA21 field experience release

## User-facing changes

- Home prioritizes Ask Susan, document analysis, profile sharing, translation,
  follow-up email, recent conversations, and field guidance. Existing tool handlers,
  role boundaries, and feature flags remain in place.
- Mobile Home/Susan/Translate/Profile/More navigation replaces the misleading
  floating Quick Actions button that only opened Email.
- Full navigation uses real buttons, current/expanded announcements, keyboard
  focus handling, Escape dismissal, return focus, and hidden collapsed groups.
- Notification View All opens Notifications, not Profile. The profile avatar is
  keyboard-operable. A skip link targets the existing main landmark.
- Missing weather is not displayed as zero or clear skies. Recent conversation
  failures offer a working retry. Malformed nullable summary arrays do not crash.
- Offline status is announced without promising offline sends or synchronization.
- Susan loads on demand; its welcome offers editable, unsent starting prompts,
  replacing unverified document/system/availability counts. Motion respects the
  user's reduced-motion preference for Framer Motion components.
- New surfaces use shared tokens and 2px corners. Active sidebar text is readable
  on dark backgrounds. Existing light-mode support is retained, not expanded into
  a new default. Home's decorative background gradients/dots are removed.

## Enforcement and checks

CI now runs scoped ESLint plus JSX accessibility rules, Stylelint, Prettier,
TypeScript, UI behavior tests, existing auth/hardening tests, and the poisoned
client-credential build. New components cannot introduce inline style attributes.
The credential scanner also checks exact configured provider values in memory,
covering credentials without recognizable prefixes; output remains path-only.

The lint/type/format scope is the rebuilt Home, mobile nav, offline banner, and
Susan welcome. The UI tests also exercise Sidebar and include its dependency graph
in TypeScript checking. This is not a whole-repository clean bill of health.

Local browser evidence uses fictional data and intercepted API traffic, not a real
customer account or submitted lead. Tested 390px mobile and 1440px desktop, dark and
existing light mode, no horizontal overflow, drawer focus/Escape, actual lazy-loaded
Susan opening, and starter draft/focus without sending. Local socket failures are
expected because the fixture browser has no messaging backend; do not describe
these checks as proof of live messaging or provider inference.

Screenshots are local-only in `output/playwright/`. No auth/session/browser capture
is committed. Final deployment SHA and runtime proof belong in the external pickup.

## Remaining work, in priority order

1. Finish provider-console authentication, identify all consumers of the exposed
   keys, replace configuration, verify functionality, then revoke old keys. Access
   is the blocker, not authorization. Never print key values or restore a leaking build.
2. Signed-in production photo, transcription, and live-voice checks; homeowner lead
   checks using an explicitly controlled test profile. No real customer sends in this run.
3. Inspection draft persistence, upload compression/object storage, slow-network
   recovery, and safe cross-panel draft retention. The offline banner is not an offline engine.
4. Expand lint/type/token enforcement panel by panel; legacy inline styles, other
   red variants, radii, and inaccessible controls still exist. Root typecheck still
   has the pre-existing JSX-in-`.ts` example blocker. Some existing local/global
   pre-push checks were discovered during release, correcting the earlier blanket
   claim that no hooks existed.
5. Resolve dependency audit findings in a separate compatibility-tested update.
   The install reported 47 findings; no force-upgrade or broad dependency audit fix
   was applied as part of this visual release.

The Impeccable skill guided the task-first hierarchy, honest states, token reuse,
restrained styling, and accessibility improvements; product context is in PRODUCT.md.
