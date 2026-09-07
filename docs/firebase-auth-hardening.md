# Firebase Auth + Firestore security rules — hardening plan

## Why
Today the database is fully open (`firestore.rules` = `allow read, write: if true`).
Login is checked only in the app's JavaScript, so the database can't tell who is
asking and can't protect anything. Anyone with the Firebase config (it ships in
the app bundle) can read everything — including usernames, which will become
phone numbers.

The fix gives each request a **verified identity** (Firebase Auth) so **security
rules** can enforce real per-person / per-role access. This needs **no backend
and no paid plan** — we use the free Email/Password provider with a synthetic
email derived from the username.

## Core idea
- Username/phone → synthetic email, e.g. `lance` → `lance@vmanifest92.local`. The user
  never sees or types it; the app builds it. It is never emailed.
- The app signs in with Firebase Email/Password using that synthetic email + the
  user's existing password. Google verifies it and every Firestore request then
  carries `request.auth.uid`.
- A doc at `users/{uid}` = `{ accountId, groupId, isAdmin, isSuperAdmin }` lets
  rules look up a signed-in user's role/group with `get()`.

The login screen and credentials do **not** change for users.

## Phased rollout (fail-safe — no lock-outs)
The rules and the client ship in an order where the app keeps working at every
step. **Do not tighten the rules before everyone is migrated.**

### Phase 0 — console (you, ~2 min, free)
- Firebase Console → Authentication → Sign-in method → enable **Email/Password**.
- Nothing else changes; rules stay open for now.

### Phase 1 — client login change (ship while rules stay OPEN)
Modify `loginWithCredentials` to be **backward-compatible and fail-safe**:
1. Build the synthetic email from the username.
2. Try `signInWithEmailAndPassword(email, password)`.
3. If it fails because the auth user doesn't exist (`auth/user-not-found`) **or
   the provider isn't enabled yet** (`auth/operation-not-allowed`):
   - fall back to the **current** Firestore password check (exactly as today);
   - on success, if the provider is enabled, `createUserWithEmailAndPassword`
     (lazy migration) and write `users/{uid}` + `accounts/{id}.authUid`.
4. On any Firebase Auth error, the app still falls back to the old path, so the
   app behaves exactly as today until migration is complete.

Also: on `logout` call Firebase `signOut`; on session restore, rely on
`onAuthStateChanged` once migrated. Keep the existing localStorage session as a
fallback during Phase 1.

Because rules are still open and the old login still works, **this phase cannot
break anyone** — even before Phase 0 is done.

### Phase 2 — write the identity docs everywhere they're needed
Ensure `users/{uid}` stays correct:
- created at first login (Phase 1);
- updated whenever an admin changes a member's **role** (`setAccountRole`) or
  **group** (`setAccountGroup`);
- removed on account deletion.

### Phase 3 — verify migration
- Watch until every active account has a `users/{uid}` doc (i.e. everyone has
  logged in once). Accounts that never log in can be migrated by an admin
  resetting their password, which creates the auth user.

### Phase 4 — tighten the rules (you)
- Copy `firestore.rules.hardened` over `firestore.rules`, publish in the console
  (or `firebase deploy --only firestore:rules`).
- Test with a **basic-user** account and an **admin** account before announcing.

### Phase 5 — drop secrets from the DB (optional, recommended)
- Once Firebase Auth owns passwords, stop writing `password` to `accounts` and
  delete existing hashes. Consider moving `username`/phone out of `accounts` too
  if you want belt-and-braces (rules already block basic users from reading other
  accounts, so this is optional).

## What the rules enforce (see `firestore.rules.hardened`)
- **accounts**: a basic user reads only their own; a regular admin reads only
  their group; a super admin reads all. → no one else's phone reaches a basic
  user, and a rogue *group* admin is limited to their own group.
- **users/{uid}**: members can't self-promote to admin (self-writes must keep
  `isAdmin/isSuperAdmin = false`); only admins/super admins change role/group.
- **attendance**: any signed-in user reads; admins write in scope; a member may
  update a doc only to set **their own** entry (self check-in).
