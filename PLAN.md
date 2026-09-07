# VMANIFEST 92 — standalone vehicle-manifest app

Extracted from PULSE 92 (`92CSSB`). PULSE 92 stays untouched: separate repo,
separate Firebase project, separate database, separate Vercel deployment.

| | |
|---|---|
| App name | **VManifest 92** |
| GitHub repo | **VManifest92** |
| Firebase project id | **vmanifest92-2874f** |
| Firestore region | asia-southeast1 |
| Local folder | `C:\Users\ROY\Desktop\Files\Manifest` |

**One job:** plan who sits in which vehicle.
No roll call, no attendance, no MC certs, no check-in, no venues.

**Scale:** ~500 personnel · 5 companies · platoons per company · sections per platoon.

**Hard constraint:** Firebase free (Spark) tier. The bill stays at zero.
Minimise Firestore reads in every design *and* while testing.

---

## Why extract, not rebuild

The manifest in PULSE 92 was already written as a *plan*, not a record
(`App.jsx:3108`). Only 3 threads tie it to attendance. Login, people, platoons,
sections, styling and iOS keyboard handling already work — that all carries over.

## Decisions already made (settled — do not reopen)

1. **Riders log in** and see their own seat. A per-person seat doc stays.
2. **A convoy can mix companies.** A manifest has *no* owning company; each seat
   carries its own rider's company.
3. **Attached / loaned personnel stay — two kinds, kept separate:**
   - *Loaned inside battalion*: already has a login. Nothing special needed.
   - *Attached from outside the unit*: no password, no `authIndex`, never logs in.
     One battalion-wide `ATTACHED` pool, not one per company.

---

## Phase 0 — New home (console only, no code)  ✅ DONE

- [x] Names decided: VManifest 92 / `VManifest92` / `vmanifest92-2874f`.
- [x] Firebase project `vmanifest92-2874f` — Firestore in **production mode**,
      region **asia-southeast1**, **Email/Password** auth enabled,
      **App Check OFF** for now.
- [x] Local folder `C:\Users\ROY\Desktop\Files\Manifest`.
- [x] GitHub repo `VManifest92` (private, empty — no README, no .gitignore).
- [x] Vercel project pointed at it. Framework Vite · build `npm run build` ·
      output `dist`.
- [x] Fresh `.env` using the **same variable names** as PULSE 92 —
      `src/firebase.js` then needs zero edits. Leave `VITE_RECAPTCHA_SITE_KEY` and
      `VITE_APPCHECK_DEBUG_TOKEN` blank.
- [x] Same env vars added in Vercel → Settings → Environment Variables
      (all three environments).

`storageBucket` is cosmetic here — the app never imports Firebase Storage — but
copy whatever the console shows rather than guessing the suffix.

## Phase 1 — Copy and strip  ✅ SUBSTANTIALLY DONE

`src/App.jsx` **17,054 → 8,378 lines**. Build green, no undefined variables
(checked with an ESLint `no-undef` pass over `src/`), login screen renders with
zero console errors.

Removed: 4 npm deps · Today, Count, Activity, MC certificate upload/viewer, QR and
proximity check-in, venue scheduling, the Status Label library, Reporting Locations,
Proximity Refresh Rate, attendance archive and certificate purge · 81 attendance /
activity / venue functions inside `App()` · **every attendance listener and on-demand
attendance read** · the dead state they fed.

Tab bar: Manifests (home, always present) · Platoon · Personnel · Admin.

**Left over for a tidy-up pass:** the venue helpers still at the top of `App.jsx`
(`effectiveVenue`, `companyVenue`, `venueRuns`, `coverageGaps`), their remaining uses
in `AccountView` / `GroupMembersView`, the `statuses` state (needed until Phase 2a),
and `src/lib.js`'s venue and upload helpers.

Copy the PULSE 92 tree (skip `node_modules`, `dist`, `.git`, `.env`).

**Keep collections:** `accounts`, `authIndex`, `users`, `groups`, `accountFields`,
`groupFields`, `formerMembers`, `settings`, `appAccess`, `deviceLogins`,
`movements`, `rosters` (re-pointed to company) — plus **new** `companies`, `seats`.

**Delete collections:** `attendance`, `attendanceSelf`, `attendanceArchive`,
`statuses`, `mcDocs`, `locations`, `adminLocations`, `checkinTokens`.

**Delete screens:** Today tab, Count tab, Activity, MC cert upload + PDF/HEIC
reader, proximity/QR check-in, venue scheduling, freeze/morning-record.

**Drops 4 npm deps:** `html5-qrcode`, `qrcode`, `pdfjs-dist`, `heic2any`.

**Rebrand pass** (fresh database, so nothing to migrate — a straight find/replace):

