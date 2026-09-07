export const DEFAULT_RADIUS = 100
export const DEFAULT_FRESHNESS_MINUTES = 15 // how long an admin's shared location stays valid, by default

export const PALETTE = [
  { name: 'green', hex: '#34C759' },
  { name: 'red', hex: '#FF3B30' },
  { name: 'orange', hex: '#FF9500' },
  { name: 'yellow', hex: '#FFCC00' },
  { name: 'blue', hex: '#007AFF' },
  { name: 'purple', hex: '#AF52DE' },
  { name: 'teal', hex: '#5AC8FA' },
  { name: 'pink', hex: '#FF2D55' },
  { name: 'gray', hex: '#8E8E93' },
]

// Ink for a solid status colour. Neither white nor black: the label is the status
// colour itself, pulled 70% of the way to the far end, so a green pill carries a
// deep green label and a yellow one a dark olive. The pill reads as one object
// rather than a chip with foreign text on it, and one rule covers every colour —
// which matters because status colours are admin-chosen, not from a fixed palette.
// Direction is set by WCAG relative luminance: anything above L 0.18 is bright
// enough to darken into (green 0.43 → #103C1B at 5.6:1, the MC yellow 0.89 →
// #464D00 at 8.1:1), and a genuinely dark status goes the other way, toward white,
// where darkening would leave the label invisible. Falls back to white on an
// unparseable colour, which is what the pills did before any of this.
export function readableInk(color) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!m) return '#FFFFFF'
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  const toward = l > 0.18 ? 0 : 255
  return `#${rgb.map((v) => Math.round(v * 0.3 + toward * 0.7).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem('vmanifest92_device_id')
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem('vmanifest92_device_id', id)
    }
    return id
  } catch (e) {
    return `dev_${Math.random().toString(36).slice(2)}`
  }
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(iso, n) {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Three letters, always. `month: 'short'` is the locale's idea of short, and on en-GB —
// which is what these phones resolve to — September comes back as "Sept", four letters
// among eleven threes. It made a date column ragged and read as a typo next to the
// reports, which build their months by slicing and have always said SEP.
//
// The weekday stays locale-formatted: every language's short weekday is a settled thing,
// and it is the month that has the odd one out.
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtNav(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${isoToDate(iso).toLocaleDateString(undefined, { weekday: 'short' })} ${d} ${MON3[m - 1]}`
}
export function fmtRow(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${isoToDate(iso).toLocaleDateString(undefined, { weekday: 'short' })} ${d} ${MON3[m - 1]} ${y}`
}
// The exception entry that applies to a group (optionally a Section within it) on
// `iso`. Entries live on the group doc as { id, locationId, from, to, miniGroupId? }
// — see groups/{id}.venueSchedule. These are Platoon/Section exceptions to the
// company reporting location; the company default lives on group.locationId and is
// resolved by effectiveVenue, not here.
//
// An entry with no `from` is a STANDING RULE: a date range only means something
// relative to an ICT period, so an override created without one carries no dates
// and applies every day. Ranked by specificity: a Section entry beats a
// platoon-wide one; at equal specificity a dated entry beats a dateless one, since
// an explicit range is a deliberate exception to a standing rule. Between equals
// the later start wins (most recently scheduled). Dates are YYYY-MM-DD, so plain
// string comparison is a date comparison.
// Has an override finished by `iso`? A standing rule that was never ended has no
// end date and so never has. Shared by the Settings card (which hides finished
// ones) and by Reset (which leaves them alone).
export function overrideEnded(from, to, iso) {
  const end = to || from
  return !!end && iso > end
}

export function scheduledVenueEntry(group, iso, miniGroupId) {
  const rank = (e) => (e.miniGroupId ? 1 : 0) // Section > Platoon-wide
  let best = null
  for (const e of (group && group.venueSchedule) || []) {
    if (!e || !e.locationId) continue
    if (e.from && iso < e.from) continue // hasn't started yet
    // `to` without `from` is a standing rule that has since been ended: it applied
    // every day up to and including that date. Ending one rather than deleting it
    // is what keeps a past day resolving to where the platoon actually reported.
    const end = e.to || e.from
    if (end && iso > end) continue // finished before this day
    if (e.miniGroupId && e.miniGroupId !== (miniGroupId || '')) continue // another Section's entry
    if (!best) { best = e; continue }
    if (rank(e) > rank(best)) { best = e; continue }
    if (rank(e) < rank(best)) continue
    if (!!e.from !== !!best.from) { if (e.from) best = e; continue } // dated beats dateless
    // >= not >: entries are appended, so on an equal start date the one added
    // most recently wins — otherwise a freshly scheduled entry would silently
    // lose to the one it was meant to override. Two dateless entries compare the
    // same way: the later-added one wins.
    if (!e.from || e.from >= best.from) best = e
  }
  return best
}

// Every date in the app is LOCAL (todayISO builds from getFullYear/getMonth/getDate),
// so a range walk has to stay on the same footing — addDays round-trips through a
// local Date, never through toISOString.
export function datesBetween(from, to) {
  const out = []
  for (let d = from; d <= (to || from); d = addDays(d, 1)) out.push(d)
  return out
}

// "Today, 8:14 AM" for something stamped today, "3 Aug, 8:14 AM" for anything older.
// The app had no clock format at all before this — only relativeTime and the date
// formatters above — so this is the one place the 12-hour convention is decided.
export function fmtClock(ts) {
  const d = new Date(ts)
  // Locale-formatted, then the meridiem forced upper — en-SG renders it "2:18 pm",
  // and the agreed copy is "2:18 PM".
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s*([ap])\.?m\.?/i, (m, p) => ` ${p.toUpperCase()}M`)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (iso === todayISO()) return `Today, ${time}`
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`
}

