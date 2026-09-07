import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// App Check (reCAPTCHA v3) — stops direct/scripted access using just the public
// Firebase config: once enforced in the console, Firestore/Auth requests must
// carry a valid App Check token, which only a real page load through reCAPTCHA
// v3 produces (no user-visible step — it scores silently). Gated on the site
// key so the app runs unchanged until the key is set; enforcement is a separate
// console toggle done AFTER tokens are confirmed healthy in the App Check tab.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY
// Whether this build is even trying to attach App Check tokens. Read by the login
// screen: once App Check is ENFORCED in the console, a build without a site key is
// refused by Firestore with a bare permission-denied, which is indistinguishable
// from a rules problem unless something says so.
export const appCheckOn = !!RECAPTCHA_SITE_KEY
if (RECAPTCHA_SITE_KEY) {
  // For local dev / automated testing against an ENFORCED project, set a debug
  // token (App Check console → Manage debug tokens). Never set this in prod.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (e) {
    // Never let App Check init break app boot (e.g. bad key) — enforcement is
    // what protects the backend; a failed init just means no token is attached.
    console.error('App Check init failed:', e)
  }
}

export const db = getFirestore(app)
export const auth = getAuth(app)