- reference data (groups/statuses/locations/fields/settings): signed-in read,
  admin write.
- archive: super admin only. Everything else: default-deny.

## Risks & rollback
- **Biggest risk:** tightening rules before migration → reads denied. Mitigated
  by the phase order above; do not skip Phase 3.
- **Rollback:** re-publish the open `firestore.rules` to instantly restore access
  while diagnosing. The client's Phase 1 fallback keeps login working regardless.
- **Untested here:** this environment can't reach Firebase, so Phases 1–4 must be
  validated by you (or a Firebase-connected environment). Test one throwaway
  account end-to-end first.

## Decisions (CONFIRMED)
1. Synthetic email domain — **`@vmanifest92.local`** ✅
2. Migration — **lazy, on next login** ✅
3. Admin scope — **regular admins limited to their own group; super admins global** ✅
4. Drop password hashes from Firestore after migration — **yes** ✅

## Admin credential operations — solved WITHOUT a Cloud Function
The browser SDK can't change another user's Firebase Auth password directly, but
it *can* create a new auth user. So we **rotate the synthetic email** instead:

- Each account has an `authEmailVersion`; the email is `username_rN@vmanifest92.local`.
- An **admin password reset** bumps the version. The member's next login finds no
  auth user for the new email → the app creates a fresh one with the new password.
  The old auth user is **orphaned** but harmless (no `users/{uid}` → rules deny it
  everything; the `hasClaims()` guard makes that a clean deny, not an error).
- A **self password change** first tries an in-session `updatePassword`; if that
  can't run (not signed in / session too old), it bumps the version so the next
  login re-creates the auth user.
- A **username change** already changes the email, so it self-heals the same way.
- **Account deletion** removes `users/{uid}` immediately; the orphaned auth user
  is harmless and can be cleaned up manually in the console if ever desired.

Net result: **no Admin SDK, no Cloud Function, no Blaze plan.** The only
side-effect is orphaned auth users accumulating slowly (negligible at this scale).

## Division of labour
- **You:** enable the provider (Phase 0); review; publish rules (Phase 4); test;
  decide the open questions above.
- **Me:** implement the Phase 1 client changes + the `users/{uid}` maintenance
  (Phase 2) as a separate, reviewable PR once you've approved this design and
  enabled the provider so it can actually be tested.

---

## Status addendum (2026-07-04)

### Where things stand
- Phases 0–2 are live. **Auth-first login** shipped as well: `loginWithCredentials`
  now tries `signInWithEmailAndPassword` first and only falls back to the legacy
  Firestore password check for unmigrated accounts (which then lazily provision
  via `ensureFirebaseIdentity`). On the legacy path, the Firebase Auth session is
  established **before** the session-token write, so hardened rules can gate that
  write on `request.auth`.
- The hardened rules now live directly in [`firestore.rules`](../firestore.rules)
  (the `firestore.rules.hardened` draft file was retired). Publishing is still a
  manual console paste (Phase 4).

### Conventions (locked — the rules string-match against these exactly)
- Synthetic email: `username@vmanifest92.local`, or `username_rN@vmanifest92.local` once
  `authEmailVersion` ≥ 1. Version 0 / absent means the unsuffixed form.
- `authEmailVersion` is **numeric**. Some early docs stored it as a string; all
  reads coerce with `Number()` (string `"1" + 1` concatenates to `"11"`), and
  `ensureFirebaseIdentity` rewrites the normalized numeric value on every claim.

### Incident log

**#1 — premature rules publish (2026-07-04).** Strict rules written against a
divergent re-implementation (different email domain/format) were published
while production ran this implementation. The mismatch silently broke the
`users/{uid}` mirror writes and with them all admin-gated actions. Rules were
reverted to open, the implementations were reconciled onto this document's
conventions, and corrected rules were re-issued. **Lesson: never publish rules
whose string-matching doesn't come from the exact code production runs, and
always `git fetch` before assessing repo state.**

