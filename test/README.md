# Browser test harness

Runs the **real app** in a browser with Firebase swapped for in-memory fakes, so a
change can be driven end to end with no network, no credentials and no writes to the
live database.

    npm run test:build     # vite build --config vite.config.test.js
    npm run test:serve     # then drive http://localhost:4173 with Playwright

- `fake-firestore.js` — enough of the modular Firestore API to run the app: dotted-path
  updates, `deleteField` sentinels, nested-map merges, batches, and listeners that
  re-fire on any write. Exposes the document map as `window.__store`, which is how a
  test asserts on what the app actually wrote.
- `fake-auth.js` — a stand-in Auth. Note it fires `onAuthStateChanged` **asynchronously**,
  like the real SDK: the app does `const off = onAuthStateChanged(auth, () => off())`,
  and a synchronous first call reaches `off` before it is assigned.
- `snapshot.json` — a dump of the real database's non-sensitive collections, used as the
  seed. Refresh it by re-reading the REST API when the shape changes.

This is a test-only build. Nothing here is bundled into `npm run build`.

## Scale fixture

`snapshot.json` currently holds a synthetic **500-person battalion** — 5 companies,
20 platoons, 25 people each — rather than a copy of the live database. That is
deliberate: the thing most worth testing is what the app costs at full size.

The fake bills reads the way Firestore does (per document delivered) and exposes the
tally as `window.__reads`, so a test can assert on the bill:

    await p.evaluate(() => window.__resetReads())
    // ... drive the app ...
    await p.evaluate(() => window.__reads)

One caveat: the fake re-fires every listener on any write, so reads measured *after a
write* are inflated. Real Firestore only bills the documents that actually changed.
Trust the app-open numbers; treat post-write numbers as an upper bound.

## Rules tests

`rules.test.mjs` runs `firestore.rules` against the **real Firestore rules engine** in
the Firebase emulator — not a simulation. It is the only way to know the rules do what
they claim before publishing them.

The tools are heavy and are deliberately NOT in `package.json`: they would be installed
on every Vercel build for no reason. Install them when you need them:

    npm install --no-save firebase-tools @firebase/rules-unit-testing
    npx firebase emulators:start --only firestore --project vmanifest-test &
    node test/rules.test.mjs

`firebase.json` in the repo root already points the emulator at `firestore.rules`.

What it asserts, in plain terms: a rider can read their own seat and nothing else; a
rider cannot write their own seat, make themselves an admin, or move themselves to
another platoon; manifests are admin-only; a rider gets their own company's roster but
cannot list all six; the login lookup works before sign-in but cannot be enumerated;
and every dropped collection is shut to everyone.