| Where | From | To |
|---|---|---|
| `package.json` name | `pulse-92` | `vmanifest-92` |
| `index.html` title + `apple-mobile-web-app-title` | `PULSE 92` | `VManifest 92` |
| `public/manifest.webmanifest` name + short_name | `PULSE 92` | `VManifest 92` |
| `App.jsx:6634`, `App.jsx:8268` headers | `PULSE 92` | `VManifest 92` |
| `App.jsx:38` `LOCKDOWN_NOTICE` | `PULSE 92 is closed…` | `VManifest 92 is closed…` |
| `App.jsx:856` `AUTH_EMAIL_DOMAIN` **+ `firestore.rules` lines 8-11, 86** | `pulse92.local` | `vmanifest92.local` |
| `App.jsx:918` `AUTH_PW_PEPPER` | `::pulse92-fb-v1` | `::vmanifest92-fb-v1` |
| localStorage keys in `App.jsx` + `lib.js` | `pulse92_*` | `vmanifest92_*` |
| `.claude/launch.json`, `CLAUDE.md`, `README.md`, `docs/` | PULSE 92 | VManifest 92 |

The auth-domain and pepper changes **must** land in `App.jsx` and
`firestore.rules` together or logins break — that string-match coupling is the
one PULSE 92 rule that carries over unchanged.

**Tabs after the cut:** Manifests (the old Movement tab, now home, always
present) · Platoon · Personnel · Admin. Delete the `showMovementTab` gate.

## Phase 2 — Cut the 3 attendance threads  ✅ DONE

- **a) Expected status** — **done.** The manifest's `statusId` field, its writers,
  `movementDayStatusesFor()` and the whole plan-vs-roll-call comparison in
  `MovementView` are gone — the two amber counts, the per-vehicle warning triangle and
  the per-name one. Outfield vs activity now reads off the manifest's own `kind`
  instead of being inferred from which status it rostered from.
- **b) Status sweep** — **done.** `syncMovementSeats()` is gone. A man now stays on
  the vehicle he was put on until an admin takes him off it.
- **c) Seat delivery** — `attendanceSelf` is gone. New collection
  `seats/{accountId}`, one doc per person, seats keyed by manifest id.
  `mirrorSelfMovement()` (`App.jsx:3144`) becomes `writeSeat()`.

  **Done.** `seats/{accountId}` = `{ seats: { [manifestId]: { …seat } } }`.
  `writeSeat()` replaces `mirrorSelfMovement()`. A rider listens to one document —
  their own — and past moves are filtered out on read rather than deleted, so a
  finished move costs no write. `firestore.rules` gives `seats/{accountId}` read to
  the owner or an admin and **write to admins only** (a rider who can write his own
  seat is a rider who can seat himself — the `attendanceSelf` block this replaces
  allowed it because a member did mark his own attendance).

  Rules that keep it cheap:
  - Rider listens to **one** doc — their own. 1 read.
  - **Everything** the rider needs is written onto the seat: callsign, plate,
    vehicle type, role, dates, and the full crew list with each person's
    name / platoon / company.
  - Rider must **never** read the manifest doc (admin-only, battalion-wide).
  - **Keyed by manifest id** so a man on two moves sees both. The single-field
    version was a real PULSE 92 bug — the 2nd booking silently overwrote the 1st.
  - Attached (no-login) people get **no** seat doc — skipped in `writeSeat()`.

## Phase 3 — Add the company level  ✅ DONE

Shape goes `person → platoon → section` **⇒** `person → COMPANY → platoon → section`.

- New collection `companies/{id}` = `{ name, order }`. **Seeded with five** — A, B, C,
  D and S&T Coy — guarded by name, so a rename in the app is never undone by the next
  app start.
- `groups/{id}` (platoon) gains `companyId`.
- `accounts/{id}` gains `companyId` — stored flat, so filtering 500 people by company
  is a field test rather than a join back through the platoon list on every render.
  Written by `createAccount`, by `setAccountGroup` when a man changes platoon, and by
  `setGroupCompany`, which re-writes it for **every man in the platoon** when the
  platoon changes company. Five reads per app open for the company list itself.
- Sections unchanged (`miniGroups` inside the platoon doc).
- **Admin:** a Company card (create / rename / reorder / delete, with a count of the
  platoons filed under each), and a company selector on every platoon row. Deleting a
  company leaves its platoons unfiled rather than silently moving them.
- **Platoon tab:** two segmented tracks, company over platoon, with the platoon row
  filtered to the company on screen. The company row only appears when there is more
  than one company. Which tab is active is **derived**, not corrected by an effect —
  the stored id is only what was last tapped, and it goes stale on a cold start or when
  a company's last platoon moves out from under it.
- **Assign sheet:** the platoon accordions are grouped under company headings, in
  company order, with anything unfiled last. The search box was already there.
- **Seats** carry the rider's company as id + name (`c` / `cn`), exactly as they carry
  platoon — a rider can only read their own seat, so the name has to travel with it.

