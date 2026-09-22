import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check'

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

// Whether reCAPTCHA has actually HANDED US a token — a different question from
// whether a site key is present, and the only one that predicts what happens when
// App Check is enforced. A key can be in the build and still yield nothing:
// reCAPTCHA blocked by an extension, a domain that does not match the key, or a key
// that is simply wrong for this registration. Firebase's console then shows 0
// verified requests and says nothing about which.
//
// Mutable, read by the Admin screen a moment later, because the answer only exists
// after an async round trip to Google.
export const appCheckState = { status: RECAPTCHA_SITE_KEY ? 'checking' : 'no-key', detail: '' }

if (RECAPTCHA_SITE_KEY) {
  // For local dev / automated testing against an ENFORCED project, set a debug
  // token (App Check console → Manage debug tokens). Never set this in prod.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  try {
    const ac = initializeAppCheck(app, {
      // ENTERPRISE, not v3. The Firebase console registered this web app under
      // reCAPTCHA Enterprise, and a v3 token sent to an Enterprise registration is
      // rejected every time — which is exactly what "0 verified requests" meant.
      // VITE_RECAPTCHA_SITE_KEY must therefore hold an ENTERPRISE site key (made in
      // Google Cloud → Security → reCAPTCHA), not a key from google.com/recaptcha/admin.
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
    // Ask for a token straight away and record the outcome. This is the check that
    // should happen BEFORE enforcing, not after being locked out by it.
    getToken(ac, false)
      .then((r) => {
        appCheckState.status = r && r.token ? 'ok' : 'empty'
        appCheckState.detail = r && r.token ? `token ${r.token.length} chars` : 'no token returned'
      })
      .catch((e) => {
        appCheckState.status = 'failed'
        appCheckState.detail = (e && (e.code || e.message)) || 'unknown error'
        console.error('App Check token failed:', e)
      })
  } catch (e) {
    // Never let App Check init break app boot (e.g. bad key) — enforcement is
    // what protects the backend; a failed init just means no token is attached.
    appCheckState.status = 'failed'
    appCheckState.detail = (e && (e.code || e.message)) || 'init threw'
    console.error('App Check init failed:', e)
  }
}

export const db = getFirestore(app)
export const auth = getAuth(app)
