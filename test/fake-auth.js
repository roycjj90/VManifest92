// Stand-in for firebase/auth. The app requires a real Auth session before it will
// use its Firestore session, so the harness hands it one; passwords are already
// checked against the Firestore hash by loginWithCredentials before we get here.
let current = null
const watchers = new Set()
const emit = () => watchers.forEach((f) => f(current))

export const getAuth = () => ({ get currentUser() { return current } })
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) }

export async function signInWithEmailAndPassword(auth, email) {
  current = { uid: 'uid_' + email.replace(/[^a-z0-9]/gi, '_'), email }
  emit(); return { user: current }
}
export const createUserWithEmailAndPassword = signInWithEmailAndPassword
export async function signOut() { current = null; emit() }
export async function updatePassword() {}
export async function updateEmail() {}
export async function reauthenticateWithCredential() { return { user: current } }
// ASYNCHRONOUS, like the real SDK. Callers do
//   const off = onAuthStateChanged(auth, (u) => { off(); ... })
// and a synchronous first call reaches `off` before it is assigned.
export function onAuthStateChanged(auth, cb) {
  watchers.add(cb)
  queueMicrotask(() => { if (watchers.has(cb)) cb(current) })
  return () => watchers.delete(cb)
}
