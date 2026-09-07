/*
 * Backfill the public `authIndex` collection from `accounts`.
 *
 * The login bootstrap must read a few fields BEFORE any Firebase Auth session
 * exists (accountId, authEmailVersion, lockout counters, and the legacy hash
 * for not-yet-migrated accounts). Those now live in a narrow, PII-free doc at
 * `authIndex/{usernameLower}` so the `accounts` collection itself can be locked
 * down (no more world-readable names / phones / groups).
 *
 * This script mirrors every existing account into its authIndex doc. It is
 * idempotent (merge writes) and safe to re-run. Run it BEFORE deploying the
 * client that reads authIndex — the client still falls back to the accounts
 * query for any missing index doc, so order isn't load-bearing, but backfilling
 * first means the very first post-deploy login already uses the new path.
 *
 * Run locally:
 *   FIREBASE_SERVICE_ACCOUNT='<service-account JSON>' node scripts/backfill-auth-index.cjs
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  (required) JSON string of a service-account key
 *   DRY_RUN                   "true" = log only, write nothing (default: write)
 */

const admin = require('firebase-admin')

function init() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set.')
    process.exit(1)
  }
  let serviceAccount
  try {
    serviceAccount = JSON.parse(raw)
  } catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.')
    process.exit(1)
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
}

async function main() {
  init()
  const db = admin.firestore()
  const dryRun = process.env.DRY_RUN === 'true'

  const accountsSnap = await db.collection('accounts').get()
  let written = 0, skipped = 0

  for (const d of accountsSnap.docs) {
    const data = d.data()
    const uname = (data.username || '').trim().toLowerCase()
    if (!uname) { skipped++; console.warn(`skip ${d.id}: no username`); continue }

    // Only the fields the pre-auth lookup needs. `password` is included only
    // when the account is still on the legacy hash (migrated accounts have had
    // it deleted, and the index must not resurrect it).
    const entry = {
      accountId: d.id,
      authEmailVersion: Number(data.authEmailVersion) || 0,
      failedAttempts: data.failedAttempts || 0,
      lockedUntil: data.lockedUntil == null ? null : data.lockedUntil,
    }
    if (data.password != null) entry.password = data.password

    if (dryRun) {
      console.log(`[dry-run] authIndex/${uname} <- ${JSON.stringify(entry)}`)
      written++
      continue
    }
    await db.collection('authIndex').doc(uname).set(entry, { merge: true })
    written++
    console.log(`authIndex/${uname} (account ${d.id})`)
  }

  console.log(`Done. accounts=${accountsSnap.size} written=${written} skipped=${skipped} dryRun=${dryRun}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
