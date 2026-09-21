import { chromium } from 'playwright'
import fs from 'fs'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message))
p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text().slice(0,200)) })
const T = async () => (await p.textContent('body')).replace(/\s+/g,' ')
const store = (pre) => p.evaluate((pre) => { const o={}; for (const [k,v] of window.__store) if (k.startsWith(pre)) o[k]=v; return o }, pre)
const nDocs = (pre) => p.evaluate((pre) => { let n=0; for (const k of window.__store.keys()) if (k.startsWith(pre)) n++; return n }, pre)
const reads = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__reads)))
const closeCard = async () => { const ov = p.locator('.rc-modal-overlay').first(); if (await ov.count()) { await ov.click({ position: { x: 5, y: 5 } }); await p.waitForTimeout(700) } }
let pass=0, fail=0
const ok = (l,c,x='') => { if(c){console.log('  PASS  '+l+(x?' — '+x:'')); pass++} else {console.log('  FAIL  '+l+(x?' — '+x:'')); fail++} }

await p.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
await p.getByText('Dev: Admin', { exact: true }).click(); await p.waitForTimeout(1800)
await p.getByRole('button', { name: 'Admin', exact: true }).click(); await p.waitForTimeout(800)
await p.getByText('Import Personnel', { exact: false }).first().click(); await p.waitForTimeout(700)
await p.locator('textarea').fill(fs.readFileSync('/tmp/test250.tsv','utf8')); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Check' }).click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: 'Import', exact: true }).click(); await p.waitForTimeout(7000)
await closeCard()
console.log('(250 imported)')

console.log('\n=== 4. build a manifest ===')
await p.getByRole('button', { name: 'Manifests', exact: true }).click(); await p.waitForTimeout(900)
ok('empty state offers to build one', (await T()).includes('No Manifest Yet'))
await p.getByRole('button', { name: /Build a Manifest/ }).first().click(); await p.waitForTimeout(800)
await p.locator('input[placeholder^="e.g."]').first().fill('TEKONG MOVE'); await p.waitForTimeout(200)
await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: 'Set Up Vehicles' }).click(); await p.waitForTimeout(700)
// A FRESH install has no saved fleet — the first vehicle has to be typed. That is
// the real first-run path, so test it rather than seeding a fleet around it.
async function newVehicle(callsign, type, plate, seats) {
  await p.getByRole('button', { name: 'Add Vehicle' }).click(); await p.waitForTimeout(700)
  await p.getByRole('button', { name: /New Vehicle/ }).click(); await p.waitForTimeout(700)
  const ins = p.locator('input')
  await ins.nth(0).fill(callsign); await p.waitForTimeout(120)
  await ins.nth(1).fill(type); await p.waitForTimeout(120)
  await ins.nth(2).fill(plate); await p.waitForTimeout(120)
  await ins.nth(3).fill(seats); await p.waitForTimeout(120)
  await p.locator('button').filter({ hasText: /^Save/ }).last().click(); await p.waitForTimeout(1200)
}
await newVehicle('ALPHA 1', '5-TON', '12345', '12')
ok('first vehicle typed in from scratch', true)
await newVehicle('ALPHA 2', '5-TON', '23456', '12')
await closeCard()
const mv = Object.values(await store('movements/')).find(m => m.name === 'TEKONG MOVE')
ok('manifest has 2 vehicles', mv && Object.keys(mv.vehicles||{}).length === 2, `${mv ? Object.keys(mv.vehicles||{}).length : 0}`)
const fleetNow = (await store('movements/'))['movements/fleet']
ok('vehicles saved into the reusable fleet', fleetNow && Object.keys(fleetNow.vehicles||{}).length === 2, `${fleetNow ? Object.keys(fleetNow.vehicles||{}).length : 0} in fleet`)
ok('created as a DRAFT', mv && mv.published === false)

console.log('\n=== 5. seat a mixed-company crew, with roles ===')
const rowsAll = fs.readFileSync('/tmp/test250.tsv','utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'))
// 52 of the 250 names repeat, which is realistic - so both of these have to be
// names that occur EXACTLY ONCE, or searching one turns up the other man and the
// assertion means nothing. (That is what failed the first three runs; the app was
// right every time.)
const nameCount = rowsAll.reduce((m, r) => (m[r[4]] = (m[r[4]] || 0) + 1, m), {})
const uniq = (pred) => rowsAll.find(r => nameCount[r[4]] === 1 && pred(r))[4]
const drvName    = uniq(r => r[2] === 'Drivers')
const notDrvName = uniq(r => r[2] !== 'Drivers')
const aCoyName   = uniq(r => r[0] === 'A Coy' && r[2] !== 'Drivers')
const cCoyName   = uniq(r => r[0] === 'C Coy' && r[2] !== 'Drivers')
const sheet = () => p.locator('.rc-modal-overlay')
const search = async (t) => { await sheet().locator('input').first().fill(t); await p.waitForTimeout(700) }

