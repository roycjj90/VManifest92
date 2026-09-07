# VManifest 92 (VManifest92)

Mobile-first attendance app: admin-created accounts, custom statuses, group tabs,
and location-based check-in (user must be near the set location **and** near an
admin who shared their location recently). QR check-in via `html5-qrcode`.

**Stack:** React 18 + Vite 5, Firebase (Firestore + Auth + App Check), `lucide-react`
icons, CSS custom properties for theming (`src/styles.css`, light/dark). Deployed on
Vercel; Firestore rules published by hand via the Firebase Console.

**Run:** `npm run dev` (Vite, :5173) · `npm run build` · `npm run preview`.
Env in `.env` (see `.env.example`) — all `VITE_FIREBASE_*` plus optional App Check keys.
Default seed login: `admin` / `123` (super-admin, for testing).

---

## How to work in this repo (Karpathy principles, applied here)

**1. Think before coding.** State assumptions; if a request has two readings, ask —
don't pick silently. One-line directional style feedback ("darker", "wider",
"more transparent") is often ambiguous: confirm the interpretation before implementing.

**2. Simplicity first.** Minimum code that solves the problem. No speculative features,
no abstractions for single-use code, no error handling for impossible cases. If it's
200 lines and could be 50, rewrite it. This ethos is not optional here — it's the same
discipline that keeps Firestore reads (and the bill) down.

**3. Surgical changes.** `src/App.jsx` is very large. Touch only what the request
needs. Don't "improve" adjacent code, reformat, or refactor things that aren't broken.
Match existing style even if you'd do it differently. Remove only the imports/vars your
own change orphaned; if you spot unrelated dead code, mention it — don't delete it.

**4. Goal-driven execution.** Turn vague tasks into verifiable ones ("fix the bug" →
"reproduce it, then confirm the repro is gone"). For UI/behavior changes, verify in the
running app/preview, not by eyeballing the diff. State a brief plan for multi-step work.

---

## Firestore & cost — a hard constraint

**Free (Spark) tier. The bill must stay at zero — this shapes every design.**
- Minimize reads in every feature **and** while testing. Prefer denormalized reads,
  cached data, and `getDoc` over broad listeners.
- `onSnapshot` fans out fast: the per-group attendance listener is ~N² in reads and is
  a real free-tier risk around ~1000 users — optimize before scaling, don't add more
  broad listeners casually.
- In `firestore.rules`, every `get()` is a billed read too. Keep rule lookups minimal.
- Group rosters are names-only, denormalized to `rosters/{groupId}` (reconciled on
  account changes + `getDoc` + pull-to-refresh) precisely to avoid per-member reads.

## Firebase auth — locked conventions (rules string-match these)

`firestore.rules` string-matches formats produced by `src/App.jsx`. **If you change one,
change both, or logins/writes break.**
- Synthetic email: `username@vmanifest92.local` (authEmailVersion 0/absent),
  `username_rN@vmanifest92.local` (version N ≥ 1). Some legacy docs store the version as a
  string; the client normalizes to a number on successful linkage.
- `users/{uid}` mirror = `{ accountId, groupId, isAdmin, isSuperAdmin }`.
- `accounts` reads are **locked down** (super admin / own-group admin / self). The
  pre-auth login lookup goes through `authIndex/{loginId}` instead — `get` is world-open
  by necessity, `list` deliberately isn't, and the doc carries no personal data.
- Login IDs are phone numbers, so the Auth address is derived from the **account id**
  (`acc_<accountId>@vmanifest92.local`, `authEmailScheme: 'a'`), never the login ID — that
  keeps members' numbers out of the Firebase Auth user list. Firebase lowercases the
  whole address, so both sides lowercase the id.
- **Gotcha:** a regular user's `accounts` array = their own doc only. `accounts.find()`
  on another user silently returns nothing (this already broke proximity check-in once).

## Firebase rollout discipline

Sequence rules/App Check changes **additive-first**. Verify in PROD before enforcing;
never publish rules that match code you haven't deployed yet. App Check needs CSP +
authorized domain + propagation time — localhost masks failures, so don't trust local
as proof. Don't dismiss anomalous security signals as noise.

## UI / rendering patterns

- Drive drag/swipe gestures via **ref + direct DOM writes**, not per-frame React state —
  `App.jsx` is too large for `setState` on every frame.
- Icons are `lucide-react` at small sizes; picking by label alone often misreads intent.
  There's a `suggest-icon` skill for side-by-side icon comparison — use it for icon asks.

---

## Working conventions

- **Shipping:** never commit, push, merge, or deploy unless the user says to — finishing a
  change is not a signal to ship it. Leave completed work uncommitted in the working tree
  and say so; he batches several sessions' edits into one deploy. On his word, the whole
  branch → PR → squash-merge sequence runs at once (see the `ship-batch` skill).
- **Repo state:** `git fetch` before asserting branch/PR/deploy state — don't reason from
  stale local state.
- **Verification:** for simple UI/text tweaks, skip auto screenshot verification and ask
  first — the user usually has the preview open. Verify substantive behavior changes.
- **Dev login:** the login page has temporary quick-login buttons for role switching
  (they clear the device lockout). **Remove these before launch.**

## Pre-launch checklist

- [ ] Remove dev quick-login buttons from the login page — and in the same change,
      tighten `deviceLogins` `allow delete` to `isAdmin()` in `firestore.rules`
      (left open only because those buttons clear the lock as a regular user).
- [ ] Change the seed `admin` / `123` password.
- [ ] Close the account-claim squatting risk: confirm every account has logged in at
      least once (a migrated account is immune), or switch the `authUid` claim path in
      `firestore.rules` to admin-only. Synthetic-email registration is
      first-come-first-served, so an account that has NEVER logged in can be claimed by
      anyone with the public bundle config — see "Accepted residual risk (pre-launch
      only)" in `docs/firebase-auth-hardening.md`.
- [ ] Confirm App Check is enforced and tokens are healthy in PROD. (Believed already
      enforced on Firestore since 2026-07-04 — verify rather than assume, and remember
      enforcement blocks REST-with-just-an-API-key checks, so verify through the app.)
- [ ] Confirm `firestore.rules` in the Console matches deployed code. Re-check after
      every deploy that touched the file — most recently #134 (the `appAccess`
      lockdown block) and #135 (the past-day `pastDayOK` write rule).
