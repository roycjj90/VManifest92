import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
const r = (p) => fileURLToPath(new URL(p, import.meta.url))
// Test-only build: swaps Firebase for the in-memory fakes in test/ so the real app
// can be driven in a browser with no network and no credentials.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    'firebase/firestore': r('./test/fake-firestore.js'),
    'firebase/auth': r('./test/fake-auth.js'),
    'firebase/app': r('./test/fake-app.js'),
    'firebase/app-check': r('./test/fake-app.js'),
  } },
})
