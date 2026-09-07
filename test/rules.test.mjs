import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore'
import fs from 'fs'

const env = await initializeTestEnvironment({
  projectId: 'vmanifest-test',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
})

// Seed the mirrors and data with rules OFF.
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore()
  await setDoc(doc(d, 'users/uid_admin'), { accountId: 'acc_admin', groupId: '', companyId: '', isAdmin: true, isSuperAdmin: true })
  await setDoc(doc(d, 'users/uid_rider'), { accountId: 'acc_rider', groupId: 'g1', companyId: 'coyA', isAdmin: false, isSuperAdmin: false })
  await setDoc(doc(d, 'users/uid_other'), { accountId: 'acc_other', groupId: 'g2', companyId: 'coyB', isAdmin: false, isSuperAdmin: false })
  // authUid is what a logged-in member's own-doc read is matched on (writeIdentityDocs
  // sets it on first real login), so a fixture without it is not a real member.
  await setDoc(doc(d, 'accounts/acc_rider'), { username: '91110000', displayName: 'Rider', groupId: 'g1', companyId: 'coyA', authUid: 'uid_rider' })
  await setDoc(doc(d, 'accounts/acc_other'), { username: '92220000', displayName: 'Other', groupId: 'g2', companyId: 'coyB', authUid: 'uid_other' })
  await setDoc(doc(d, 'seats/acc_rider'), { seats: { mv1: { callsign: 'ALPHA 1' } } })
  await setDoc(doc(d, 'seats/acc_other'), { seats: { mv1: { callsign: 'ALPHA 1' } } })
  await setDoc(doc(d, 'movements/mv1'), { name: 'TEKONG MOVE', date: '2026-09-07', assign: {} })
  await setDoc(doc(d, 'rosters/coyA'), { members: {} })
  await setDoc(doc(d, 'rosters/coyB'), { members: {} })
  await setDoc(doc(d, 'companies/coyA'), { name: 'A Coy', order: 0 })
  await setDoc(doc(d, 'authIndex/91110000'), { accountId: 'acc_rider' })
  await setDoc(doc(d, 'appAccess/lockdown'), { lockdown: false })
})

const admin = env.authenticatedContext('uid_admin').firestore()
const rider = env.authenticatedContext('uid_rider').firestore()
const anon  = env.unauthenticatedContext().firestore()

let pass = 0, fail = 0
const check = async (label, shouldPass, op) => {
  try { await (shouldPass ? assertSucceeds(op()) : assertFails(op())); console.log('  PASS ', label); pass++ }
  catch (e) { console.log('  FAIL ', label, '-', String(e.message).slice(0, 110)); fail++ }
}

console.log('\n--- a rider and their own seat ---')
await check('rider reads their OWN seat', true, () => getDoc(doc(rider, 'seats/acc_rider')))
await check('rider CANNOT read someone else\'s seat', false, () => getDoc(doc(rider, 'seats/acc_other')))
await check('rider CANNOT write their own seat (would seat himself)', false, () => setDoc(doc(rider, 'seats/acc_rider'), { seats: {} }))
await check('rider CANNOT list all seats', false, () => getDocs(collection(rider, 'seats')))

console.log('\n--- manifests are admin-only ---')
await check('rider CANNOT read a manifest', false, () => getDoc(doc(rider, 'movements/mv1')))
await check('rider CANNOT list manifests', false, () => getDocs(collection(rider, 'movements')))
await check('admin reads a manifest', true, () => getDoc(doc(admin, 'movements/mv1')))
await check('admin writes a manifest', true, () => setDoc(doc(admin, 'movements/mv1'), { name: 'X' }, { merge: true }))

console.log('\n--- company rosters ---')
await check('rider reads their OWN company roster', true, () => getDoc(doc(rider, 'rosters/coyA')))
await check('rider CANNOT read another company roster', false, () => getDoc(doc(rider, 'rosters/coyB')))
await check('rider CANNOT list all rosters (the nominal roll)', false, () => getDocs(collection(rider, 'rosters')))
await check('admin lists all rosters', true, () => getDocs(collection(admin, 'rosters')))
await check('rider CANNOT write a roster', false, () => setDoc(doc(rider, 'rosters/coyA'), { members: {} }))

console.log('\n--- accounts stay locked down ---')
await check('rider reads their OWN account', true, () => getDoc(doc(rider, 'accounts/acc_rider')))
await check('rider CANNOT make themselves an admin', false, () => setDoc(doc(rider, 'accounts/acc_rider'), { isAdmin: true }, { merge: true }))
await check('rider CANNOT move themselves to another platoon', false, () => setDoc(doc(rider, 'accounts/acc_rider'), { groupId: 'g2' }, { merge: true }))
await check('rider CANNOT read another account', false, () => getDoc(doc(rider, 'accounts/acc_other')))
await check('rider CANNOT list accounts', false, () => getDocs(collection(rider, 'accounts')))
await check('anon CANNOT read an account', false, () => getDoc(doc(anon, 'accounts/acc_rider')))

console.log('\n--- login path must work before sign-in ---')
await check('anon reads authIndex (the login lookup)', true, () => getDoc(doc(anon, 'authIndex/91110000')))
await check('anon CANNOT list authIndex (phone-number harvest)', false, () => getDocs(collection(anon, 'authIndex')))
await check('anon reads the lockdown flag', true, () => getDoc(doc(anon, 'appAccess/lockdown')))

console.log('\n--- companies ---')
await check('rider reads company names', true, () => getDoc(doc(rider, 'companies/coyA')))
await check('rider CANNOT write a company', false, () => setDoc(doc(rider, 'companies/coyA'), { name: 'X' }))
await check('admin writes a company', true, () => setDoc(doc(admin, 'companies/coyA'), { name: 'A Coy', order: 0 }))

console.log('\n--- dropped collections must be shut ---')
for (const c of ['attendance', 'statuses', 'locations', 'mcDocs', 'checkinTokens', 'adminLocations']) {
  await check(`admin CANNOT write ${c} (collection is gone)`, false, () => setDoc(doc(admin, `${c}/x`), { a: 1 }))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