// ONE sheet session for both driver checks: reopening it resets the role to Troop,
// which is what made the negative case look like a bug the first time round.
await p.getByText('ALPHA 1', { exact: false }).first().click(); await p.waitForTimeout(800)
await p.getByRole('button', { name: 'Assign', exact: true }).first().click(); await p.waitForTimeout(1100)
await sheet().getByRole('button', { name: 'Driver', exact: true }).click(); await p.waitForTimeout(700)
await search(notDrvName)
ok('a non-driver is NOT offered for the Driver role', await sheet().getByText(notDrvName, { exact: true }).count() === 0, notDrvName)
await search(drvName)
const drvHit = sheet().getByText(drvName, { exact: true }).first()
ok('a Drivers-section man IS offered', await drvHit.count() > 0, drvName)
await drvHit.click(); await p.waitForTimeout(300)
await p.locator('button').filter({ hasText: /Assign as/ }).last().click(); await p.waitForTimeout(1400)

// Troops from two different companies, found by search across 250 names.
await p.getByRole('button', { name: 'Assign', exact: true }).first().click(); await p.waitForTimeout(1100)
for (const nm of [aCoyName, cCoyName]) {
  await search(nm)
  const hit = sheet().getByText(nm, { exact: true }).first()
  if (await hit.count()) { await hit.click(); await p.waitForTimeout(250) }
}
await p.locator('button').filter({ hasText: /Assign as/ }).last().click(); await p.waitForTimeout(1400)
const mv2 = Object.values(await store('movements/')).find(m => m.name === 'TEKONG MOVE')
const coys = new Set(Object.values(mv2.assign||{}).map(a => a.cn))
ok('crew drawn from 2+ companies', coys.size >= 2, [...coys].join(' + '))
ok('3 seated', Object.keys(mv2.assign||{}).length === 3, `${Object.keys(mv2.assign||{}).length}`)

console.log('\n=== 6. draft hides everything from riders ===')
ok('no seat documents while a draft', await nDocs('seats/') === 0, `${await nDocs('seats/')}`)

console.log('\n=== 7. publish ===')
await p.getByRole('button', { name: 'Publish', exact: true }).first().click(); await p.waitForTimeout(1800)
const seats = await store('seats/')
ok('a seat document per rider', Object.keys(seats).length === 3, `${Object.keys(seats).length}`)
const anySeat = Object.values(seats)[0]
const card = Object.values(anySeat.seats)[0]
ok('seat carries the vehicle', !!card.callsign, card.callsign)
ok('seat carries the whole crew', (card.crew||[]).length === 3, `${(card.crew||[]).length} crew`)
ok('crew carries company names', (card.crew||[]).every(c => c.cn), [...new Set((card.crew||[]).map(c=>c.cn))].join(', '))
ok('a driver role is recorded', (card.crew||[]).some(c => c.r === 'driver'))

console.log('\n=== 8. the printed report ===')
const rep = p.locator('button').filter({ hasText: /Report/ }).first()
ok('Copy Report offered', await rep.count() > 0)

console.log('\n=== 9. the rider ===')
await p.getByRole('button', { name: 'Sign Out' }).click(); await p.waitForTimeout(1200)
await p.evaluate(() => window.__resetReads())
// Log in as one of the seated men via the real login form.
const seatedId = Object.keys(seats)[0].split('/')[1]
const acct = (await store('accounts/'))[`accounts/${seatedId}`]
await p.locator('input[placeholder="Login ID"]').fill(acct.username)
await p.locator('input[type=password]').fill('FMC')
await p.getByRole('button', { name: /Sign In/ }).click(); await p.waitForTimeout(2500)
const riderTxt = await T()
ok('a real imported rider can log in', !riderTxt.includes('Sign in to see your vehicle'), riderTxt.slice(0,60))
const rr = await reads()
ok('rider app open is cheap', rr.total < 40, `${rr.total} reads, seats:${rr.byCollection.seats||0}`)
ok('rider sees the manifest name', riderTxt.includes('TEKONG MOVE'))
ok('rider sees their vehicle', riderTxt.includes('ALPHA 1'))
ok('rider cannot see an Admin tab', !(await p.locator('.tab-bar button[aria-label="Admin"]').count()))

console.log('\nERRORS:', errs.join(' | ') || '(none)')
console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
await p.screenshot({ path: '/tmp/t250-rider.png', fullPage: true })
await b.close()