**#2 — strict rules published against a stale client bundle (2026-07-04).**
After incident #1's fix was merged, strict rules were re-published before every
client had picked up the reconciled bundle. The **pre-fix** `loginWithCredentials`
wrote the session-token/lockout fields *before* establishing the Firebase Auth
session (harmless under open rules, denied under the new ones), so users still
running the old bundle got "Could not reach the database" on login. Confirmed
via the deployed bundle's `Last-Modified` timestamp landing ~10 minutes after
the fix's merge commit, and via `git log` showing no later commits — the fix was
live, the failures were from browsers that hadn't reloaded yet. Rules reverted
to open again while this was diagnosed. **Lesson: after merging a fix that
changes write ordering, confirm the new bundle is actually being served (and
ideally that active sessions have reloaded) before re-publishing rules that
depend on the new ordering — a correct merge isn't the same as a live fix.**

While diagnosing #2, a **separate latent bug** was found in `ensureFirebaseIdentity`:
on password drift (an Auth user exists at the stored version but with a stale
password) the client rolled `authEmailVersion` forward and tried to claim the
new version — a write hardened rules can never legitimately authorize, since
trusting a client-chosen version would let an attacker who reads the
(world-readable) current version pre-register the next version's synthetic
email and win the claim first. Reverted to the original, safe behavior: give up
and rely on an admin password reset (an authorized write) to fix drift instead.
See "Known edge cases" below.

