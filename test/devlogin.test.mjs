// Does the dev quick-login flow still work once the hardened rules are published?
// Three things it needs, none of them obvious: clear a device lock as an ordinary
// signed-in user; claim authUid on an account that has never logged in; and create
// its users/{uid} mirror.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, deleteField, getDocs, collection } from 'firebase/firestore'
import fs from 'fs'

const env = await initializeTestEnvironment({
  projectId: 'vmanifest-devlogin',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
})
await env.clearFirestore()

// A freshly SEEDED admin: authEmailScheme 'a', no authUid — exactly what ensureSeedData
// writes and what the dev button then has to log in as.
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore()
  await setDoc(doc(d, 'accounts/acc_admin'), {
    username: 'admin', displayName: 'Admin', isAdmin: true, isSuperAdmin: true,
    groupId: '', companyId: '', authEmailVersion: 0, authEmailScheme: 'a',
    failedAttempts: 0, lockedUntil: null, password: 'x'.repeat(64),
  })
  await setDoc(doc(d, 'authIndex/admin'), { accountId: 'acc_admin', authEmailVersion: 0, authEmailScheme: 'a', password: 'x'.repeat(64), failedAttempts: 0, lockedUntil: null })
  await setDoc(doc(d, 'deviceLogins/dev123'), { date: '2026-09-07', accountId: 'acc_other', accountDisplay: 'Someone Else' })
})

let pass = 0, fail = 0
const check = async (label, shouldPass, op) => {
  try { await (shouldPass ? assertSucceeds(op()) : assertFails(op())); console.log('  PASS ', label); pass++ }
  catch (e) { console.log('  FAIL ', label, '-', String(e.message).slice(0, 140)); fail++ }
}

const anon = env.unauthenticatedContext().firestore()
// Firebase Auth has just minted this uid for acc_admin's synthetic address.
const fresh = env.authenticatedContext('uid_fresh', { email: 'acc_acc_admin@vmanifest92.local' }).firestore()

console.log('\n--- the login bootstrap, before any session ---')
await check('anon reads authIndex to find the account', true, () => getDoc(doc(anon, 'authIndex/admin')))
await check('anon reads the lockdown flag', true, () => getDoc(doc(anon, 'appAccess/lockdown')))

console.log('\n--- first real login claims the account ---')
// EXACTLY what writeIdentityDocs writes. The password deletion is not incidental:
// the rule only permits a claim that RETIRES the legacy hash, never one that keeps it.
await check('claims authUid on a never-logged-in account', true, () =>
  setDoc(doc(fresh, 'accounts/acc_admin'), { authUid: 'uid_fresh', authEmailVersion: 0, password: deleteField() }, { merge: true }))

await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'accounts/acc_admin'), { authUid: 'uid_fresh' }, { merge: true })
})
await check('creates its users/{uid} mirror', true, () =>
  setDoc(doc(fresh, 'users/uid_fresh'), { accountId: 'acc_admin', groupId: '', companyId: '', isAdmin: true, isSuperAdmin: true }))

console.log('\n--- the dev buttons clear the device lock ---')
const member = env.authenticatedContext('uid_member').firestore()
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'users/uid_member'), { accountId: 'acc_member', groupId: 'g1', companyId: 'coyA', isAdmin: false, isSuperAdmin: false })
})
await check('an ORDINARY signed-in user can clear a device lock', true, () => deleteDoc(doc(member, 'deviceLogins/dev123')))
await check('an ordinary user can claim a device lock', true, () =>
  setDoc(doc(member, 'deviceLogins/dev123'), { date: '2026-09-07', accountId: 'acc_member', accountDisplay: 'Member' }))
await check('an ordinary user still cannot LIST device locks', false, () => getDocs(collection(member, 'deviceLogins')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