**2 permission levels** (revised down from 4, Roy's call): **admin** — sees and seats
the whole battalion — and **member**, who sees their own seat.

Both the platoon-admin and company-admin levels are dropped. Platoon admin existed in
PULSE 92 because roll call is taken per platoon; with attendance gone there is no
per-platoon job left. Company admin was then dropped too, in favour of the simplest
thing that works.

*The trade-off, recorded so it is a decision and not an oversight:* there is no longer
any scoping between companies — any admin can see and seat any company's men, and
nothing in the app prevents it. Raised before building; Roy's call to proceed.

Mechanically `isSuperAdmin` and `isAdmin` both stay in the code. The pair is
load-bearing throughout `App.jsx` and string-matched by `firestore.rules`; collapsing
them into one flag is a rename with no behavioural gain and a real chance of breaking
logins. An admin is simply always both.

Platoon and Section remain unchanged as organisational structure — this removes
permission levels, not levels of the hierarchy. Re-introducing company scoping later
is a filter on one flag plus a rules clause; the seat already carries the rider's
platoon id and name, and Phase 3 adds company the same way.

**Screens:** company picker on the Personnel and Platoon tabs. The "add people to
this vehicle" sheet becomes Company → Platoon → Section drill-down **plus a
search box** (scrolling 500 names is unusable).

**Mixed convoys:** the seat already carries the rider's platoon id + name
(`App.jsx:3186`); add company the same way, id + name. The seating screen groups
the roster by company first. **Start with:** only a battalion admin builds mixed
convoys; company admins stay inside their own coy. One line to loosen later.

**Attached:** keep the existing `attached:true` mechanism as-is (`App.jsx:5331`) —
an account with no password and no `authIndex` entry. The seat already carries
`att:true` (`App.jsx:3330`) and the crew list already renders it. No work.
*Simplification:* the old rule "a movement status is the only way onto a vehicle"
dies with the statuses. Attached men now seat straight off the roster.

## Phase 4 — Make 500 people affordable (the important one)  ⬜

**Problem:** a super admin currently subscribes to *every* account
(`App.jsx:2200`). At 500 people that's 500 reads per app open.
20 admins × 5 opens/day = 50,000 reads = the entire free daily allowance, gone.

**Fix:** reuse the `rosters` pattern the repo already has, but at **company** level.

```
rosters/{companyId} = { members: { [accountId]:
  { n: name, rank, g: platoonId, mg: sectionId, order } } }
rosters/ATTACHED    = same shape, att:true   // outside-unit pool
```

= **6 reads** to load every seatable person in the battalion, not 500.
~100 people × ~80 bytes ≈ 8 KB per doc; the limit is 1 MB. Fine.

A full `accounts` doc is read **only** when opening one person's profile, on demand.
The reconcile-on-change logic already exists — just key it on `companyId`.

**Checked:** manifest doc size is fine. A 500-seat battalion move is ~60 KB against
the 1 MB limit. No need to split manifests across docs.

**Writes:** seating one person = 1 merged write. Publishing = 1 batch (manifest +
1 per rider), under the 500-write batch cap. Free tier allows 20k writes/day. Fine.

## Phase 5 — Many manifests at once  ⬜

PULSE 92 allows exactly 2 live manifests split by kind (outfield / activity)
because it is one company. 5 companies need many.

- Drop the two-kind split (`MV_KINDS`, the segmented control, swiping between
  kinds). It was only ever a proxy for the attendance status.
- The Manifests tab becomes a **list**: upcoming, newest first, each row showing
  name, dates, vehicle count, seat count, Draft/Published badge, and the companies
  **represented** on it (e.g. "B Coy, C Coy") — not an owning company.
- Tap one → the existing `MovementView` seating screen, mostly unchanged.
- **Keep** Draft vs Published exactly as-is: nothing reaches a phone until publish;
  unpublish pulls it all back.
- **Keep** the saved fleet list (`movements/fleet`) as-is.
- **Keep** the manifest report / export (`buildManifestReport`, `App.jsx:13356`).
  That is the printed sheet, and it is the whole point of the app.

## Phase 6 — Rules, seed, lock down  ⬜

1. Start from `firestore.rules`; delete the blocks for dropped collections, add
   `companies` + `seats`, add the company-admin level. Three to get right:
   - `seats/{accountId}` — a person reads their **own** doc only; writes admin-only.
   - `movements/{id}` — admin read only; riders never reach it.
   - `rosters/{companyId}` — admin read; battalion sees all, company sees its own.
2. `ensureSeedData()` no longer creates statuses, and seeds **two test accounts** —
   `admin` (full access) and `user` (member), both password `123` — one per permission
   level, so the two dev quick-login buttons work on a fresh database. Phase 6 adds the
   5 companies here and removes the test accounts along with the buttons.
3. Bulk import the 500 — reuse the approach in `~/.claude/plans/bulk-account-import.md`.
   Do not type 500 people by hand.
4. **App Check last:** register reCAPTCHA v3, set `VITE_RECAPTCHA_SITE_KEY`,
   confirm tokens are healthy in the console for a day, *then* enforce.
   `vercel.json`'s CSP already allows the Google domains — carries over as-is.
5. Remove the dev quick-login buttons before real use.

---

## Standing constraints

- Firebase free tier only. Minimise Firestore reads in every design and while testing.
- UI copy says **Platoon / Personnel / Section**; the code still says
  **Group / Member / MiniGroup**. Don't conflate the two.
- All text inputs `font-size >= 16px` so iOS Safari doesn't auto-zoom.
- Plain words, not dev jargon.
- **Do not commit or push until Roy says so.**