**#3 — missing-field access in the `users/{uid}` create rule (2026-07-04).**
While testing the authIndex work, all account passwords were reset to a common
dev value (an admin-authenticated bulk write that also bumped `authEmailVersion`,
forcing every account to re-migrate on next login). Re-migration then failed for
some accounts with `permission-denied` on the `users/{uid}` mirror create, which
cascaded into the login's session write and surfaced as "Could not reach the
database." Root cause: the create rule compared `get(accounts).data.isSuperAdmin
== true`, but older accounts (e.g. `ll`) had **no `isSuperAdmin` field at all**,
and reading a missing map field in a rule *raises and denies* rather than
returning null. Accounts created via `createAccount` always write the boolean, so
this only bit legacy field-less accounts — and only once re-migration was forced.
Fixes: (a) data — backfilled explicit `isAdmin`/`isSuperAdmin` booleans on every
account; (b) rule — switched the create rule to null-safe `data.get('authUid','')`
/ `.get('isAdmin', false)` / `.get('isSuperAdmin', false)` / `.get('groupId','')`
(the last still normalizing a present-but-null group to `''`). **Lesson: in rules,
never read `data.<field>` for a field that might be absent — use
`data.get(field, default)`.** Requires republishing `firestore.rules`.

### Vulnerability found & fixed during the rules review
The naive claim rule ("any signed-in uid may set `authUid` on an unclaimed
account") allows full account takeover: Firebase's `signUp` endpoint is public,
so anyone can mint an authenticated uid, claim an arbitrary unmigrated account,
self-create a matching `users/{uid}` mirror, and then pass every
`isSelfAccount()` check — no password needed. The deployed rules therefore
require the caller's **Auth token email** to equal the synthetic email derived
from the account doc's **stored** username/version before an `authUid` claim is
accepted, and a self-created mirror must byte-match the claimed account doc.

**Accepted residual risk (pre-launch only):** synthetic-email registration is
first-come-first-served, so an attacker with the bundle config could still
squat `username_rN@vmanifest92.local` *before* the real owner's first
post-hardening login and win the claim. Every account that has logged in once
is immune. Before real launch, either confirm every account has migrated or
switch claims to admin-only.

### Known edge cases under hardened rules
- **Password drift** (an Auth user exists at the account's stored version but
  with a stale password — e.g. from a bug or a manual Firestore edit outside
  the normal password-change paths): `ensureFirebaseIdentity` does **not**
  self-heal this by rolling the version forward client-side (see incident #2)
  — it gives up and the legacy login still succeeds, but Auth-first login for
  that account keeps failing every time until an admin resets their password
  (`setAccountPassword`, an authorized write that bumps the stored version
  correctly). Should be effectively unreachable in normal operation, since
  every path that changes a password already bumps the version itself.
- `ensureSeedData` treats `permission-denied` as "already seeded" so the login
  screen renders for unauthenticated visitors; app-session restore waits for
  `onAuthStateChanged` so Firestore listeners never attach pre-auth.

### Phase 5 — shipped (2026-07-04): drop secrets from the DB

`writeIdentityDocs` now clears `accounts/{id}.password` (`deleteField()`) the
moment an account is confirmed migrated — on first migration, and (new) also
on every subsequent successful Auth-first login where a stale hash is still
lingering, so no separate one-time cleanup script is needed going forward.
The 8 real accounts existing at ship time were cleared immediately via an
authenticated admin write rather than waiting for their next natural login.

New accounts still get a `password` hash at creation (`createAccount`) — it's
the only bootstrap available without Cloud Functions — and it's retired the
same way on their first login.

**Consequences worth knowing:**
- **No more silent fallback for migrated accounts.** Before, a transient
  Auth-side hiccup would invisibly succeed via the leftover hash. Now
  `loginWithCredentials` only counts a failed Auth-first attempt toward the
  lockout if Auth's error code is a genuine credential rejection
  (`auth/invalid-credential`/`wrong-password`/`user-not-found`); anything else
  (network blip, rate limit) returns *"Could not verify your password right
  now — try again"* without touching `failedAttempts`. Normal logins and
  genuinely-wrong passwords are unaffected either way.
- **Self password/username changes were reworked to not need the hash.**
  `changeMyPassword` verifies "current password" via `reauthenticateWithCredential`
  for migrated accounts (no hash left to compare against), and only writes a
  fresh Firestore hash as a fallback bootstrap if the in-session `updatePassword`
  fails. `changeMyUsername` calls `updateEmail` in-session so the Auth linkage
  tracks a username change directly, since the synthetic email is derived from
  it — no version bump or re-migration needed when it works.
- **Admin-driven username changes on an already-migrated account are now
  guarded, not silently broken.** An admin can't call `updateEmail` on someone
  else's session, and there's no Cloud Function to do it server-side — so
  before Phase 5 this self-healed via the (now-removed) legacy password
  fallback, and after Phase 5 it simply can't. `setAccountUsername` refuses
  the rename for a migrated target with a message telling the admin to pair it
  with a password reset (which restores a bootstrap hash and bumps the
  version, so the member's next login re-migrates cleanly under the new
  username). No auto-generated temporary password UX was built — worth
  revisiting if this comes up often in practice.
- **`firestore.rules`' `isClaimingAuthUid()`** now permits `password` in the
  update diff, but only ever to *remove* it (`!('password' in
  request.resource.data)` — the claim path can never be used to set or
  preserve a password value). This matters specifically for first-time
  migrations (no `users/{uid}` mirror exists yet, so the more permissive
  `isSelfAccount()` path isn't available) — repairs on an already-linked
  account go through `isSelfAccount()` instead, which was already unrestricted
  for these fields.

---

## Closing the accounts read exposure — the `authIndex` split (2026-07-04)

### The remaining exposure
`accounts` is still `allow read: if true`. Password hashes are gone (Phase 5),
but every account's `username` (→ phone), `displayName`, `nickname`, `groupId`,
admin flags, and custom info fields are readable by anyone with the (public)
bundle config — no login, via the Firestore REST API. This is the last big gap.

### Why it can't just be flipped
`loginWithCredentials` must read the account BEFORE any Firebase Auth session
exists — to find it by username, get its `authEmailVersion` (to build the
synthetic email), check `lockedUntil`, and read the legacy hash for
not-yet-migrated accounts. That pre-auth read is exactly what `read: if true`
exists for.

### The design (SHIPPED — see Progress below; this section is the record of how)
Split the pre-auth lookup into a new, narrow, PII-free collection so `accounts`
itself can be locked:

- **`authIndex/{usernameLower}`** (new) = `{ accountId, authEmailVersion,
  failedAttempts, lockedUntil, password? }`. No name / group / role / phone-as-a-
  field. `get` open (login needs one doc pre-auth); `list` denied (no
  enumeration — strictly better than today's world-readable, listable accounts).
  `password` is present only until that account migrates (same residual
  pre-migration exposure as today, gone on migration).
- **`accounts/{id}`** keeps ALL its current fields unchanged (replica model —
  lowest blast radius). `authIndex` is a derived replica of the lookup fields.
- Client (`src/App.jsx`): login reads `authIndex` first, then reads the full
  profile from `accounts` AFTER the Auth session exists (the ordering locked
  rules require). `writeIdentityDocs` claims `authUid` FIRST, then reads the
  profile (self-read now permitted), then writes the `users/{uid}` mirror — so
  nothing reads the profile before the claim authorizes it. All write paths
  (`createAccount`, `setAccountPassword`, `changeMyPassword`, `changeMyUsername`,
  `setAccountUsername`, `removeAccount`, `ensureSeedData`, `recordFailedAttempt`)
  mirror into `authIndex`. `authIndex` is keyed by username, so renames MOVE the
  doc (delete old key + set new).
- Backfill: `scripts/backfill-auth-index.cjs` (Admin SDK) populates `authIndex`
  from existing accounts. Idempotent.

### Fail-safe properties (deliberate, given incidents #1/#2)
- Login's `authIndex` read is wrapped: on ANY error (rules block absent, denied,
  reverted) it **falls back to the old `accounts` query**, so login behaves
  exactly as today.
- `writeAuthIndex` is **best-effort** (swallows errors): a denied/failed mirror
  write never fails the login or admin op that triggered it.
- Admin/self write paths batch `accounts`+`authIndex` atomically; those batches
  require the `authIndex` rules to already be published (see order below).

### CRITICAL finding during verification (2026-07-04)
Production is running the **hardened** rules right now (confirmed empirically:
`accounts` read → 200, but an unauthenticated `accounts` write and any
`authIndex` read/write → `PERMISSION_DENIED`). The earlier plan phrasing "ship
the split while rules stay open" was WRONG — rules are not open. `authIndex`
has **no rule block**, so it is default-denied. Deploying the client against
these live rules WITHOUT the fallback above would `getDoc(authIndex)` →
permission-denied → break login for everyone. This is why the fallback exists
and why the rollout below is **rules-first**.

Note: `devLogin` (the dev quick-login buttons) writes a `sessionToken` while
unauthenticated and is therefore **denied under the hardened rules** — it cannot
be used to test login in the current state.

### Required rollout order (rules-first, fail-safe at every step)
1. **Publish the `authIndex` rules block** (already added to `firestore.rules`,
   below the `accounts` block). Zero-risk: it only grants access to a brand-new
   collection nothing reads yet; it cannot affect any current behavior.
2. **Run the backfill** (`FIREBASE_SERVICE_ACCOUNT=… node
   scripts/backfill-auth-index.cjs`) so every account has an index doc.
3. **Deploy the client.** Login now uses `authIndex`; the fallback covers any
   account the backfill missed.
4. **Verify end-to-end** with a throwaway account (see below) AND a real
   non-admin login.
5. **Only then** flip the `accounts` read rule from `if true` to:
   `allow read: if isSuperAdmin()
      || (isAdmin() && myMirror().groupId == resource.data.groupId)
      || (signedIn() && resource.data.authUid == request.auth.uid);`
   (super admin: all; regular admin: own group, matching the existing scoped
   snapshot query; member: own doc). Re-verify a real non-admin + both admin
   tiers before announcing. This step is what actually closes the exposure.

### Progress (2026-07-04, updated)
- ✅ Steps 1–2 done: `authIndex` rules block published; all 8 accounts backfilled
  (all migrated, no legacy hash).
- ✅ Step 3 done: authIndex-reading client deployed (PR #35, prod deploy `success`).
- ✅ Step 4 verified against prod: planted a lockout in `authIndex/d` while
  `accounts/d` was clear → login reported "locked" (proves login reads
  `authIndex`, not `accounts`); a `failedAttempts` sentinel was reset by a
  successful login (write path). All 8 accounts log in; all 3 dev buttons work.
- ✅ Step 5 (the exposure closure) — DONE. The `accounts` read lockdown was published
  and verified in prod the same day: an unauthenticated REST list of `accounts` AND an
  unauthenticated read of a single account doc both return 403 (they were 200), while
  `authIndex` get still returns 200. Member reads own doc, regular admin reads own
  group, super admin reads all; all logins and all three dev buttons work. Detail of
  what shipped: PR #36 carries the locked-down `accounts`
  read rule (`isSuperAdmin() || (isAdmin() && own group) || self`, all via
  `.get()`), PLUS a required client change: **`devLogin` no longer scans the
  accounts collection** (an unauthenticated collection read the lockdown denies)
  — it now signs in fixed per-role usernames through `loginWithCredentials`
  (which only reads the public `authIndex` pre-auth). That client change must be
  DEPLOYED before the lockdown rule is published, or the dev buttons break.
  `ensureSeedData`'s unauth read already degrades gracefully (permission-denied →
  treated as seeded), so app load is unaffected.
  - Edge case to accept: a user whose Firebase Auth session has expired but whose
    localStorage session is still valid will be logged out on next load (the
    post-auth `accounts` self-read needs `request.auth`). Firebase refresh tokens
    are long-lived, so this is rare; they simply re-login.

---

## App Check, proximity fix, and attendance scoping (2026-07-04)

### #2 App Check (reCAPTCHA v3) — client wired, needs console setup
`src/firebase.js` initializes App Check with a `ReCaptchaV3Provider`, gated on
`VITE_RECAPTCHA_SITE_KEY` (absent → no-op, safe to deploy). reCAPTCHA v3 is
invisible (no user step; a Google badge/disclosure is required). Once enforced,
Firestore/Auth reject requests without a valid App Check token — which closes the
"just use the public config via REST" hole (the exact thing this session used to
verify rules). Setup: Firebase Console → App Check → register the web app with
reCAPTCHA v3 → copy the **site key** → set `VITE_RECAPTCHA_SITE_KEY` in Vercel →
redeploy → confirm tokens are healthy in the App Check tab → THEN enforce on
Firestore + Auth. Use a debug token (`VITE_APPCHECK_DEBUG_TOKEN`) for local dev.

### Proximity check-in bug (adminLocations) — FIXED
Members' proximity check-in always reported "No Admin Nearby". Root cause: the
member's `handleCheckIn` compares GPS to `adminLocations`, but the rule was
`allow read: if isAdmin()`, so the member's `adminLocations` snapshot was denied
(state stayed `{}`). Fix: `adminLocations` read → `signedIn()` (members read
admin locations; only admins write theirs). `signedIn()` costs 0 rule reads.

### #3 attendance scoping — group-scoped
`attendance` was `read, write: if signedIn()` (any member could read/write any
group's records). Now scoped by the doc's `groupId` field vs the caller's mirror
group: member self-check-in and admin marking only within their own group; super
admin all; deletes super-admin-only (archive). Within-group entry-level
restriction is intentionally not enforced (fragile map diff; small blast radius).

### Read-cost note (Spark/free tier)
Rule `get()` calls are billed reads (cached per request). `signedIn()` = 0 reads;
group/self scoping = ~1 mirror read per op. `checkinTokens` and `deviceLogins`
were left at `signedIn()` on purpose: low sensitivity, and scoping them would add
a mirror read to every login/QR for little gain. Optional future read-saver: make
the member `adminLocations` subscription on-demand (only when checking in) rather
than a standing listener.

---

## Decoupling the Auth email from the login ID (2026-08-01)

### Why

Login IDs became mobile phone numbers. The synthetic email was derived from the
login ID, so every member's number appeared in the Firebase Auth user list and
in the public signUp endpoint's `auth/email-already-in-use` response.

**Reassessment worth recording:** the signUp oracle was already closed, because
this project has **email enumeration protection enabled**. So the change's real
value is narrower than it first appeared — the Auth user list needs Console or
Admin SDK access, and at that tier `accounts.username` is readable anyway. What
it does buy, at no cost: new accounts never register a phone-derived address at
all, and renaming an account (i.e. changing someone's phone number) becomes an
ordinary Firestore write instead of a forced password reset + re-migration.

### The scheme

`accounts.authEmailScheme` selects the address form. `firestore.rules` computes
the same answer, so the two must stay in lockstep:

- `'a'` → `acc_<accountId>@vmanifest92.local` (+ `_rN` for version N ≥ 1)
- absent / `'u'` → the legacy `<username>@vmanifest92.local` form

Absent defaults to legacy, which is what let the rules block be published ahead
of the client (PR #117 / #118 / #119).

### CONSTRAINT: `updateEmail` is blocked on this project

`updateEmail()` fails with `auth/operation-not-allowed` — *"Please verify the
new email before changing email."* This is email enumeration protection, which
requires `verifyBeforeUpdateEmail()` instead. **That can never work here:**
`@vmanifest92.local` receives no mail, so no verification link can be delivered.

Consequences:

- `reconcileAuthEmailScheme()` throws and is swallowed for **every existing
  account**. They stay on the legacy scheme indefinitely. This is not a bug to
  fix in code — there is no client-side path around it.
- `changeMyUsername()`'s `updateEmail` call has the same problem, and therefore
  only works for accounts already on scheme `'a'` (where it is skipped entirely).
- Migrating existing accounts requires the Console runbook below.

Verify the current state with a throwaway user rather than assuming — create one
at any `@vmanifest92.local` address, call `updateEmail`, read the error code, delete
it.

### CONSTRAINT: Firebase Auth lowercases the whole address

Firebase normalizes the **entire** email, local part included. Firestore
auto-ids are mixed case, so `acc_4QYoh2iQ...` is stored and returned as
`acc_4qyoh2iq...`. Both `accountAuthEmail()` (`.toLowerCase()`) and
`expectedAuthEmail()` (`.lower()`) must apply it — restoring the case on either
side alone silently denies every claim. Cost this a full deploy cycle (#118).

### Runbook — migrating legacy accounts off phone-derived addresses

Optional. Do it in one sitting; the middle step widens exposure slightly.

1. **Console → Authentication → Users.** Every address that is *not*
   `acc_*@vmanifest92.local` is a legacy account, and its local part is the login ID
   (with a `_rN` suffix if its password was ever reset). This list is the source
   of truth — `authIndex` cannot be enumerated by design.
2. **Console → Authentication → Settings → User actions →** turn **off** email
   enumeration protection.
3. **Each legacy account logs in once.** `reconcileAuthEmailScheme` then
   succeeds: `updateEmail` *moves* the existing Auth user, so no orphan is left
   behind and the phone-derived address disappears. Login handles enumeration
   protection being on or off, so nothing else changes.
4. **Turn enumeration protection back on.**
5. **Delete only genuine orphans — and verify, never assume.** A legacy-form
   address is an orphan ONLY if its `_rN` is lower than that account's current
   `authEmailVersion`. Check every candidate against `authIndex/<loginId>`
   (`.authEmailVersion`) before deleting anything:

   - `_rN` **<** current version → orphan from an old password reset, safe.
   - `_rN` **==** current version → **LIVE. Deleting it locks the account out
     permanently**, because every migrated account has its legacy hash retired
     and so has no bootstrap left to re-provision through.

   Orphans DO accumulate — a login at version N creates `<id>_rN`, and the
   previous version's user is left behind. As of 2026-08-01 the pre-version
   orphans had already been deleted by hand, so the 8 remaining legacy users all
   matched their account's current version: **nothing left that was safe to
   delete**. Absence of orphans at any given moment means someone cleaned up, not
   that resets don't produce them.

Accounts created after PR #117 need none of this: they are born on scheme `'a'`.
