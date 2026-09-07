/*
 * Delete orphaned Firebase Auth users.
 *
 * The app rotates a member's synthetic email on a password reset / username change
 * (so the next login creates a fresh auth user without an Admin SDK). The previous
 * auth user is left "orphaned" — harmless (the security rules deny it everything),
 * but it accumulates. This script removes them.
 *
 * An auth user is "live" if its uid is the authUid currently linked on some account.
 * Anything else is an orphan and gets deleted (along with any stale users/{uid} doc).
 *
 * Runs in GitHub Actions monthly, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='<service-account JSON>' node scripts/cleanup-orphan-auth-users.cjs
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  (required) JSON string of a service-account key
 *   DRY_RUN                   "true" = log only, delete nothing (default: delete)
 *   GRACE_HOURS               skip auth users created within N hours (default 24)
 *                             so an in-flight migration is never deleted mid-write
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
  const auth = admin.auth()
  const db = admin.firestore()
  const dryRun = process.env.DRY_RUN === 'true'
  const graceHours = Number(process.env.GRACE_HOURS || 24)
  const graceCutoff = Date.now() - graceHours * 60 * 60 * 1000

  // Live identities = the authUid currently linked on each account.
  const accountsSnap = await db.collection('accounts').get()
  const liveUids = new Set()
  accountsSnap.forEach((d) => {
    const u = d.get('authUid')
    if (u) liveUids.add(u)
  })

  // Safety guard: if no account has an authUid yet (e.g. run before Phase 1 is live,
  // or a misconfiguration), refuse to delete anything — otherwise we'd treat every
  // auth user as an orphan.
  if (liveUids.size === 0) {
    console.warn('No accounts have an authUid yet — refusing to delete any auth users (safety guard).')
    process.exit(0)
  }

  let checked = 0, orphans = 0, deleted = 0, skippedRecent = 0
  let pageToken
  do {
    const res = await auth.listUsers(1000, pageToken)
    for (const user of res.users) {
      checked++
      if (liveUids.has(user.uid)) continue // live identity — keep
      orphans++
      const created = Date.parse(user.metadata.creationTime)
      if (created && created > graceCutoff) { skippedRecent++; continue } // too new
      if (dryRun) {
        console.log(`[dry-run] would delete orphan ${user.uid} (${user.email})`)
        continue
      }
      try {
        await auth.deleteUser(user.uid)
      } catch (e) {
        console.error(`failed to delete ${user.uid}: ${e.message}`)
        continue
      }
      try { await db.doc(`users/${user.uid}`).delete() } catch (e) {}
      deleted++
      console.log(`deleted orphan ${user.uid} (${user.email})`)
    }
    pageToken = res.pageToken
  } while (pageToken)

  console.log(`Done. checked=${checked} orphans=${orphans} deleted=${deleted} skippedRecent=${skippedRecent} dryRun=${dryRun}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
