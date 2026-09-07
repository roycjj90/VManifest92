// A tiny in-memory stand-in for the Firestore modular SDK, just enough of it to run
// the real app in a browser without network or credentials. Used ONLY by the test
// build (vite.config.test.js aliases 'firebase/firestore' here); nothing ships.
//
// Documents live as plain objects keyed by "collection/id". Everything the app calls
// is implemented against that map: dotted-path updates, deleteField sentinels,
// nested-map merges, batches, and listeners that re-fire on any write.
import seed from './snapshot.json'

const store = new Map()
for (const [coll, docs] of Object.entries(seed)) {
  for (const [id, data] of Object.entries(docs)) store.set(`${coll}/${id}`, structuredClone(data))
}

const listeners = new Set()
const notify = () => listeners.forEach((fn) => { try { fn() } catch (e) { console.error('listener', e) } })

export const DELETE = Symbol('deleteField')
export const deleteField = () => DELETE
export const arrayUnion = (...v) => ({ __op: 'union', v })
export const arrayRemove = (...v) => ({ __op: 'remove', v })
export const Bytes = { fromUint8Array: (u) => ({ __bytes: u }) }

export const getFirestore = () => ({ __fake: true })
export const collection = (_db, ...p) => ({ type: 'coll', path: p.join('/') })
export const doc = (a, ...p) => {
  if (a && a.type === 'coll') return { type: 'doc', path: `${a.path}/${p[0] || rid()}` }
  return { type: 'doc', path: p.join('/') }
}
const rid = () => 'id_' + Math.random().toString(36).slice(2, 12)

const snapOf = (path) => {
  const d = store.get(path)
  return { id: path.split('/').pop(), exists: () => d !== undefined, data: () => (d ? structuredClone(d) : undefined) }
}

function applyMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE) { delete target[k]; continue }
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.__op && !v.__bytes) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {}
      applyMerge(target[k], v)
    } else target[k] = v
  }
}
function setPath(target, dotted, v) {
  const parts = dotted.split('.')
  let cur = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  if (v === DELETE) delete cur[parts.at(-1)]
  else cur[parts.at(-1)] = v
}

function writeDoc(path, data, opts) {
  const cur = store.get(path)
  if (opts && opts.merge && cur) { const next = structuredClone(cur); applyMerge(next, data); store.set(path, next) }
  else { const next = {}; applyMerge(next, data); store.set(path, next) }
}
function updateDoc_(path, data) {
  const cur = structuredClone(store.get(path) || {})
  for (const [k, v] of Object.entries(data)) k.includes('.') ? setPath(cur, k, v) : (v === DELETE ? delete cur[k] : cur[k] = v)
  store.set(path, cur)
}

export async function setDoc(ref, data, opts) { writeDoc(ref.path, data, opts); notify() }
export async function updateDoc(ref, data) { updateDoc_(ref.path, data); notify() }
export async function deleteDoc(ref) { store.delete(ref.path); notify() }
export async function addDoc(coll, data) { const path = `${coll.path}/${rid()}`; writeDoc(path, data); notify(); return { id: path.split('/').pop(), path } }
export async function getDoc(ref) { return snapOf(ref.path) }

const docsIn = (collPath) => [...store.keys()]
  .filter((k) => k.startsWith(collPath + '/') && k.slice(collPath.length + 1).indexOf('/') === -1)
  .map(snapOf)

const matches = (snap, wheres) => wheres.every(([f, op, v]) => {
  const a = f === '__name__' ? snap.id : snap.data()?.[f]
  if (op === '==') return a === v
  if (op === '>=') return a >= v
  if (op === '<=') return a <= v
  if (op === 'in') return Array.isArray(v) && v.includes(a)
  return true
})

export const where = (f, op, v) => ({ __where: [f, op, v] })
export const query = (coll, ...cs) => ({ type: 'query', path: coll.path, wheres: cs.map((c) => c.__where) })

export async function getDocs(target) {
  const all = docsIn(target.path)
  const list = target.type === 'query' ? all.filter((s) => matches(s, target.wheres)) : all
  return { docs: list, empty: list.length === 0, forEach: (f) => list.forEach(f) }
}

export function onSnapshot(target, next, err) {
  const fire = () => {
    if (target.type === 'doc') return next(snapOf(target.path))
    getDocs(target).then(next).catch(err || (() => {}))
  }
  fire()
  listeners.add(fire)
  return () => listeners.delete(fire)
}

export function writeBatch() {
  const ops = []
  return {
    set: (ref, data, opts) => ops.push(() => writeDoc(ref.path, data, opts)),
    update: (ref, data) => ops.push(() => updateDoc_(ref.path, data)),
    delete: (ref) => ops.push(() => store.delete(ref.path)),
    commit: async () => { ops.forEach((f) => f()); notify() },
  }
}

// Exposed so the test driver can read back exactly what the app wrote.
window.__store = store