export function relativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}min ago`
  return `${Math.floor(mins / 60)}h ago`
}
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
// ---- Supporting documents (MC certificates and the like) --------------------
// Files live inside Firestore, not Cloud Storage: Storage became billing-only in
// Feb 2026 and this project stays on the free tier. A Firestore doc caps at 1 MiB,
// so anything larger is split across `parts` sub-docs. Bytes are stored native
// (Uint8Array), NOT base64 — base64 would inflate every file by a third for nothing.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // one batched commit has to hold this
export const DOC_CHUNK_BYTES = 900000           // under 1 MiB with room for field overhead
export const MAX_DOC_DAYS = 30                  // a typo can't write thousands of days
export const DEFAULT_DOC_LABEL = 'Supporting Document'

// What a status calls the thing it needs attached — 'Medical Certificate' on MC,
// the generic fallback everywhere else. Admin-set per status, so renaming the
// status label can't break the wording.
export function docLabelOf(status) {
  return (status && status.docLabel) || DEFAULT_DOC_LABEL
}

export function chunkBytes(bytes, size = DOC_CHUNK_BYTES) {
  const out = []
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size))
  return out
}

export function blobFrom(parts, mimeType) {
  return new Blob(parts, { type: mimeType || 'application/octet-stream' })
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Shrink a photo until it's small enough to be cheap to store and to read back.
// Quality first, then one halving of the long edge — a phone photo lands well under
// the target on the first or second pass, so MAX_UPLOAD_BYTES only ever bites a PDF.
// Throws if the image can't be decoded: iPhone Safari reads HEIC natively (the target
// device), desktop Chrome does not, and the caller turns that into a plain message.
export async function compressImage(file, { maxDim = 1600, targetBytes = 400000 } = {}) {
  const bitmap = await createImageBitmap(file)
  let smallest = null
  try {
    for (const dim of [maxDim, Math.round(maxDim / 2)]) {
      const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const q of [0.85, 0.7, 0.55, 0.4]) {
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q))
        if (!blob) continue
        if (blob.size <= targetBytes) return blob
        if (!smallest || blob.size < smallest.size) smallest = blob
      }
    }
  } finally {
    if (bitmap.close) bitmap.close()
  }
  // Still over target after every pass — hand back the smallest we made and let the
  // caller apply MAX_UPLOAD_BYTES. Better a large photo than a rejected one.
  return smallest || file
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location isn't available in this browser."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  })
}
export function humanizeGeoError(err) {
  if (err && err.code === 1) return 'Please turn on location services.'
  if (err && err.code === 2) return 'Please turn on location services.'
  if (err && err.code === 3) return 'Location timed out. Retry.'
  return (err && err.message) || "Couldn't get your location."
}
