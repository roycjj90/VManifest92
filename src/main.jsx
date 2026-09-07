import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

function setAppHeight() {
  const root = document.documentElement
  const vv = window.visualViewport
  const h = vv ? vv.height : window.innerHeight
  if (h > 0) root.style.setProperty('--app-height', `${h}px`)
  // Publish the visual viewport rect so modal overlays can pin to it. --vv-top is the
  // amount iOS has scrolled the layout viewport under the keyboard (offsetTop); a modal
  // that translates down by it stays glued to the visible area instead of being
  // scrolled off when iOS reveals a focused input.
  if (vv) {
    root.style.setProperty('--vv-height', `${vv.height}px`)
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
  }
  // Keyboard up (visual viewport well below the layout viewport, which it doesn't
  // touch) → hide the floating tab bar so it doesn't stack on top of the keyboard.
  root.classList.toggle('kb-open', h > 0 && root.clientHeight - h > 120)
}
setAppHeight()
// Recompute after first paint and once the page has fully settled, so a wrong or
// zero viewport height at cold start (common on iOS PWAs) self-corrects without a tap.
requestAnimationFrame(setAppHeight)
window.addEventListener('load', setAppHeight)
window.addEventListener('pageshow', setAppHeight)
window.addEventListener('orientationchange', () => { setAppHeight(); setTimeout(setAppHeight, 300) })
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppHeight)
  window.visualViewport.addEventListener('scroll', setAppHeight)
}
window.addEventListener('resize', setAppHeight)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
