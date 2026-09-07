import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  doc, getDoc, setDoc, updateDoc, deleteField, addDoc, deleteDoc, collection, onSnapshot, getDocs, query, where, writeBatch, Bytes, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db, auth } from './firebase.js'
import { SteeringWheel, UsersGroup, Run, RunPlus, UserCog, UsersCog, DocOnDoc } from './tabler-icons.jsx'
import { RankInsignia, rankKey, rankLabel } from './rank-icons.jsx'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, updateEmail, signOut, onAuthStateChanged, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import {
  DEFAULT_RADIUS, DEFAULT_FRESHNESS_MINUTES, todayISO, addDays, fmtNav, fmtRow,
  distanceMeters, getPosition, humanizeGeoError, getDeviceId, scheduledVenueEntry, overrideEnded,
  readableInk, datesBetween, fmtClock, chunkBytes, blobFrom, compressImage, docLabelOf, fmtBytes,
  MAX_UPLOAD_BYTES, MAX_DOC_DAYS, DEFAULT_DOC_LABEL,
} from './lib.js'
import {
  Activity, ClipboardList, CalendarCheck, CalendarDays, Shield, ShieldCheck, MapPin, LocateFixed, LocateOff,
  Loader2, LogOut, Plus, Trash2, Pencil, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Settings, UserCircle, SunMoon, Check, X, CircleX, UserCheck, Lock, SlidersHorizontal, CheckCircle2, Tags, CircleDashed, QrCode, ScanLine, RefreshCw, Layers, HelpCircle, Phone, GripVertical, MoreHorizontal, EyeOff, Eye, TabletSmartphone,
  Paperclip, FileWarning, FileCheck, FileClock, FileMinus, FileText, Camera, Share2, Download, Filter, Ban, TriangleAlert, History, Archive, Truck, PersonStanding, UserPlus, Star,
} from 'lucide-react'

const SESSION_KEY = 'vmanifest92_session'
const LAST_LOGIN_ID_KEY = 'vmanifest92_last_login_id' // prefill the Login ID field on return visits
// DEV ONLY: password the quick-login buttons sign in with. The buttons now go
// through the real login (hardened rules require a genuine Auth session), so
// this must be the actual password of the test accounts. Remove with the
// buttons before launch.
const DEV_PASSWORD = '123'
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes
const STATIC_CACHE_KEY = 'vmanifest92_static_v1'
const STATIC_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const OUTLOOK_DAYS = 14 // how far ahead the venue outlook looks
// One message for both sides of lockdown: what the login page says while it's on,
// and what a refused login is told. Super admins see it too and sign in anyway —
// no branching, and nobody who left it on is left wondering why.
const LOCKDOWN_NOTICE = 'VManifest 92 is closed for Setup.'
// Ink for text on the red tint below, where the ink and its own background are the
// same hue and the raw colour washes out (1.4:1 in light). --tint-ink-mix is the
// app's existing answer to exactly this: pull toward --text on a light surface,
// keep the hue PURE on a dark one, where blending toward white only turns red into
// salmon on brown. 5.7:1 light, 5.5:1 dark.
const LOCKDOWN_INK = 'color-mix(in srgb, var(--red) var(--tint-ink-mix), var(--text))'
const LOCKDOWN_TINT = 'color-mix(in srgb, var(--red) 15%, transparent)'
// Draft Mode wears the same shape as Lockdown, one hue over: a state the app is being held
// in on purpose, announced in the header on every tab rather than tucked inside the thing it
// affects. Violet because it is not an alarm — nothing is wrong with a manifest still being
// written. Same ink recipe as the red one, for the same reason: a pale hue on a 15% wash of
// itself washes out, so it is pulled toward --text on a light surface and left pure on a dark.
const DRAFT_INK = 'color-mix(in srgb, var(--purple) var(--tint-ink-mix), var(--text))'
const DRAFT_TINT = 'color-mix(in srgb, var(--purple) 15%, transparent)'

// The freeze wears the same shape as Lockdown and Draft, one hue further round: a state
// the app is being held in on purpose, announced in the header. Blue because nothing is
// wrong — the morning was taken and reported, which is the day working as intended. Same
// ink recipe as the other two, for the same reason: a hue on a 15% wash of itself washes
// out, so it is pulled toward --text on a light surface and left pure on a dark one.
const FROZEN_INK = 'color-mix(in srgb, var(--blue) var(--tint-ink-mix), var(--text))'
const FROZEN_TINT = 'color-mix(in srgb, var(--blue) 15%, transparent)'

// Tabler Icons' snowflake (MIT), inlined rather than added as a second icon dependency
// for one glyph. Lucide's snowflake is a six-spoke asterisk; this one has the barbed arms
// that actually read as a snowflake. Props match a lucide icon exactly, so every call site
// is unchanged and `color` still falls through to currentColor inside a tinted chip.
function Snowflake({ size = 24, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M10 4l2 1l2 -1" />
      <path d="M12 2v6.5l3 1.72" />
      <path d="M17.928 6.268l.134 2.232l1.866 1.232" />
      <path d="M20.66 7l-5.629 3.25l.01 3.458" />
      <path d="M19.928 14.268l-1.866 1.232l-.134 2.232" />
      <path d="M20.66 17l-5.629 -3.25l-2.99 1.738" />
      <path d="M14 20l-2 -1l-2 1" />
      <path d="M12 22v-6.5l-3 -1.72" />
      <path d="M6.072 17.732l-.134 -2.232l-1.866 -1.232" />
      <path d="M3.34 17l5.629 -3.25l-.01 -3.458" />
      <path d="M4.072 9.732l1.866 -1.232l.134 -2.232" />
      <path d="M3.34 7l5.629 3.25l2.99 -1.738" />
    </svg>
  )
}

// Validation messages that render under their own field's title rather than in
// the form's general message slot (which keeps the date and overlap warnings).
// Named so each render site and its validation can't drift apart.
const WEEKEND_EXCLUDED_MSG = 'The ICT Period excludes weekends.'
const LOCATION_REQUIRED_MSG = 'Pick a Reporting Location.'
const SECTION_REQUIRED_MSG = 'Pick a Section.'
const PERSON_REQUIRED_MSG = 'Pick Personnel.'
const LOC_NAME_REQUIRED_MSG = 'Enter a name for this Reporting Location.'
const LOC_RADIUS_REQUIRED_MSG = 'Enter a Check-In Radius between 1 and 400 metres.'
const START_DATE_REQUIRED_MSG = 'Pick a Start Date.'
const END_DATE_REQUIRED_MSG = 'Pick an End Date.'

// Small tinted pill for inline quick actions (date presets, select-all), so they
// read as tappable instead of as blue label text.
// Sentinel for the company card's Attached chip: it opens the same names sheet as a
// status chip but is not a status, so it needs an id no status can ever have.
// Every vehicle here is a MID plate, so the prefix is the app's to write and never the
// admin's to type — the field stores the digits alone and this puts the MID back.
const plateLabel = (plate) => (String(plate || '').trim() ? `MID${String(plate).trim()}` : '')

// The day document's roster stamp plus its freeze state, in one shape. FIVE readers
// fill the same `attendanceStamp` map — two live listeners, the past-day fetch, the
// month query and the all-platoons query — and every one of them has to carry the
// same fields. A reader that forgot `frozen` would draw a frozen day as an open one,
// buttons and all, and only the rules would stop the write.
const stampOf = (data) => ({
  members: data.members || null,
  sections: data.sections || {},
  venueSections: data.venueSections || {},
  venuePersons: data.venuePersons || {},
  frozen: data.frozen === true,
  unfrozen: Array.isArray(data.unfrozen) ? data.unfrozen : [],
  frozenByName: data.frozenByName || '',
  frozenAt: data.frozenAt || 0,
})

const ATTACHED_CHIP = '__attached'
// A triangle, not a dot: every status marker in this app is a coloured circle, and
// Attached is not a status — it counts people alongside the roll call rather than inside
// it. The shape says so on its own, which matters because the ten statuses already use
// green, yellow, amber, orange, red-orange, red, blue, cyan, magenta AND purple, leaving
// no hue that wouldn't read as "some status".
// var(--text), so it is black on the light theme and white on the dark one — a solid
// neutral either way, and never a colour that could be mistaken for a status.
const ATTACHED_MARK_STYLE = {
  width: 0, height: 0, flexShrink: 0,
  borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
  borderBottom: '7px solid var(--text)',
}
// A tinted pill's edge, in one place. 45% of the colour the pill's ink is made from —
// TINT_PILL_STYLE's figure, which is where the rule started. A 15-16% wash has no
// discernible boundary on a dark card, so without a stroke these read as coloured text
// rather than as something with a shape.
//
// The header banners' edge — Lockdown, Draft Mode, Attendance Frozen. currentColor, so
// each banner's own ink draws it, at full strength: TINT_EDGE's 45% on top of a 15% fill
// left an outline you had to look for, and the bar read as a wash with no boundary. The
// ink is already blended toward --text for contrast, so this is a defined edge rather
// than a hard ring of raw hue.
const BANNER_EDGE = '1px solid currentColor'
// TINT_EDGE covers every pill whose ink IS its colour — currentColor resolves per
// element, so blue, red and the lockdown tint all get their own edge from one string.
// The amber and violet pills blend their ink toward --text, so 45% of currentColor
// would carry that blend into the stroke; they name the source colour instead.
// Freeze wears the same box in all four of its states - Freeze, blocked, Confirm, Frozen -
// so tapping it cannot make the chip grow under the thumb and shove the row along with it.
// "Confirm" is the longest of the labels and sets the width; the others are centred in it.
// border-box, so the 66 includes the padding. Shared rather than repeated because the
// armed BUTTON and the frozen SPAN are the same chip in two states, and a width that
// drifted between them would be the very jump this exists to stop.
// HEIGHT is pinned for the same reason as the width: the word is 11px in three states and
// 10px in the armed one, and a line box a point shorter made the chip shrink when tapped,
// taking the row with it. 22 rather than the 23 the 11px line box comes to on its own -
// that is what the FMC tag and the three pills beside it measure, and Freeze standing one
// pixel taller than everything else on the row was a mismatch the free-flowing version had
// been hiding. Both sizes centre inside it.
// A word in a pill does not sit where the box says it does, and the size of the error
// depends on how much TALL ink the word has.
//
// The line box centres the font's ascent and descent, which lands a label half a pixel low
// from rounding. For a word that is mostly full-height - "FMC", "ATTACH", "Platoon 1", with
// its P, l, t and 1 - that half pixel is the whole correction: cap-top-to-baseline is the
// ink, so centring it is centring the word.
//
// "Freeze" is not that word. One tall letter and five short ones means centring
// cap-to-baseline leaves every visible letter sitting BELOW the line, and it reads as low
// however good the arithmetic is. It wants a whole pixel - which also keeps the glyphs on
// device pixels instead of smeared across half of one.
//
// So the constant is chosen by the shape of the label, not by where it is used.
//
// Both are nudged on an INNER element, never on the pill: a transform on the pill would
// move its background with the word, and every gap on these rows is measured off those
// boxes. inline-block because a transform does nothing to a plain inline. Layout is
// untouched - a transform is paint only - so the fixed 66px Freeze chip stays 66.
const PILL_INK_CAPS = { display: 'inline-block', transform: 'translateY(-0.5px)' }
const PILL_INK = { display: 'inline-block', transform: 'translateY(-1px)' }
const FREEZE_CHIP = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 7px 0 6px', minWidth: 66, height: 22, borderRadius: 999, fontWeight: 600 }
// The WORD is sized per-state, because the box is not. A fixed 66px box sized to the
// longest label leaves the shorter ones sitting in slack, and slack in a chip reads as a
// mistake - so "Freeze" and "Frozen" spend it on being legible instead, at 11px. "Confirm"
// cannot: it is the word the 66 was measured from, and one point up would push the box
// wider and undo the whole point of fixing it. Both still fit: 62.5 for "Frozen", the wider
// of the two, and 65.6 for "Confirm".
//
// The SNOWFLAKE does not follow the word. It is the one thing on the chip that is the same
// in all four states - it is what says which control this is - and a mark that changed size
// as the label changed would read as a second thing happening. Roy's call.
const FREEZE_ICON = 12
const freezeFontSize = (armed) => (armed ? 10 : 11)
const TINT_EDGE = '1px solid color-mix(in srgb, currentColor 45%, transparent)'
// The BLUE pills' edge. Solid, where TINT_EDGE above is a 45% transparency.
//
// A transparent edge paints over its own pill's fill, so it moved when the fill did —
// raising the card tint to 28% dragged the outline bluer along with it, which is not what
// a border is for. Solid, the outline is the app's blue whatever the fill behind it does,
// and the tint is left doing the one job it should: colouring the background.
// Only the blue ones. Amber and violet keep their own edges, which are already
// source-coloured rather than currentColor-derived — see the note above.
const BLUE_EDGE = '1px solid var(--blue)'
// Every label in the Reporting Location form — the field titles and the hints under their
// boxes. One constant because they are the same kind of text: 12px secondary, said about a
// field rather than in it. Only the margins differ, and those are per-position.
const LOC_LABEL = { fontSize: 12, color: 'var(--text-secondary)' }
// A title is set at 600 where its hint stays at 400. They are the same size and the same ink,
// and they sit one directly under the other, so weight is the only thing separating the name
// of a field from the note about it.
const LOC_TITLE = { ...LOC_LABEL, fontWeight: 600 }
// A destructive button's two states. In this app SOLID red already means "the next tap does
// it" — Purge Documents and Clear Manifests are btn-primary that fill red on the confirming
// tap, and the archive chip goes blue to red the same way. So a Delete that is filled before
// you have touched it is saying "you already tapped once", which is exactly the wrong thing
// for the one control on a card that cannot be undone.
//
// At rest: the red tint with red ink. Armed: filled, white ink. The LABEL changes too at
// every call site; this is only the colour half, and it exists so the rule lives in one
// place rather than being retyped at each of the seven buttons that follow it.
const dangerFill = (armed) => ({ background: armed ? 'var(--red)' : 'var(--red-tint)', color: armed ? '#fff' : 'var(--red)' })
// The tick/cross pair that appears when a name is tapped for editing — Platoon, Section,
// Personnel Info and Platoon Info all draw the same row, so they share one rule rather than
// four copies of it.
//
// The two flags differ in one case only, and deliberately. The TICK is live when the new
// name is different AND not blank: a blank name cannot be saved, so a blue tick would
// promise a write that never happens. The CROSS is red whenever the box differs from what
// is stored, blank included — red here means "this throws away what you typed", and
// emptying the box is something typed. So on an emptied field the tick is grey and the
// cross is red, which is exactly what those two buttons would do next.
//
// No arming on the cross. The colour IS the warning, and it arrives before the tap rather
// than after it — which is the better place for a warning about a tap.
const renameDirty = (next, cur) => !!(next || '').trim() && (next || '').trim() !== (cur || '').trim()
const renameChanged = (next, cur) => (next || '').trim() !== (cur || '').trim()
// Sizes are NOT part of these helpers on purpose: each row picks the size of the icon it
// replaces (tick = its pencil, cross = its bin), and those differ between cards.
const renameTick = (live) => ({ background: 'none', border: 'none', color: live ? 'var(--blue)' : 'var(--text-secondary)', display: 'flex' })
// One sentence, five screens — the Today board, the Count calendar, the Platoon tab, the
// Activity sheet list and its roster all stand down with it, so it lives here rather than
// being retyped where it is used.
//
// The gear is DRAWN, not named. "The Admin tab" is a place, and the tab bar carries icons
// with no labels — so the words sent you looking for a word that is not on screen. Inline,
// on the text's own baseline, so it reads as part of the sentence and not as a button.
const ASSIGN_PERSONNEL_HINT = <>Assign Personnel to this platoon from <Settings size={13} style={{ verticalAlign: -2 }} />.</>
const renameCross = (changed) => ({ background: 'none', border: 'none', color: changed ? 'var(--red)' : 'var(--text-secondary)', display: 'flex' })
// The same solid edge for a chip that is NOT blue. CHIP_STYLE is spread by chips in four
// inks — the red Resets, the violet one on the manifest, and the three banner chips, each
// of which overrides `color` and nothing else — so a hard `var(--blue)` on the shared
// constant outlined every one of them in a colour it had no other trace of. `currentColor`
// is that override, whatever it turned out to be, and on the blue chips it IS var(--blue),
// so nothing that was already right moved.
const SOLID_EDGE = '1px solid currentColor'
const AMBER_EDGE = '1px solid color-mix(in srgb, var(--orange) 45%, transparent)'
const VIOLET_EDGE = '1px solid color-mix(in srgb, var(--purple) 45%, transparent)'
const CHIP_STYLE = {
  background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
  border: SOLID_EDGE,
  borderRadius: 999,
  padding: '5px 12px',
  color: 'var(--blue)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  flexShrink: 0,
}

// The chip on an app-header banner — Lockdown's Turn Off, Draft Mode's Publish, the
// freeze's Unfreeze. All three are one width so the banners are the same shape: the bar
// beside a chip is flex:1, so a chip that sizes to its own word makes the bar a different
// length in every state, and the states then read as three different components rather
// than one pattern in three colours.
//
// The width is NOT a number. Two attempts at one (71px for "Turn Off", then 75px for
// "Unfreeze") were both measured in the preview, which renders Segoe UI on Windows —
// and a phone renders SF Pro or Roboto, where the same word at the same 12px comes out
// wider. The chip then overflowed its own minimum and took the difference out of its
// bar, which is exactly the mismatch this constant existed to prevent, visible only on
// the device. See BannerChip: it carries every banner word as a hidden sizer, so the
// browser answers "how wide is the longest word" in the font it is actually using, and
// every chip gets the same answer.
const BANNER_CHIP = { ...CHIP_STYLE }
const BANNER_WORDS = ['Turn Off', 'Publish', 'Unfreeze']

// One grid cell, every banner word stacked in it, only the real one visible. A hidden
// element still takes part in sizing, so the cell is as wide as the widest word — the
// same value for all three chips, on any device, in whatever font it resolves. Add a
// word here if a fourth banner ever arrives; forgetting to is the one way this drifts.
function BannerChip({ children, style, ...rest }) {
  return (
    <button {...rest} style={{ ...BANNER_CHIP, ...style, display: 'inline-grid', alignItems: 'center', justifyItems: 'center' }}>
      <span style={{ gridArea: '1 / 1' }}>{children}</span>
      {BANNER_WORDS.map((w) => (
        <span key={w} aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden', pointerEvents: 'none' }}>{w}</span>
      ))}
    </button>
  )
}

// One cell of the status-count grid on the Count tab — the All Platoons card and the
// day card below it both use it, so the two read as the same control at two scopes.
// minWidth 0 is what lets the label ellipsis instead of forcing the column wider.
const STATUS_CHIP_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
  padding: '5px 10px',
  borderRadius: 999,
  background: 'var(--separator)',
  border: 'none',
  fontSize: 12,
  color: 'var(--text)',
}
const STATUS_CHIP_LABEL_STYLE = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
}

// Centered modal overlay, pinned to the VISUAL viewport (the area not covered by the
// keyboard). height/transform read --vv-height/--vv-top, which main.jsx keeps in sync on
// every visualViewport resize AND scroll — so when iOS scrolls a focused input into view
// (offsetTop), the overlay translates down with it and the card stays centered in the
// visible area instead of drifting off with a gap. Portaled to document.body so it
// escapes the scroll container's pull-refresh transform (which would trap position:fixed).
const MODAL_OVERLAY_STYLE = { position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--vv-height, 100dvh)', transform: 'translateY(var(--vv-top, 0px))', zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 12px' }
// Bottom-sheet variant of the same pinning, for the document sheets. They have a
// ceiling of their own AND a capped preview inside them, and those two limits must
// measure the SAME viewport. `inset: 0` sizes to the area between Safari's toolbars,
// while `vh` is pegged to the full screen and never moves — so coming back from
// another tab restores the toolbars, drops the sheet's ceiling by ~100px, and leaves
// the preview at its full-screen height. Content that fitted a moment ago no longer
// does, and the sheet silently turns into a scroller. Both sides read --vv-height now.
// How long the slide-down lasts. Matches .rc-sheet-closing in styles.css — the node has
// to stay mounted for exactly as long as the animation runs, so the two are one number
// written twice.
// How long a card stays mounted after it is dismissed, so it can be seen leaving. MUST
// equal --rc-exit in src/styles.css, which is where the animations themselves are timed —
// one number governs every sheet's slide and every dialog's fade, so nothing in the app
// closes at a different speed from anything else. Shorter than the CSS and the card is cut
// off mid-move; longer and it sits invisible on screen swallowing taps.
const RC_SHEET_EXIT_MS = 320

// The loaned-personnel pills. Amber says the man is not ours; violet names the section he
// came from — the one hue in the palette carrying no state meaning, so it reads as a plain
// category. Module scope because the admin's manifest and the member's own crew list must
// draw the same pill; they were the admin's alone, which is why a member's list showed a
// loaned man as though he were one of his own.
const TINT_AMBER = 'color-mix(in srgb, var(--orange) 16%, transparent)'
const TINT_AMBER_INK = 'color-mix(in srgb, var(--orange) 75%, var(--text))'
const TINT_VIOLET = 'color-mix(in srgb, var(--purple) 16%, transparent)'
const TINT_VIOLET_INK = 'color-mix(in srgb, var(--purple) 75%, var(--text))'
const ATTACH_PILL = { fontSize: 10, fontWeight: 600, lineHeight: '15px', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }

// Solves y at a given x on a CSS cubic-bezier, by Newton's method on x(t).
//
// It exists because a SCROLL POSITION cannot be handed to a CSS transition, and anything
// animating alongside one has to trace the same curve or the two visibly disagree. That is
// the platoon selector: the sliding pill is a 300ms CSS transition and the strip under it
// is a scrollLeft, and `behavior: 'smooth'` runs the strip on the browser's own duration —
// about 100ms — so the track arrived and the pill was still travelling.
const bezierEasing = (x1, y1, x2, y2) => {
  const a = (u, v) => 1 - 3 * v + 3 * u
  const b = (u, v) => 3 * v - 6 * u
  const at = (t, u, v) => ((a(u, v) * t + b(u, v)) * t + 3 * u) * t
  const slope = (t, u, v) => 3 * a(u, v) * t * t + 2 * b(u, v) * t + 3 * u
  return (x) => {
    let t = x
    // Six passes is well past convergence for these curves, and it is a fixed cost per
    // frame rather than a loop that could hunt on a degenerate control point.
    for (let i = 0; i < 6; i += 1) {
      const d = slope(t, x1, x2)
      if (Math.abs(d) < 1e-6) break
      t -= (at(t, x1, x2) - x) / d
    }
    return at(t, y1, y2)
  }
}
// Read off .seg-pill's own `transition` in styles.css. Change one, change the other.
const SEG_EASE = bezierEasing(0.4, 0, 0.2, 1)
const SEG_MS = 300

// A manifest is one of two kinds: the outfield move-out, or an ordinary activity that just
// needs vehicles. A manifest written before activities existed carries no `kind` — every one
// of those is a move-out, and its doc id is a bare date for the same reason.
//
// The id has to carry the kind because an outfield and an activity can both start on the
// same Monday, and a date alone would put them on one document.
const MV_KINDS = ['outfield', 'activity']
const movementKind = (m) => (m && m.kind) || 'outfield'
const movementDocId = (kind, date) => `${kind}__${date}`
// Keeps a popup mounted for the length of its exit animation after the state that opened
// it goes away. Pass the value (or flag) the popup renders from; render from what comes
// back instead, and hang .rc-sheet-closing off the second return. Every close path is
// covered by construction — an X, a Cancel, the scrim, or a save that closes behind you
// all end in the same state going null, and this sees that rather than each button.
function useExiting(value) {
  const [shown, setShown] = useState(value)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (value) { setShown(value); setClosing(false); return }
    if (!shown) return
    setClosing(true)
    const t = setTimeout(() => { setShown(null); setClosing(false) }, RC_SHEET_EXIT_MS)
    return () => clearTimeout(t)
  }, [value])
  return [shown, closing]
}

const SHEET_OVERLAY_STYLE = { position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--vv-height, 100dvh)', transform: 'translateY(var(--vv-top, 0px))', zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
const sheetFrac = (f) => `calc(var(--vv-height, 100dvh) * ${f})`
// A names sheet whose title stays put. The shell used to be one scrolling box with
// 18/16/28 padding, so a long list carried the status label and the close button up
// out of view — you could no longer see whose list you were reading, or shut it
// without scrolling back. Splitting it into a fixed header and a scrolling body
// keeps the padding identical (the body owns the 28px bottom, so the last row still
// clears the sheet's edge) and leaves overflow:hidden on the shell to preserve the
// rounded top corners.
const SHEET_SHELL_STYLE = { background: 'var(--card)', borderRadius: '20px 20px 0 0', maxHeight: sheetFrac(0.86), display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const SHEET_HEADER_STYLE = { flexShrink: 0, padding: '18px 16px 12px' }
const SHEET_BODY_STYLE = { overflowY: 'auto', padding: '0 16px 28px' }
// How far down a sheet has to be dragged before letting go dismisses it, and how fast a
// short flick has to be travelling to do the same. Under both, it springs back.
const SHEET_DRAG_CLOSE_PX = 88
const SHEET_DRAG_FLICK = 0.5   // px per ms

// Drag a bottom sheet down to close it, the way every iOS sheet does.
//
// Three things here are not obvious. The panel is moved by writing `transform` straight
// onto the node instead of through state — App.jsx re-renders far too much to do that on
// every touchmove, the same reason the vehicle drag handles work this way. The listeners
// are attached by hand rather than through React's onTouch* props, because React registers
// touchmove on its root as PASSIVE: preventDefault from a React handler is ignored, and the
// sheet's own body rubber-bands underneath the drag instead. And nothing is reset on the
// way out — .rc-sheet-closing animates transform to translateY(100%), and a CSS animation
// outranks an inline style, so the slide continues from wherever the finger left the sheet
// rather than snapping back to the top first.
//
// A sheet whose body scrolls only drags when that body is already scrolled to the top.
// Otherwise the gesture belongs to the list, which is what iOS does too.
function useSheetDrag(onClose, enabled = true) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let startX = 0, startY = 0, lastY = 0, lastT = 0, dy = 0, v = 0
    let decided = false, dragging = false
    // The nearest scrolling ancestor between the touch and the panel, panel included —
    // several sheets put the scroll on the panel itself and several on a body inside it.
    const scrollerUnder = (target) => {
      for (let n = target; n && n !== el.parentNode; n = n.parentNode) {
        if (n.nodeType !== 1) continue
        const o = getComputedStyle(n).overflowY
        if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
      }
      return null
    }
    const springBack = () => {
      el.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
      el.style.transform = 'translateY(0px)'
      setTimeout(() => { el.style.transition = ''; el.style.transform = '' }, 280)
    }
    const onStart = (e) => {
      if (e.touches.length !== 1) return
      decided = false; dragging = false; dy = 0; v = 0
      startX = e.touches[0].clientX
      startY = lastY = e.touches[0].clientY
      lastT = e.timeStamp
      el.style.transition = ''
    }
    const onMove = (e) => {
      if (e.touches.length !== 1) return
      const y = e.touches[0].clientY, x = e.touches[0].clientX
      // Nothing is claimed until the finger has moved enough to say which way it meant to
      // go. Six pixels is under the tap slop, so a tap on a row is never read as a drag.
      if (!decided) {
        if (Math.abs(y - startY) < 6 && Math.abs(x - startX) < 6) return
        decided = true
        const sc = scrollerUnder(e.target)
        dragging = (y - startY) > Math.abs(x - startX) && (!sc || sc.scrollTop <= 0)
        if (!dragging) return
      }
      if (!dragging) return
      e.preventDefault()
      dy = Math.max(0, y - startY)
      // Speed is sampled over at least 8ms — about half a frame. Taking it from whatever
      // two moves happen to arrive back to back divides a few pixels by a fraction of a
      // millisecond and reports a flick that never happened, which dismissed the sheet on
      // a 40px nudge.
      const dt = e.timeStamp - lastT
      if (dt >= 8) { v = (y - lastY) / dt; lastY = y; lastT = e.timeStamp }
      el.style.transform = `translateY(${dy}px)`
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      if (dy > SHEET_DRAG_CLOSE_PX || (dy > 24 && v > SHEET_DRAG_FLICK)) closeRef.current()
      else springBack()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])
  return ref
}

// The gap between one platoon's page and the next while they are moving. 32px is the two
// 16px gutters the scroller already puts down the sides, so the pages pass each other at
// the same distance everything else on the screen keeps from the edge.
const SWIPE_PAGE_GAP = 32

// A page swipe between platoons, with the next platoon's page peeking in under the finger.
//
// It costs NO extra Firestore reads, which is the whole reason it is built this way. The
// neighbours are drawn from day documents already in memory: the all-platoons query behind
// the Count and Movement tabs now keeps the `activities` and `docs` fields it used to drop,
// so the data the peek needs was paid for before the gesture started. Nothing here opens a
// listener, and nothing here re-reads on a swipe — bouncing between two platoons costs the
// same as looking at one. A platoon whose document has genuinely never arrived peeks blank
// and fills on landing; see activityPage.
//
// The two neighbours are absolutely positioned one page-width out on either side, so they
// take no layout height and the current page alone sets how tall this is. They are inert:
// aria-hidden and pointerEvents none, and every handler they are given is a no-op. That
// last part matters more than it looks — ActivityView clears the open sheet when its
// groupId changes, and a neighbour allowed to do that would close the sheet you are on.
//
// Direct DOM writes, never state: this wraps a subtree of App.jsx, and re-rendering it on
// every touchmove would drop frames on the gesture it exists to smooth.
function SwipePages({ enabled, hasPrev, hasNext, onPrev, onNext, prev, next, children }) {
  const ref = useRef(null)
  // Read through a ref so the listeners bind once. Rebinding them when the neighbours
  // change would tear the gesture down mid-drag.
  const cb = useRef(null)
  cb.current = { hasPrev, hasNext, onPrev, onNext }
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let startX = 0, startY = 0, dx = 0, decided = false, sliding = false, busy = false
    let timer = null
    // '' rather than translateX(0): a transform, even an identity one, makes this element
    // the containing block for any position:fixed descendant — and the Add Personnel sheet
    // is one. At rest there must be no transform at all.
    const setX = (x, ms) => {
      el.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.22,0.61,0.36,1)` : 'none'
      el.style.transform = x ? `translate3d(${x}px,0,0)` : ''
    }
    let yielded = false
    const onStart = (e) => {
      if (busy || e.touches.length !== 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      dx = 0; decided = false; sliding = false
      // A gesture that begins on something that owns horizontal movement belongs to it,
      // not to the page. Decided at touchstart, from where the finger landed, so the two
      // never race for it. Two ways to own it: data-hswipe, which swipe-to-clear sets, and
      // touch-action:none, which every drag-to-reorder handle already carries — so a new
      // handle is covered the day it is written, without having to remember this file.
      yielded = ownsHorizontal(e.target)
    }
    const onMove = (e) => {
      if (busy || yielded || e.touches.length !== 1) return
      const x = e.touches[0].clientX, y = e.touches[0].clientY
      // Nothing is claimed until the finger says which way it meant to go. Six pixels is
      // under the tap slop, so a tap on a roster row is never read as a swipe.
      if (!decided) {
        if (Math.abs(x - startX) < 6 && Math.abs(y - startY) < 6) return
        decided = true
        sliding = Math.abs(x - startX) > Math.abs(y - startY)
      }
      if (!sliding) return
      e.preventDefault()
      dx = x - startX
      // At the first and last platoon the page still moves, a quarter as far. Answering the
      // gesture and refusing it at once is what says there is no page that way — and there
      // is nothing rendered out there to uncover, so it must not travel a full width.
      if ((dx > 0 && !cb.current.hasPrev) || (dx < 0 && !cb.current.hasNext)) dx *= 0.25
      setX(dx, 0)
    }
    const onEnd = () => {
      if (!sliding || busy) return
      sliding = false
      const goPrev = dx > 0
      const step = (el.offsetWidth || 1) + SWIPE_PAGE_GAP
      // A quarter of the way across before it commits — about 100px on a phone. It was a
      // flat 70, which landed on the next platoon before the gesture felt finished; the
      // fraction also keeps the same feel on any screen width rather than getting easier to
      // trigger the wider the phone.
      if (Math.abs(dx) < step * 0.25 || (goPrev ? !cb.current.hasPrev : !cb.current.hasNext)) {
        setX(0, 220)
        return
      }
      busy = true
      const dir = goPrev ? 1 : -1
      setX(dir * step, 170)
      timer = setTimeout(() => {
        // Switch, then snap the track back to centre with no transition. The picture does
        // not move: the page that was one step out is now the current one, sitting exactly
        // where the track was holding it.
        // flushSync, because that only works if React has COMMITTED the new platoon before
        // the transform is cleared. Left to batch, the browser gets one frame of the old
        // platoon back at centre and the switch reads as a stutter.
        flushSync(() => { (goPrev ? cb.current.onPrev : cb.current.onNext)() })
        setX(0, 0)
        busy = false
      }, 170)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      if (timer) clearTimeout(timer)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.style.transition = ''
      el.style.transform = ''
    }
  }, [enabled])
  // pan-y hands vertical scrolling back to the browser and keeps horizontal for us, so the
  // roster scrolls at native speed and the two gestures never fight. minHeight fills the
  // scroller, so a short list is still swipeable in the empty space under it.
  return (
    <div ref={ref} style={{ position: 'relative', minHeight: '100%', touchAction: enabled ? 'pan-y' : 'auto' }}>
      {enabled && (
        <div aria-hidden style={{ position: 'absolute', top: 0, right: `calc(100% + ${SWIPE_PAGE_GAP}px)`, width: '100%', pointerEvents: 'none' }}>{prev}</div>
      )}
      {children}
      {enabled && (
        <div aria-hidden style={{ position: 'absolute', top: 0, left: `calc(100% + ${SWIPE_PAGE_GAP}px)`, width: '100%', pointerEvents: 'none' }}>{next}</div>
      )}
    </div>
  )
}

// Walks up from wherever the finger landed looking for something that has already claimed
// horizontal movement. Stops at <body>; the page swipe's own wrapper never sets either.
function ownsHorizontal(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.dataset && n.dataset.hswipe !== undefined) return true
    if (n.nodeType === 1 && getComputedStyle(n).touchAction === 'none') return true
  }
  return false
}

// Handed to every control on a neighbour page. Module scope so its identity is stable and
// an inert page never re-runs an effect just because it was re-rendered.
const SWIPE_NOOP = () => {}

// How far the pill travels to sit fully open, and how far a finger has to drag before
// letting go counts as "open it" rather than "put it back".
const SWIPE_CLEAR_SNAP = 30

// Swipe a recorded status pill to the left to uncover a red Clear sitting under it, then
// tap that to wipe the status. Two deliberate actions, matching every other destructive
// thing on this board — Mark All and quick-Present both arm before they fire — because a
// status wiped by a stray finger is silent: the row simply reads unmarked again and
// nothing says why.
//
// Clear is drawn ONCE, at full size, pinned to the row's right edge and sitting behind
// the pill. The pill slides left off it; nothing grows and nothing is clipped. Two
// earlier shapes were both wrong for the same underlying reason — a pill revealed a bit
// at a time is not a pill. Sliding it through a window with overflow:hidden cut a square
// edge across its radius, which showed up as a straight grey edge in the notch of the
// status pill's rounded corner; growing the button's own width kept the radius but
// squeezed the word inside it. Uncovering a finished pill has neither problem.
//
// The pill carries a --card backing of its own, because on a frozen day a reopened man's
// pill is a 25% tint and the red would otherwise glow through it before the swipe began.
//
// The transform is written straight onto the node during the drag rather than through
// state — App.jsx re-renders far too much to do that per touchmove (see useSheetDrag,
// which makes the same trade for the same reason). State carries only the resting
// open/closed, which changes once per gesture. The listeners are attached by hand
// because React registers touchmove on its root as PASSIVE, and a passive handler cannot
// preventDefault the page scroll that would otherwise take the gesture away mid-swipe.
function SwipeClear({ enabled, open, onOpen, onClose, onClear, label, children }) {
  const wrapRef = useRef(null)
  const slideRef = useRef(null)
  const actionRef = useRef(null)
  // How far the pill has to travel to sit clear of the action behind it. Measured off the
  // rendered button rather than guessed at, so it holds in whatever font the device uses
  // and would still hold if the word ever changed.
  const travel = () => (actionRef.current ? actionRef.current.getBoundingClientRect().width + 8 : 0)
  // Set while a drag is actually moving, and read by the pill's own click handler: a
  // swipe that ends over the pill must not also open the status picker.
  const draggedRef = useRef(false)
  const openRef = useRef(open)
  openRef.current = open

  const settle = (el, to) => {
    el.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)'
    el.style.transform = `translateX(${-to}px)`
    setTimeout(() => { el.style.transition = '' }, 240)
  }

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !enabled) return
    let startX = 0, startY = 0, decided = false, dragging = false, base = 0, dx = 0, max = 0
    const onStart = (e) => {
      if (e.touches.length !== 1) return
      decided = false; dragging = false; draggedRef.current = false
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      max = travel()
      base = openRef.current ? max : 0
      dx = base
      if (slideRef.current) slideRef.current.style.transition = ''
    }
    const onMove = (e) => {
      if (e.touches.length !== 1) return
      const x = e.touches[0].clientX, y = e.touches[0].clientY
      // Nothing is claimed until the finger says which way it meant to go. Six pixels is
      // under the tap slop, so a tap on the pill is never read as a swipe; and a gesture
      // that is mostly vertical is left to the page, which is scrolling a long platoon.
      if (!decided) {
        if (Math.abs(x - startX) < 6 && Math.abs(y - startY) < 6) return
        decided = true
        dragging = Math.abs(x - startX) > Math.abs(y - startY)
        if (!dragging) return
      }
      if (!dragging) return
      e.preventDefault()
      draggedRef.current = true
      dx = Math.max(0, Math.min(max, base + (startX - x)))
      if (slideRef.current) slideRef.current.style.transform = `translateX(${-dx}px)`
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      const sl = slideRef.current
      if (!sl) return
      // Past the snap point it opens, short of it it goes back — measured from where the
      // gesture started, so dragging a little way BACK from open closes it again.
      const shouldOpen = openRef.current ? dx > max - SWIPE_CLEAR_SNAP : dx > SWIPE_CLEAR_SNAP
      settle(sl, shouldOpen ? max : 0)
      if (shouldOpen !== openRef.current) (shouldOpen ? onOpen : onClose)()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, onOpen, onClose])

  // Follow the resting state whenever it changes from outside the drag — another row
  // being swiped closes this one, and the drag's own settle has already put the pill
  // where this would.
  useEffect(() => {
    const sl = slideRef.current
    if (!sl) return
    const want = open && enabled ? travel() : 0
    const now = -parseFloat((sl.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0
    if (Math.abs(now - want) > 0.5) settle(sl, want)
  }, [open, enabled])

  // A tap anywhere else puts it away, the way an open iOS row does. pointerdown rather
  // than click so it closes on the press, and captured so a tap on some other control
  // still closes this before that control's own handler runs.
  useEffect(() => {
    if (!open || !enabled) return
    const away = (e) => { if (!wrapRef.current || !wrapRef.current.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open, enabled, onClose])

  if (!enabled) return children
  return (
    // data-hswipe says "the horizontal gesture in here is mine". The Activity tab's page
    // swipe reads it and stands down, or a drag on a pill would clear a status and change
    // platoon at once — this listener sits inside that one, so both would see the move.
    <span ref={wrapRef} data-hswipe style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {/* Underneath, and never moves. Tinted rather than filled, like the Reset chip on
          the Reporting Location card: solid red is the app's ARMED state, the colour a
          control turns at the moment it is about to fire, and this one is still asking.
          Not tabbable and hidden from a screen reader while it is covered — it is not a
          control yet, and the picker behind the pill is the same job by another route. */}
      <button ref={actionRef} type="button" tabIndex={open ? 0 : -1} aria-hidden={!open}
        aria-label={`Clear ${label}`}
        onClick={(e) => { e.stopPropagation(); onClose(); onClear() }}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 999, border: '1.5px solid color-mix(in srgb, var(--red) 45%, transparent)', background: 'color-mix(in srgb, var(--red) 15%, transparent)', color: 'var(--red)', fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', cursor: 'pointer' }}>
        Clear
      </button>
      {/* The pill, and the only thing that moves. --card behind it so the red does not
          show through a tinted pill, rounded to the pill's own shape so the backing is
          never visible as a rectangle behind its corners.
          onClickCapture, so a swipe that ends over the pill is stopped here rather than
          after the status picker has already opened. */}
      <span ref={slideRef} style={{ position: 'relative', zIndex: 1, display: 'flex', minWidth: 0, borderRadius: 999, background: 'var(--card)' }}
        onClickCapture={(e) => { if (draggedRef.current) { e.preventDefault(); e.stopPropagation() } }}>
        {children}
      </span>
    </span>
  )
}

// The card half of a bottom sheet: draggable, and it swallows the tap that would otherwise
// reach the scrim behind it and close the sheet. A component rather than a bare hook so a
// sheet rendered inside a conditional or an IIFE can still have one — hooks cannot.
// `disabled` is for a sheet that is mid-save: the scrim stops closing it, and so does this.
function SheetPanel({ onClose, disabled, children, ...rest }) {
  const ref = useSheetDrag(onClose, !disabled && !!onClose)
  return <div ref={ref} onClick={(e) => e.stopPropagation()} {...rest}>{children}</div>
}
// A count or a document line that acts as a button: btn-secondary's blue tint plus a
// border in the same ink. The tint on its own vanishes against the dark card — the
// same reason Mark All needed an edge — and without a shape these read as coloured
// text rather than something to press. Fully rounded, because unlike the buttons in a
// row these sit inline with running text and a pill is what separates them from it.
const TINT_PILL_STYLE = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: 'var(--blue-tint)', border: BLUE_EDGE, color: 'var(--blue)', fontFamily: 'inherit', cursor: 'pointer' }
// A strength figure sits under the FMC pill that names whose strength it is, and has to
// centre on it. A fixed-width centred box does that, but it leaves half the slack sitting
// between the figure and the label after it, which reads as a gap — and the slack shrinks
// as the count gains a digit, so no single negative margin closes it at every size.
//
// Padding computed from the digit count does both. In the app's font stack the digits are
// uniform width at 24px/700 — measured 13.80, 27.61, 41.41 for one, two and three, exact
// multiples — so where a figure has to start to be centred is arithmetic, and the label
// after it then follows at the container's own gap with no slack in between.
//
// 45 is what 'FMC' renders to at 12px/600 inside its 10px side padding. The pill has no
// other size it can be, and the Count tab's platoon card uses this too — lining its figure
// up with the company figure above it, not with its own much wider 'Platoon 1' pill.
const FMC_PILL_W = 45
const BIG_DIGIT_W = 13.8
const centreUnderPill = (n) => ({ paddingLeft: Math.max(0, (FMC_PILL_W - String(n ?? '').length * BIG_DIGIT_W) / 2) })
const modalRoot = () => document.body

// Firebase Auth uses Email/Password; each account is wrapped into a synthetic email
// (never shown to the user, never emailed) so we get a verified identity for free.
const AUTH_EMAIL_DOMAIN = 'vmanifest92.local'
// The synthetic email carries a reset version: bumping it (on an admin password
// reset, or a self-change that couldn't sync in-session) yields a fresh email, so
// the next login creates a brand-new Firebase Auth user with the new password.
// This is how password resets work without an Admin SDK / Cloud Function.
const versionSuffix = (version) => (version ? `_r${version}` : '')

// LEGACY address, derived from the login ID. Login IDs are phone numbers, so this
// form publishes every member's number twice over: into the Firebase Auth user
// list (visible to anyone with console access) and into the public signUp
// endpoint, whose "email already in use" response is a free existence oracle for
// any number an attacker cares to try. Kept only to sign in accounts that haven't
// migrated yet — never used for a newly created one.
const syntheticEmail = (username, version) =>
  `${(username || '').trim().toLowerCase()}${versionSuffix(version)}@${AUTH_EMAIL_DOMAIN}`

// CURRENT address, derived from the opaque account doc id. The id is already
// public via authIndex, so this leaks nothing new, and it decouples the Auth
// identity from the login ID entirely — which also means changing a phone number
// no longer has to touch Firebase Auth at all.
// LOWERCASED, and it has to stay that way: Firebase Auth normalizes the whole
// address — local part included — so it stores acc_4QYoh2iQ... as acc_4qyoh2iq...
// and hands that back in the token. Firestore auto-ids are mixed case, so passing
// one through verbatim makes request.auth.token.email and the rules' computed
// expectation permanently unequal, and every claim is denied. (The legacy form
// never hit this: usernames are lowercased before they reach syntheticEmail.)
// firestore.rules applies .lower() for the same reason — change one, change both.
const accountAuthEmail = (accountId, version) =>
  `acc_${String(accountId || '').toLowerCase()}${versionSuffix(version)}@${AUTH_EMAIL_DOMAIN}`

// Which address an account currently answers to. Stored per-account as
// authEmailScheme so the Firestore rules can compute the same answer (they
// string-match this exact format — see firestore.rules). Absent means the legacy
// form, so accounts written before this shipped keep working untouched.
const AUTH_SCHEME_ACCOUNT = 'a'
const isAccountScheme = (scheme) => scheme === AUTH_SCHEME_ACCOUNT
const authEmailFor = (scheme, accountId, username, version) =>
  isAccountScheme(scheme) ? accountAuthEmail(accountId, version) : syntheticEmail(username, version)

function loadStaticCache() {
  try {
    const raw = localStorage.getItem(STATIC_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    if (Date.now() - (cache.ts || 0) > STATIC_CACHE_TTL) return null
    return cache
  } catch (e) { return null }
}
function saveStaticCache(data) {
  try { localStorage.setItem(STATIC_CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() })) } catch (e) {}
}

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function isHash(s) { return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s) }

// Firebase Auth requires passwords >= 6 chars, but app passwords can be shorter
// (e.g. a 3-4 digit PIN). Derive a long, deterministic Firebase password from the
// real one. The pepper keeps it different from the hash stored in accounts.password,
// so reading that field doesn't hand someone a working Firebase credential.
const AUTH_PW_PEPPER = '::vmanifest92-fb-v1'
const authPassword = (raw) => hashPassword(`${raw || ''}${AUTH_PW_PEPPER}`)

// Default initial password every new account is created with. The account is
// flagged mustChangePassword, so the user is forced to set their own on first
// login (see ForcePasswordChangeModal) — this is only ever the induction
// credential relayed to inductees, never a resting state.
const DEFAULT_INITIAL_PASSWORD = 'FMC'

// Human-relayable temp password for admin-driven resets/renames. Unambiguous
// charset (no 0/O/1/I/L) so it can be read aloud or typed without confusion.
function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

// Grow a textarea to fit its content so it never needs a manual resize handle.
// +2 accounts for the 1px top+bottom border under the global border-box sizing.
const autoGrowTextarea = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px' }

// Two kinds of fixed personnel-info field, and the difference matters.
//
// PERMANENT is the app's own: seeded if missing, never renamed, deleted or reordered, and
// never listed in the admin's field creator at all — there is nothing there to decide. It
// is also never self-editable: a man does not set his own rank. Only an admin, from the
// member card, can. Rank is drawn as an insignia rather than as text, so its VALUE has to
// stay a rank abbreviation — see src/rank-icons.jsx.
//
// PINNED is only about position. These lead the grid in this order and cannot be dragged,
// but they are listed in the creator and an admin may rename, delete or lock them like any
// other field. The pin is by label, so renaming one drops it into the ordinary custom
// list — which is the honest outcome, since it is no longer the field that was pinned.
const PERMANENT_ACCOUNT_FIELDS = ['Rank']
const PINNED_ACCOUNT_FIELDS = ['PES', 'Medical Excuse']
const FIXED_ACCOUNT_FIELDS = [...PERMANENT_ACCOUNT_FIELDS, ...PINNED_ACCOUNT_FIELDS]
function isPermanentAccountField(f) { return !!f && PERMANENT_ACCOUNT_FIELDS.includes(f.label) }
function isPinnedAccountField(f) { return !!f && PINNED_ACCOUNT_FIELDS.includes(f.label) }
function isFixedAccountField(f) { return isPermanentAccountField(f) || isPinnedAccountField(f) }
function sortAccountFields(arr) {
  const rank = (f) => { const i = FIXED_ACCOUNT_FIELDS.indexOf(f.label); return i === -1 ? FIXED_ACCOUNT_FIELDS.length : i }
  return [...arr].sort((a, b) => (rank(a) - rank(b)) || ((a.order ?? 0) - (b.order ?? 0)))
}

async function ensureSeedData() {
  try {
    const groupsSnap = await getDocs(collection(db, 'groups'))
    const defaultGroupId = groupsSnap.empty
      ? (await addDoc(collection(db, 'groups'), { name: 'General' })).id
      : groupsSnap.docs[0].id

    // ONE admin level, Roy's call: an admin sees the whole battalion, and everyone else
    // is a member who sees their own seat. So two test accounts, one per level, for the
    // two dev quick-login buttons. Both go before launch with the buttons — see PLAN.md
    // Phase 6.
    //
    // `isSuperAdmin` stays as the flag that carries it. The pair is load-bearing all
    // through this file and in firestore.rules; collapsing them into one flag is a
    // rename, not a simplification, and it would break the rules' string matching for
    // no behavioural gain. An admin here is simply always both.
    const accountsSnap = await getDocs(collection(db, 'accounts'))
    const byName = new Map(accountsSnap.docs.map((d) => [(d.data().username || '').toLowerCase(), d]))
    const SEED_ACCOUNTS = [
      { username: 'admin', displayName: 'Admin', isAdmin: true, isSuperAdmin: true, groupId: '' },
      { username: 'user', displayName: 'User', isAdmin: false, isSuperAdmin: false, groupId: defaultGroupId },
    ]
    const missing = SEED_ACCOUNTS.filter((a) => !byName.has(a.username))
    if (missing.length) {
      const hash = await hashPassword('123')
      const batch = writeBatch(db)
      missing.forEach((a) => {
        const ref = doc(collection(db, 'accounts'))
        batch.set(ref, { ...a, password: hash, authEmailVersion: 0, failedAttempts: 0, lockedUntil: null, authEmailScheme: AUTH_SCHEME_ACCOUNT })
        batch.set(doc(db, 'authIndex', a.username), { accountId: ref.id, authEmailVersion: 0, password: hash, failedAttempts: 0, lockedUntil: null, authEmailScheme: AUTH_SCHEME_ACCOUNT })
      })
      await batch.commit()
    }
    // An `admin` seeded by an earlier build is a HALF-privileged admin — it predates the
    // single-admin decision and was written with isSuperAdmin false. Left alone it would
    // put the Dev: Admin button behind a login that cannot see the other platoons, which
    // reads as a bug in whatever is being tested rather than as stale seed data. Only
    // ever raises the seeded test account, and only while it is still the seeded one.
    const seededAdmin = byName.get('admin')
    if (seededAdmin && seededAdmin.data().isSuperAdmin !== true && seededAdmin.data().displayName === 'Admin') {
      await setDoc(doc(db, 'accounts', seededAdmin.id), { isAdmin: true, isSuperAdmin: true }, { merge: true })
    }
    // A fresh database gets the whole fixed set; an established one only ever gets the
    // PERMANENT fields back. This runs on every app start, so seeding the pinned pair
    // unconditionally would resurrect PES the moment an admin deleted it — and deleting
    // them is allowed now. Empty collection is the only safe read of "never set up".
    const accountFieldsSnap = await getDocs(collection(db, 'accountFields'))
    const existingFieldLabels = new Set(accountFieldsSnap.docs.map((d) => d.data().label))
    const wanted = accountFieldsSnap.empty ? FIXED_ACCOUNT_FIELDS : PERMANENT_ACCOUNT_FIELDS
    const missingBuiltins = wanted.filter((label) => !existingFieldLabels.has(label))
    if (missingBuiltins.length) {
      const batch = writeBatch(db)
      // Pinned fields are seeded self-editable, which is how PES and Medical Excuse have
      // always behaved. Rank is not: only an admin sets a man's rank.
      missingBuiltins.forEach((label, i) => batch.set(doc(collection(db, 'accountFields')),
        { label, order: i, editableByUser: !PERMANENT_ACCOUNT_FIELDS.includes(label) }))
      await batch.commit()
    }
  } catch (e) {
    // Hardened rules deny these reads/writes to unauthenticated visitors. A
    // locked-down database is necessarily already seeded, so this must not
    // block the login screen.
    if (e && e.code === 'permission-denied') return
    throw e
  }
}

// Sign in at the address the account DECLARES, then at the other scheme's address
// if that fails. The second attempt is what makes the scheme migration crash-safe:
// the flip is necessarily two writes (Firebase Auth's updateEmail, then the
// Firestore field), so a crash, denied write or closed tab between them leaves the
// two disagreeing — and with the legacy hash already retired there'd be no
// fallback left to log in through. Trying both means either side of the flip still
// authenticates, and the caller heals the mismatch straight after.
//
// Costs one extra Auth round-trip on a genuinely wrong password. Auth calls aren't
// billed reads, so this doesn't touch the Firestore budget.
async function signInEitherScheme(accountId, uname, version, fbPass, scheme) {
  const primary = authEmailFor(scheme, accountId, uname, version)
  const alternate = isAccountScheme(scheme)
    ? syntheticEmail(uname, version)
    : accountAuthEmail(accountId, version)
  try {
    await signInWithEmailAndPassword(auth, primary, fbPass)
    return { ok: true, scheme, code: null }
  } catch (e) {
    try {
      await signInWithEmailAndPassword(auth, alternate, fbPass)
      return { ok: true, scheme: isAccountScheme(scheme) ? '' : AUTH_SCHEME_ACCOUNT, code: null }
    } catch (e2) {
      // Report the PRIMARY error: it's the one that describes the account's
      // declared identity, and recordFailedAttempt branches on it to tell a wrong
      // password apart from a transient failure.
      return { ok: false, scheme, code: e && e.code }
    }
  }
}

// Retire an account's phone-derived Auth address, in-session, right after a
// successful sign-in (updateEmail requires a recent login). Only ever touches the
// caller's OWN account, so the isSelfAccount rule covers both writes — the claim
// path can't carry this field, by design (see isClaimingAuthUid in firestore.rules).
// Best-effort: on failure the account stays on the legacy address and simply
// retries next login, which is why signInEitherScheme has to tolerate both.
async function reconcileAuthEmailScheme(accountId, uname, version, storedScheme, signedInScheme) {
  if (isAccountScheme(storedScheme) && isAccountScheme(signedInScheme)) return storedScheme
  try {
    // If we authenticated at the legacy address, move Auth first. When we got in
    // at the acc_ address the move already happened (an interrupted earlier run) —
    // only the Firestore side is missing.
    if (!isAccountScheme(signedInScheme)) {
      if (!auth.currentUser) return storedScheme
      await updateEmail(auth.currentUser, accountAuthEmail(accountId, version))
    }
    await setDoc(doc(db, 'accounts', accountId), { authEmailScheme: AUTH_SCHEME_ACCOUNT }, { merge: true })
    await writeAuthIndex(uname, accountId, { authEmailScheme: AUTH_SCHEME_ACCOUNT })
    return AUTH_SCHEME_ACCOUNT
  } catch (e) {
    return storedScheme
  }
}

// Lockdown reads pre-auth, so it lives in its own collection with an open `get`
// (see the appAccess block in firestore.rules). Fails open on purpose: a denied
// or failed read must never be the reason nobody can sign in.
async function readLockdown() {
  try {
    const snap = await getDoc(doc(db, 'appAccess', 'lockdown'))
    return !!(snap.exists() && snap.data().lockdown)
  } catch (e) { return false }
}

async function loginWithCredentials(username, password, deviceId, opts = {}) {
  try {
    const uname = username.trim().toLowerCase()

    // Pre-auth lookup via the public authIndex — a narrow, PII-free doc keyed by
    // username that carries only what login needs before any Firebase Auth
    // session exists (accountId, version, lockout, legacy hash). This is what
    // lets the accounts doc itself be locked down. Falls back to the old
    // accounts query for any account not yet backfilled into authIndex (safe
    // while rules are still open; every account gets an index doc on migration).
    let accountId = null, version = 0, lockedUntil = null, failedAttemptsPrev = 0, legacyPassword = undefined
    let scheme = ''
    let idx = null
    try {
      const idxSnap = await getDoc(doc(db, 'authIndex', uname))
      if (idxSnap.exists()) idx = idxSnap.data()
    } catch (e) { /* authIndex not readable yet (rules block not published, or reverted) — fall back */ }
    if (idx) {
      accountId = idx.accountId
      version = Number(idx.authEmailVersion) || 0
      lockedUntil = idx.lockedUntil
      failedAttemptsPrev = idx.failedAttempts || 0
      legacyPassword = idx.password
      scheme = idx.authEmailScheme || ''
    } else {
      const snap = await getDocs(query(collection(db, 'accounts'), where('username', '==', uname)))
      const match = snap.docs[0] || null
      if (!match) return { ok: false, message: 'No account with that username.' }
      const d = match.data()
      accountId = match.id
      version = Number(d.authEmailVersion) || 0
      lockedUntil = d.lockedUntil
      failedAttemptsPrev = d.failedAttempts || 0
      legacyPassword = d.password
      scheme = d.authEmailScheme || ''
    }
    const accountRef = doc(db, 'accounts', accountId)
    // An account is migrated once Auth owns its credential and the legacy hash
    // has been retired (see writeIdentityDocs).
    const migrated = !legacyPassword

    if (lockedUntil && lockedUntil > Date.now()) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000)
      return { ok: false, message: `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` }
    }

    // Authenticate against Firebase Auth first. Falls through to the legacy
    // Firestore check only for accounts not yet migrated.
    let authOk = false
    let authErrorCode = null
    let signedInScheme = scheme
    try {
      const r = await signInEitherScheme(accountId, uname, version, await authPassword(password), scheme)
      authOk = !!r.ok
      authErrorCode = r.code
      signedInScheme = r.scheme
    } catch (e) { authErrorCode = e && e.code /* not migrated yet, or password rotated — fall back below */ }

    if (authOk) {
      // Heal interrupted migrations (auth user exists but the accounts.authUid
      // claim / users/{uid} mirror writes never landed — e.g. denied mid-
      // rollout), and retire any legacy hash left over from before
      // writeIdentityDocs started clearing it.
      try {
        const uid = auth.currentUser.uid
        let accData = null
        let mirrorExists = false
        try {
          const [accSnap, mirrorSnap] = await Promise.all([getDoc(accountRef), getDoc(doc(db, 'users', uid))])
          accData = accSnap.exists() ? accSnap.data() : null
          mirrorExists = mirrorSnap.exists()
        } catch (e) {
          // A session alone does NOT grant this read: the accounts rule wants
          // authUid == request.auth.uid, which is precisely what an unclaimed
          // account lacks. Letting the denial skip the repair deadlocks the
          // account — the claim needs the read, the read needs the claim — and
          // nothing else in the flow can break the cycle, because sign-in
          // succeeded so the legacy fallback that would re-provision is never
          // reached. Treat a denied read as evidence the claim is missing.
        }
        const needsRepair = !accData || accData.authUid !== uid || !mirrorExists || !migrated
        // Safe to call without a prior read: its first write IS the claim, and
        // the rules judge that against stored state, not against anything we'd
        // have learned here.
        if (needsRepair) await writeIdentityDocs(accountId, uid, version, uname)
      } catch (e) { /* best-effort — an already-linked account works without this */ }
      // Move the account off the phone-derived Auth address if it's still on one.
      // Deliberately after the block above: the flip is a self-write, so it needs
      // the users/{uid} mirror the repair guarantees.
      scheme = await reconcileAuthEmailScheme(accountId, uname, version, scheme, signedInScheme)
    }

    // Bump the failed-attempt counter on both docs so the pre-auth lookup and
    // the accounts doc never disagree on lockout state.
    async function recordFailedAttempt() {
      const attempts = (failedAttemptsPrev || 0) + 1
      const updates = { failedAttempts: attempts }
      if (attempts >= MAX_LOGIN_ATTEMPTS) updates.lockedUntil = Date.now() + LOCKOUT_DURATION
      try { await setDoc(accountRef, updates, { merge: true }) } catch (e) {}
      await writeAuthIndex(uname, accountId, updates)
      return attempts >= MAX_LOGIN_ATTEMPTS ? `Too many failed attempts. Account locked for 15 minutes.` : 'Incorrect password.'
    }

    let upgradedHash = null
    if (!authOk && migrated) {
      // Migrated with no legacy fallback. Only treat this as a genuine wrong
      // password (and count it toward the lockout) if Auth itself rejected
      // the credential — a transient error (network blip, rate limit) isn't
      // evidence the password was wrong, and must not silently tick toward
      // locking someone out of their own correct password.
      const credentialRejected = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(authErrorCode)
      if (!credentialRejected) {
        return { ok: false, message: 'Could not verify your password right now. Please try again in a moment.' }
      }
      return { ok: false, message: await recordFailedAttempt() }
    } else if (!authOk) {
      const inputHash = await hashPassword(password)
      const passwordOk = isHash(legacyPassword) ? legacyPassword === inputHash : legacyPassword === password

      if (!passwordOk) return { ok: false, message: await recordFailedAttempt() }

      if (!isHash(legacyPassword)) upgradedHash = inputHash
      // The legacy check passed, but Firestore rules only see request.auth.
      // Establish the Firebase Auth session (lazy provisioning) BEFORE the
      // session writes below, which hardened rules gate on it. The profile is
      // read post-claim inside writeIdentityDocs — no pre-auth accounts read.
      scheme = await ensureFirebaseIdentity(accountId, uname, version, password, scheme)
    }

    // Read the profile now that a session exists (permitted under locked rules).
    const profSnap = await getDoc(accountRef)
    if (!profSnap.exists()) return { ok: false, message: 'No account with that username.' }
    const profile = profSnap.data()

    // Lockdown can only be judged once we know who this is, so it sits after
    // authentication and before anything is written — no session token, no
    // device lock, nothing left behind by a refused attempt. Signing out keeps
    // the refusal honest: a blocked login must not leave a live Auth session.
    if (!profile.isSuperAdmin && (await readLockdown())) {
      try { await signOut(auth) } catch (e) {}
      return { ok: false, message: LOCKDOWN_NOTICE }
    }

    const sessionToken = crypto.randomUUID()
    const loginUpdates = { failedAttempts: 0, lockedUntil: null, sessionToken }
    if (upgradedHash) loginUpdates.password = upgradedHash
    await setDoc(accountRef, loginUpdates, { merge: true })
    // Always mirror the version we authenticated at, so an account that reached
    // here via the fallback path (no pre-existing index doc) can't end up with a
    // version-less index that would build the wrong synthetic email next time.
    const idxUpdates = { authEmailVersion: version, failedAttempts: 0, lockedUntil: null }
    if (upgradedHash) idxUpdates.password = upgradedHash
    await writeAuthIndex(uname, accountId, idxUpdates)

    const acc = { id: accountId, ...profile, failedAttempts: 0, lockedUntil: null, sessionToken }

    if (!acc.isAdmin) {
      const lockRef = doc(db, 'deviceLogins', deviceId)
      // DEV ONLY: the quick-login buttons bypass the one-account-per-device lock
      // and clear any existing lock, so switching roles in dev never hits a
      // lockout. Now that we're authenticated, the delete is permitted. Remove
      // with the dev buttons before launch.
      if (opts.bypassDeviceLock) {
        try { await deleteDoc(lockRef) } catch (e) {}
      } else {
        const today = todayISO()
        const lockSnap = await getDoc(lockRef)
        if (lockSnap.exists()) {
          const lock = lockSnap.data()
          if (lock.date === today && lock.accountId !== acc.id) {
            return { ok: false, message: `This device already logged into ${lock.accountDisplay || 'another account'} today. Ask an admin to re-enable it in the Admin tab.` }
          }
        }
        await setDoc(lockRef, {
          date: today,
          accountId: acc.id,
          // Deliberately NOT storing the username: login IDs are phone numbers,
          // and this doc is readable by every admin regardless of group — which
          // would leak numbers past the own-group boundary the accounts rules
          // draw. accountDisplay is enough for the Admin tab's lock list, and
          // createAccount requires a display name, so it's never empty.
          accountDisplay: acc.displayName || acc.username,
          updatedAt: Date.now(),
        })
      }
    }

    return { ok: true, account: acc, sessionToken }
  } catch (e) {
    return { ok: false, message: 'Could not reach the database. Check your Firebase setup.' }
  }
}

// Spelled out in full everywhere it is shown to a person: "VC" means nothing to a new
// enlistee at 0450.
const MOVEMENT_ROLE_LABEL = { driver: 'Driver', vc: 'Vehicle Cmdr', pax: 'Troop' }
// Label and icon are looked up from the same place so a role can never show one role's
// word beside another's picture.
// A star for the commander rather than a rank insignia or a medal: at 13px anything built
// on a ring - a rosette, a medal, a radio - reads as a second steering wheel beside the
// driver's, and those two sit next to each other on every vehicle row. The star is the only
// rank-shaped mark left with no ring and no chevron, chevrons being spoken for by navigation.
const MOVEMENT_ROLE_ICON = { driver: SteeringWheel, vc: Star, pax: PersonStanding }
const MOVEMENT_ROLE_ICON_SIZE = 13
// Solid, not tinted: a crew appointment is a fact about the person, not a count you
// could tap. One colour per appointment — a truck has a commander, a driver and a load
// of troops, and the pill is what says which at a glance on a long crew list.
// Padding is 9px on the left against 11px on the right, and that asymmetry is what makes the
// contents look centred. Every role icon is drawn inside a 24-unit box it does not fill, so an
// even padding lands the ink two-odd pixels right of centre: the dead air inside the icon adds
// to the left padding, while the label's last letter runs right up to the right one.
const ROLE_PILL_STYLE = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 11px 3px 9px', borderRadius: 999, background: 'var(--blue)', color: '#fff', fontSize: 11, fontWeight: 600, lineHeight: '16px' }
// Commander graphite, driver purple, troop blue. Purple for the driver because the licence
// chip on his section already wears it, so a man's qualification and his seat read as one idea.
// The driver's purple is pinned rather than themed - --role-driver-bg has no dark value, so it
// stays the light one. The licence chip still uses --purple and does lift in dark; they are a
// tint and a solid, so they were never going to match exactly anyway.
const MOVEMENT_ROLE_PILL = {
  vc: { background: 'var(--role-vc-bg)', color: 'var(--role-vc-ink)' },
  driver: { background: 'var(--role-driver-bg)' },
  pax: { background: 'var(--blue)' },
}
const rolePill = (role, extra) => ({ ...ROLE_PILL_STYLE, ...(MOVEMENT_ROLE_PILL[role] || MOVEMENT_ROLE_PILL.pax), ...extra })

// A star fills its box corner to corner; the steering wheel and the standing figure both
// leave air around theirs. At one nominal size the star therefore reads a size larger than
// the roles it sits beside, so it is drawn down to match what the eye measures rather than
// what the box says. Applied here, in the one component every role pill goes through, so
// the correction holds at 13px on a vehicle row and at 16px in the role picker alike.
const MOVEMENT_ROLE_ICON_SCALE = { vc: 0.85 }

function RoleIcon({ role, size = MOVEMENT_ROLE_ICON_SIZE }) {
  const I = MOVEMENT_ROLE_ICON[role] || MOVEMENT_ROLE_ICON.pax
  // Up one pixel. The pill sets 16px of line-height on 11px text, so `align-items: center`
  // centres the icon on the line box while the capitals sit high inside it, leaving every
  // role icon a pixel below the middle of its own word. Corrected here for all three rather
  // than on the star alone - the star only made a shared misfit visible.
  return <I size={Math.round(size * (MOVEMENT_ROLE_ICON_SCALE[role] || 1))} style={{ flexShrink: 0, transform: 'translateY(-1px)' }} />
}

// Name shown when listing members anywhere. Nickname first (often shorter), then
// the full display name. Never falls through to the username, which may be a phone.
function memberLabel(a) {
  return (a && (a.nickname || a.displayName || a.username)) || ''
}

// Is this person still expected on `date`? A deferred account carries the first
// date it no longer counts (deferredFrom), and everything before that stands —
// so this is a comparison, never a boolean. `deferred: true` would have rewritten
// history: the person would vanish from every past date too, and the Count tab's
// name lists would break in the exact way the formerMembers record exists to fix.
// Firestore field names cannot be empty, and the ungrouped Section's id is ''. One
// function so the write and every read of a day's stamped venues agree on the substitute;
// '_' is safe because a real Section id is always 'mg_'-prefixed.
const SECTION_KEY = (sectionId) => sectionId || '_'

function activeOn(a, date) {
  return !a || !a.deferredFrom || date < a.deferredFrom
}

// The single answer to "which venue applies, and why" — used by check-in, the
// 14-day outlook and every venue label in the UI. Precedence, top to bottom:
// the person's own venue → their Section's scheduled entry → a platoon-wide
// scheduled entry → the platoon's default venue. Pass person = null for a
// platoon-level view.
// Where a person reports on `iso`, STRICT to the actual date — this gates
// proximity check-in. Precedence (most specific first): person exception → Section
// → Platoon → Company default.
//
// The ICT period bounds the OVERRIDES, not the company location. The company
// location is perpetual: set it once and it applies every day of the year, which
// is what keeps proximity check-in available outside an ICT period. An override
// carrying no dates is a standing rule and applies every day too; a dated one
// applies only inside its range, and the days either side fall back to whatever
// is standing. Returns { id, source, entryId, loc, from, to } where from/to is the
// applicable span — '' at either end means unbounded, i.e. nothing to display.
// The company's own dated runs, resolved for one day. Same ranking as scheduledVenueEntry
// one level down — a dated entry beats a dateless one, and between two of a kind the later
// start wins (most recently scheduled) — but with no Section/Platoon specificity to weigh,
// because every entry here is already company-wide. A dateless entry is the standing default;
// a dated one is a stretch the company reports somewhere else. Lives on group.companySchedule,
// duplicated onto every platoon doc the way the ICT dates already are.
function companyScheduleEntry(schedule, iso) {
  let best = null
  for (const e of schedule || []) {
    if (!e || !e.locationId) continue
    if (e.from && iso < e.from) continue
    const end = e.to || e.from
    if (end && iso > end) continue
    if (!best) { best = e; continue }
    if (!!e.from !== !!best.from) { if (e.from) best = e; continue } // dated beats dateless
    if (!e.from || e.from >= best.from) best = e                     // later start wins
  }
  return best
}

function effectiveVenue(person, group, savedLocations, iso) {
  const find = (id) => (id ? (savedLocations || []).find((l) => l.id === id) || null : null)
  const none = { id: null, source: 'none', entryId: null, loc: null, from: '', to: '' }
  if (!group) return none
  if (person && person.locationId) {
    const loc = find(person.locationId)
    const from = person.locationFrom || ''
    const to = person.locationTo || ''
    if (loc && (!from || iso >= from) && (!to || iso <= to)) return { id: person.locationId, source: 'person', entryId: null, loc, from, to }
  }
  const entry = scheduledVenueEntry(group, iso, person && person.miniGroupId)
  if (entry) return { id: entry.locationId, source: 'scheduled', entryId: entry.id, loc: find(entry.locationId), from: entry.from || '', to: entry.to || entry.from || '' }
  // The company's own dated list. A DATED run is a deliberate "here, for this stretch" — it
  // carries its own span and is always worth showing, so once a day is recorded it keeps the
  // run that covered it and a later edit to the list cannot rewrite it. A DATELESS run is the
  // standing default and behaves exactly like the group.locationId fallback below it: quiet
  // outside an ICT period, dated to the period's window inside one. Both are source 'company'.
  const eventTo = group.eventTo || group.eventFrom || ''
  const inEvent = !!group.eventFrom && iso >= group.eventFrom && iso <= eventTo
  // A DATE-SPECIFIC company run: the company reporting somewhere else for a stretch. It
  // carries its own span and is always worth showing, so a recorded day keeps the run that
  // covered it and a later edit to the list cannot reach back and rewrite it. The STANDING
  // company location stays on group.locationId below — its own picker, unchanged — and only
  // dated runs live in companySchedule, which is why the list is filtered to `e.from` here.
  const cEntry = companyScheduleEntry((group.companySchedule || []).filter((e) => e.from), iso)
  if (cEntry) return { id: cEntry.locationId, source: 'company', entryId: cEntry.id, loc: find(cEntry.locationId), from: cEntry.from, to: cEntry.to || cEntry.from }
  // The standing default. Dates only on the days inside the ICT period — outside it the
  // company location is in force but has no range to show, exactly as it always has.
  const id = group.locationId || null
  if (!id) return none
  return { id, source: 'default', entryId: null, loc: find(id), from: inEvent ? group.eventFrom : '', to: inEvent ? eventTo : '' }
}

// The company's own reporting location for a day, with every Platoon/Section/Personnel
// exception set aside — what the FMC header and a company-wide reading mean by "where we
// report". effectiveVenue can't be reused as-is: hand it a platoon that has an override
// active and it returns THAT override, which is right for one platoon's board and wrong for
// the company total several platoons might be diverging from on the same day. Company data
// has no document of its own, so groups[0] stands in — every platoon doc carries the same
// companySchedule and the same legacy locationId.
function companyVenue(groups, savedLocations, iso) {
  const g = (groups || [])[0]
  if (!g) return null
  const find = (id) => (id ? (savedLocations || []).find((l) => l.id === id) || null : null)
  const entry = companyScheduleEntry((g.companySchedule || []).filter((e) => e.from), iso)
  const id = entry ? entry.locationId : (g.locationId || null)
  const loc = find(id)
  if (!loc) return null
  let from = entry ? (entry.from || '') : ''
  let to = entry ? (entry.to || entry.from || '') : ''
  if (!from) {
    const eventTo = g.eventTo || g.eventFrom || ''
    const inEvent = !!g.eventFrom && iso >= g.eventFrom && iso <= eventTo
    from = inEvent ? g.eventFrom : ''
    to = inEvent ? eventTo : ''
  }
  return { id, label: loc.label, from, to }
}

// Where a person reports, as one run per place in chronological order — the source
// of the Reporting Location card on the account tab.
//
// Outside an ICT period there is no schedule to break down: the standing location
// applies with no end in sight, so it is a single entry with no dates. Only once
// the period is running does the breakdown mean anything, and then it covers the
// rest of the period — an exception (Office, 1–3 Aug) followed by the standing
// location for the days it doesn't cover. In-memory over already-loaded docs, so
// it costs no reads.
function venueRuns(person, group, savedLocations) {
  if (!group) return []
  const today = todayISO()
  const eventTo = group.eventFrom ? (group.eventTo || group.eventFrom) : ''
  if (!group.eventFrom || today < group.eventFrom || today > eventTo) {
    const v = effectiveVenue(person, group, savedLocations, today)
    return v.loc ? [{ id: v.id, loc: v.loc, from: today, to: today, dated: false }] : []
  }
  const runs = []
  for (let iso = today; iso <= eventTo; iso = addDays(iso, 1)) {
    const v = effectiveVenue(person, group, savedLocations, iso)
    const last = runs[runs.length - 1]
    // `dated` stays true only while every day of the run carried a range, so a
    // standing rule inside the period doesn't borrow the walk's own start and end.
    if (last && last.id === v.id) { last.to = iso; last.dated = last.dated && !!v.from }
    else runs.push({ id: v.id, loc: v.loc, from: iso, to: iso, dated: !!v.from })
  }
  return runs.filter((r) => r.loc)
}

// Where the company reports on one day: its dated ICT run if one covers the day, else the
// Default. The same order effectiveVenue resolves in, minus the Platoon/Section/Personnel
// levels above it — this is the company's own answer, which those levels are exceptions TO.
function companyLocationOn(group, iso) {
  const entry = companyScheduleEntry(((group && group.companySchedule) || []).filter((e) => e.from), iso || todayISO())
  return entry ? entry.locationId : ((group && group.locationId) || null)
}

// App-wide colour rule for a reporting location and its pin: where the company reports is
// the baseline (blue); any Platoon/Section/Personnel override that sends someone somewhere
// else is orange, so the exceptions are the ones that stand out.
//
// Measured against the company's answer ON THE DAY, not against group.locationId. That field
// is only the Default — the fallback for days no ICT run covers — so an ICT that moves the
// company to Home used to leave every override ALSO saying Home painted orange, marking as
// an exception a place that was not one. `iso` defaults to today; a row about a dated stretch
// passes its own start date, since that is the day its colour is a statement about.
function venueColor(locationId, group, iso) {
  return locationId && group && locationId === companyLocationOn(group, iso) ? 'var(--blue)' : 'var(--orange)'
}

// Label for one date span: "Mon, Aug 3" or "Mon, Aug 3 – Fri, Aug 7". A dateless
// (standing) entry has no span to label, so it renders as nothing rather than
// letting fmtNav('') through as "Invalid Date".
// The days of [from, to] that no run covers. Runs are clipped to the window first, so one
// that starts before the period or ends after it still counts for the part inside — the
// question is only ever whether a DAY has somewhere to report, not whether a run is tidy.
// Overlapping runs are fine and resolve by companyScheduleEntry's own ranking; they simply
// cover the same day twice, which is not a gap.
//
// Returns spans rather than a boolean so the card can say WHICH days are missing. An empty
// array means the period is fully covered — and an unset period is vacuously covered, since
// there are no days to miss.
//
// `skipWeekends` is the ICT's own flag and it has to be honoured here, not just in the form:
// a run may not START or END on a weekend when it is set, so demanding weekend coverage as
// well would be two rules that cannot both be satisfied — Mon–Fri then Mon–Fri leaves a
// Saturday nobody is allowed to cover. A day off is not a day missing a location.
function coverageGaps(runs, from, to, skipWeekends) {
  if (!from || !to) return []
  const spans = (runs || [])
    .filter((e) => e && e.locationId && e.from)
    .map((e) => ({ from: e.from, to: e.to || e.from }))
    .filter((e) => e.to >= from && e.from <= to)
    .map((e) => ({ from: e.from < from ? from : e.from, to: e.to > to ? to : e.to }))
    .sort((a, b) => (a.from < b.from ? -1 : 1))
  const gaps = []
  let cursor = from
  for (const sp of spans) {
    if (sp.from > cursor) gaps.push({ from: cursor, to: addDays(sp.from, -1) })
    if (addDays(sp.to, 1) > cursor) cursor = addDays(sp.to, 1)
    if (cursor > to) break
  }
  if (cursor <= to) gaps.push({ from: cursor, to })
  if (!skipWeekends) return gaps
  // A gap made only of days off is not a gap. Walked day by day rather than trimmed at the
  // ends, so a Fri–Mon hole comes back as two: the Friday and the Monday.
  const real = []
  for (const g of gaps) {
    let open = null
    for (let iso = g.from; iso <= g.to; iso = addDays(iso, 1)) {
      if (isWeekend(iso)) { if (open) { real.push({ from: open, to: addDays(iso, -1) }); open = null } continue }
      if (!open) open = iso
    }
    if (open) real.push({ from: open, to: g.to })
  }
  return real
}

// Hold the company's runs inside the period they belong to. Shortening an ICT used to leave
// a run hanging over the end of it — and a run is read on its own dates, not the period's, so
// those extra days would have sent the company somewhere on days the exercise was already
// over. A run that now falls entirely outside is dropped: it covers nothing.
//
// The ends are pulled onto working days when weekends are excluded, for the same reason the
// form refuses to let one be typed there. A run with nothing but days off left in it goes.
function clampRunsToPeriod(runs, from, to, skipWeekends) {
  if (!from || !to) return runs || []
  const stepToWorkday = (iso, dir, limit) => {
    let cur = iso
    while (skipWeekends && isWeekend(cur)) {
      cur = addDays(cur, dir)
      if (dir < 0 ? cur < limit : cur > limit) return null
    }
    return cur
  }
  return (runs || []).flatMap((e) => {
    if (!e || !e.from) return [e]
    const end = e.to || e.from
    if (end < from || e.from > to) return []
    let f = e.from < from ? from : e.from
    let t = end > to ? to : end
    f = stepToWorkday(f, 1, t)
    if (f === null) return []
    t = stepToWorkday(t, -1, f)
    if (t === null || t < f) return []
    return [{ ...e, from: f, to: t }]
  })
}

function outlookDates(run) {
  if (!run || !run.from) return ''
  if (run.from === run.to) return fmtNav(run.from)
  return `${fmtNav(run.from)} – ${fmtNav(run.to)}`
}


// Drops only entries with nothing left to resolve to — a venue that was deleted.
// Nothing is dropped by age. The Today tab reads a past day's reporting location
// out of this list, so removing a finished entry would quietly move the platoon on
// that day to the company location, which is not where it was. Finished entries
// leave with the annual archive instead (archiveOverrides), alongside the records
// they explain.
function pruneVenueSchedule(entries) {
  return (entries || []).filter((e) => e && e.locationId)
}

function newScheduleEntry({ locationId, from, to, miniGroupId }) {
  return {
    id: `s_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`,
    locationId,
    from,
    to: to || from,
    miniGroupId: miniGroupId || '',
  }
}

// Two entries clash when they cover the same target (both platoon-wide, or the
// same Section) and their date spans overlap. Resolution still works — the
// later start wins — but the admin is warned before adding one.
function overlappingEntries(entries, { from, to, miniGroupId, skipId }) {
  const mg = miniGroupId || ''
  return (entries || []).filter((e) => (
    e && e.id !== skipId && (e.miniGroupId || '') === mg
    && e.from <= (to || from) && (e.to || e.from) >= from
  ))
}

// Admin-set manual order within a mini-group; unset sorts as 0.
function memberOrderKey(a) {
  return typeof a?.memberOrder === 'number' ? a.memberOrder : 0
}

// Sort a member list by manual order, tie-broken alphabetically by label.
function orderedMembers(list) {
  return [...list].sort((a, b) => (memberOrderKey(a) - memberOrderKey(b)) || memberLabel(a).localeCompare(memberLabel(b)))
}

// Split members into sections that follow the group's miniGroups order, with an
// "Ungrouped" bucket (members with no/unknown miniGroupId) appended last only when
// it has anyone. With no mini-groups defined, returns one headerless section (name
// '') so callers render the flat list exactly as before. Defined-but-empty sections
// are kept — the admin view shows them; read-only views filter them out.
function groupByMiniGroup(list, miniGroups) {
  const defs = [...(miniGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (!defs.length) return [{ id: '', name: '', members: orderedMembers(list) }]
  const known = new Set(defs.map((m) => m.id))
  const sections = defs.map((m) => ({ id: m.id, name: m.name, members: orderedMembers(list.filter((a) => (a.miniGroupId || '') === m.id)) }))
  const ungrouped = orderedMembers(list.filter((a) => !known.has(a.miniGroupId || '')))
  if (ungrouped.length) sections.push({ id: '', name: 'Ungrouped', members: ungrouped })
  return sections
}

// Mirror the pre-auth lookup fields into the public authIndex, keyed by the
// (lowercased) username. This is the narrow, PII-free doc the login bootstrap
// reads before any Firebase Auth session exists (so the accounts doc itself can
// be locked down): only accountId, version, lockout counters and the legacy
// hash live here — never a name, phone-as-field, or group. Kept in lockstep
// with the accounts doc; `patch` may carry deleteField() sentinels.
async function writeAuthIndex(uname, accountId, patch) {
  // Best-effort by design: the accounts doc is the primary, authIndex is its
  // pre-auth read replica. A denied/failed mirror write (e.g. before the
  // authIndex rules block is published) must never fail the login or admin
  // write that triggered it — login just falls back to the accounts query
  // until the index catches up.
  try {
    await setDoc(doc(db, 'authIndex', (uname || '').toLowerCase()), { accountId, ...patch }, { merge: true })
  } catch (e) {}
}

// Sign the user into Firebase Auth (creating the auth user on first login), then
// link the account and write its users/{uid} role/group mapping. Every call is
// wrapped so a failure here can never break the legacy login flow. Called only
// on the not-yet-migrated login path; the profile is read post-claim inside
// writeIdentityDocs, so no pre-auth accounts read is needed.
// `scheme` is the account's STORED authEmailScheme, and the auth user must be
// created at the address that scheme implies — the claim rule matches the token's
// email against stored state, so provisioning at any other address is denied.
// Accounts born on the new scheme therefore never register a phone-derived
// address at all; legacy ones register theirs, then get flipped by the reconcile
// below. Returns the scheme the account ended up on.
async function ensureFirebaseIdentity(accountId, uname, version, password, scheme) {
  try {
    const fbPass = await authPassword(password)
    let uid = null
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmailFor(scheme, accountId, uname, version), fbPass)
      uid = cred.user.uid
    } catch (e) {
      // Sign-in can fail because the auth user doesn't exist yet (first login) OR the
      // password is stale. Firebase's email-enumeration protection reports both as the
      // same error code (auth/invalid-credential), so we don't branch on the code — we
      // just try to create the user. The legacy login already verified this password,
      // so creating with it is correct.
      try {
        const cred = await createUserWithEmailAndPassword(auth, authEmailFor(scheme, accountId, uname, version), fbPass)
        uid = cred.user.uid
      } catch (e2) {
        // auth/email-already-in-use → the auth user exists at this version but
        // its password is stale (a legacy password change that never synced).
        // Deliberately NOT self-healed by bumping the version here: hardened
        // rules only trust authEmailVersion changes made through an already-
        // authorized write (self via isSelfAccount, or admin via isAdmin) —
        // anchoring the claim's expected email to anything the client can
        // freely propose would let an attacker who reads the (public) authIndex
        // version number pre-register that exact synthetic email and win the
        // claim before the real owner ever does. An admin password reset
        // (setAccountPassword) bumps the version through an authorized write.
        return scheme
      }
    }
    if (!uid) return scheme
    await writeIdentityDocs(accountId, uid, version, uname)
    // The claim above is what makes the account self-writable, so the flip off
    // the legacy address can only happen after it. No-op for an account already
    // born on the new scheme.
    return await reconcileAuthEmailScheme(accountId, uname, version, scheme, scheme)
  } catch (e) {
    // Best-effort by design: the caller's legacy login already succeeded, and
    // this is a no-op until the Email/Password provider is enabled.
    return scheme
  }
}

// Links a signed-in Firebase uid to its account. Order matters: the claim write
// (authUid + version normalize + legacy-hash retirement) lands FIRST — that's
// the isClaimingAuthUid path under hardened rules, and it needs no profile. Only
// once accounts.authUid names this uid does the self-read rule permit reading
// the profile, which we then mirror into users/{uid} for the rules to consult.
// This ordering is what lets accounts stay locked: nothing here reads the
// profile before the claim authorizes it.
//
// Retiring the legacy hash the moment Auth owns the credential also keeps the
// public authIndex from carrying a usable secret any longer than necessary.
// Safe by construction — this only runs after a password was verified, by Auth
// itself or by the legacy check preceding the ensureFirebaseIdentity call.
async function writeIdentityDocs(accountId, uid, version, uname) {
  await setDoc(doc(db, 'accounts', accountId), { authUid: uid, authEmailVersion: version, password: deleteField() }, { merge: true })
  await writeAuthIndex(uname, accountId, { authEmailVersion: version, password: deleteField() })
  const snap = await getDoc(doc(db, 'accounts', accountId))
  if (!snap.exists()) return
  const acc = snap.data()
  await setDoc(doc(db, 'users', uid), {
    accountId,
    groupId: acc.groupId || '',
    isAdmin: !!acc.isAdmin,
    isSuperAdmin: !!acc.isSuperAdmin,
  }, { merge: true })
}

// ---- Activity attendance sheets -------------------------------------------
// A named sheet sitting ON TOP of the morning roll call — a range practice, an ammo draw,
// a night roll call. It answers "who came to this?", and it never writes to the day's own
// record: a man on MC in the morning is on MC all day, however many activities he later
// turns up to. See ~/.claude/plans/activity-attendance-ict.md.

function genActivityId() { return 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// Newest LAST, so a sheet created later in the day sits under the one created before it —
// which is the order the day actually happened in. `order` overrides that once an admin has
// dragged the cards; the id is the tie-break because it embeds Date.now(), so a day whose
// activities predate the drag feature still sorts by creation with nothing to migrate.
function sortActivities(a, b) {
  const ao = a.order, bo = b.order
  if (typeof ao === 'number' && typeof bo === 'number' && ao !== bo) return ao - bo
  if (typeof ao === 'number' !== (typeof bo === 'number')) return typeof ao === 'number' ? -1 : 1
  return a.id < b.id ? -1 : 1
}

// Whose statuses put a man ON THE ROSTER of every activity that day. Two things and no
// more: the primary status, which is always in, and any status carrying `onParade`.
//
// A FLAG, never a label — the same rule `requiresDoc` and `stopsAttending` follow, so
// renaming a status cannot silently switch this off. On this database it resolves to
// Present + Outfield + LATE: a man in the field is present in a different place, and a
// late man turns up.
//
// Deliberately NOT `rosterSource`, which answers a different question — which single
// status a vehicle manifest expects on its own day. That one is read with a `.find()`, so
// flagging LATE with it would make an outfield manifest expect LATE and strip every man
// off his truck the morning he was marked Outfield. Two questions, two flags.
function onParadeIds(statuses) {
  const ids = statuses.filter((s) => s.onParade && !s.stopsAttending).map((s) => s.id)
  const primary = statuses[0] && statuses[0].id
  return new Set(primary ? [primary, ...ids] : ids)
}

// The two conditions a proximity check-in has to clear, measured against ONE venue: the
// person is inside that venue's own radius, and an admin who shared their location recently
// is inside it too. Lifted out of TodayView's handleCheckIn so a member checking in to an
// activity runs the identical test against a different place — one rule with two callers
// rather than two copies free to drift apart.
//
// Admin docs are counted straight from `adminLocations` and never looked up in `accounts`:
// under the read lockdown a regular user can only read their OWN account, so a find() there
// returns undefined for every admin and the check silently always fails.
function proximityChecks(pos, target, adminLocations, freshnessMs) {
  const radius = (target && target.radiusMeters) || DEFAULT_RADIUS
  const venueDist = distanceMeters(pos.lat, pos.lng, target.lat, target.lng)
  const now = Date.now()
  let nearest = null
  Object.values(adminLocations).forEach((loc) => {
    if (!loc || now - loc.updatedAt > freshnessMs) return
    const d = distanceMeters(pos.lat, pos.lng, loc.lat, loc.lng)
    if (nearest === null || d < nearest) nearest = d
  })
  return { venue: venueDist <= radius, admin: nearest !== null && nearest <= radius, venueDist, adminDist: nearest, radius }
}

export default function App() {
  const [seeded, setSeeded] = useState(false)
  const [seedError, setSeedError] = useState('')
  const [account, setAccount] = useState(null)
  const [theme, setThemeState] = useState(() => {
    try {
      const id = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').id || ''
      return localStorage.getItem(`vmanifest92_theme_${id}`) || 'system'
    } catch (e) { return 'system' }
  })
  const [accounts, setAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [statuses, setStatuses] = useState([])
  const [attendance, setAttendance] = useState({})
  const [attendanceVerifiers, setAttendanceVerifiers] = useState({})
  // Which venue validated each proximity check-in, keyed like attendance itself.
  // Recorded at check-in time so a past date keeps its own answer even after the
  // schedule that produced it is edited or pruned.
  const [attendanceVenues, setAttendanceVenues] = useState({})
  // The day's own record of who was on it and where they reported — see dayStamp().
  const [attendanceStamp, setAttendanceStamp] = useState({})
  // Metadata for the supporting document attached to each person's status, keyed
  // like attendance. Rides on the attendance doc the board already reads, so the
  // attached / outstanding / confirmed marker costs no extra reads. The file bytes
  // are NOT here — they're fetched from mcDocs only when someone taps to view.
  const [attendanceDocs, setAttendanceDocs] = useState({})
  // The day's named activity sheets — a range practice, an ammo draw, a night roll call —
  // each with its own roster and its own ticks, keyed like attendance itself.
  // Nested INSIDE the day document rather than given a collection of their own, so they
  // arrive in snapshots the admin is already paying for: zero extra reads, and they ride
  // into `attendanceArchive` with the year for free.
  // See ~/.claude/plans/activity-attendance-ict.md.
  // Which people's status on a day was recorded AFTER that day had passed. There is
  // no way to work this out later — a Present set on the day and one set a week on
  // are identical in the record — so it is stamped at the moment it happens, as a
  // flag rather than a name. Rides on the attendance doc the board already reads.
  const [attendanceBackdated, setAttendanceBackdated] = useState({})
  const [adminLocations, setAdminLocations] = useState({})
  const [deviceLogins, setDeviceLogins] = useState({})
  // Whether Admin › Device Lockouts is open. The listener below hangs off this and nothing
  // else — see the effect for why.
  const [lockoutsOpen, setLockoutsOpen] = useState(false)
  const [checkinSettings, setCheckinSettings] = useState({ freshnessMinutes: DEFAULT_FRESHNESS_MINUTES })
  const [savedLocations, setSavedLocations] = useState([])
  // Locations arrive on their own listener, so a group can land first. Until this
  // flips, "not set"/"Unknown" would be a lie — the views hold those strings back.
  const [locationsReady, setLocationsReady] = useState(false)
  const [groupFields, setGroupFields] = useState([])
  const [accountFields, setAccountFields] = useState([])
  // Everyone tracks this (the listener below signs non-super-admins out when it
  // flips on); only super admins are ever shown it.
  const [lockdown, setLockdown] = useState(false)
  // accountId -> name, for everyone whose account has been deleted. One document
  // for every departure ever, fetched once per session when the Count tab is
  // first opened — see the effect below.
  const [formerNames, setFormerNames] = useState({})
  const formerNamesLoaded = useRef(false)
  // Today's outfield vehicle manifest — ONE document for the whole company, because a
  // vehicle carries people from more than one platoon and a manifest split across three
  // platoon docs would have to be re-joined every time anyone looked at it. Admins only;
  // a member never reads the collection, their own seat rides on their own card instead
  // (see mirrorSelfMovement). `movementFleet` is the standing vehicle list, read only
  // while the Admin tab is open.
  // Two manifests can be live at once — a move-out and an activity — so the listener keeps
  // the earliest running one of EACH kind. `movement` is whichever the admin has selected in
  // the header, so everything downstream still reads a single manifest and does not have to
  // know there are two.
  const [movements, setMovements] = useState({ outfield: null, activity: null })
  const [mvKind, setMvKind] = useState('outfield')
  const movement = movements[mvKind] || null
  // The manifest's day as a plain string. Effects key off THIS, not off `movement` — the
  // object is a fresh identity on every snapshot, so depending on it would tear down and
  // re-subscribe (and re-bill) the attendance listeners on every keystroke an admin makes
  // in the setup card.
  const movementDate = movement ? movement.date : null
  const [movementFleet, setMovementFleet] = useState({})
  // A member's own seat, off their attendanceSelf card. Deliberately NOT folded into the
  // attendance* maps like the rest of the card: those are keyed by date__group and are
  // blanked when the card isn't today's, and a manifest is normally written the evening
  // before. This carries its own date and is gated on that alone.
  // Every seat this person holds, whatever day it is for. `myMovement` above is the one
  // covering TODAY — that is what decides whether the Movement tab exists at all — while
  // the Today board reads this list, because it can be pointed at any date.
  const [mySeats, setMySeats] = useState([])
  // Whether TODAY's roll call is frozen for this member. Members never read the
  // platoon board (see attendance-self-card-model), so the flag rides on their own
  // card as `frozenOn` — the DATE it applies to rather than a bare boolean, so a card
  // written yesterday cannot lock this morning. Cleared for one man when a super admin
  // reopens him.
  // Reopened by a super admin. Restores his certificate upload and NOTHING else — the
  // status tiles stay gone for the whole frozen day, reopened or not.
  // Today's activity sheets HE is on, off his own card. A member never reads the platoon
  // day document (attendance-self-card-model), so everything he needs about an activity —
  // its name, its venue, whether he is ticked — is written onto his card by whichever
  // admin action put him on the roster. Empty on a day with no activities, which is most.
  // Which sheet's roster is open, or null for the card list. Held here rather than inside
  // the view because the nav bar swaps the platoon selector for a back chevron and the
  // sheet's name while one is open.
  const [activityOpen, setActivityOpen] = useState(null)
  // The open sheet's SCOPE, held beside its id rather than looked up from it. The lookup
  // goes blank for a moment when a super admin switches platoons — the new platoon's day
  // document has not landed yet — and this is what decides whether the platoon selector is
  // even on screen at that instant, so a flicker there would take the control away
  // mid-tap. Set when a sheet is opened; cleared with it.
  const [activityScope, setActivityScope] = useState(null)
  const openActivity = (id, scope) => { setActivityOpen(id); setActivityScope(id ? scope || null : null) }
  // Which door opened the sheet-creation card, or null for closed. It was a boolean while
  // there was one way in; there are two now — the FMC card's row, which makes a company
  // sheet, and the Activities footer, which makes one for the platoon on screen — and the
  // card opens on the scope of whichever was tapped.
  // The ICT reporting locations — the dated runs, edited from the Today header beside the
  // ICT period they belong to. The DEFAULT company location is not here: it is perpetual,
  // it is what keeps proximity check-in alive outside an ICT, and it lives in Settings at
  // the top of the card holding the saved places it picks from.
  // Set when Save is tapped on a period no location covers. It turns the empty line under
  // ICT Reporting Location red — the answer is missing exactly where it would have been
  // printed, so that line is the message, and a second one under the dates would be the
  // same sentence twice.
  // The runs as the admin is editing them, not as they are stored. Seeded when the card
  // opens and written only by the card's one Save, so adding, editing and deleting a run are
  // all reversible by backing out — the same as the dates they sit under. A run used to
  // write itself the moment its own form closed, which made half of this card live and the
  // other half a draft.
  // The ICT period, edited in the same card. It used to be its own card in Settings, and it
  // was the only half of this setup that lived there — the dates frame the reporting
  // location (proximity check-in runs inside them), so splitting the two across two tabs
  // meant reading half the answer in each. One card, one door, one editor: two editors for
  // one pair of fields is what caused the stale-seed race saveEvent was untangled from.
  // The unmarked filter's pill is in the nav bar and the list it filters is in the body, so
  // the state that joins them has to be here. Add Personnel is the same shape the other way
  // round: the button is up in the bar, the sheet it opens is rendered down in the view.
  const [activityOnlyUnmarked, setActivityOnlyUnmarked] = useState(false)
  const [activityAddOpen, setActivityAddOpen] = useState(false)
  const activityLast = useRef(null)
  // The two ways into unfreezing, both super-admin-only and both on the Today tab.
  // `unfreezeList` is the banner chip's sheet; `unfreezeOne` is the dialog a locked pill
  // opens, and holds { id, name }.
  // The blocked-freeze card. Holds the platoons that are short, and is the ONLY thing the
  // grey chip does — on the ready path the chip just freezes, with no card in between.
  // Armed, waiting for the second tap. Freezing the company is one tap away from being
  // the most consequential thing on the screen — it seals every platoon's morning at
  // once — so it takes the same 3s armed confirm as Mark All and quick-Present rather
  // than firing on contact. The ref is what the handler reads: state alone would give
  // the second tap a stale closure.
  const confirmFreezeAllRef = useRef(false)
  const confirmFreezeAllTimer = useRef(null)
  // Ticked in the list sheet but not yet written — the sheet commits on its button, not
  // per row, so several men can be reopened in one pass.
  // The Vehicle Manifest card, opened from the pill in the day header. It used to be a row
  // in Settings, which meant the one screen that shows a manifest could only send you to
  // another tab to build one - see the Movement tab's empty state, which now opens this.
  const [movementSetupOpen, setMovementSetupOpen] = useState(false)
  // The card's vehicle editor is a sub-view, and the back chevron belongs to the PopupCard
  // out here - so the way out is reported up (onBackChange) and handed to onBack.
  const [mvSetupBack, setMvSetupBack] = useState(null)
  const [tab, setTab] = useState('movement')
  const [activeGroupId, setActiveGroupId] = useState('')
  // The Platoon tab remembers its OWN platoon, and this is the whole reason it exists: one
  // shared value meant walking to Platoon 4 here also walked the Today tab there, and the
  // Activity tab vanished with it, because every tab read the same id. They are two
  // different jobs — Today is this morning's roll call for the platoon you are working,
  // this tab is browsing the company's people — so each keeps its own place.
  //
  //
  // Costs nothing to read. This tab renders out of `accounts`, which is already in memory,
  // so a platoon change here touches no listener and fetches no document — which is also
  // why the split is drawn HERE rather than around `activeGroupId`, whose every change
  // re-points the day's attendance listener.
  const [groupTabGroupId, setGroupTabGroupId] = useState('')
  // Share and Scan QR live in the nav bar, above the platoon selector, so they stay
  // put while the roll call scrolls. That is why their state sits up here rather than
  // in TodayView: the buttons are outside it now, and the QR sheet they open is shared
  // with the member "Show QR" button still inside it.
  const [showQR, setShowQR] = useState(null) // null = closed, 'show' | 'scan' = open in that mode
  // Re-renders the toolbar once a minute so the share button's countdown is honest.
  // Local clock only — nothing here reads Firestore.
  const [, setMinuteTick] = useState(0)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  // Leaving a sheet drops both, so a filter left on one roster is not still on over another.
  // Below `selectedDate` rather than up with the other activity state, because it now reads
  // it: the sheets no longer have a date or a platoon of their own to watch.
  useEffect(() => { setActivityOnlyUnmarked(false); setActivityAddOpen(false) }, [activityOpen, selectedDate, activeGroupId])
  // The date every listener below reads when it attaches. Each captures `todayISO()` once,
  // so an app left open across midnight goes on answering for yesterday — the member's card,
  // the board, and which manifests count as still running. Bumping this re-subscribes them
  // against the new day.
  //
  // Checked when the app is brought back to the front, not on a timer: a phone in a pocket
  // has no listeners running anyway, and a ticking clock would be a wake-up call for nothing
  // on the 364 days it fires while the date is unchanged. Nothing is read unless the date
  // has ACTUALLY moved, so on a normal day this costs zero.
  const [dayKey, setDayKey] = useState(todayISO())
  // The hidden date input behind the Today tab's date label, so tapping the label can open
  // the calendar itself rather than relying on the tap landing on the input underneath.
  const dateFieldRef = useRef(null)
  useEffect(() => {
    const check = () => setDayKey((prev) => (prev === todayISO() ? prev : todayISO()))
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])
  // The board follows the clock only if it was still sitting on the day that just ended.
  // Someone who navigated to Thursday on purpose stays on Thursday.
  const prevDayRef = useRef(dayKey)
  useEffect(() => {
    const prev = prevDayRef.current
    if (prev === dayKey) return
    prevDayRef.current = dayKey
    setSelectedDate((d) => (d === prev ? dayKey : d))
  }, [dayKey])
  // Which month the Count tab is showing ('2026-08'). Up here rather than inside
  // HistoryView because the fetch below is keyed to it — the whole point of the month
  // view is that paging the calendar is what decides which documents get read.
  // Which of the merged tab's screens is on top of the day screen.
  //
  //   null           the day screen — the FMC card, the platoon card, the calendar
  //   'board'        one platoon's roll call
  //   'activities'   that platoon's activity sheets
  //
  // ONE value, not two booleans, and that is the whole reason it is a string: two flags can
  // both be true, and the first bug that produces is a board rendering under a sheet list.
  //
  // A THIRD level lives under 'activities' — `activityOpen`, the sheet id — which is only
  // ever meaningful while this reads 'activities'.
  //
  // It does NOT hold the platoon it opened. The platoon on screen is `activeGroupId` and
  // always was, so a screen holding its own copy would disagree with the pills the moment
  // one was tapped. Opening a screen sets `activeGroupId` and raises this; the pills and the
  // page swipe then move what is under it without touching it.
  //
  // A member has the day screen and 'activities'; he has no board, because his own status
  // card IS his day screen.
  const [openScreen, setOpenScreen] = useState(null)
  // The day being looked at is `selectedDate`, ONE state for the whole app — the calendar,
  // the company card, the platoon card and the board all read it. It used to have a second
  // copy of its own (`historyDay`, null meaning today), which meant the Count tab and the
  // Today tab could be looking at different days with nothing on screen saying so.
  //
  // The old copy also dropped itself when the calendar was paged to another month. It does
  // not any more: every card that shows the day is captioned with it, and the "Today ›"
  // pill on the month row is the way back. A date and the month you happen to be browsing
  // are two different questions.
  const [adminSubTab, setAdminSubTab] = useState('general')
  // Tick-for-a-moment state on the Count tab's Copy Report button — see buildFmcReport.
  const [copiedReport, setCopiedReport] = useState(false)
  // Which status's company-wide names are open, as a status id. The chips in the All
  // Platoons card open this; the Count tab's own day card has its own single-platoon one.
  const fetchedAttendanceKeys = useRef(new Set())
  const fetchedMonths = useRef(new Set())
  // Regular users can't read other accounts, so their group's member list comes
  // from the names-only rosters/{groupId} mirror (see group-roster feature).
  const [roster, setRoster] = useState(null)
  const rosterSyncRef = useRef({}) // admin: last-written roster JSON per group (skip redundant writes)
  const scrollRef = useRef(null)
  // Shrinks the tab bar while you read down a long list and restores it on the way back
  // up. Written straight to the element's class list, never through state: this runs on
  // scroll frames and App.jsx is far too large to re-render on any of them (same reason
  // the drag gestures write to the DOM directly).
  // A callback ref rather than an effect, because the whole shell only mounts after
  // login — an effect would have run once against a null ref and, with nothing in its
  // deps changing afterwards, never bound the listener at all.
  const tabBarRef = useRef({})
  const setTabBarRef = useCallback((bar) => {
    const s = tabBarRef.current
    if (s.el) { s.el.removeEventListener('scroll', s.fn); s.el = null }
    s.bar = bar
    const el = scrollRef.current
    if (!bar || !el) return
    let last = el.scrollTop
    let shrunk = false
    s.el = el
    s.fn = () => {
      const y = el.scrollTop
      const dy = y - last
      // 6px of slack: under that it's finger jitter, and a bar that flips on jitter
      // reads as a flicker rather than a response. The 40px floor keeps the first
      // nudge of a short list from shrinking it for nothing.
      if (Math.abs(dy) < 6) return
      last = y
      const next = dy > 0 && y > 40
      if (next !== shrunk) { shrunk = next; bar.classList.toggle('shrunk', next) }
    }
    el.addEventListener('scroll', s.fn, { passive: true })
  }, [])
  const lastRefreshRef = useRef(0) // refresh rate-limit — keeps spam taps from hammering Firestore
  const [refreshState, setRefreshState] = useState('idle') // 'idle' | 'loading' | 'cooldown'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Every tab shares ONE scroll container, so switching tabs used to keep whatever
  // offset the previous tab was left at — scroll to the bottom of Today, tap Count,
  // and the Count cards arrive already scrolled. Desktop hides it because the taller
  // window leaves Today barely scrollable. Reset to the top on every tab change.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [tab])

  useEffect(() => {
    if (!account) return
    try {
      const saved = localStorage.getItem(`vmanifest92_theme_${account.id}`)
      setThemeState(saved || 'system')
    } catch (e) {}
  }, [account?.id])

  useEffect(() => {
    const SKIP = ['date', 'checkbox', 'radio', 'range', 'color', 'file']
    const isTextField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      !(el.tagName === 'INPUT' && SKIP.includes(el.type))
    let timer = null
    function onFocusIn(e) {
      if (!isTextField(e.target)) return
      clearTimeout(timer)
      const target = e.target.closest('.card') || e.target
      timer = setTimeout(() => {
        try { target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } catch (_) {}
      }, 350)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => { document.removeEventListener('focusin', onFocusIn); clearTimeout(timer) }
  }, [])

  function setTheme(value) {
    setThemeState(value)
    try { localStorage.setItem(`vmanifest92_theme_${account?.id || ''}`, value) } catch (e) {}
  }

  useEffect(() => {
    if (localStorage.getItem('vmanifest92_seeded_v2')) { setSeeded(true); return }
    // The timer only decides when to STOP BLOCKING the login screen — it no longer
    // decides whether the seed worked. A first-ever seed on a cold database is a
    // dozen sequential round trips, and at 10s it routinely outran the timer and
    // then, because the cache flag was written only `if (!settled)`, never recorded
    // the success — so a database that had seeded perfectly well showed a connection
    // error on every single load, forever.
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      setSeedError('Still setting up — Firebase is taking longer than 30 seconds. If this keeps happening, check that your Firestore database exists and your VITE_FIREBASE_... values in Vercel are correct.')
      setSeeded(true)
    }, 30000)
    ensureSeedData()
      // Unconditional: the seed either finished or it did not, and a slow one that
      // finished is still a finished one.
      .then(() => {
        localStorage.setItem('vmanifest92_seeded_v2', '1')
        if (timedOut) setSeedError('')
      })
      .catch((e) => {
        console.error('VManifest 92 seed error:', e)
        // The Firebase error CODE is the whole diagnosis — permission-denied means
        // rules, unavailable means it never got there — and dropping it left the
        // screen saying "could not connect" for both.
        setSeedError(`${(e && e.code) || 'error'}: ${(e && e.message) || 'Could not connect to Firebase.'}`)
      })
      .finally(() => {
        clearTimeout(timeout)
        setSeeded(true)
      })
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    // Wait for Firebase Auth to finish restoring any persisted session before
    // restoring the app session: setting `account` attaches the Firestore
    // listeners below, and under hardened rules a listener attached while
    // request.auth is still null is denied and never retried.
    const settled = new Promise((resolve) => {
      const off = onAuthStateChanged(auth, () => { off(); resolve() }, () => { off(); resolve() })
    })
    settled.then(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (raw) {
          const { id, sessionToken, expiresAt } = JSON.parse(raw)
          if (expiresAt && Date.now() > expiresAt) { localStorage.removeItem(SESSION_KEY); return }
          getDoc(doc(db, 'accounts', id)).then((snap) => {
            if (!snap.exists()) { localStorage.removeItem(SESSION_KEY); return }
            const data = snap.data()
            if (sessionToken && data.sessionToken !== sessionToken) { localStorage.removeItem(SESSION_KEY); return }
            setAccount({ id: snap.id, ...data })
          })
        }
      } catch (e) {}
    })
  }, [])

  useEffect(() => {
    if (!account) return
    const sort = (arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const unsubs = [
      onSnapshot(
        account.isSuperAdmin
          ? collection(db, 'accounts')
          : account.isAdmin
            ? query(collection(db, 'accounts'), where('groupId', '==', account.groupId))
            : query(collection(db, 'accounts'), where('__name__', '==', account.id)),
        (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ]

    // Everyone listens, because turning lockdown on signs everyone else out on
    // the spot — that can't work off a listener only super admins hold. One
    // document, so it's one read per session plus one per flip, and the switch
    // moves about twice a year.
    //
    // The error handler swallows rather than sets: Firestore kills a listener the
    // moment it errors, so writing `false` here would hide the banner for the
    // rest of the session with no way back — one blip and a super admin is told
    // lockdown is off while it's on. Leaving the last known value alone errs the
    // safe way, and the initial `false` still covers the case that actually
    // matters (the appAccess rules block not published yet).
    unsubs.push(onSnapshot(
      doc(db, 'appAccess', 'lockdown'),
      (snap) => {
        const on = !!(snap.exists() && snap.data().lockdown)
        setLockdown(on)
        if (on && !account.isSuperAdmin) handleLogout()
      },
      () => {},
    ))

    if (account.isAdmin) {
      unsubs.push(
        onSnapshot(collection(db, 'groups'), (snap) => setGroups(sort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))),
        onSnapshot(collection(db, 'groupFields'), (snap) => setGroupFields(sort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))),
        onSnapshot(collection(db, 'accountFields'), (snap) => setAccountFields(sortAccountFields(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))),
      )
    } else {
      const cache = loadStaticCache()
      if (cache) {
        if (cache.groups) setGroups(cache.groups)
        if (cache.statuses) setStatuses(cache.statuses)
        if (cache.groupFields) setGroupFields(cache.groupFields)
        if (cache.accountFields) setAccountFields(sortAccountFields(cache.accountFields))
        if (cache.savedLocations) { setSavedLocations(cache.savedLocations); setLocationsReady(true) }
      } else {
        Promise.all([
          getDocs(collection(db, 'groups')),
          getDocs(collection(db, 'statuses')),
          getDocs(collection(db, 'groupFields')),
          getDocs(collection(db, 'accountFields')),
          getDocs(collection(db, 'locations')),
        ]).then(([gSnap, sSnap, gfSnap, afSnap, lSnap]) => {
          const g = sort(gSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
          const s = sort(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
          const gf = sort(gfSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
          const af = sortAccountFields(afSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
          const l = sort(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
          setGroups(g); setStatuses(s); setGroupFields(gf); setAccountFields(af); setSavedLocations(l); setLocationsReady(true)
          saveStaticCache({ groups: g, statuses: s, groupFields: gf, accountFields: af, savedLocations: l })
        })
      }
      // Real-time listener so venue changes from admin are reflected immediately.
      // Only the group doc is listened to (cheap: 1 read per user per change).
      // If the newly assigned location isn't cached yet, fetch just that doc.
      if (account.groupId) {
        const fetchedLocIds = new Set()
        unsubs.push(
          onSnapshot(doc(db, 'groups', account.groupId), (snap) => {
            if (!snap.exists()) return
            const updated = { id: snap.id, ...snap.data() }
            setGroups((prev) => {
              const exists = prev.some((g) => g.id === snap.id)
              return exists ? prev.map((g) => g.id === snap.id ? updated : g) : sort([...prev, updated])
            })
            // Every venue the group can send this member to within the outlook
            // window — the default plus anything scheduled — so the outlook can
            // print names. One getDoc per venue, once, only when it first appears.
            const wanted = new Set()
            if (updated.locationId) wanted.add(updated.locationId)
            for (let i = 0; i < OUTLOOK_DAYS; i++) {
              const entry = scheduledVenueEntry(updated, i === 0 ? todayISO() : addDays(todayISO(), i), account.miniGroupId)
              if (entry && entry.locationId) wanted.add(entry.locationId)
            }
            setSavedLocations((prev) => {
              wanted.forEach((locId) => {
                if (fetchedLocIds.has(locId) || prev.some((l) => l.id === locId)) return
                fetchedLocIds.add(locId)
                getDoc(doc(db, 'locations', locId)).then((lSnap) => {
                  if (!lSnap.exists()) return
                  setSavedLocations((p) => {
                    const next = sort([...p.filter((l) => l.id !== locId), { id: lSnap.id, ...lSnap.data() }])
                    const cached = loadStaticCache()
                    if (cached) saveStaticCache({ ...cached, savedLocations: next })
                    return next
                  })
                }).catch(() => {})
              })
              return prev
            })
          }),
        )
      }
    }

    return () => unsubs.forEach((u) => u())
  }, [account, dayKey])

  // Whether the company-wide listener below is running, and on which day. Declared up here
  // because the two per-platoon listeners that follow are switched OFF by it: it delivers
  // every platoon's document for the day with every field they read, so leaving them on
  // meant two or three live subscriptions to the SAME document and a bill of two or three
  // reads for every single mark made in the platoon on screen.
  const wantsAllPlatoons = !!account?.isSuperAdmin && (tab === 'today' || tab === 'movement')
  const allPlatoonsDate = tab === 'movement' && movementDate ? movementDate : dayKey

  // Device lockouts, read ONLY while the card that shows them is open, and only for TODAY.
  //
  // It used to be a listener on the whole collection, opened for every admin on every app
  // open and left running on every tab. Both halves of that were waste. The collection
  // holds one document per device that has ever logged in — a new phone, a reinstall or a
  // cleared browser makes another and the old one is never removed — so it only ever grows,
  // while `todaysLocks` throws away everything that is not from today. An admin was paying
  // for every phone the unit has ever owned, on Today, on Count, on Movement, to render a
  // list on a card he had not opened.
  //
  // `allow list: if isAdmin()` already covers a filtered query, so this needed no rules
  // change. On a normal day it returns nothing at all.
  useEffect(() => {
    if (!lockoutsOpen || !account?.isAdmin) return
    return onSnapshot(
      query(collection(db, 'deviceLogins'), where('date', '==', todayISO())),
      (snap) => {
        const m = {}
        snap.docs.forEach((d) => { m[d.id] = d.data() })
        setDeviceLogins(m)
      },
      () => {},
    )
  }, [lockoutsOpen, account, dayKey])


  // The live outfield vehicle manifest. One document, company-wide, admins only: one
  // read to open and one per change. A day with no manifest still bills the one read,
  // which is the whole cost on the ~364 days a year there isn't one.
  //
  // A manifest can run several days, so it is NOT necessarily filed under today's date —
  // a two-day move-out that started yesterday still governs this morning. The doc id
  // stays the START date and `until` carries the last day. Firestore takes an inequality
  // on one field only, so the end is filtered in the query and the start in the client;
  // the matching set is a handful of documents at most.
  //
  // Manifests written before ranges existed carry no `until` and so never match — every
  // one of those is in the past, where nothing should match anyway.
  useEffect(() => {
    if (!account?.isAdmin) return
    const today = todayISO()
    return onSnapshot(query(collection(db, 'movements'), where('until', '>=', today)), (snap) => {
      // No `date <= today` filter: a manifest is built days ahead and the admin has to be
      // able to open it before the morning it is for. `until >= today` already drops the
      // ones that are over. Earliest first, so a move-out running today outranks one
      // still to come.
      //
      // Everything downstream of `movement` is already date-guarded — the member's card
      // (movementSeatCard's own span test), outfieldStatusOn, and the four writers that
      // check `movement.date === date`. The one thing this DOES change on purpose is the
      // Movement tab appearing early, which is the point.
      const live = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => m.date)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
      // Earliest running one of each kind. Two outfields at once is not a thing the app
      // offers, so a second one of a kind can only be leftover data — taking the earliest
      // matches what a single-manifest build did and keeps the choice predictable.
      setMovements(Object.fromEntries(MV_KINDS.map((k) => [k, live.find((m) => movementKind(m) === k) || null])))
    })
  }, [account, dayKey])

  // The standing vehicle fleet, read only while something is actually showing it, and
  // never at all for a member.
  //
  // It used to be gated on the Admin tab alone, which was right when the manifest was
  // built there. It is opened from the Today tab now (and from the Movement tab's empty
  // state), so on a phone that had never wandered into Settings the fleet arrived empty
  // and the sheet said there were no vehicles. It only looked right in a browser that had
  // visited Admin earlier: the listener stops on the way out but the state it filled stays
  // behind, so the sheet was reading a leftover.
  useEffect(() => {
    if (!account?.isAdmin || (tab !== 'admin' && !movementSetupOpen)) return
    return onSnapshot(doc(db, 'movements', 'fleet'), (snap) => {
      setMovementFleet(snap.exists() ? (snap.data().vehicles || {}) : {})
    })
  }, [tab, account, movementSetupOpen])

  // Land on a manifest that exists. An admin who opens the tab to "No Vehicles Assigned Yet" while
  // the other kind is live and running would think the app had lost it.
  useEffect(() => {
    const has = (k) => (account?.isAdmin ? !!movements[k] : mySeats.some((x) => x.kind === k))
    if (has(mvKind)) return
    const other = MV_KINDS.find(has)
    if (other) setMvKind(other)
  }, [movements, mySeats, mvKind, account])


  // Admins keep the names-only rosters/{groupId} mirror in sync from the accounts
  // they can see (basic admin → own group; super admin → all groups). Reconciled
  // here rather than in each mutation so create/remove/rename/move/role all flow
  // through one path. A per-group JSON guard means it only writes when the member
  // map actually changed — ~0 writes steady-state.
  useEffect(() => {
    if (!account?.isAdmin) return
    const scope = account.isSuperAdmin ? groups.map((g) => g.id) : (account.groupId ? [account.groupId] : [])
    scope.forEach((gid) => {
      if (!gid) return
      const members = {}
      // Deferred personnel come off the roster members see. This has no date to
      // reason about — it's the list as it stands — so it asks about today.
      accounts.filter((a) => (a.groupId || '') === gid && activeOn(a, todayISO())).forEach((a) => {
        members[a.id] = { label: memberLabel(a), mg: a.miniGroupId || '', order: memberOrderKey(a) }
      })
      const json = JSON.stringify(members)
      if (rosterSyncRef.current[gid] === json) return
      rosterSyncRef.current[gid] = json
      setDoc(doc(db, 'rosters', gid), { members }, { merge: false }).catch(() => {})
    })
  }, [accounts, account, groups])

  // Regular users read their own group's roster (names only). getDoc + 1h cache
  // (like the static cache) keeps this to ~1 read per session; pull-to-refresh
  // forces a fresh read.
  async function loadRoster(force) {
    if (!account || account.isAdmin || !account.groupId) { setRoster(null); return }
    const ckey = `vmanifest92_roster_${account.groupId}`
    if (!force) {
      try {
        const raw = localStorage.getItem(ckey)
        if (raw) {
          const c = JSON.parse(raw)
          if (Date.now() - (c.ts || 0) < STATIC_CACHE_TTL) { setRoster(c.members || {}); return }
        }
      } catch (e) {}
    }
    try {
      const snap = await getDoc(doc(db, 'rosters', account.groupId))
      const members = snap.exists() ? (snap.data().members || {}) : {}
      setRoster(members)
      try { localStorage.setItem(ckey, JSON.stringify({ members, ts: Date.now() })) } catch (e) {}
    } catch (e) {}
  }
  useEffect(() => { loadRoster(false) }, [account])

  // While a modal overlay is open, stop touch-drags from scrolling the page behind it.
  // A position:fixed overlay doesn't block background scroll on iOS, and overflow:hidden
  // alone isn't reliable there, so we cancel touchmove at the document level — except
  // when the gesture is inside a scrollable region of the modal itself (so the card's
  // own content still scrolls). One passive:false listener for the app's lifetime; it
  // no-ops unless a modal is mounted.
  useEffect(() => {
    const onTouchMove = (e) => {
      const overlay = document.querySelector('.rc-modal-overlay')
      if (!overlay) return
      // Any drag that isn't inside the modal is on the background — always block it.
      // (This is the reliable check: the touch may land on the backdrop OR leak to the
      // page behind it; either way its target is outside the overlay.)
      if (!overlay.contains(e.target)) { e.preventDefault(); return }
      // Inside the modal: allow the gesture only within a scrollable region (card body),
      // so a long card still scrolls; block it elsewhere on the card.
      for (let el = e.target; el && el !== overlay; el = el.parentNode) {
        if (el.nodeType === 1 && el.scrollHeight > el.clientHeight) {
          const oy = getComputedStyle(el).overflowY
          if (oy === 'auto' || oy === 'scroll') return
        }
      }
      e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Freeze the background scroller while any modal overlay is mounted. Belt-and-braces,
  // because iOS scrolls the shell (a transformed compositor layer) on the compositor
  // thread: (1) toggle .rc-modal-open so the CSS rule sets overflow:hidden; (2) also write
  // overflow-y:hidden + touch-action:none straight onto the scroller element — overflow
  // gives it no scroll range at all, which the compositor can't override, and neither
  // property is in React's style prop so a re-render won't revert them. Overlays are
  // portaled as direct <body> children, so a childList observer on <body> catches every
  // open/close. The modal card is portaled out to <body> so it still scrolls.
  useEffect(() => {
    const sync = () => {
      const open = !!document.querySelector('.rc-modal-overlay')
      document.documentElement.classList.toggle('rc-modal-open', open)
      const el = scrollRef.current
      if (el) {
        el.style.overflowY = open ? 'hidden' : ''
        el.style.touchAction = open ? 'none' : ''
        // Clear any leftover pull-to-refresh transform so it can't hold the page shifted.
        if (open) el.style.transform = 'translateY(0px)'
      }
    }
    const mo = new MutationObserver(sync)
    mo.observe(document.body, { childList: true })
    // Belt in case the observer misses a mutation: re-sync on every touch start (fires
    // before the scroll would), so the lock is in place before a drag can move anything.
    document.addEventListener('touchstart', sync, { capture: true, passive: true })
    sync()
    return () => { mo.disconnect(); document.removeEventListener('touchstart', sync, { capture: true }) }
  }, [])

  // Switching tabs shows a different list from the top, so start it expanded rather
  // than leaving it shrunk from the tab before.
  useEffect(() => { tabBarRef.current?.bar?.classList.remove('shrunk') }, [tab])

  // Slides the blue pill between the segments of every .segmented track — the platoon
  // selector, the admin sub-tabs, the theme switch, and the small toggles inside the
  // admin cards. Done once here for all of them rather than per call site: every track
  // renders a bare <span className="seg-pill" />, and this places it.
  // Positions are MEASURED because these segments size to their labels, unlike the
  // equal-width tab bar. An observer, not a render effect, because half the tracks live
  // inside child components whose re-renders this one wouldn't see. Class attributes are
  // what mark a segment active, and a frame's worth of them collapses into one pass.
  // This only ever MOVES a pill that the JSX already rendered. It must not create one:
  // React reuses the header <div> across tabs and simply rewrites its className, so an
  // injected node was left stranded inside .segmented-scroll — nothing positioned around
  // it, so it stretched the full height of the header as a blue blob over the title.
  useEffect(() => {
    let queued = false
    const sync = () => {
      queued = false
      document.querySelectorAll('.segmented').forEach((track) => {
        const active = track.querySelector('button.active')
        const pill = track.querySelector('.seg-pill')
        if (!pill) return
        if (!active) { pill.style.opacity = '0'; return }
        // Rects, not offsetLeft/offsetWidth: those round to whole pixels, and the
        // track's 0.5px border pushed the pill a visible pixel off its label. Measured
        // from the padding box (where left:0 puts the pill) and in content coordinates,
        // so it stays put when a long selector is scrolled sideways.
        const tr = track.getBoundingClientRect()
        const ar = active.getBoundingClientRect()
        const border = parseFloat(getComputedStyle(track).borderLeftWidth) || 0
        // Slide only WITHIN one selector. Switching main tabs swaps the whole track for
        // a different set of segments (Platoon 1/2/3 → System/Light/Dark → General…),
        // and animating between two unrelated controls is what read as a jiggle: the
        // pill stretched from the old label's width to the new one's on arrival. The
        // segment labels identify the selector, so a changed set means "different
        // control, put it there" and an unchanged one means "same control, slide".
        const sig = Array.from(track.querySelectorAll('button'), (b) => b.textContent).join('|')
        const swapped = pill.dataset.sig !== sig
        pill.dataset.sig = sig
        if (swapped) pill.style.transition = 'none'
        pill.style.opacity = '1'
        pill.style.width = `${ar.width}px`
        pill.style.transform = `translateX(${ar.left - tr.left - border + track.scrollLeft}px)`
        if (swapped) { void pill.offsetWidth; pill.style.transition = '' } // commit, then re-arm
        // Keep the active segment ON SCREEN. A five-platoon track is wider than the phone,
        // and the page swipe changes which platoon is active without touching how far the
        // track is scrolled — so swiping to the last one left ATTACH hanging off the right
        // edge, selected and barely visible.
        //
        // Deliberately NOT scrollIntoView: that walks up to every scrollable ancestor, and
        // half these tracks sit inside cards below the fold, so it would jump the PAGE to
        // reach a theme switch nobody asked to see. This moves one element's scrollLeft and
        // can do nothing else.
        //
        // It also moves the LEAST it can — a segment already clear of both edges is left
        // alone — so it never fights a track the user has scrolled by hand.
        //
        // Only when the ACTIVE SEGMENT CHANGES. The observer fires on every class rewrite
        // anywhere in the header, and re-running this on all of them would yank the track
        // mid-drag. First sight of a track jumps instantly — there is nothing to animate
        // from — and every change after that slides.
        const label = active.textContent
        const first = pill.dataset.act === undefined
        if (first || pill.dataset.act !== label) {
          pill.dataset.act = label
          const box = track.closest('.segmented-scroll')
          if (box) {
            // Enough that the segment reads as sitting IN the strip rather than cut off by
            // it. At either end of the track the scroll simply clamps, which is right: the
            // last segment flush with the last pixel of content is not cut off.
            const PAD = 14
            const br = box.getBoundingClientRect()
            const want = ar.right > br.right - PAD ? ar.right - br.right + PAD
              : ar.left < br.left + PAD ? ar.left - br.left - PAD : 0
            // CLAMPED to the scroll that actually exists, and that is not a tidy-up — it is
            // why the pill used to land with a kick. The track ends 2px past its last
            // segment, so asking for 14px of clearance beside ATTACH asks for ~11px more
            // scroll than there is (measured: wants 66, has 55). The browser clamps a
            // scrollLeft write silently, so the tween froze at ~55% of its duration while
            // the pill's own 300ms transition ran on. The pill is absolutely positioned
            // INSIDE the track, so on screen you see transform MINUS scroll: while both
            // curves match, that difference is smooth, and the moment one stops early it
            // is not. Clamping the TARGET keeps both running the full 300ms.
            const dx = Math.max(-box.scrollLeft,
              Math.min(want, box.scrollWidth - box.clientWidth - box.scrollLeft))
            if (dx && (first || swapped)) {
              box.scrollLeft += dx
            } else if (dx) {
              // Hand-tweened, not `behavior: 'smooth'` — same duration and same curve as
              // the pill above it, so the two read as one thing moving. See SEG_EASE.
              cancelAnimationFrame(box.rcSegRaf)
              const from = box.scrollLeft
              const t0 = performance.now()
              const step = (now) => {
                const k = Math.min(1, (now - t0) / SEG_MS)
                box.scrollLeft = from + dx * SEG_EASE(k)
                if (k < 1) box.rcSegRaf = requestAnimationFrame(step)
              }
              box.rcSegRaf = requestAnimationFrame(step)
            }
          }
        }
      })
    }
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(sync) } }
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { subtree: true, childList: true, attributeFilter: ['class'] })
    window.addEventListener('resize', schedule)
    sync()
    return () => { mo.disconnect(); window.removeEventListener('resize', schedule) }
  }, [])

  // The real culprit (per on-screen diagnostics): while a modal is open, iOS scrolls the
  // WINDOW/document itself (a phantom keyboard/focus scroll — nothing there is legitimately
  // scrollable), which shifts visualViewport.offsetTop and drags the whole shell via the
  // .screen transform. Pin the document scroll back to 0 whenever a modal is open.
  useEffect(() => {
    const pin = () => {
      if (!document.querySelector('.rc-modal-overlay')) return
      const de = document.scrollingElement || document.documentElement
      if (window.scrollY || (de && de.scrollTop) || document.body.scrollTop) {
        window.scrollTo(0, 0)
        if (de) de.scrollTop = 0
        document.body.scrollTop = 0
      }
    }
    window.addEventListener('scroll', pin, { passive: true, capture: true })
    if (window.visualViewport) window.visualViewport.addEventListener('scroll', pin)
    return () => {
      window.removeEventListener('scroll', pin, { capture: true })
      if (window.visualViewport) window.visualViewport.removeEventListener('scroll', pin)
    }
  }, [])

  // Manual refresh (header button). Re-fetches the user's own account (so a mid-day
  // group/role reassignment is picked up without a full reload), the roster, and static
  // data; attendance is already live. Rate-limited: a read happens at most once per
  // REFRESH_COOLDOWN no matter how fast the button is tapped, and the button stays
  // disabled (spinner while loading, greyed during cooldown) so it can't spam Firestore.
  const REFRESH_COOLDOWN = 10000
  async function handleRefresh() {
    if (refreshState !== 'idle' || Date.now() - lastRefreshRef.current < REFRESH_COOLDOWN) return
    lastRefreshRef.current = Date.now()
    setRefreshState('loading')
    try {
      if (account?.id) {
        const snap = await getDoc(doc(db, 'accounts', account.id))
        if (snap.exists()) {
          if (!account.isAdmin) { try { localStorage.removeItem(STATIC_CACHE_KEY) } catch (e) {} }
          rosterSyncRef.current = {}
          setAccount({ id: snap.id, ...snap.data() }) // re-runs listener effects (re-subscribe)
        }
      }
      await loadRoster(true)
    } catch (e) {}
    setRefreshState('cooldown')
    setTimeout(() => setRefreshState('idle'), REFRESH_COOLDOWN)
  }

  function handleLogin(acc, sessionToken) {
    setAccount(acc)
    setTab('movement') // a stale tab from a previous account (e.g. 'admin') can be invalid for this one
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: acc.id, sessionToken: sessionToken || null, expiresAt: Date.now() + SESSION_TTL }))
    if (acc.username) localStorage.setItem(LAST_LOGIN_ID_KEY, acc.username) // prefill the Login ID on the next visit
  }
  async function handleLogout() {
    setAccount(null)
    // Back to the day screen. Signing out and in again as somebody else would otherwise
    // land him mid-board on the platoon the last man was looking at.
    setOpenScreen(null)
    localStorage.removeItem(SESSION_KEY)
    try { await signOut(auth) } catch (e) {}
    if (account) {
      try { await setDoc(doc(db, 'accounts', account.id), { sessionToken: null }, { merge: true }) } catch (e) {}
    }
  }

  // DEV ONLY: quick login as the first super-admin / admin / non-admin account.
  // Goes through the REAL login (loginWithCredentials) so the session carries a
  // genuine Firebase Auth identity — the old shortcut (writing a sessionToken
  // directly) is denied by the hardened rules, which require request.auth for
  // the app's reads/writes. Uses DEV_PASSWORD, so it only works if the picked
  // account's password matches. Remove this and the buttons before launch.
  async function devLogin(role) {
    // Fixed test-account usernames per role — deliberately NOT a scan of the
    // accounts collection, which is unreadable to an unauthenticated visitor
    // once the read lockdown is in place. loginWithCredentials only reads the
    // public authIndex pre-auth, so this keeps working after lockdown.
    const DEV_ACCOUNTS = { admin: 'admin', user: 'user' }
    const username = DEV_ACCOUNTS[role]
    if (!username) { console.warn(`devLogin: no test account mapped for ${role}`); return false }
    try {
      const res = await loginWithCredentials(username, DEV_PASSWORD, getDeviceId(), { bypassDeviceLock: true })
      if (res.ok) { handleLogin(res.account, res.sessionToken); return true }
      console.warn(`devLogin(${role}) failed for "${username}": ${res.message}`)
      return false
    } catch (e) { console.warn('devLogin error', e); return false }
  }


  // ---- Outfield vehicle manifest -------------------------------------------
  // A manifest is a PLAN, not a record: it says where people are supposed to be. It
  // never touches the daily roll call, a status, or a certificate — so it needs no
  // part of the attendance rules, pastDayOK(), or the freeze.


  function mirrorSelfMovement(batch, accountId, mvId, seat) {
    batch.set(doc(db, 'attendanceSelf', accountId), { mvSeats: { [mvId]: seat || deleteField() }, movement: deleteField() }, { merge: true })
  }

  // `party` is null on an ordinary activity, and that null is what the member's card reads
  // to know it has no wave to name. The card is standalone by design — a member cannot read
  // `movements/` — so everything it shows has to be written onto the seat here.
  function movementSeatCard(mv, veh, role, crew) {
    const activity = !mv.statusId || mv.statusId === (statuses[0] || {}).id
    return { date: mv.date, until: mv.until || mv.date, kind: movementKind(mv), name: mv.name || 'OUTFIELD', callsign: veh.callsign || '', plate: veh.plate || '', type: veh.type || '', role, party: activity ? null : (veh.party || 'main'), crew: crew || [] }
  }

  // Everyone on a vehicle carries THAT vehicle's crew on their own card, so a member can
  // see who they're riding with without reading the manifest (which is admin-only, and
  // company-wide — it would hand every member every name in the company).
  // The price is rewriting one vehicle's cards whenever its roster or roles change. That
  // is bounded by a truck's seats, never by the company, and it is a write not a read.
  const platoonNameOf = (gid) => (groups.find((g) => g.id === (gid || '')) || {}).name || ''

  // A manifest with `published: false` is the admin's working copy: it is built, argued
  // over and rearranged, and none of that reaches a phone. Absent means published — every
  // manifest that existed before this was already on people's cards, and silently pulling
  // it off them would be the one behaviour nobody asked for.
  const isDraft = (mv) => !!mv && mv.published === false

  function writeVehicleCards(batch, mv, vehicleId, assign) {
    const veh = mv.vehicles && mv.vehicles[vehicleId]
    if (!veh) return
    // Nothing leaves the manifest while it is a draft. Publish writes every card in one go.
    if (isDraft(mv)) return
    const rank = { driver: 0, vc: 1, pax: 2 }
    const rows = Object.entries(assign)
      .filter(([, a]) => a && a.v === vehicleId)
      .sort((x, y) => (rank[x[1].r] ?? 2) - (rank[y[1].r] ?? 2))
    // The platoon rides along as BOTH its id and its name: a member cannot read another
    // platoon's records to resolve one from the other, and cannot read the platoon list
    // either. The id is what tells him whose men are not his own; the name is what he
    // reads. Same reason the rider's name is copied here rather than looked up.
    // `att` and `sec` ride along for the same reason the name and platoon do: a member
    // cannot read another platoon's records to find out that a man is on loan, or which
    // section he came from. Left off, his crew list showed an attached man as one of his own
    // while the admin's manifest beside it marked him plainly.
    const crew = rows.map(([id, a]) => ({ id, n: a.n || '', r: a.r || 'pax', g: a.g || '', gn: platoonNameOf(a.g), ...(a.att ? { att: true } : null), ...(a.sec ? { sec: a.sec } : null) }))
    rows.forEach(([accId, a]) => mirrorSelfMovement(batch, accId, mv.id, movementSeatCard(mv, veh, a.r, crew)))
  }

  // Every manifest write goes through here so a rejection is REPORTED rather than
  // vanishing. Without it a denied write looks identical to a successful one — the
  // form closes and nothing appears — which is exactly how "I can't add a vehicle"
  // turns into a hunt through the console.
  async function movementWrite(run) {
    try {
      await run()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e && e.code === 'permission-denied'
        ? 'Firestore rejected this. The movements rules block has not been published in the Firebase Console yet.'
        : 'Could not save. Check your connection and try again.' }
    }
  }

  // The manifest a write is FOR is named by its id. `date` is still written as a field — it
  // is the day the roster is drawn from, and every date test downstream reads it — but it no
  // longer decides which document is touched.
  const movementById = (id) => MV_KINDS.map((k) => movements[k]).find((m) => m && m.id === id) || null

  function saveMovement(id, date, patch) {
    return movementWrite(() => setDoc(doc(db, 'movements', id), { date, year: parseInt(date.slice(0, 4), 10), ...patch }, { merge: true }))
  }

  function saveFleetVehicle(id, veh) {
    return movementWrite(() => setDoc(doc(db, 'movements', 'fleet'), { vehicles: { [id]: veh } }, { merge: true }))
  }

  function removeFleetVehicle(id) {
    return movementWrite(() => setDoc(doc(db, 'movements', 'fleet'), { vehicles: { [id]: deleteField() } }, { merge: true }))
  }

  // Deleting a vehicle MUST clear its seats and their cards in the same batch — an
  // `assign` entry pointing at a vehicle id that no longer exists is the one corrupt
  // state this model allows, and Firestore has no undo.
  function removeMovementVehicle(id, vehicleId) {
    const mv = movementById(id)
    return movementWrite(() => {
      const batch = writeBatch(db)
      const patch = { [`vehicles.${vehicleId}`]: deleteField() }
      Object.entries((mv && mv.assign) || {}).forEach(([accId, a]) => {
        if (a.v !== vehicleId) return
        patch[`assign.${accId}`] = deleteField()
        mirrorSelfMovement(batch, accId, id, null)
      })
      batch.update(doc(db, 'movements', id), patch)
      return batch.commit()
    })
  }

  // Party rides on every seated person's card, so moving a vehicle between serials has
  // to refresh them — otherwise a passenger is told "Main Body" after the truck moved.
  function setVehicleParty(id, vehicleId, party) {
    const mv = movementById(id)
    return movementWrite(() => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'movements', id), { vehicles: { [vehicleId]: { party } } }, { merge: true })
      if (mv) writeVehicleCards(batch, { ...mv, vehicles: { ...mv.vehicles, [vehicleId]: { ...mv.vehicles[vehicleId], party } } }, vehicleId, mv.assign || {})
      return batch.commit()
    })
  }

  // How many days the movement runs. The range rides on every seated person's card for
  // the same reason the party does, so changing it has to refresh them all — otherwise a
  // card that still ends yesterday goes blank on a member's phone on day two, on exactly
  // the morning they need it. Bounded by the manifest (vehicles × seats), and writes.
  // `sourceId` is the roster source the cards should be written AS, for the one caller that
  // has just changed it: the local `movement` still carries the old one until the listener
  // catches up, and a seat card built from it would keep a party the manifest no longer has.
  // Left undefined, the cards keep whatever source the manifest already had.
  function setMovementRange(id, date, until, sourceId) {
    const live = movementById(id)
    const mv = live && (sourceId === undefined ? live : { ...live, statusId: sourceId })
    return movementWrite(() => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'movements', id), { date, year: parseInt(date.slice(0, 4), 10), until }, { merge: true })
      if (mv) Object.keys(mv.vehicles || {}).forEach((vid) => writeVehicleCards(batch, { ...mv, until }, vid, mv.assign || {}))
      return batch.commit()
    })
  }

  // Publish writes every rider's card in one batch, so the whole company learns its
  // vehicles at the same instant rather than watching seats appear one at a time over an
  // afternoon. Unpublish clears them again, for a manifest that has to be rebuilt.
  //
  // One commit: 1 manifest write plus one per rider, which is under Firestore's 500-write
  // batch limit for any manifest a company could fill. It is also FEWER writes than the
  // live-as-you-go behaviour it replaces — that wrote a truck's worth of cards on every
  // single assignment.
  function setMovementPublished(id, published) {
    const mv = movementById(id)
    return movementWrite(() => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'movements', id), { published }, { merge: true })
      if (mv) {
        const assign = mv.assign || {}
        if (published) {
          Object.keys(mv.vehicles || {}).forEach((vid) => writeVehicleCards(batch, { ...mv, published: true }, vid, assign))
        } else {
          Object.keys(assign).forEach((accId) => mirrorSelfMovement(batch, accId, id, null))
        }
      }
      return batch.commit()
    })
  }

  function removeMovement(id) {
    const mv = movementById(id)
    return movementWrite(() => {
      const batch = writeBatch(db)
      Object.keys((mv && mv.assign) || {}).forEach((accId) => mirrorSelfMovement(batch, accId, id, null))
      batch.delete(doc(db, 'movements', id))
      return batch.commit()
    })
  }

  // Seat people. The name and platoon are denormalised onto each assignment because
  // `accounts` reads are group-scoped — without them a platoon admin would see another
  // platoon's passengers as unresolvable ids. Same reasoning as rosters/formerMembers.
  function assignToVehicle(id, vehicleId, accountIds, role = 'pax') {
    const mv = movementById(id)
    const veh = mv && mv.vehicles && mv.vehicles[vehicleId]
    if (!veh) return Promise.resolve({ ok: true })
    return movementWrite(() => {
      const batch = writeBatch(db)
      const patch = {}
      const next = { ...(mv.assign || {}) }
      accountIds.forEach((accId) => {
        const a = accounts.find((x) => x.id === accId)
        // `n` is what the manifest is READ by (nickname preferred); `fn` is the roll name
        // the Copy Report has to print, because that message goes to higher. Both ride on
        // the seat because a platoon admin cannot resolve either for another platoon's man.
        next[accId] = { v: vehicleId, r: role, n: memberLabel(a), fn: (a && a.displayName) || memberLabel(a), g: (a && a.groupId) || '' }
        // Attached-ness and the section name ride on the seat for the same reason the
        // name and platoon do: `accounts` reads are group-scoped, so a platoon admin
        // cannot look either of them up for a man outside his own platoon. The section is
        // written for EVERYONE, not just attached men — it is what says who holds a
        // licence, and the Driver role is refused to anyone outside a Driver section.
        const sec = a && groupMiniGroups(a.groupId || '').find((m) => m.id === a.miniGroupId)
        if (sec && sec.name) next[accId].sec = sec.name
        if (a && a.attached) next[accId].att = true
        patch[`assign.${accId}`] = next[accId]
      })
      writeVehicleCards(batch, mv, vehicleId, next)
      batch.update(doc(db, 'movements', id), patch)
      return batch.commit()
    })
  }

  function setMovementRole(id, accountId, role) {
    const mv = movementById(id)
    const cur = mv && mv.assign && mv.assign[accountId]
    if (!cur) return Promise.resolve({ ok: true })
    return movementWrite(() => {
      const batch = writeBatch(db)
      batch.update(doc(db, 'movements', id), { [`assign.${accountId}.r`]: role })
      writeVehicleCards(batch, mv, cur.v, { ...mv.assign, [accountId]: { ...cur, r: role } })
      return batch.commit()
    })
  }

  // A seat is a plan made days ahead; a status is what is true on the day. When the two
  // disagree about the day the manifest rosters from, the STATUS wins and the seat goes.
  // Otherwise a man marked MC on Wednesday still counts toward Thursday's strength and
  // still holds the driver's seat on a truck that has nobody to drive it — the counts and
  // the "No DVR" warning both read the seats, so leaving a dead seat there makes every
  // number on the manifest lie.
  //
  // Removed with no note left behind, by decision: the day's attendance still records the
  // status that took him, so who came off and why is traceable where it actually happened
  // rather than mirrored onto the manifest.
  //
  // On the START DAY the plan meets the morning, and the morning wins. A man whose status on
  // the manifest's own day is not what the manifest expects — anything but Outfield on an
  // outfield, anything but Present on an activity — comes off the vehicle without a word.
  //
  // Silent on purpose. The morning routine is: take the roll call, then read the manifest.
  // What an admin is looking for by then is an empty driver's or commander's seat, or a
  // truck light enough to fold into another — and "No DVR" / "No VC" on the vehicle already
  // say that far better than a list of names who dropped out. A notice would only be read
  // once and then be in the way.
  //
  // Only `mv.date`, the day it rosters from. A man Outfield on Thursday and MC on Friday
  // still moves out on Thursday and his seat is not in question.
  //
  // Every live manifest, not just the one on screen: the admin who changed a status was not
  // necessarily looking at either, and each is judged against its own expected status.
  //
  // Called AFTER the status write commits, never inside its batch, and one commit per
  // manifest: a batch cannot write the same document twice, and marking a whole platoon
  // would otherwise hit one manifest once per man.
  async function syncMovementSeats(date, changes) {
    if (!changes.length) return
    for (const mv of MV_KINDS.map((k) => movements[k])) {
      if (!mv || date !== mv.date) continue
      const expected = mv.statusId || statuses[0]?.id || null
      // No status is NOT Present. An unmarked row wears a TINTED Present pill, which is the
      // button offering to mark him; only the solid one says he was marked. So silence never
      // counts as agreement, on either kind of manifest — a man keeps his seat for the
      // expected status and for nothing else.
      const assign = mv.assign || {}
      const upd = {}
      const drops = []
      changes.forEach(({ accountId, statusId }) => {
        if (!assign[accountId]) return
        if (statusId === expected) return
        drops.push(accountId)
        upd[`assign.${accountId}`] = deleteField()
      })
      if (!Object.keys(upd).length) continue
      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'movements', mv.id), upd)
        const next = { ...assign }
        drops.forEach((id) => delete next[id])
        // His own card loses the seat; the men left on his truck lose a crew mate off theirs.
        // One pass per affected vehicle, not per man — two off the same truck would otherwise
        // rewrite the same cards twice in one batch.
        drops.forEach((accId) => mirrorSelfMovement(batch, accId, mv.id, null))
        ;[...new Set(drops.map((id) => assign[id].v))].forEach((vid) => writeVehicleCards(batch, mv, vid, next))
        await batch.commit()
      } catch (e) {}
    }
  }

  function unassignFromMovement(id, accountId) {
    const mv = movementById(id)
    const cur = mv && mv.assign && mv.assign[accountId]
    return movementWrite(() => {
      const batch = writeBatch(db)
      batch.update(doc(db, 'movements', id), { [`assign.${accountId}`]: deleteField() })
      mirrorSelfMovement(batch, accountId, id, null)
      // The people left behind lose a crew mate off their own card.
      if (cur) {
        const next = { ...mv.assign }
        delete next[accountId]
        writeVehicleCards(batch, mv, cur.v, next)
      }
      return batch.commit()
    })
  }

  // ---- Activity attendance sheets -------------------------------------------
  // Everything here writes to `activities` on the day document and to the members' own
  // cards, and to NOTHING else. Not a status, not a certificate, not the day's `entries`.
  // That separation is the whole feature: a man on MC in the morning is on MC in that
  // record all day, and is also present at the night roll call, and both are true.

  // A writeBatch that spills into a fresh one before Firestore's 500-write ceiling, with
  // the same surface: .set / .update / .delete, then one .commit().
  //
  // It exists because these five writers fan out per PERSON. A company sheet marked all
  // present touches one day document per platoon plus one card per man on it — past 500
  // for a full company — and Firestore rejects an over-limit batch WHOLE, so the write
  // landed nowhere. The chunks commit in order and are not one transaction, which is safe
  // here: every write is a full value at a known field path, so a half-applied fan-out is
  // repaired by simply doing it again.
  function chunkedBatch() {
    // Under 500 with room to spare — a caller can queue two writes per person (the day
    // document's field and his card), and the margin means a chunk boundary can never
    // land between the pair in a way that matters.
    const LIMIT = 450
    const batches = []
    let n = LIMIT
    const cur = () => {
      if (n >= LIMIT) { batches.push(writeBatch(db)); n = 0 }
      n += 1
      return batches[batches.length - 1]
    }
    const api = {
      set: (...a) => { cur().set(...a); return api },
      update: (...a) => { cur().update(...a); return api },
      delete: (...a) => { cur().delete(...a); return api },
      commit: async () => { for (const b of batches) await b.commit() },
    }
    return api
  }



















  // ---- Supporting documents ------------------------------------------------
  // A flagged status (MC) carries a file and a date range. The file lives in
  // mcDocs/<id> + its parts sub-collection; the range is written straight into each
  // day's attendance doc, so the board, the Count tab and history all keep working
  // without knowing ranges exist. Only the metadata rides on the attendance doc.










  // ...and whether this admin may write it. A basic admin holds one platoon: the rules reject
  // a write naming any other, and a rejected write fails the WHOLE batch — so a range
  // straddling a transfer would take the entire verification down with it. Days outside his
  // authority are skipped instead, which is also the right answer on the merits: the days
  // before the transfer are not his platoon's to record.
  const canWriteGroup = (gid) => !!account && (account.isSuperAdmin || gid === (account.groupId || ''))
















  // ---- Freezing the morning record ------------------------------------------
  // The Today tab is the morning roll call: taken once, reported to higher, then it
  // stands. A super admin freezes it at the moment it goes up the chain, and reopens
  // individual men as the day requires. See ~/.claude/plans/freeze-morning-record.md.
  //
  // Two locks. This is the workflow one — it hides the controls, so the wrong write is
  // never attempted and the app can explain itself. freezeOK() in firestore.rules is the
  // other, and it is what makes the freeze true rather than merely presented.









  useEffect(() => {
    if (!account?.isAdmin || tab !== 'today' || selectedDate !== todayISO()) return undefined
    const t = setInterval(() => setMinuteTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [account, tab, selectedDate])


  // No optimistic set: the listener above is what moves the UI, and a write the
  // rules refuse must not leave the switch looking flipped when it hasn't moved.
  async function saveLockdown(on) {
    try { await setDoc(doc(db, 'appAccess', 'lockdown'), { lockdown: !!on }, { merge: true }) } catch (e) {}
  }














  async function setGroupInfo(groupId, info) {
    try { await setDoc(doc(db, 'groups', groupId), { info }, { merge: true }); return true } catch (e) { return false }
  }

  async function addGroupField(label) {
    if (!label || !label.trim()) return
    await addDoc(collection(db, 'groupFields'), { label: label.trim(), order: groupFields.length })
  }
  async function removeGroupField(id) {
    try { await deleteDoc(doc(db, 'groupFields', id)) } catch (e) {}
  }
  async function renameGroupField(id, label) {
    if (!label || !label.trim()) return
    try { await setDoc(doc(db, 'groupFields', id), { label: label.trim() }, { merge: true }) } catch (e) {}
  }
  async function reorderGroupField(id, direction) {
    const idx = groupFields.findIndex((f) => f.id === id)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= groupFields.length) return
    const a = groupFields[idx]
    const b = groupFields[swapIdx]
    await Promise.all([
      setDoc(doc(db, 'groupFields', a.id), { order: swapIdx }, { merge: true }),
      setDoc(doc(db, 'groupFields', b.id), { order: idx }, { merge: true }),
    ])
  }

  async function setAccountInfo(accountId, info) {
    try { await setDoc(doc(db, 'accounts', accountId), { info }, { merge: true }); return true } catch (e) { return false }
  }
  async function addAccountField(label) {
    if (!label || !label.trim()) return
    await addDoc(collection(db, 'accountFields'), { label: label.trim(), order: accountFields.length })
  }
  // Permanent only. A pinned field can be deleted and renamed like any other — it is
  // pinned in POSITION, not in existence.
  async function removeAccountField(id) {
    if (isPermanentAccountField(accountFields.find((f) => f.id === id))) return
    try { await deleteDoc(doc(db, 'accountFields', id)) } catch (e) {}
  }
  async function renameAccountField(id, label) {
    if (!label || !label.trim()) return
    if (isPermanentAccountField(accountFields.find((f) => f.id === id))) return
    try { await setDoc(doc(db, 'accountFields', id), { label: label.trim() }, { merge: true }) } catch (e) {}
  }
  async function setAccountFieldEditable(id, editableByUser) {
    try { await setDoc(doc(db, 'accountFields', id), { editableByUser: !!editableByUser }, { merge: true }) } catch (e) {}
  }
  async function reorderAccountField(id, direction) {
    const idx = accountFields.findIndex((f) => f.id === id)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= accountFields.length) return
    const a = accountFields[idx]
    const b = accountFields[swapIdx]
    // Both kinds of fixed field hold their slot: permanent because the app owns it,
    // pinned because PES and Medical Excuse lead the grid in that order by definition.
    if (isFixedAccountField(a) || isFixedAccountField(b)) return
    await Promise.all([
      setDoc(doc(db, 'accountFields', a.id), { order: swapIdx }, { merge: true }),
      setDoc(doc(db, 'accountFields', b.id), { order: idx }, { merge: true }),
    ])
  }



  // Full-order persisters for the other drag-to-reorder lists. Same pattern as
  // setStatusOrder: write only the docs whose order changed.
  async function setGroupOrder(orderedIds) {
    const current = groups.map((g) => g.id)
    await Promise.all(orderedIds.map((id, i) =>
      current[i] === id ? null : setDoc(doc(db, 'groups', id), { order: i }, { merge: true })
    ).filter(Boolean))
  }
  async function setGroupFieldOrder(orderedIds) {
    const current = groupFields.map((f) => f.id)
    await Promise.all(orderedIds.map((id, i) =>
      current[i] === id ? null : setDoc(doc(db, 'groupFields', id), { order: i }, { merge: true })
    ).filter(Boolean))
  }
  // Custom account fields reorder among themselves; reassign the order slots they
  // already occupy so the app-managed built-in fields keep their positions.
  async function setAccountFieldOrder(orderedIds) {
    const custom = accountFields.filter((f) => !isFixedAccountField(f))
    const slots = custom.map((f) => f.order ?? 0).slice().sort((a, b) => a - b)
    const byId = Object.fromEntries(custom.map((f) => [f.id, f]))
    await Promise.all(orderedIds.map((id, i) => {
      const f = byId[id]
      if (!f) return null
      return (f.order ?? 0) === slots[i] ? null : setDoc(doc(db, 'accountFields', id), { order: slots[i] }, { merge: true })
    }).filter(Boolean))
  }
  async function setMiniGroupOrder(groupId, orderedIds) {
    const byId = Object.fromEntries(groupMiniGroups(groupId).map((m) => [m.id, m]))
    const next = orderedIds.map((id, i) => (byId[id] ? { ...byId[id], order: i } : null)).filter(Boolean)
    await writeMiniGroups(groupId, next)
  }

  // `attached` = personnel loaned to the company for an ICT (a driver from MT line, a
  // storeman from another unit). They are a full personnel record — name, contact,
  // platoon, personnel info, daily status, a seat on the manifest — with no way into the
  // app: no password is written and no authIndex entry is created, and login stops dead
  // at the missing index doc. Their number still goes in the Login ID field, because that
  // is where the company keeps a contact number.
  async function createAccount({ username, displayName, nickname, groupId, miniGroupId, role, attached }) {
    const uname = username.trim().toLowerCase()
    if (!uname) return { ok: false, message: 'Enter a login ID.' }
    if (!displayName || !displayName.trim()) return { ok: false, message: 'Enter a personnel name.' }
    const taken = accounts.some((a) => (a.username || '').toLowerCase() === uname)
    if (taken) return { ok: false, message: 'That login ID is taken.' }
    // Every new account starts with the default induction password (FMC) and is
    // flagged mustChangePassword, so the user is forced to set their own on first
    // login (see ForcePasswordChangeModal) — FMC is never a resting credential.
    const hash = attached ? null : await hashPassword(DEFAULT_INITIAL_PASSWORD)
    // Pre-generate the id so the accounts doc and its authIndex entry can be
    // written atomically in one batch (they must never exist without each other).
    const accountRef = doc(collection(db, 'accounts'))
    const batch = writeBatch(db)
    batch.set(accountRef, {
      username: uname, displayName: displayName.trim(), nickname: (nickname || '').trim(), groupId: groupId || '', miniGroupId: miniGroupId || '',
      // No password field at all on an attached record, rather than an empty one: there
      // is no credential to guess, and nothing for a password reset to rotate.
      ...(attached ? { attached: true } : { password: hash }),
      isAdmin: role === 'admin' || role === 'superAdmin',
      isSuperAdmin: role === 'superAdmin',
      // Write the full set of fields the rules read (authEmailVersion, lockout
      // counters) so a claim / lockout bump never hits a missing field — reading
      // an absent field in a security rule raises and denies (see incident #3).
      authEmailVersion: 0, failedAttempts: 0, lockedUntil: null, mustChangePassword: !attached,
      // Born on the account-derived Auth address, so this member's login ID (a
      // phone number) never becomes a Firebase Auth email — nothing to migrate
      // later, and nothing for the signUp endpoint to confirm the number against.
      authEmailScheme: AUTH_SCHEME_ACCOUNT,
    })
    // The one write that makes an account loginnable. Skipped for attached personnel —
    // this is the whole mechanism, not a cosmetic flag.
    if (!attached) batch.set(doc(db, 'authIndex', uname), { accountId: accountRef.id, authEmailVersion: 0, password: hash, failedAttempts: 0, lockedUntil: null, authEmailScheme: AUTH_SCHEME_ACCOUNT })
    await batch.commit()
    return { ok: true }
  }

  // Keep a migrated user's users/{uid} role/group mapping in sync with admin edits.
  // Best-effort; only acts once the account has a linked Firebase Auth uid.
  async function syncUserClaims(id, patch) {
    try {
      const acc = accounts.find((a) => a.id === id)
      if (acc && acc.authUid) await setDoc(doc(db, 'users', acc.authUid), patch, { merge: true })
    } catch (e) {}
  }

  async function setAccountRole(id, role) {
    try {
      await setDoc(doc(db, 'accounts', id), {
        isAdmin: role === 'admin' || role === 'superAdmin',
        isSuperAdmin: role === 'superAdmin',
      }, { merge: true })
      await syncUserClaims(id, { isAdmin: role === 'admin' || role === 'superAdmin', isSuperAdmin: role === 'superAdmin' })
      return true
    } catch (e) { return false }
  }

  // One batch, so the name is kept by the same write that removes the account.
  // Past attendance names are resolved against the roster, and once the account
  // doc is gone the name exists nowhere else in the app — a deletion that
  // succeeded while the name write failed would lose it silently, and there is
  // no undo. Three deletes and one merge, all or nothing.
  async function removeAccount(id) {
    const acc = accounts.find((a) => a.id === id)
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'accounts', id))
      if (acc && acc.username) batch.delete(doc(db, 'authIndex', acc.username.toLowerCase()))
      if (acc && acc.authUid) batch.delete(doc(db, 'users', acc.authUid))
      // The display name, not the label: a nickname is how the app addresses
      // someone day to day, and a year later a past record wants the name.
      const name = (acc && (acc.displayName || acc.username)) || ''
      if (name) batch.set(doc(db, 'formerMembers', 'index'), { [id]: name }, { merge: true })
      await batch.commit()
      setFormerNames((prev) => (name ? { ...prev, [id]: name } : prev))
    } catch (e) {}
  }

  // Put a deferred person back on the board — a full undo, not just a release.
  //
  // The day the defer was set goes back to what DEFER displaced: the status that
  // was there before it (deferredPrev), or unset if the day was blank. That holds
  // whatever the date, so there is no cutoff to remember, and it never leaves a
  // day emptier than the defer found it.
  //
  // No date test and no read of the day first: changing or clearing the status on
  // that exact date is itself what un-defers someone (see applyDeferral), so if
  // they are still on this list, that day still carries the defer. Both branches
  // below clear deferredFrom in their own batch for the same reason — the direct
  // write is only for an account with no group, which owns no attendance row.
  async function returnToPlatoon(id) {
    try { await setDoc(doc(db, 'accounts', id), { deferredFrom: deleteField(), deferredPrev: deleteField() }, { merge: true }) } catch (e) {}
  }

  // Shared tail of a self-service password change: try syncing Firebase Auth
  // in-session first (drops the Firestore hash entirely when it works), else
  // fall back to storing a new hash + bumping the synthetic-email version.
  // Always clears mustChangePassword, however the caller got here.
  async function applyNewPassword(newPassword) {
    let synced = false
    try { if (auth.currentUser) { await updatePassword(auth.currentUser, await authPassword(newPassword)); synced = true } } catch (e) {}

    const uname = (account.username || '').toLowerCase()
    if (synced) {
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', account.id), { password: deleteField(), mustChangePassword: deleteField() }, { merge: true })
      batch.set(doc(db, 'authIndex', uname), { accountId: account.id, password: deleteField() }, { merge: true })
      await batch.commit()
      setAccount((prev) => ({ ...prev, password: undefined, mustChangePassword: false }))
    } else {
      const newHash = await hashPassword(newPassword)
      const nextVersion = (Number(account.authEmailVersion) || 0) + 1
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', account.id), { password: newHash, authEmailVersion: nextVersion, mustChangePassword: deleteField() }, { merge: true })
      batch.set(doc(db, 'authIndex', uname), { accountId: account.id, password: newHash, authEmailVersion: nextVersion }, { merge: true })
      await batch.commit()
      setAccount((prev) => ({ ...prev, password: newHash, authEmailVersion: nextVersion, mustChangePassword: false }))
    }
  }

  async function changeMyPassword(currentPassword, newPassword) {
    if (!newPassword) return { ok: false, message: 'Enter a new password.' }
    // Migrated accounts have no Firestore password hash left to compare
    // against (see writeIdentityDocs) — Auth owns the credential, so verify
    // "current password" by re-authenticating against it directly.
    if (account.authUid && !account.password) {
      try {
        const email = authEmailFor(account.authEmailScheme, account.id, account.username, Number(account.authEmailVersion) || 0)
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, await authPassword(currentPassword)))
      } catch (e) {
        return { ok: false, message: 'Current password is incorrect.' }
      }
    } else {
      const currentHash = await hashPassword(currentPassword)
      const currentOk = isHash(account.password) ? account.password === currentHash : account.password === currentPassword
      if (!currentOk) return { ok: false, message: 'Current password is incorrect.' }
    }
    try { await applyNewPassword(newPassword); return { ok: true } } catch (e) { return { ok: false, message: 'Could not update password.' } }
  }

  // Forced first-change flow right after a fresh login with a temp password:
  // the just-established Auth session is already proof of identity, so this
  // skips re-verifying the (temp) current password the self-service flow above requires.
  async function completeForcedPasswordChange(newPassword) {
    if (!newPassword) return { ok: false, message: 'Enter a new password.' }
    try { await applyNewPassword(newPassword); return { ok: true } } catch (e) { return { ok: false, message: 'Could not update password.' } }
  }

  async function changeMyUsername(newUsername) {
    const uname = newUsername.trim().toLowerCase()
    if (!uname) return { ok: false, message: 'Enter a username.' }
    const taken = accounts.some((a) => a.id !== account.id && (a.username || '').toLowerCase() === uname)
    if (taken) return { ok: false, message: 'That username is taken.' }
    try {
      // On the LEGACY scheme the synthetic email is derived from the username, so
      // once migrated (no Firestore password hash left as a fallback bootstrap —
      // see writeIdentityDocs) the Auth linkage must be updated to match, or the
      // next login looks for an email that no longer exists. Do this in-session
      // before writing the new username, so a failure here means nothing changed
      // yet rather than leaving the two out of sync.
      // On the account-derived scheme the address doesn't contain the username at
      // all, so a rename touches Firestore only — nothing to keep in sync.
      if (!isAccountScheme(account.authEmailScheme) && account.authUid && !account.password && auth.currentUser) {
        await updateEmail(auth.currentUser, syntheticEmail(uname, Number(account.authEmailVersion) || 0))
      }
      // authIndex is keyed by username, so a rename moves the doc: carry its
      // fields to the new key and drop the old one, atomically with the
      // accounts write so the two can never disagree.
      const oldUname = (account.username || '').toLowerCase()
      const oldIdxSnap = await getDoc(doc(db, 'authIndex', oldUname))
      // The rebuilt fallback has to restate the scheme too — see renameMigratedAccount.
      const idxData = oldIdxSnap.exists() ? oldIdxSnap.data() : {
        authEmailVersion: Number(account.authEmailVersion) || 0,
        ...(isAccountScheme(account.authEmailScheme) ? { authEmailScheme: AUTH_SCHEME_ACCOUNT } : {}),
      }
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', account.id), { username: uname }, { merge: true })
      if (oldUname && oldUname !== uname) batch.delete(doc(db, 'authIndex', oldUname))
      batch.set(doc(db, 'authIndex', uname), { ...idxData, accountId: account.id }, { merge: true })
      await batch.commit()
      setAccount({ ...account, username: uname })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: 'Could not update username.' }
    }
  }

  async function clearDeviceLock(deviceId) {
    try { await deleteDoc(doc(db, 'deviceLogins', deviceId)) } catch (e) {}
  }

  async function setAccountPassword(id, newPassword) {
    if (!newPassword) return false
    try {
      const hash = await hashPassword(newPassword)
      // Admins can't sync another user's Firebase Auth password from the browser,
      // so rotate the synthetic email: the member's next login creates a fresh
      // auth user with this password (old one is orphaned and harmless).
      const acc = accounts.find((a) => a.id === id)
      const nextVersion = (Number(acc && acc.authEmailVersion) || 0) + 1
      const uname = (acc && acc.username || '').toLowerCase()
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', id), { password: hash, failedAttempts: 0, lockedUntil: null, authEmailVersion: nextVersion }, { merge: true })
      if (uname) batch.set(doc(db, 'authIndex', uname), { accountId: id, password: hash, failedAttempts: 0, lockedUntil: null, authEmailVersion: nextVersion }, { merge: true })
      await batch.commit()
      return true
    } catch (e) { return false }
  }

  async function setAccountDisplayName(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, message: 'Enter a display name.' }
    try {
      await setDoc(doc(db, 'accounts', id), { displayName: trimmed }, { merge: true })
      if (id === account.id) setAccount({ ...account, displayName: trimmed })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: 'Could not update display name.' }
    }
  }

  async function setAccountNickname(id, nickname) {
    const trimmed = (nickname || '').trim()
    try {
      await setDoc(doc(db, 'accounts', id), { nickname: trimmed }, { merge: true })
      if (id === account.id) setAccount({ ...account, nickname: trimmed })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: 'Could not update nickname.' }
    }
  }

  async function setAccountUsername(id, newUsername) {
    const uname = newUsername.trim().toLowerCase()
    if (!uname) return { ok: false, message: 'Enter a username.' }
    const taken = accounts.some((a) => a.id !== id && (a.username || '').toLowerCase() === uname)
    if (taken) return { ok: false, message: 'That username is taken.' }
    // Renaming someone else's migrated account can't be made safe the way
    // self-service renames are (changeMyUsername calls updateEmail in-session
    // — an admin has no session to call it on for another account, and there's
    // no Cloud Function to do it server-side). The synthetic email is derived
    // from username, so silently allowing this would leave the member's next
    // login looking for an Auth identity that no longer matches anything, with
    // no password fallback left to self-heal through (see writeIdentityDocs).
    // Reset their password in the same breath instead — that already bumps
    // authEmailVersion and restores a bootstrap hash, so their next login
    // re-migrates cleanly under the new username.
    //
    // None of that applies once the account is on the account-derived scheme: the
    // Auth address doesn't contain the username, so a rename is an ordinary
    // Firestore write and needs no password reset. This is what makes changing a
    // member's phone number a routine edit rather than a re-migration.
    const target = accounts.find((a) => a.id === id)
    if (target && target.authUid && !target.password && !isAccountScheme(target.authEmailScheme)) {
      return { ok: false, message: 'This personnel has already signed in with their current username. Reset their password at the same time (Set Password below) so their account relinks correctly on next login.' }
    }
    try {
      // Not migrated: the authIndex doc still holds the legacy hash — carry it
      // (and the version) to the new username key so the next login still works.
      const oldUname = (target && target.username || '').toLowerCase()
      const oldIdxSnap = oldUname ? await getDoc(doc(db, 'authIndex', oldUname)) : null
      const idxData = oldIdxSnap && oldIdxSnap.exists()
        ? oldIdxSnap.data()
        : {
            authEmailVersion: Number(target && target.authEmailVersion) || 0,
            ...(target && target.password ? { password: target.password } : {}),
            // Restate the scheme — see renameMigratedAccount.
            ...(isAccountScheme(target && target.authEmailScheme) ? { authEmailScheme: AUTH_SCHEME_ACCOUNT } : {}),
          }
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', id), { username: uname }, { merge: true })
      if (oldUname && oldUname !== uname) batch.delete(doc(db, 'authIndex', oldUname))
      batch.set(doc(db, 'authIndex', uname), { ...idxData, accountId: id }, { merge: true })
      await batch.commit()
      if (id === account.id) setAccount({ ...account, username: uname })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: 'Could not update username.' }
    }
  }

  // Rename a MIGRATED account (the only kind, once everyone has logged in once).
  // An admin can't call updateEmail on another user's Auth session, so renaming
  // is done the only safe way: rotate authEmailVersion and drop a fresh bootstrap
  // hash (a generated temp password), so the member's next login re-migrates a
  // new Auth user under the new username. Returns the temp password to relay.
  // Combines what used to be a two-step manual process (Set Password, then Save
  // Login Name) into one action.
  async function renameMigratedAccount(id, newUsername) {
    const uname = newUsername.trim().toLowerCase()
    if (!uname) return { ok: false, message: 'Enter a username.' }
    const taken = accounts.some((a) => a.id !== id && (a.username || '').toLowerCase() === uname)
    if (taken) return { ok: false, message: 'That username is taken.' }
    const target = accounts.find((a) => a.id === id)
    if (!target) return { ok: false, message: 'Account not found.' }
    try {
      const tempPassword = generateTempPassword()
      const hash = await hashPassword(tempPassword)
      const nextVersion = (Number(target.authEmailVersion) || 0) + 1
      const oldUname = (target.username || '').toLowerCase()
      // The rename moves authIndex to a NEW key, so `merge` has no existing doc to
      // merge with — the scheme has to be restated explicitly or the index would
      // claim the legacy form while the accounts doc says otherwise. The next
      // login would then provision an auth user at the wrong address and have its
      // claim denied, with no legacy hash left to recover through.
      const idxScheme = isAccountScheme(target.authEmailScheme) ? { authEmailScheme: AUTH_SCHEME_ACCOUNT } : {}
      const batch = writeBatch(db)
      batch.set(doc(db, 'accounts', id), { username: uname, password: hash, failedAttempts: 0, lockedUntil: null, authEmailVersion: nextVersion, mustChangePassword: true }, { merge: true })
      if (oldUname && oldUname !== uname) batch.delete(doc(db, 'authIndex', oldUname))
      batch.set(doc(db, 'authIndex', uname), { accountId: id, password: hash, failedAttempts: 0, lockedUntil: null, authEmailVersion: nextVersion, ...idxScheme }, { merge: true })
      await batch.commit()
      if (id === account.id) setAccount({ ...account, username: uname, password: hash, authEmailVersion: nextVersion, mustChangePassword: true })
      return { ok: true, tempPassword, username: uname }
    } catch (e) {
      return { ok: false, message: 'Could not rename the account.' }
    }
  }

  async function addGroup(name) {
    if (!name.trim()) return
    // A platoon created mid-period joins the period that is already running. The ICT window
    // and the company reporting location are denormalized onto EVERY group doc rather than
    // held once for the company, and only saveEvent() writes them — across the groups that
    // existed when it ran. A platoon added afterwards therefore reports NOWHERE and carries
    // no period, which reads as a bug rather than as a platoon nobody has set up yet.
    //
    // Only the company-wide half is copied. `venueSchedule` holds this platoon's own
    // Platoon/Section exceptions and names Section ids a new platoon does not have, and
    // `ictPeriods` is the record of periods it was never part of.
    const peer = groups.find((g) => g.eventFrom || g.locationId || (g.companySchedule || []).length) || null
    await addDoc(collection(db, 'groups'), {
      name: name.trim(), order: groups.length,
      ...(peer ? { eventFrom: peer.eventFrom || null, eventTo: peer.eventTo || null, locationId: peer.locationId || null, companySchedule: peer.companySchedule || [] } : {}),
    })
  }
  async function removeGroup(id) { await deleteDoc(doc(db, 'groups', id)) }
  async function renameGroup(id, name) {
    if (!name.trim()) return
    await updateDoc(doc(db, 'groups', id), { name: name.trim() })
  }

  async function reorderGroup(id, direction) {
    const idx = groups.findIndex((g) => g.id === id)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= groups.length) return
    const a = groups[idx]
    const b = groups[swapIdx]
    await Promise.all([
      setDoc(doc(db, 'groups', a.id), { order: swapIdx }, { merge: true }),
      setDoc(doc(db, 'groups', b.id), { order: idx }, { merge: true }),
    ])
  }


  async function setAccountGroup(id, groupId) {
    const before = accounts.find((a) => a.id === id)
    const from = before ? (before.groupId || '') : ''
    const to = groupId || ''
    // Mini-groups are scoped to a group, so a move clears the old assignment.
    //
    // `prevGroupId` + `groupChangedOn` are ONE transfer's worth of memory, and they exist for
    // one job: a certificate covering a range that straddles the move. An MC written for
    // 20-26 Aug by a man who transferred on the 25th belongs to two platoons, and without
    // this the whole range is filed against whichever board the verifying admin had open.
    // Deliberately not a full posting history — one transfer is all a certificate's span can
    // realistically straddle, and a second move overwrites the first, which is the honest
    // limit rather than a half-built history nobody can trust.
    try {
      await setDoc(doc(db, 'accounts', id), from !== to
        ? { groupId: to, miniGroupId: '', prevGroupId: from, groupChangedOn: todayISO() }
        : { groupId: to, miniGroupId: '' }, { merge: true })
    } catch (e) {}
    await syncUserClaims(id, { groupId: to })
  }

  // Mini-groups (a member subdivision inside a group) live as an embedded array on
  // the group doc: [{ id, name, order }]. Members already read their own group doc,
  // so definitions cost no extra reads. Each add/rename/remove/reorder is one write.
  function genMiniGroupId() { return 'mg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
  function groupMiniGroups(groupId) {
    const g = groups.find((x) => x.id === groupId)
    return Array.isArray(g?.miniGroups) ? g.miniGroups : []
  }
  async function writeMiniGroups(groupId, next) {
    try { await setDoc(doc(db, 'groups', groupId), { miniGroups: next }, { merge: true }) } catch (e) {}
  }
  async function addMiniGroup(groupId, name) {
    if (!name.trim()) return
    const list = groupMiniGroups(groupId)
    await writeMiniGroups(groupId, [...list, { id: genMiniGroupId(), name: name.trim(), order: list.length }])
  }
  async function renameMiniGroup(groupId, mgId, name) {
    if (!name.trim()) return
    await writeMiniGroups(groupId, groupMiniGroups(groupId).map((m) => (m.id === mgId ? { ...m, name: name.trim() } : m)))
  }
  async function removeMiniGroup(groupId, mgId) {
    // Leaves members' now-orphaned miniGroupId as-is; an unknown id renders as Ungrouped.
    await writeMiniGroups(groupId, groupMiniGroups(groupId).filter((m) => m.id !== mgId).map((m, i) => ({ ...m, order: i })))
  }
  async function reorderMiniGroup(groupId, mgId, direction) {
    const list = [...groupMiniGroups(groupId)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const idx = list.findIndex((m) => m.id === mgId)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return
    ;[list[idx], list[swapIdx]] = [list[swapIdx], list[idx]]
    await writeMiniGroups(groupId, list.map((m, i) => ({ ...m, order: i })))
  }


  async function setAccountMiniGroup(id, miniGroupId) {
    const before = accounts.find((a) => a.id === id) || null
    const from = before ? (before.miniGroupId || '') : ''
    const to = miniGroupId || ''
    try { await setDoc(doc(db, 'accounts', id), { miniGroupId: to }, { merge: true }) } catch (e) {}
  }

  // Reorder a member within its (group, mini-group) bucket. Persists a normalized
  // 0..n memberOrder for the whole bucket so unset/duplicate orders can't scramble
  // the list; writes are bounded per bucket and admin-only.
  async function reorderMember(id, direction) {
    const target = accounts.find((a) => a.id === id)
    if (!target) return
    const gid = target.groupId || ''
    const mg = target.miniGroupId || ''
    const peers = orderedMembers(accounts.filter((a) => (a.groupId || '') === gid && (a.miniGroupId || '') === mg))
    const idx = peers.findIndex((a) => a.id === id)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= peers.length) return
    ;[peers[idx], peers[swapIdx]] = [peers[swapIdx], peers[idx]]
    await Promise.all(
      peers
        .map((a, i) => (a.memberOrder === i ? null : setDoc(doc(db, 'accounts', a.id), { memberOrder: i }, { merge: true })))
        .filter(Boolean)
    ).catch(() => {})
  }

  // requiresDoc/docLabel travel together: the name is only meaningful while the
  // toggle is on, and blanking it on the way off keeps a stale "Medical Certificate"
  // from resurfacing if the toggle is ever turned back on for a different reason.
  function docFields(requiresDoc, docLabel) {
    return {
      requiresDoc: !!requiresDoc,
      docLabel: requiresDoc ? ((docLabel || '').trim() || DEFAULT_DOC_LABEL) : '',
    }
  }

  // Platoons that have somebody in them on the day being looked at. Costs no read —
  // `accounts` is already in memory — and it is the whole basis of the Activity tab's
  // selector below. Declared up here because the effect under it is a hook, and a hook
  // cannot sit below the early returns.
  const peopledGroupIds = new Set(accounts.filter((a) => a.groupId && activeOn(a, selectedDate)).map((a) => a.groupId))

  // The sheet list never stands on an empty platoon. An activity cannot be created for a
  // platoon with nobody in it and cannot show anything either, so the selector does not list
  // one — and if the platoon the day screen was left on happens to be empty when the list
  // opens, it moves to the first that has people rather than leaving the screen pointed at a
  // segment the selector no longer draws. Same shape, and same reason, as the Movement guard
  // below.
  //
  // Keyed on the SCREEN, not the tab, and this is the one line in the merge that has to be
  // right: the same filter run on the day screen would hide an empty platoon there too — and
  // the day screen is where its stand-down card and its Assign Personnel button live, which
  // is the only way to stop it being empty.
  //
  // A PAST day does the same, on the day screen too. The paragraph above says the day
  // screen must keep an empty platoon listed, and that is still true of today and of any
  // day still to come — the stand-down card and its Assign Personnel button are the only
  // way to fill one, so hiding it would hide the fix. A day already gone has no fix:
  // posting somebody in now does not put them on a roll call that was taken and reported
  // last week. So on a past day an empty platoon is not a thing you can act on, it is just
  // a segment that opens a screen with nothing on it, and the selector drops it.
  // Super admin only, because he is the only one the selector is drawn for.
  useEffect(() => {
    if (!account?.isAdmin || tab !== 'today' || !activeGroupId) return
    if (openScreen !== 'activities' && !(account.isSuperAdmin && selectedDate < todayISO())) return
    if (peopledGroupIds.has(activeGroupId)) return
    const first = groups.find((g) => peopledGroupIds.has(g.id))
    if (first) setActiveGroupId(first.id)
  }, [account, tab, openScreen, activeGroupId, groups, accounts, selectedDate])

  // Movement is the one tab that can disappear out from under you — it goes the moment the
  // outfield's last day rolls over at midnight. The bar drops it while the app stays
  // pointed at it, so the screen goes blank until something else is tapped. Sits ABOVE the
  // early returns below, because a hook behind a conditional return is not a hook React
  // will accept — it changes the hook count between the login screen and the app.

  if (!seeded) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="rc-spin" size={28} color="var(--blue)" />
      </div>
    )
  }
  if (!account) {
    return <LoginScreen onLogin={handleLogin} seedError={seedError} theme={theme} setTheme={setTheme} devLogin={devLogin} />
  }

  const isAdmin = !!account.isAdmin
  // Everyone who belongs to the platoon, deferred included. Only the Count tab's
  // name lists use this: a day's record can name someone who is no longer on the
  // board, and the names have to resolve or the count stops adding up.
  const platoonAccounts = accounts.filter((a) => (a.groupId || '') === activeGroupId)
  // Who the board is for on the date being viewed. Deferred personnel drop out
  // from their deferredFrom date onward and stay put on every day before it.
  const groupAccounts = platoonAccounts.filter((a) => activeOn(a, selectedDate))
  // Members list shown in the Group tab. Admins have full account docs; regular
  // users get names only, from the roster mirror (their own doc is always included
  // even if the roster hasn't been reconciled yet).
  const groupMembersList = (() => {
    if (isAdmin || !roster) return groupAccounts
    // Roster entries are { label, mg, order } now, but tolerate the old bare-string
    // shape until the next reconcile rewrites the doc. Ordering/grouping is applied
    // downstream by groupByMiniGroup, so no sort here.
    const list = Object.entries(roster).map(([id, v]) => {
      const info = (v && typeof v === 'object') ? v : { label: v, mg: '', order: 0 }
      return { id, displayName: info.label || '', miniGroupId: info.mg || '', memberOrder: typeof info.order === 'number' ? info.order : 0 }
    })
    if (!list.some((m) => m.id === account.id)) {
      list.push({ id: account.id, displayName: memberLabel(account), miniGroupId: account.miniGroupId || '', memberOrder: memberOrderKey(account) })
    }
    return list
  })()
  const dayRecord = attendance[`${selectedDate}__${activeGroupId}`] || {}
  const dayVerifiers = attendanceVerifiers[`${selectedDate}__${activeGroupId}`] || {}
  const dayDocs = attendanceDocs[`${selectedDate}__${activeGroupId}`] || {}
  const dayBackdated = attendanceBackdated[`${selectedDate}__${activeGroupId}`] || {}
  // The logged-in user's own status always belongs to their own group, not the
  // sub-group tab currently being viewed (matters for super admins switching tabs).
  const myGroupId = account.groupId || activeGroupId
  const myDayRecord = attendance[`${selectedDate}__${myGroupId}`] || {}
  const myDayVerifiers = attendanceVerifiers[`${selectedDate}__${myGroupId}`] || {}
  const myDayVenues = attendanceVenues[`${selectedDate}__${myGroupId}`] || {}
  const myDayDocs = attendanceDocs[`${selectedDate}__${myGroupId}`] || {}
  const activeGroupObj = groups.find((g) => g.id === activeGroupId) || null
  // Today's venue for the logged-in user: their own override, then their
  // Section's / the platoon's scheduled entry for today, then the platoon
  // default. This is what check-in validates against, so it always resolves
  // against today — never the date the Today tab happens to be showing.
  const myVenueToday = effectiveVenue(account, activeGroupObj, savedLocations, todayISO())
  const activeGroupLocation = myVenueToday.loc
  // The Settings sub-tab a basic admin actually gets: their own platoon, always.
  // Derived rather than stored so the General default can't leak through to them,
  // and an admin with no platoon lands on a tab that matches nothing (empty list)
  // instead of falling back to company-wide setup.
  const adminScopedSubTab = account.isSuperAdmin ? adminSubTab : (account.groupId || '')
  // All-groups attendance total for the super admin summary pinned in the nav bar.
  // Attached personnel count as company strength ONLY while an exercise is running and
  // only for the men actually on it — the status the manifest rosters from, so the people
  // in the total are exactly the people on the vehicles. Off the exercise they go back to
  // being lent, not part of the strength. The movements listener only ever holds a
  // movement spanning today, so a past exercise resolves to null here and its attached men
  // fall back to the chip alone rather than costing a read to look up.
  const outfieldStatusOn = (day) =>
    movement && movement.date <= day && (movement.until || movement.date) >= day
      ? (movement.statusId || statuses[0]?.id || null)
      : null

  // Who was on a platoon's board for a given day. A finished day answers from its own
  // stamp, so the company count and the report to higher stay true after a man transfers —
  // otherwise both read him out of the platoon he is in NOW, find no status for him there,
  // and file him under Unmarked while his real record sits unread in the platoon he left.
  // Back-dating a report is a supported workflow, so this is the difference between sending
  // higher the right figure and the wrong one.
  function rosterOn(day, groupId) {
    const st = attendanceStamp[`${day}__${groupId}`]
    // A FROZEN day is read exactly like a past one, because that is what it is: the
    // figure has gone up the chain, so the board must show the record rather than the
    // live world. Without this an override edited in the afternoon, or a man transferred
    // out, would change what a frozen board shows while the stored record stayed put —
    // and the rules would reject any attempt to write the difference in.
    if ((day < todayISO() || (st && st.frozen)) && st && Array.isArray(st.members)) {
      const byId = {}
      accounts.forEach((a) => { byId[a.id] = a })
      return st.members.map((id) => byId[id] || { id, displayName: formerNames[id] || 'Former personnel', attached: false })
    }
    return accounts.filter((a) => (a.groupId || '') === groupId && activeOn(a, day))
  }


  // The morning count as a message you can paste into WhatsApp. `*stars*` are its bold
  // markers; everything else is plain text so it survives being pasted anywhere else.
  // Present is a number only — the point of the list is who ISN'T, and naming 200 people
  // who turned up would bury the six who didn't. Unmarked comes last and is a status like
  // the others here: nobody has said where they are, which is the thing to chase.
  function buildFmcReport() {
    // The day the card is showing, not necessarily today: tapping back to a past day and
    // copying should give you that day's report, which is how a missed morning gets sent.
    const day = selectedDate
    const primaryStatusId = statuses[0]?.id
    const people = []
    // Attached personnel are kept out of the company's strength for the same reason as on
    // the Count card — they are lent to it, not part of it — and reported in a block of
    // their own at the end, so higher gets both numbers without either distorting the
    // other.
    const attached = []
    const onExercise = outfieldStatusOn(day)
    groups.forEach((g) => {
      const entries = attendance[`${day}__${g.id}`] || {}
      rosterOn(day, g.id)
        // The full personnel name, not the nickname memberLabel prefers: this message
        // goes to higher, where a person is their name on the nominal roll.
        .forEach((a) => (a.attached ? attached : people).push({ name: (a.displayName || memberLabel(a)).toUpperCase(), statusId: entries[a.id] || null }))
    })
    // Built from the ISO parts, not toLocaleDateString: the device's locale would put
    // the month first on a US phone, and this line goes to higher in one fixed shape.
    const dayLabel = dayTag(day)
    // Attached men on the exercise are company strength for the day, but each name is
    // written once and it is written in the ATTACHED block — so they are added to the
    // headline figure here rather than folded into the status blocks. The blocks still
    // reconcile: status blocks + Unmarked + ATTACHED = TOTAL STRENGTH.
    const attachedInStrength = onExercise ? attached.filter((p) => p.statusId === onExercise).length : 0
    const lines = [
      `*FMC - ${dayLabel}*`,
      `*TOTAL STRENGTH: ${people.length + attachedInStrength}*`,
      `*PRESENT STRENGTH: ${people.filter((p) => p.statusId === primaryStatusId).length}*`,
    ]
    const block = (label, named) => {
      if (!named.length) return
      lines.push('', `*${label.toUpperCase()}: ${named.length}*`, ...named.map((p) => p.name))
    }
    statuses.slice(1).forEach((s) => block(s.label, people.filter((p) => p.statusId === s.id)))
    block('Unmarked', people.filter((p) => !p.statusId))
    // Each name carries its own status inline rather than sitting under status headings:
    // the block is short, and it is read out as one list. Matches the ATTACHED chip on the
    // card — men with no status against their name are not counted or listed.
    const accountedFor = attached.filter((p) => p.statusId)
    if (accountedFor.length) {
      lines.push('', `*ATTACH: ${accountedFor.length}*`, ...accountedFor.map((p) => {
        const label = (statuses.find((st) => st.id === p.statusId) || {}).label || ''
        return label ? `${p.name} (${label.toUpperCase()})` : p.name
      }))
    }
    return lines.join('\n')
  }
  async function copyFmcReport() {
    try { await navigator.clipboard.writeText(buildFmcReport()) } catch (e) {}
    setCopiedReport(true)
    setTimeout(() => setCopiedReport(false), 1500)
  }

  // Only on a date that has one. An admin gets it off the shared manifest; a member gets
  // it off their own card, which carries their vehicle and its crew — so a member never
  // reads the (company-wide, admin-only) manifest and neither pays a read to find out.
  // A member keeps the tab for as long as he is on ANY manifest, not only one running
  // today: next week's move-out is the thing he most wants to look up, and the selector
  // above lets him pick which of the two he is looking at.
  // One date row in the nav bar, and one date behind it. The Activity screens used to carry
  // their own `activityDate`, kept apart so that paging one tab back a day did not move the
  // other — a real problem when they were two tabs read side by side. Inside one tab it is
  // the opposite problem: one screen cannot show two days, and the sheet you open belongs to
  // the day the card above it is captioned with.
  const navDate = selectedDate
  const setNavDate = setSelectedDate
  // Whether the nav bar is carrying a date row at all. It governs THREE things that only
  // make sense together — the row itself, the platoon selector's bottom margin, and the nav
  // bar's own bottom padding — so it is one flag rather than three copies of the condition.
  // Miss any one of them and the row lands hard against the platoon pills with too much air
  // under it, which is exactly what the Activity tab did before this existed.
  //
  // Stays up while a roster is OPEN, which it used not to. A sheet belongs to a day, and
  // the roster showed only its name — so marking a past day, the one fact that decides
  // whether the ticks are going anywhere sensible was the one fact not on screen.
  // A member's board keeps the arrow row; an admin picks his day on the calendar and the
  // row he gets on a board is the caption below.
  //
  // An ADMIN gets it only once a screen is open, where it is a caption saying which day these
  // ticks are going onto; on his day screen the calendar below is already the date control and
  // every card is captioned. A MEMBER gets it on every screen of the tab — the arrow row IS
  // how he changes his day, and behind the Activities row the same row carries his way back.
  const showDateNav = tab === 'today' && (isAdmin ? !!openScreen : true)
  // The merged tab's two layers, named once. `todayCards` is the company screen — admins
  // only, nothing open. `todayBoard` is one platoon's board, which is what a member always
  // sees and what an admin sees once he has opened one.
  const todayCards = tab === 'today' && isAdmin && !openScreen
  const todayBoard = tab === 'today' && (!isAdmin ? !openScreen : openScreen === 'board')
  // The sheet list and everything under it. A member reaches it too — his is MyActivityView,
  // the same screen from the other end.
  const activitiesOpen = tab === 'today' && openScreen === 'activities'
  // The ONE place inside the activity screens that still offers platoons: a company sheet
  // held open. That sheet is one sheet run in five platoons, so switching is a move between
  // two halves of the same thing and you are marking the same roster either side.
  //
  // The sheet LIST no longer does. It used to carry the full selector, and Roy's objection is
  // that it made the list a second place to choose a platoon: the day screen already has
  // one, and having two meant the platoon could change under you on a screen whose whole job
  // is to show one platoon's sheets. Going back to Summary and picking there is one more tap
  // and no ambiguity. What stands in its place is a label — see the solo pill in the header.
  //
  // A platoon sheet held open has no selector either, and never did: it exists in one platoon
  // and nowhere else, so there is nothing to switch to.
  const activityKeepsSelector = activitiesOpen && !!activityOpen && activityScope === 'company'
  // Where the platoon on screen sits in the list the pills are built from, so a swipe and
  // a tap always agree on what "next" means. Shared by both swiping tabs.
  // Which platoons the selector offers. Every tab gets all of them except the ACTIVITY tab,
  // which drops the platoons that have nobody in them.
  //
  // Not a display tidy-up — those segments have nothing behind them. A platoon with no
  // personnel cannot have an activity created for it, platoon-scoped or otherwise, and a
  // company sheet duplicated into it can only ever say "Nobody in this Platoon yet". On a
  // sheet you are working through, each one is a swipe between the platoons that do have
  // people.
  //
  // The Activity tab only. On Today an empty platoon still has to be reachable: the board
  // is where you notice it is empty, and the Admin tab is where you go and fill it.
  //
  // The active platoon is kept in the list even when it fails the test, so the render
  // between arriving on this tab and the effect above moving you off cannot leave the
  // selector with no active segment and the swipe with no neighbours.
  //
  // One selector, ONE memory behind it now. The Activity screens used to keep a platoon of
  // their own, which was right while they were a tab beside Today: switching tabs should not
  // have walked you across the company. They are a screen INSIDE Today now — one selector,
  // one thing it selects — so a second memory would mean tapping Activities silently changed
  // which platoon you were reading, which is the bug the split existed to prevent.
  //
  // The Platoon tab keeps its own (`groupTabGroupId`): still a different tab, still a
  // different job.
  // Empty platoons drop out on the sheet list and on any day already past — see the effect
  // above for why those two and not the day screen's today. `|| g.id === activeGroupId` is
  // the belt to that effect's braces: it keeps the pill the screen is actually on drawn for
  // the one render before the effect moves off it, so the track never shows a highlight on
  // nothing.
  const selectorGroups = (activitiesOpen || selectedDate < todayISO())
    ? groups.filter((g) => peopledGroupIds.has(g.id) || g.id === activeGroupId)
    : groups
  // Where an empty platoon gets filled: the Admin tab's Unassigned sub-tab, holding everyone
  // with no platoon. Super admin only — `adminScopedSubTab` pins a platoon admin to his own
  // platoon, so there is no Unassigned tab for him to be sent to, and posting people between
  // platoons is not his to do. Undefined for him, which is what makes the stand-down fall
  // back to telling him where it happens instead of offering a button that goes nowhere.
  const goAssignPersonnel = account.isSuperAdmin ? (() => { setAdminSubTab('unassigned'); setTab('admin') }) : undefined
  const activeGroupIdx = selectorGroups.findIndex((g) => g.id === activeGroupId)
  const prevGroupId = activeGroupIdx > 0 ? selectorGroups[activeGroupIdx - 1].id : ''
  const nextGroupId = activeGroupIdx >= 0 && activeGroupIdx < selectorGroups.length - 1 ? selectorGroups[activeGroupIdx + 1].id : ''
  // The Platoon tab's own neighbours. Same shape as the three above, off its own platoon,
  // because browsing this tab must not move the one Today is pointed at.
  const groupTabIdx = groups.findIndex((g) => g.id === groupTabGroupId)
  const groupTabPrevId = groupTabIdx > 0 ? groups[groupTabIdx - 1].id : ''
  const groupTabNextId = groupTabIdx >= 0 && groupTabIdx < groups.length - 1 ? groups[groupTabIdx + 1].id : ''
  const canPageGroups = !!account.isSuperAdmin && groups.length > 1
  // Swipeable exactly when the pills are up. On a platoon-only sheet there is no selector,
  // because that sheet exists in one platoon and nowhere else — so there is nothing to
  // swipe to either, and the gesture goes with it.
  const groupSwipe = canPageGroups && tab === 'group'
  // Every screen of the merged tab. On the day screen the swipe moves the platoon card and
  // the calendar under it; on a board it moves the board; on the sheet list it moves the
  // list. Same gesture, same pills, same `activeGroupId` — which is why one flag covers all
  // three, where there used to be one for Today and a second for Activity.
  //
  // The exception is a PLATOON-scoped sheet held open: it exists in one platoon and nowhere
  // else, so there is nothing to swipe to and the pills are not up either.
  const todaySwipe = canPageGroups && tab === 'today' && (openScreen !== 'activities' || activityKeepsSelector)
  // Settings pages the pills that ARE there: General and Unassigned are not platoons, but
  // they are two of the segments, and a swipe that skipped them would disagree with the
  // control above it.
  const adminTabIds = ['general', ...groups.map((g) => g.id), 'unassigned']
  const adminIdx = adminTabIds.indexOf(adminScopedSubTab)
  const adminPrevId = adminIdx > 0 ? adminTabIds[adminIdx - 1] : ''
  const adminNextId = adminIdx >= 0 && adminIdx < adminTabIds.length - 1 ? adminTabIds[adminIdx + 1] : ''
  const adminSwipe = !!account.isSuperAdmin && tab === 'admin' && isAdmin
  // Which tabs carry their platoon selector BELOW the nav bar's separator instead of
  // inside it. Count joins Activity: on both, everything above the line is the company's
  // — the sheet and the day, or the FMC total — and everything below belongs to one
  // platoon, so the pills read as the boundary between the two rather than as one more
  // row of header.
  const pinnedSelector = account.isSuperAdmin && isAdmin
    && tab === 'today' && (openScreen !== 'activities' || activityKeepsSelector)
  // With a sheet open the date is a CAPTION, not a control: it says which day these ticks
  // are going onto, and that is all it is for. Left live, every one of its three ways to
  // change the day — either arrow, the picker, the Today pill — closed the sheet out from
  // under you, because a sheet belongs to the day it was made for. A control whose only
  // effect is to end what you are doing should not look like one.
  //
  // Every screen an admin opens gets the caption, the sheet list included: the arrows used to
  // live there and have gone with the merge, because one tab cannot hold two dates and the
  // calendar on the day screen is where the day is chosen now.
  const dateNavStatic = !!openScreen
  // Whether a selector comes next INSIDE the nav bar, which is what the toolbar's bottom
  // margin is spacing itself from. Today only now: the Activity tab's selector moved below
  // the separator, so what follows the toolbar there is the sheet's summary card instead —
  // which the next line accounts for.
  // 8px under the Share/Scan pair when something with a BODY comes next, which is now only
  // an open sheet's summary card. 4px is the case it was tuned on: a bare date row, a line
  // of text that needs no air of its own — and that is what follows on Today too, since the
  // platoon selector moved out from under the toolbar to below the separator.
  // 8px when the row under the toolbar carries a back pill — an open activity sheet, or an
  // open board. That row is a pill and a date rather than a bare line of text, and at 4px it
  // sat 2px under the Share/Scan pair while the Activity tab's identical row sat at 6. Same
  // control, same place, same air around it.
  const toolbarGap = (isAdmin && !!openScreen) ? '0 0 8px' : '0 0 4px'
  // The tabs as data rather than six conditional elements, because the sliding pill
  // needs to know how many there are and which one is active — and that is exactly
  // what the old hand-counted tabCount was reconstructing.
  //
  // Movement sits with Today and Count rather than after Personnel. The tabs that come
  // and go on a given day lead; Platoon and Personnel are the reference behind them and
  // do not move. On a move-out morning the board, the tally and the trucks are the three
  // an admin works from, and a member opening the app to find his vehicle should not
  // have to pass his own record to reach it.
  // Manifests is the home tab and is ALWAYS present — this app has one job, and a tab
  // that came and went with the work (PULSE 92's Movement tab) made the home screen
  // move under you. A rider with no seat gets the tab and an empty state, not no tab.
  const tabDefs = [
    { id: 'movement', icon: Truck, label: 'Manifests' },
    { id: 'group', icon: UsersGroup, label: 'Platoon' },
    { id: 'account', icon: UserCircle, label: 'Personnel' },
    isAdmin && { id: 'admin', icon: Settings, label: 'Admin' },
  ].filter(Boolean)
  const tabCount = tabDefs.length
  const tabIndex = tabDefs.findIndex((t) => t.id === tab)
  const tabIconSize = tabCount >= 6 ? 18 : 22

  // Who is on the manifest's roster today. A platoon admin may only read their OWN
  // platoon's day doc (firestore.rules attendance block), so they cannot derive the
  // company roster at all — they get their own platoon and no company denominator.
  // Their view of everyone already seated still works, because those names ride on the
  // manifest document itself.
  // Takes the manifest rather than reading `movement`, so the page swipe can build the
  // OTHER kind's roster without becoming it first.
  function movementRosterFor(mv) {
    if (!mv || !isAdmin) return null
    const movement = mv
    // The manifest's OWN date, not today. A move-out is planned days ahead, and the men on
    // it are marked ahead too (the status picker's Duration dropdown, which already names
    // this manifest's last day). Reading today's board would show an empty roster right up
    // until the morning, which is the one morning nobody has time to build a manifest.
    const day = movement.date
    const sourceId = movement.statusId || statuses[0]?.id
    const scope = account.isSuperAdmin ? groups : groups.filter((g) => g.id === account.groupId)
    // EVERY man on strength, not the ones marked for it. A manifest is a plan, drawn up
    // before anyone can know who will be on MC that morning, and a plan you can only draw
    // from people already marked is a plan you have to fake the roll call to make.
    //
    // `sourceId` survives as the EXPECTED status, not as a filter: it is what the manifest
    // is compared against once the day arrives (see movementDayStatuses). Nothing here
    // writes a status, and nothing about a status decides who may be seated.
    const people = []
    scope.forEach((g) => {
      accounts.forEach((a) => {
        if ((a.groupId || '') !== g.id || !activeOn(a, day)) return
        people.push(a)
      })
    })
    return { people, sourceId, companyWide: !!account.isSuperAdmin }
  }
  const movementRoster = movementRosterFor(movement)

  // What the board actually says, for the manifest's own day, keyed by account. The plan is
  // compared against this on screen and NEVER written back to it.
  //
  // Free: the manifest's day is already subscribed for both admin kinds — the super admin's
  // all-groups listener and the platoon admin's single getDoc — so reading it again here
  // costs nothing. Entries are plain status ids.
  function movementDayStatusesFor(mv) {
    if (!mv || !isAdmin) return {}
    const scope = account.isSuperAdmin ? groups : groups.filter((g) => g.id === account.groupId)
    const out = {}
    scope.forEach((g) => Object.assign(out, attendance[`${mv.date}__${g.id}`] || {}))
    return out
  }
  const movementDayStatuses = movementDayStatusesFor(movement)

  // The manifest kinds that actually EXIST — the same list the segmented control is built
  // from, hoisted so a swipe and a tap can never disagree about what is next to what. An
  // admin counts a manifest; a member counts a SEAT on one.
  const mvKindsShown = MV_KINDS.filter((k) => (account.isAdmin ? !!movements[k] : mySeats.some((x) => x.kind === k)))
  const mvIdx = mvKindsShown.indexOf(mvKind)
  const mvPrevKind = mvIdx > 0 ? mvKindsShown[mvIdx - 1] : ''
  const mvNextKind = mvIdx >= 0 && mvIdx < mvKindsShown.length - 1 ? mvKindsShown[mvIdx + 1] : ''
  // Two pages at most, and only when both manifests are running. Everyone who sees the
  // segments gets the gesture — a member with a seat on each kind included.
  const movementSwipe = tab === 'movement' && mvKindsShown.length > 1

  // Minutes this admin's shared location will still let personnel check in. This
  // number IS the explanation the Personnel Check-In card used to spell out in a
  // paragraph, which is why the button wears it as its label.
  const myShare = adminLocations[account.id]
  const shareLeft = myShare
    ? Math.max(0, Math.ceil((myShare.updatedAt + (checkinSettings.freshnessMinutes || DEFAULT_FRESHNESS_MINUTES) * 60000 - Date.now()) / 60000))
    : 0
  // All three states use the status pills' recipe: a 25% tint of the hue, ink at
  // --tint-ink-strong, and an outline in that same ink. Worth stating why it's the
  // pills' numbers and not a set of its own — 25% and --tint-ink-strong are a
  // calibrated PAIR. The strong token exists because a pale hue on a 25% wash of
  // itself fails 4.5:1, and it is tuned against that exact fill; a 25% tint carrying
  // the lighter --tint-ink-mix would be a fill and an ink from two different recipes.
  // A tint rather than the solid blue these used to be: .seg-pill — the platoon
  // selector's sliding pill, 8px below — is solid var(--blue) too, so two identical
  // fills sat stacked with nothing telling them apart. Tinting keeps the blue
  // identity while leaving the solid fill to mean one thing in this bar, "the
  // platoon you're looking at", and it makes all three share states the same shape
  // in three colours.
  const SHARE_FRESH_TINT = 'color-mix(in srgb, var(--green) 25%, transparent)'
  const SHARE_FRESH_INK = 'color-mix(in srgb, var(--green) var(--tint-ink-strong), var(--text))'
  const TOOL_TINT = 'color-mix(in srgb, var(--blue) 25%, transparent)'
  const TOOL_INK = 'color-mix(in srgb, var(--blue) var(--tint-ink-strong), var(--text))'
  // Green means the share is live, red means it never went out. Neither is a solid
  // fill because this label is 12px bold — white on #FF3B30 is 3.9:1, short of the
  // 4.5:1 that text this small needs, while ink blended toward --text clears it in
  // both themes.
  const SHARE_ERR_TINT = 'color-mix(in srgb, var(--red) 25%, transparent)'
  const SHARE_ERR_INK = 'color-mix(in srgb, var(--red) var(--tint-ink-strong), var(--text))'
  // The outline is the hue itself, not the ink, and at FULL strength — the same solid
  // edge BLUE_EDGE draws on every other tinted blue control in the app. It was 45%, which
  // on a 25% fill of the same hue is barely an edge at all: the pair read as two washes
  // floating in the bar rather than two buttons. All three states move together, because
  // they are one shape in three colours and an edge weight that changed with the state
  // would be the one thing about them that is not just the hue.
  const SHARE_FRESH_EDGE = 'var(--green)'
  const TOOL_EDGE = 'var(--blue)'
  const SHARE_ERR_EDGE = 'var(--red)'
  // Today only, and for the reason the old card gave: sharing a location and scanning
  // a QR both write to the CURRENT day whatever date is on screen, so on a past day
  // they would quietly do something else.

  return (
    <div className="screen">
      {/* 3px under the date, where the class carries 10 and this tab used to carry 0.
          Zero left the date sitting on the separator; this rides close to it without
          touching. The date row is not as tight as the number looks — the arrows beside
          it carry 4px of padding they hand straight back to the layout, so there is
          empty air inside the row below the letters before this 2 even starts.
          This number and the platoon scroller's margin below are ONE pair: the separator
          is wherever the nav bar's content ends plus this padding, so every pixel taken
          off here has to be given to that margin, or the separator walks up the screen.
          They were 6 and -1; they are 3 and 2, which is the same total and the date row
          three pixels lower. */}
      {/* 3 with a date row last, 7 with a card. Both are 3px of gap to the eye: the date
          sits in a box carrying 4px of its own padding under the letters, so the ink stops
          7px clear of the line, while a card's background runs to its edge and 3 is 3. The
          10px default is neither — it is room for a segmented track's reserved scrollbar to
          tuck into, and on these two tabs the track has moved below the line. */}
      <div className="nav-bar" style={showDateNav ? { paddingBottom: 3 } : pinnedSelector ? { paddingBottom: 7 } : undefined}>
        {/* No margin under the title row, and a slightly wider one under the name line
            below it. The two look lopsided when they match: even at line-height 1 the
            title's line box carries empty leading beneath its capitals, so the air
            above the name is bigger than the number says. The uneven pair is what
            makes the two gaps look even.
            line-height 1 is also what brings the title box down to the height of the
            Sign Out pill beside it — at `normal` it ran 37px against the pill's 29px
            and pushed the whole row taller for space no glyph was using. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <h1 className="large-title" style={{ lineHeight: 1 }}>VManifest 92</h1>
          {/* Both are pills on the separator fill — the same neutral chip the rest of the
              app uses — so they read as controls against the nav bar rather than as two
              bits of grey text beside the title. The gap tightens with them, since each
              now carries its own padding. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={handleRefresh} disabled={refreshState !== 'idle'} aria-label="Refresh" style={{ background: 'var(--separator)', border: 'none', display: 'flex', alignItems: 'center', color: 'var(--text)', padding: 6, borderRadius: 999, opacity: refreshState === 'idle' ? 1 : 0.4 }}>
              <RefreshCw size={16} className={refreshState === 'loading' ? 'rc-spin' : ''} />
            </button>
            <button onClick={handleLogout} style={{ background: 'var(--separator)', border: 'none', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px 6px 10px', borderRadius: 999, color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
        {/* Who you are, and nothing else. The DAY briefly lived on the right of this line,
            while it would not fit on the card below beside three pills. It fits again at
            11px, and it belongs on the card: a caption over the numbers it is the day for,
            not a line of its own above them. */}
        <p className="nav-subtitle" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {/* The unit sits between the person and their platoon, so the line reads
              from the individual outward. FMC is a constant here for the same reason
              the report header at the top of this file hardcodes it — the app serves
              one unit, and there is no account field to read it from. */}
          {[account.displayName || account.username, 'FMC', groups.find((g) => g.id === account.groupId)?.name].filter(Boolean).join(' · ')}
        </p>
        {/* A super admin is the only person still in the app while this is on, and
            the only one who can lift it, so the notice rides on every tab rather
            than living in Settings where it would be out of sight. */}
        {lockdown && account.isSuperAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
            {/* The tint stops short of the button rather than running the full width,
                so the button reads as its own control instead of something inside
                the message. */}
            {/* An edge, like the chip beside it. BANNER_EDGE reads currentColor, so the
                bar carries the ink itself and the two are struck from one recipe rather
                than a tint being outlined by a second opinion. */}
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0, padding: '8px 10px', borderRadius: 10, background: LOCKDOWN_TINT, border: BANNER_EDGE, color: LOCKDOWN_INK }}>
              <Ban size={16} color={LOCKDOWN_INK} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, fontSize: 12, fontWeight: 500, color: LOCKDOWN_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Lockdown Mode</span>
            </span>
            <BannerChip onClick={() => saveLockdown(false)} style={{ background: LOCKDOWN_TINT, color: LOCKDOWN_INK }}>Turn Off</BannerChip>
          </div>
        )}
        {/* The manifest on screen is still being written. Up here rather than inside the card
            because it is a state the whole tab is in, not a row of it — and because the card
            it used to sit in is the very thing being edited, so the notice moved every time
            the manifest grew. Only on the Movement tab: it is the only place it means
            anything, and an admin on the Today board does not need telling. */}
        {tab === 'movement' && account.isAdmin && movements[mvKind] && movements[mvKind].published === false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0, padding: '8px 10px', borderRadius: 10, background: DRAFT_TINT, border: BANNER_EDGE, color: DRAFT_INK }}>
              <Pencil size={16} color={DRAFT_INK} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, fontSize: 12, fontWeight: 500, color: DRAFT_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Draft Mode</span>
            </span>
            {/* Seating is every admin's job — a platoon sergeant knows his own men and fills
                his half of the manifest. Deciding the company has been TOLD is not: publishing
                puts a vehicle on every phone at once, and taking it back down does too. Both
                belong to the super admin. A platoon admin still sees the banner, because it is
                the answer to "why can my men not see this yet". */}
            {account.isSuperAdmin && (
              <BannerChip onClick={() => setMovementPublished(movements[mvKind].id, true)} style={{ background: DRAFT_TINT, color: DRAFT_INK }}>Publish</BannerChip>
            )}
          </div>
        )}
        {account.isSuperAdmin && tab === 'group' ? (
          /* The Platoon tab's, and only its. Today, Count and Activity carry theirs BELOW
             the nav bar's separator instead — see pinnedSelector. The wrapper's 8px of
             padding is pulled back out by a -8px margin, so the reserved scrollbar strip
             tucks into the nav bar's own bottom padding and the separator stays level with
             every other tab. */
          <div className="segmented-scroll">
            <div className="segmented">
              <span className="seg-pill" />
              {groups.map((g) => (
                <button key={g.id} className={groupTabGroupId === g.id ? 'active' : ''} onClick={() => setGroupTabGroupId(g.id)}>{g.name}</button>
              ))}
            </div>
          </div>
        ) : tab === 'admin' && account.isSuperAdmin ? (
          /* Super admin only. A basic admin administers one platoon and lands on it
             automatically (adminScopedSubTab), so there is nothing here for them to
             switch between — no General, no other platoons, no Unassigned. */
          <div className="segmented-scroll">
            <div className="segmented">
              <span className="seg-pill" />
              <button className={adminSubTab === 'general' ? 'active' : ''} onClick={() => setAdminSubTab('general')}>General</button>
              {groups.map((g) => (
                <button key={g.id} className={adminSubTab === g.id ? 'active' : ''} onClick={() => setAdminSubTab(g.id)}>{g.name}</button>
              ))}
              <button className={adminSubTab === 'unassigned' ? 'active' : ''} onClick={() => setAdminSubTab('unassigned')}>Unassigned</button>
            </div>
          </div>
        ) : tab === 'movement' ? (() => {
          /* Which manifest is on screen. The same control the platoon tabs use, in the same
             place, because it answers the same question — which of these am I looking at.
             Every admin, not only a super admin: a platoon admin seats his own men on
             whichever manifest is running.

             Only the manifests that EXIST, for everyone. A segment for a kind nobody has
             set up leads to an empty screen, and it is not how one gets made anyway: both
             kinds are created from Admin › Vehicle Manifest, which is also the only route
             when there is no manifest at all and this whole tab is hidden.

             An admin counts a manifest as existing; a member counts a SEAT on one. A draft
             writes no seat cards, so a manifest still being built does not exist for him —
             which is the one thing Draft Mode is for. On a single kind the lone segment
             fills the track, reading as a label rather than a choice he failed to make. */
          const kinds = mvKindsShown
          if (!kinds.length) return null
          return (
            <div className={`segmented segmented--fill${kinds.length === 1 ? ' segmented--solo' : ''}`}>
              <span className="seg-pill" />
              {kinds.map((k) => (
                <button key={k} className={mvKind === k ? 'active' : ''} onClick={() => setMvKind(k)}>
                  {k === 'activity' ? 'Activity' : 'Outfield'}
                </button>
              ))}
            </div>
          )
        })() : tab === 'account' ? (
          <div className="segmented segmented--auto">
            <span className="seg-pill" />
            <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}>System</button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', userSelect: 'none', marginLeft: 'auto' }}>
              Theme<SunMoon size={14} />
            </span>
          </div>
        ) : null}
      </div>

      {/* The platoon selector, BELOW the nav bar's separator rather than
          inside it — and outside the scrolling area, so it is pinned without needing
          `position: sticky` or a background to hide anything passing behind it. It is a
          flex sibling of the scroller and simply takes its own height.
          It sits here because this is the control closest to what it changes: the header
          above the line describes the sheet and the day, and everything below the line is
          one platoon's — the pills are the boundary between the two.
          5px of bottom padding, Roy's number. The track is a 999px pill, and with the strip
          ending flush at its bottom edge its rounded corner met the roster's straight
          clipped edge and pinched a dark wedge between the two curves; any clear band at
          all separates them. It is also where .segmented-scroll's reserved scrollbar
          paints — 8px of it into 5px of room, so on a desktop the last 3px cross the list.
          iOS draws that bar as an overlay only while a finger is moving, which is the case
          this is built for.
          Today, Count and Activity. The Platoon tab still keeps its selector in the nav
          bar, which is why this is a second copy of the track rather than the same one
          moved. */}
      {pinnedSelector && (
        <div style={{ flexShrink: 0, background: 'var(--nav-bg)', padding: '8px 16px 5px' }}>
          <div className="segmented-scroll">
            <div className="segmented">
              <span className="seg-pill" />
              {selectorGroups.map((g) => (
                <button key={g.id} className={activeGroupId === g.id ? 'active' : ''} onClick={() => setActiveGroupId(g.id)}>{g.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Above the swipe, not inside it. It was inside each platoon's page, which meant two
          identical copies sliding past each other every time a super admin paged between
          platoons — the card and the calendar under it change, these do not. Out here it sits
          still while they slide, the way the platoon selector above it already does.

          PINNED, a sibling of the scroller rather than its first child, so it stays under the
          selector while the card and the calendar scroll beneath it. It costs that height on
          the day screen — and only there, since the whole block is gated on `todayCards` and
          a board or a sheet list is not carrying it.

          Not on an empty platoon. There is no roll call to take and no sheet to open, and the
          stand-down card below is the whole answer — the same test the card and the calendar
          use, so all three appear and disappear together. */}
      <div
        ref={scrollRef}
        className="rc-scroll"
        style={{ flex: 1, padding: 16, paddingTop: 10, paddingBottom: 90, position: 'relative', overflowX: todaySwipe || groupSwipe || adminSwipe || movementSwipe ? 'hidden' : undefined }}
      >
        {tab === 'group' && (() => {
          // One platoon's Personnel list. It costs nothing to draw a neighbour: a super
          // admin already holds every account, so the page beside this one is a filter over
          // memory rather than a read. A neighbour is inert, so it gets no setter — and it
          // cannot open a member card, which is this screen's only other state.
          const groupPage = (gid, live) => (
            <GroupMembersView
              groupAccounts={isAdmin ? accounts.filter((a) => (a.groupId || '') === gid && activeOn(a, selectedDate)) : groupMembersList}
              account={account} accountFields={accountFields}
              myGroup={groups.find((g) => g.id === gid) || null} groupFields={groupFields}
              setAccountInfo={live ? setAccountInfo : SWIPE_NOOP}
              savedLocations={savedLocations} locationsReady={locationsReady}
              onAssignPersonnel={live ? goAssignPersonnel : undefined}
            />
          )
          return (
            <SwipePages
              enabled={groupSwipe}
              hasPrev={!!groupTabPrevId} hasNext={!!groupTabNextId}
              onPrev={() => setGroupTabGroupId(groupTabPrevId)}
              onNext={() => setGroupTabGroupId(groupTabNextId)}
              prev={groupSwipe && groupTabPrevId ? groupPage(groupTabPrevId, false) : null}
              next={groupSwipe && groupTabNextId ? groupPage(groupTabNextId, false) : null}
            >
              {groupPage(groupTabGroupId, true)}
            </SwipePages>
          )
        })()}
        {tab === 'account' && (
          /* The live row, not the session's `account`. `account` is written once at login
             and never listens, so an admin setting a man's Rank from the member card did
             not reach this screen until the next Refresh or sign-in. `accounts` already
             carries his own document — a regular user's listener is a __name__ query on
             exactly that one doc — so reading it here costs nothing and adds no fan-out.
             Falls back to `account` for the moment before the first snapshot lands. */
          <AccountView
            account={accounts.find((a) => a.id === account.id) || account} changeMyPassword={changeMyPassword} accountFields={accountFields} setAccountInfo={setAccountInfo}
            myGroup={groups.find((g) => g.id === account.groupId) || null} savedLocations={savedLocations} locationsReady={locationsReady}
          />
        )}
        {tab === 'movement' && isAdmin && movement && movementRoster && (() => {
          // One manifest. A neighbour is inert, so nothing that seats a man or publishes a
          // plan reaches it — a page parked off the side of the screen must not be able to
          // change a manifest nobody is looking at.
          const mvPage = (kind, live) => {
            const mv = movements[kind] || null
            const roster = movementRosterFor(mv)
            if (!mv || !roster) return null
            return (
              // Keyed on the manifest, so switching kinds is a FRESH screen rather than
              // the old one handed new props. Without it MovementView keeps the state it
              // worked out at mount — above all "a single-vehicle manifest opens itself",
              // which is decided once from whichever manifest happened to be up first. The
              // page swipe made that visible (the peek is a new instance and obeyed the
              // rule; the page you landed on did not), but the pills always did it too.
              <MovementView
                key={mv.id}
                movement={mv} roster={roster} dayStatuses={movementDayStatusesFor(mv)} accounts={accounts} groups={groups} statuses={statuses} account={account}
                assignToVehicle={live ? assignToVehicle : SWIPE_NOOP} setMovementRole={live ? setMovementRole : SWIPE_NOOP} unassignFromMovement={live ? unassignFromMovement : SWIPE_NOOP}
                setMovementPublished={live ? setMovementPublished : SWIPE_NOOP}
                onSetUpVehicles={live ? (() => setMovementSetupOpen(true)) : SWIPE_NOOP}
              />
            )
          }
          return (
            <SwipePages
              enabled={movementSwipe}
              hasPrev={!!mvPrevKind} hasNext={!!mvNextKind}
              onPrev={() => setMvKind(mvPrevKind)}
              onNext={() => setMvKind(mvNextKind)}
              prev={movementSwipe && mvPrevKind ? mvPage(mvPrevKind, false) : null}
              next={movementSwipe && mvNextKind ? mvPage(mvNextKind, false) : null}
            >
              {mvPage(mvKind, true)}
            </SwipePages>
          )
        })()}
        {tab === 'movement' && !isAdmin && (
          <SwipePages
            enabled={movementSwipe}
            hasPrev={!!mvPrevKind} hasNext={!!mvNextKind}
            onPrev={() => setMvKind(mvPrevKind)}
            onNext={() => setMvKind(mvNextKind)}
            prev={movementSwipe && mvPrevKind ? <MyMovementView seat={mySeats.find((x) => x.kind === mvPrevKind) || null} kind={mvPrevKind} account={account} /> : null}
            next={movementSwipe && mvNextKind ? <MyMovementView seat={mySeats.find((x) => x.kind === mvNextKind) || null} kind={mvNextKind} account={account} /> : null}
          >
            <MyMovementView seat={mySeats.find((x) => x.kind === mvKind) || null} kind={mvKind} account={account} />
          </SwipePages>
        )}
        {tab === 'admin' && isAdmin && (() => {
          // One Settings page. Only two things differ between them, and both are about
          // being the page in front: which segment it is, and the pending card. That card
          // is a PORTAL — it would open over the screen from a page parked off the side of
          // it — so a neighbour is given neither the popup nor the setter that clears it.
          const adminPage = (sub, live) => (
          <AdminView
            accounts={accounts} groups={groups} statuses={statuses} checkinSettings={checkinSettings} account={account}
            createAccount={createAccount} removeAccount={removeAccount} returnToPlatoon={returnToPlatoon} addGroup={addGroup} removeGroup={removeGroup} renameGroup={renameGroup}
            reorderGroup={reorderGroup} setGroupOrder={setGroupOrder} setAccountGroup={setAccountGroup}
            addMiniGroup={addMiniGroup} renameMiniGroup={renameMiniGroup} removeMiniGroup={removeMiniGroup} reorderMiniGroup={reorderMiniGroup} setMiniGroupOrder={setMiniGroupOrder}
            setAccountMiniGroup={setAccountMiniGroup} reorderMember={reorderMember}
            lockdown={lockdown} saveLockdown={saveLockdown}
            setAccountPassword={setAccountPassword}
            setAccountDisplayName={setAccountDisplayName} setAccountNickname={setAccountNickname} setAccountUsername={setAccountUsername}
            renameMigratedAccount={renameMigratedAccount}
            deviceLogins={live ? deviceLogins : {}} clearDeviceLock={live ? clearDeviceLock : SWIPE_NOOP}
            setLockoutsOpen={live ? setLockoutsOpen : SWIPE_NOOP}
            setGroupInfo={setGroupInfo}
            groupFields={groupFields} addGroupField={addGroupField} removeGroupField={removeGroupField} reorderGroupField={reorderGroupField} setGroupFieldOrder={setGroupFieldOrder} renameGroupField={renameGroupField}
            accountFields={accountFields} addAccountField={addAccountField} removeAccountField={removeAccountField} reorderAccountField={reorderAccountField} setAccountFieldOrder={setAccountFieldOrder} renameAccountField={renameAccountField} setAccountFieldEditable={setAccountFieldEditable} setAccountInfo={setAccountInfo} setAccountRole={setAccountRole}
            adminSubTab={sub} setAdminSubTab={live ? setAdminSubTab : SWIPE_NOOP}
          />
          )
          return (
            <SwipePages
              enabled={adminSwipe}
              hasPrev={!!adminPrevId} hasNext={!!adminNextId}
              onPrev={() => setAdminSubTab(adminPrevId)}
              onNext={() => setAdminSubTab(adminNextId)}
              prev={adminSwipe && adminPrevId ? adminPage(adminPrevId, false) : null}
              next={adminSwipe && adminNextId ? adminPage(adminNextId, false) : null}
            >
              {adminPage(adminScopedSubTab, true)}
            </SwipePages>
          )
        })()}
      </div>

      {/* The Movement tab comes and goes with the work: it exists only on a date that
          has a manifest, which is a handful of days a year. Six tabs or more compacts
          the bar (see .tab-bar.compact) — the icon shrinks with it so the extra width
          reads as breathing room rather than bigger buttons. */}
      <div ref={setTabBarRef} className={`tab-bar${tabCount >= 6 ? ' compact' : ''}${tabCount >= 7 ? ' compact-7' : ''}`} style={{ '--tabs': tabCount, '--i': Math.max(tabIndex, 0) }}>
        {/* Hidden only in the gap where the open tab no longer exists — the Movement
            tab disappearing out from under you — so the pill never sits on a tab
            you aren't actually looking at. */}
        <span className="tab-pill" style={{ opacity: tabIndex < 0 ? 0 : 1 }} />
        {tabDefs.map((t) => (
          <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={t.icon} label={t.label} size={tabIconSize} />
        ))}
      </div>
      {movementSetupOpen && (
        <PopupCard title="Vehicle Manifest" icon={Truck} open maxHeight="80vh" trigger={<span />}
          onOpen={() => {}}
          onClose={() => { setMvSetupBack(null); setMovementSetupOpen(false) }}
          onBack={mvSetupBack || undefined}>
          <MovementSetupCard
            onBackChange={(fn) => setMvSetupBack(() => fn)}
            movements={movements} fleet={movementFleet} statuses={statuses}
            onDone={() => setMovementSetupOpen(false)}
            eventFrom={(groups[0] || {}).eventFrom || ''} eventTo={(groups[0] || {}).eventTo || ''}
            saveMovement={saveMovement} removeMovement={removeMovement} removeMovementVehicle={removeMovementVehicle}
            setVehicleParty={setVehicleParty} setMovementRange={setMovementRange} setMovementPublished={setMovementPublished}
            saveFleetVehicle={saveFleetVehicle} removeFleetVehicle={removeFleetVehicle}
          />
        </PopupCard>
      )}
      {account.mustChangePassword && <ForcePasswordChangeModal completeForcedPasswordChange={completeForcedPasswordChange} />}
    </div>
  )
}

// Blocks the app until the user sets their own password — shown right after
// login when an admin issued a temp password (e.g. via a Login ID change).
// No close/skip affordance: this is meant to be unavoidable, not a reminder.
function ForcePasswordChangeModal({ completeForcedPasswordChange }) {
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!newPw || !confirmPw) { setMsg('Enter your new password twice.'); return }
    if (newPw !== confirmPw) { setMsg('Passwords do not match.'); return }
    setBusy(true)
    const res = await completeForcedPasswordChange(newPw)
    setBusy(false)
    if (!res.ok) setMsg(res.message)
  }

  return createPortal(
    <div className="rc-modal-overlay" style={MODAL_OVERLAY_STYLE}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--separator)' }}>
          <Lock size={18} color="var(--blue)" />
          <span style={{ fontSize: 16, fontWeight: 600 }}>Change Your Password</span>
        </div>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Set a new password to continue.</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>At least 8 alphanumeric characters.</p>
          </div>
          <input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={{ width: '100%' }} autoComplete="new-password" />
          <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={{ width: '100%' }} autoComplete="new-password" onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          {msg && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{msg}</p>}
          <button className="btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
        </div>
      </div>
    </div>,
    modalRoot()
  )
}

function TabBtn({ active, onClick, icon: Icon, label, size = 22 }) {
  return (
    <button className={`tab-item ${active ? 'active' : ''}`} onClick={onClick} aria-label={label}>
      <Icon size={size} />
    </button>
  )
}

function EmptyPlatoon({ onAssign }) {
  return (
    <EmptyState icon={UsersGroup} title="No Personnel Assigned Yet." body={onAssign ? undefined : ASSIGN_PERSONNEL_HINT}>
      {onAssign && (
        /* The Activity tab's empty-state button, to the pixel — same tint, same edge, same
           12px radius. Two screens that stand down and offer one way forward should not
           offer it in two different shapes. */
        <button onClick={onAssign}
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px 14px', borderRadius: 12, background: 'var(--blue-tint)', border: BLUE_EDGE, color: 'var(--blue)', fontSize: 14, fontWeight: 600 }}>
          <UserPlus size={16} />Assign Personnel
        </button>
      )}
    </EmptyState>
  )
}

function EmptyState({ title, body, icon: Icon = ClipboardList, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
      <Icon size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
      <p style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</p>
      {body && <p style={{ fontSize: 13, marginTop: 4 }}>{body}</p>}
      {/* The 16px side padding is handed back, so a full-width control in here comes out
          the same width as the cards it replaced rather than 32px narrower than them. */}
      {children && <div style={{ margin: '14px -16px 0' }}>{children}</div>}
    </div>
  )
}

function LoginScreen({ onLogin, seedError, theme, setTheme, devLogin }) {
  const [username, setUsername] = useState(() => localStorage.getItem(LAST_LOGIN_ID_KEY) || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTheme, setShowTheme] = useState(false)
  const [openHint, setOpenHint] = useState(null)
  // One read, and only while signed out — this screen doesn't exist otherwise.
  const [lockedDown, setLockedDown] = useState(false)
  useEffect(() => { readLockdown().then(setLockedDown) }, [])

  async function submit() {
    if (!username.trim() || !password) return
    setBusy(true); setError('')
    const res = await loginWithCredentials(username, password, getDeviceId())
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    onLogin(res.account, res.sessionToken)
  }

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, position: 'relative' }}>
        {showTheme && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div className="segmented" style={{ flex: 1 }}>
              <span className="seg-pill" />
              <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}>System</button>
              <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
              <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
            </div>
            <button onClick={() => setShowTheme(false)} style={{ background: 'none', border: 'none', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
              <SunMoon size={16} />
              THEME
            </button>
          </div>
        )}
        {!showTheme && (
          <button onClick={() => setShowTheme(true)} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500 }}>
            <SunMoon size={16} />
            THEME
          </button>
        )}
        {seedError && (
          <div style={{ background: 'rgba(255,59,48,0.1)', color: 'var(--red)', fontSize: 13, padding: 10, borderRadius: 10, marginBottom: 14 }}>
            <p style={{ margin: 0 }}>Connection problem: {seedError}</p>
            {/* Which settings actually made it into the BUILD. Vite bakes these in at
                build time, so a variable saved in Vercel but not ticked for Production
                is simply absent here — and the symptom is a connection that hangs rather
                than anything that names itself. Safe to print: the Firebase web config
                ships to every visitor anyway, and the API key is deliberately not shown
                in full. Only ever on screen when something is already wrong. */}
            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.85, wordBreak: 'break-all' }}>
              Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'MISSING'}
              {' · '}Key: {import.meta.env.VITE_FIREBASE_API_KEY ? 'set' : 'MISSING'}
              {' · '}Auth domain: {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'MISSING'}
              {' · '}App ID: {import.meta.env.VITE_FIREBASE_APP_ID ? 'set' : 'MISSING'}
              {' · '}Sender ID: {import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? 'set' : 'MISSING'}
            </p>
          </div>
        )}
        {/* The tagline reads as a lead-in to the fields, so it sits nearer them than
            to the logo block above it. */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--blue)', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* The pulse line, not the clipboard the Today tab wears. This is the app
                mark, so it should say the app's name rather than repeat a tab's icon —
                and one icon meaning two things is what erodes the set. */}
            <Activity color="#fff" size={32} />
          </div>
          {/* Smaller than the in-app title. Set in all caps under a 64px mark, 28px
              read as shouting; 22px lets the logo lead and the name sit under it. */}
          <h1 className="large-title" style={{ fontSize: 22 }}>VManifest 92</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>Sign in to see your vehicle</p>
        </div>
        {lockedDown && (
          <div style={{ background: LOCKDOWN_TINT, color: LOCKDOWN_INK, padding: 12, borderRadius: 10, margin: '0 0 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <TriangleAlert size={22} />
            <p style={{ fontSize: 13, fontWeight: 500, textAlign: 'center', margin: 0 }}>{LOCKDOWN_NOTICE}</p>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <div style={{ position: 'relative' }}>
            <input placeholder="Login ID" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', paddingRight: 36 }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button type="button" onClick={() => setOpenHint(openHint === 'login' ? null : 'login')} aria-label="Login ID help" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex' }}>
              <HelpCircle size={18} />
            </button>
          </div>
          {openHint === 'login' && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0 4px' }}>Login ID is your mobile number.</p>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} style={{ width: '100%', paddingRight: 36 }} />
            <button type="button" onClick={() => setOpenHint(openHint === 'password' ? null : 'password')} aria-label="Password help" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex' }}>
              <HelpCircle size={18} />
            </button>
          </div>
          {openHint === 'password' && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0 4px' }}>At least 8 alphanumeric characters.</p>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: '6px 0 0 4px' }}>{error}</p>}
        </div>
        <button className="btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
        {/* DEV ONLY: quick-login shortcuts. Remove before launch. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => devLogin('admin')}>Dev: Admin</button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => devLogin('user')}>Dev: User</button>
        </div>
      </div>
    </div>
  )
}

// Shared 3-across grid of account-info mini cards. Used on the Account tab and in
// the admin-only member info modal so the two always look identical.
// `editable` says this viewer may edit at all; `editableByUser` on each field says whether
// PERSONNEL may. `adminEdit` is the third case: an admin looking at someone's member card,
// who is the only one allowed to set an app-owned field like Rank — the man himself never
// can, whichever screen he is on.
function AccountInfoGrid({ accountFields, info, editable, adminEdit, onSaveField }) {
  const [drafts, setDrafts] = useState({})
  const [editingField, setEditingField] = useState(null)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {accountFields.map((f) => {
        const savedValue = (info && typeof info === 'object') ? info[f.id] : ''
        // Prefer a locally-saved draft over the `info` prop: self-saves don't
        // trigger a live refresh of the account, so the prop stays stale until
        // the next manual refresh/login — without this the field would revert
        // to blank right after saving.
        const value = drafts[f.id] !== undefined ? drafts[f.id] : (savedValue || '')
        // Every field now answers to its own editableByUser toggle, including PES and
        // Medical Excuse — they used to be exempt as built-ins, and carry the flag set
        // instead so nothing changed for the men. The one exception runs the other way:
        // a permanent field is admin-only by construction and no toggle can open it.
        const canEdit = editable && (isPermanentAccountField(f) ? !!adminEdit : !!f.editableByUser)
        // Medical Excuse takes 2/3 of the first row; PES (sorted first) takes the other 1/3.
        const cardStyle = { padding: '12px 10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, gridColumn: f.label === 'Medical Excuse' ? 'span 2' : undefined }
        if (canEdit && editingField === f.id) {
          return (
            <div key={f.id} className="card" style={cardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</p>
              <input
                autoFocus
                value={value}
                onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                // Save the whole merged info (base + all drafts) so editing several
                // fields in one session never clobbers earlier saves back to their
                // stale prop value.
                onBlur={() => { if (value !== (savedValue || '')) onSaveField({ ...(info && typeof info === 'object' ? info : {}), ...drafts, [f.id]: value }); setEditingField(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                // 16px so iOS Safari doesn't auto-zoom on focus (and get stuck zoomed after blur).
                style={{ fontSize: 16, fontWeight: 500, border: 'none', borderBottom: '1px solid var(--separator)', borderRadius: 0, background: 'none', padding: '0 0 2px', color: 'var(--text)', width: '100%' }}
              />
            </div>
          )
        }
        return (
          <div key={f.id} className="card" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</p>
              {canEdit && (
                <button onClick={() => setEditingField(f.id)} aria-label="Edit" style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexShrink: 0 }}>
                  <Pencil size={14} color="var(--blue)" />
                </button>
              )}
            </div>
            <p style={{ fontSize: 16, margin: 0, fontWeight: 500, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', color: value ? 'var(--text)' : 'var(--text-secondary)' }}>{value || '—'}</p>
          </div>
        )
      })}
    </div>
  )
}

function AccountView({ account, changeMyPassword, accountFields, setAccountInfo, myGroup, savedLocations, locationsReady }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [currentPwOk, setCurrentPwOk] = useState(null) // null = unchecked/unknown, true/false after blur verification
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState(false)
  const [openPopup, setOpenPopup] = useState(null)
  const fieldLabelStyle = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }
  const headerStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }
  const msgStyle = { fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }

  async function handlePassword() {
    if (!currentPw || !newPw) { setPwMsg('Enter your current and new password.'); setPwError(true); return }
    const res = await changeMyPassword(currentPw, newPw)
    setPwMsg(res.ok ? 'Password updated.' : res.message)
    setPwError(!res.ok)
    if (res.ok) { setCurrentPw(''); setNewPw(''); setCurrentPwOk(null) }
  }

  // Verifies the typed current password on blur (no side effects) so the Update
  // button can light up before submit — mirrors the checks changeMyPassword does.
  async function verifyCurrentPassword() {
    if (!currentPw) { setCurrentPwOk(null); return }
    if (account.authUid && !account.password) {
      try {
        const email = authEmailFor(account.authEmailScheme, account.id, account.username, Number(account.authEmailVersion) || 0)
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, await authPassword(currentPw)))
        setCurrentPwOk(true)
      } catch (e) { setCurrentPwOk(false) }
    } else {
      const currentHash = await hashPassword(currentPw)
      setCurrentPwOk(isHash(account.password) ? account.password === currentHash : account.password === currentPw)
    }
  }

  async function handleSaveField(info) {
    await setAccountInfo(account.id, info)
  }

  // Rank rides beside the name instead of sitting in the info grid: a man's rank belongs
  // to his name, not to the same list as his PES and his rifle number. Matched by label,
  // the way Medical Excuse's double-width cell already is. Only this tab moves it — the
  // admin's member modal draws the same grid and keeps Rank in it.
  const rankField = accountFields.find((f) => f.label === 'Rank')
  const infoFields = rankField ? accountFields.filter((f) => f !== rankField) : accountFields
  const rankValue = (rankField && account.info && typeof account.info === 'object' ? account.info[rankField.id] : '') || ''
  const rankMatch = rankKey(rankValue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section>
        {/* ONE title over both cards, set at the row's left edge — which is the rank card's
            left edge, since it leads the row. Two titles each sat over their own card, but a
            centred one over the rank card and a left-set one over the name card read as two
            unrelated sections rather than the one line of identity they are. */}
        <h2 style={headerStyle}>{rankField ? 'Personnel Rank / Name' : 'Personnel Name'}</h2>
        {/* Half a grid card wide: the info grid is 3 columns with two 8px gaps, so one
            card is (100% - 16px) / 3 and half of that is / 6. The rank card carries no
            label of its own — the title above it does that — so it is a single centred
            value and naturally shorter than the name card beside it; alignItems:stretch
            then pulls it up to the name card's height. */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          {rankField && (
            <div className="card" style={{ width: 'calc((100% - 16px) / 6)', flexShrink: 0, minWidth: 0, padding: '6px 8px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              {/* Insignia over its abbreviation, stacked rather than side by side — at half a
                  grid card the box is 41px of usable width, and 'SLTC' alone eats 26 of them.
                  Stacking spends the tight dimension on the icon and the roomy one on the word.
                  The label is the canonical RANK and the icon is its INSIGNIA, which are not
                  always the same string: an admin who typed '3sg' gets '3SG' under the chevrons,
                  and a man typed as 'me3 2' gets 'ME3-2' under the ME3 device he actually wears.
                  A value with no insignia (a typo, an NS suffix) falls back to text alone; an
                  empty card would read as a bug rather than as an unset rank.
                  The label is pinned to the bottom and the insignia is CENTRED in the 25px left
                  above it. Padding is 6 top and 5 bottom, and the gap is 2 rather than 1 — together
                  they drop the label the 1.2px that centres the pair. It needs dropping because the
                  label's line box is not symmetric: 9px caps in an 11px line leave 2.5px of leading
                  above the letters and 1.5px below, so a stack that MEASURES centred still sits
                  high by the difference. 25 + 2 + 11 is exactly the 38px this padding leaves, so
                  nothing here has slack to absorb a change — move one and move another. Sitting the ink on the label instead left the short ranks — a 2LT bar
                  is 2px of ink, a PFC chevron 5 — stranded on the baseline with the whole card
                  empty over them. Centring costs the tall ranks nothing: LG and MSG already fill
                  the 25 and cannot move. 25 + the 11px label line + 1 gap is exactly the 37px of
                  usable height, and 27 is what the FULL 31-unit box would measure — RankInsignia
                  returns a fraction of it, so the tallest (LG, 28.28 of 31) comes back 24.6. */}
              {rankMatch
                ? (
                  <>
                    <div style={{ height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RankInsignia rank={rankMatch} size={27} maxWidth={41} style={{ flexShrink: 0 }} />
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 600, lineHeight: '11px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rankLabel(rankValue)}</p>
                  </>
                )
                : (
                  /* No insignia to draw. REC is the honest case — a recruit wears a bare patch,
                     so there has never been anything to trace — and a typo or an NS suffix lands
                     here too. Either way the word IS the rank, so it takes the whole card at a
                     size that reads like one, rather than sitting at the 9px meant to caption a
                     picture that isn't there.
                     The -1px is measured, not taste. Two things push this word low: the card's
                     bottom padding is a pixel short of its top (that asymmetry exists to drop the
                     9px label in the OTHER branch, and a lone centred child inherits half of it),
                     and a rank abbreviation is all capitals, so its line box reserves descender
                     space nothing uses. Together they put the ink 1px below the card's centre. */
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0, position: 'relative', top: -1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: rankValue ? 'var(--text)' : 'var(--text-secondary)' }}>{rankLabel(rankValue) || '—'}</p>
                )}
            </div>
          )}
          <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
            <p style={{ fontWeight: 500, margin: 0 }}>{account.displayName}</p>
          </div>
        </div>
      </section>

      {infoFields.length > 0 && (
        <section>
          <h2 style={headerStyle}>Personnel Info</h2>
          <AccountInfoGrid accountFields={infoFields} info={account.info} editable onSaveField={handleSaveField} />
        </section>
      )}

      {myGroup && (
        <section>
          <h2 style={headerStyle}>Reporting Location</h2>
          {(() => {
            // What's coming, in order, so an ICT-period exception is followed by the
            // standing location for the days it doesn't cover. Two or more places
            // become mini cards in a 2-column grid, matching Personnel Info. Only a
            // fully dated run gets a date line — the standing location has no range.
            const runs = venueRuns(account, myGroup, savedLocations)
            // Locations still loading: stay blank rather than flash "not set".
            if (!locationsReady) return <div className="card" style={{ minHeight: 42 }} />
            if (runs.length === 0) return <div className="card"><p style={{ fontSize: 13, margin: 0, color: 'var(--text-secondary)' }}>Not Set</p></div>
            // Same pin + venueColor as the Platoon and Settings cards: blue for the
            // company location, orange for an override sending you elsewhere.
            const venueLine = (r) => (
              /* Against the run's OWN start date. A run is a stretch of days and the company
                 may report somewhere else across it — compared with TODAY's company location,
                 the company's own next place read as an override of itself. */
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, color: venueColor(r.id, myGroup, r.from || undefined) }}>
                <MapPin size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.loc.label}</span>
              </p>
            )
            if (runs.length === 1) return (
              <div className="card">
                {venueLine(runs[0])}
                {runs[0].dated && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{outlookDates({ from: runs[0].from, to: runs[0].to })}</p>}
              </div>
            )
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {runs.map((r) => (
                  <div key={r.from} className="card" style={{ padding: '12px 10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    {venueLine(r)}
                    {r.dated && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{outlookDates({ from: r.from, to: r.to })}</p>}
                  </div>
                ))}
              </div>
            )
          })()}
        </section>
      )}

      <section>
        <h2 style={headerStyle}>Account</h2>
        <PopupCard title="Password" icon={Lock} subtitle="Change account password." open={openPopup === 'login'} onOpen={() => setOpenPopup('login')} onClose={() => setOpenPopup(null)}>
        <div>
          <p style={fieldLabelStyle}>Password</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PasswordInput placeholder="Current Password" value={currentPw}
              onChange={(e) => { setCurrentPw(e.target.value); setCurrentPwOk(null) }}
              onBlur={verifyCurrentPassword} autoComplete="current-password" />
            <PasswordInput placeholder="New Password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            <button className="btn-secondary" style={{ width: '100%', background: 'var(--blue)', color: '#fff', opacity: currentPwOk && newPw.trim() ? 1 : 0.4 }} onClick={handlePassword}>Update</button>
          </div>
          {pwMsg && <p style={{ ...msgStyle, color: pwError ? 'var(--red)' : 'var(--green)' }}>{pwMsg}</p>}
        </div>
        </PopupCard>
      </section>
    </div>
  )
}

function GroupMembersView({ groupAccounts, account, myGroup, groupFields, accountFields, setAccountInfo, savedLocations, locationsReady, onAssignPersonnel }) {
  const [selectedMember, setSelectedMember] = useState(null)
  const [shownMember, memberClosing] = useExiting(selectedMember)
  const [copiedLoginId, setCopiedLoginId] = useState(false)
  async function copyLoginId(id) {
    try { await navigator.clipboard.writeText(id) } catch (e) {}
    setCopiedLoginId(true)
    setTimeout(() => setCopiedLoginId(false), 1500)
  }
  const isAdmin = !!account.isAdmin
  const headerStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }
  const cardHeaderStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 6px' }
  const groupName = myGroup?.name || 'Your group'

  // Nobody in the platoon and there is nothing to describe: the info card, the reporting
  // location and the Personnel heading were three headings stacked over an empty screen,
  // each answering a question about people who are not there. The one thing worth saying
  // is that it is empty and where to fix it — the same words the Today board and an
  // activity roster use, because it is the same fact on all three. The ICON is this tab's
  // own, not theirs: every empty state wears the icon of the screen it is standing in for,
  // and on the two attendance screens that is the clipboard.
  //
  // Safe to word it for an admin. A regular user's list is built from the roster mirror
  // and always contains his own row (see groupMembersList), so an empty one only ever
  // reaches somebody who can act on it.
  if (groupAccounts.length === 0) {
    return <EmptyPlatoon onAssign={onAssignPersonnel} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {myGroup && groupFields.length > 0 && (
        <section>
          <h2 style={headerStyle}>{groupName} info</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            {groupFields.map((f) => {
              const value = (myGroup.info && typeof myGroup.info === 'object') ? myGroup.info[f.id] : ''
              return (
                <div key={f.id}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{f.label}</p>
                  <p style={{ fontSize: 14, margin: 0, whiteSpace: 'pre-wrap', color: value ? 'var(--text)' : 'var(--text-secondary)' }}>{value || '—'}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
      {isAdmin && myGroup && (
        <section>
          <h2 style={headerStyle}>Reporting Location</h2>
          <div className="card">
            {(() => {
              const v = effectiveVenue(null, myGroup, savedLocations, todayISO())
              if (!locationsReady) return <p style={{ margin: 0, minHeight: 20 }} />
              return (
                <>
                  {/* Same pin + venueColor as the Settings cards and the Section
                      headings below: blue for the company location, orange when an
                      override is sending this platoon somewhere else. */}
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, color: v.loc ? venueColor(v.id, myGroup, v.from || undefined) : 'var(--text-secondary)' }}>
                    {v.loc && <MapPin size={14} style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.loc ? v.loc.label : 'Not Set'}</span>
                  </p>
                  {v.from && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{outlookDates({ from: v.from, to: v.to || v.from })}</p>}
                </>
              )
            })()}
          </div>
        </section>
      )}
      <section>
        <h2 style={headerStyle}>{groupName} Personnel</h2>
        {(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groupByMiniGroup(groupAccounts, myGroup?.miniGroups || []).filter((sec) => sec.members.length).map((sec) => (
              <div key={sec.id || 'ungrouped'}>
                {sec.name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 4px 6px' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{sec.name}</p>
                  </div>
                )}
                <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                  {sec.members.map((p) => {
                    // Flag a personal override that differs from where the member's
                    // Section/platoon/company would send them today (admins only).
                    const theirs = isAdmin && p.locationId ? savedLocations.find((l) => l.id === p.locationId) || null : null
                    const secV = theirs ? effectiveVenue({ miniGroupId: p.miniGroupId }, myGroup, savedLocations, todayISO()) : null
                    const oddOneOut = !!theirs && theirs.id !== secV.id
                    const inner = (
                      <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, minWidth: 0 }}>
                          {memberLabel(p)}
                          {p.id === account.id && <UserCircle size={17} color="var(--text-secondary)" />}
                          {oddOneOut && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: venueColor(p.locationId, myGroup, p.locationFrom || undefined), fontWeight: 400, fontSize: 11, minWidth: 0 }}>
                              <MapPin size={11} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{theirs.label}{p.locationFrom ? <span style={{ color: 'var(--text-secondary)' }}> | {outlookDates({ from: p.locationFrom, to: p.locationTo || p.locationFrom })}</span> : ''}</span>
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isAdmin && <ChevronRight size={16} color="var(--text-secondary)" />}
                        </span>
                      </>
                    )
                    return isAdmin ? (
                      <button key={p.id} className="list-row" onClick={() => setSelectedMember(p)}>
                        {inner}
                      </button>
                    ) : (
                      <div key={p.id} className="list-row">{inner}</div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {shownMember && createPortal(
        <div
          className={`rc-modal-overlay${memberClosing ? ' rc-modal-closing' : ''}`}
          style={MODAL_OVERLAY_STYLE}
          onClick={() => setSelectedMember(null)}
        >
          <div
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px 6px', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{memberLabel(shownMember)}</span>
                {shownMember.username && (
                  <>
                    <span style={{ width: 1, height: 16, background: 'var(--separator)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{shownMember.username}</span>
                    {/* Blue at rest, like the Call beside it: both act on the login ID,
                        and greying one of the pair made it read as a label rather than a
                        button. The tick alone now carries the copied signal. */}
                    <button onClick={() => copyLoginId(shownMember.username)} aria-label="Copy login ID" style={{ background: 'none', border: 'none', color: 'var(--blue)', display: 'flex', padding: 6, marginLeft: 4, cursor: 'pointer', flexShrink: 0 }}>
                      {copiedLoginId ? <Check size={15} /> : <DocOnDoc size={15} />}
                    </button>
                    <a href={`tel:${shownMember.username}`} aria-label="Call" style={{ color: 'var(--blue)', display: 'flex', padding: 6, flexShrink: 0 }}>
                      <Phone size={16} />
                    </a>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedMember(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--red)', display: 'flex', padding: 4, cursor: 'pointer', flexShrink: 0 }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 14, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={cardHeaderStyle}>Display Name</p>
                <div className="card">
                  <p style={{ fontWeight: 500, margin: 0, overflowWrap: 'anywhere' }}>{shownMember.displayName || '—'}</p>
                </div>
              </div>
              {(() => {
                const v = effectiveVenue(shownMember, myGroup, savedLocations, todayISO())
                return (
                  <div>
                    <p style={cardHeaderStyle}>Reporting Location</p>
                    <div className="card">
                      <p style={{ fontWeight: 500, margin: 0, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                        {v.loc ? v.loc.label : '—'}
                      </p>
                      {v.from && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{outlookDates({ from: v.from, to: v.to || v.from })}</p>}
                    </div>
                  </div>
                )
              })()}
              {accountFields.length > 0 && (
                <div>
                  <p style={cardHeaderStyle}>Personnel Info</p>
                  <AccountInfoGrid
                    key={shownMember.id}
                    accountFields={accountFields}
                    info={shownMember.info}
                    editable={isAdmin}
                    adminEdit={isAdmin}
                    onSaveField={(info) => { setAccountInfo(shownMember.id, info); setSelectedMember((m) => m && { ...m, info }) }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>,
        modalRoot()
      )}
    </div>
  )
}

// Past days, so every list here is read against the day it belongs to, not against
// the platoon as it stands now. `platoonAccounts` deliberately includes deferred
// personnel — they were on the board on the days they were marked — and anyone
// deleted since is resolved through `formerNames`.
// Month arithmetic on 'YYYY-MM' strings, in UTC throughout. Date.UTC + getUTC* keeps a
// month from sliding a day either way on a machine east or west of the parser's idea of
// midnight — the same reason the rest of the app never touches a bare `new Date()`.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// `21 AUG` — the shout-case day the reports that go to higher are written in.
const dayTag = (iso) => {
  const [, mo, dd] = String(iso || '').split('-')
  return mo ? `${Number(dd)} ${MONTH_NAMES[Number(mo) - 1].slice(0, 3).toUpperCase()}` : ''
}
// A move-out runs for days, so its dates are a span wherever they are stated. Two shapes,
// because the two places they appear have different room: the manifest card wears the
// compact `17-23 AUG`, collapsing a shared month to one mention, while the report spells
// both ends — `17 AUG - 23 AUG` — because a message that goes to higher should not make
// the reader carry a month across a hyphen. Either way a one-day move-out is just the day.
const spanTag = (from, to, { collapse = false } = {}) => {
  if (!to || to === from) return dayTag(from)
  if (collapse && from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}-${dayTag(to)}`
  return `${dayTag(from)} - ${dayTag(to)}`
}
function monthLabel(m) { const [y, mo] = m.split('-'); return `${MONTH_NAMES[Number(mo) - 1]} ${y}` }
function shiftMonth(m, n) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
// Day 0 of the next month is the last day of this one.
function monthLength(m) { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate() }
// Weekday of the 1st, Monday = 0. Working weeks run Mon–Fri, so the weekend reads as one
// block at the end of the row instead of being split across both edges.
// Sunday-first, so `getUTCDay()` is the index as it comes — 0 is Sunday. It used to add 6
// and wrap, which is the Monday-first shift; the weekday header above the grid has to
// agree with whichever one this is.
// Saturday or Sunday, off an ISO date. UTC throughout, like every other date helper here:
// the strings are calendar days and not instants, and reading them in local time would put a
// Singapore Monday on a Sunday for anyone whose clock is behind.
function isWeekend(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 || wd === 6
}

function monthFirstWeekday(m) { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() }

// Info Entry tab body of the merged Platoon Info card: pick a platoon, fill in
// its info-field values. The inner editor is keyed by platoon id so its draft
// re-initializes when you switch platoons.
function PlatoonInfoEntry({ groups, groupFields, setGroupInfo }) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || '')
  const group = groups.find((g) => g.id === selectedGroupId) || groups[0] || null
  if (!group) return <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Create a platoon first.</p>
  if (groupFields.length === 0) return <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Add a category first.</p>
  return (
    <>
      <select className="select-arrow" value={group.id} onChange={(e) => setSelectedGroupId(e.target.value)} style={{ width: '100%', marginBottom: 14 }}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <PlatoonInfoFields key={group.id} group={group} groupFields={groupFields} setGroupInfo={setGroupInfo} />
    </>
  )
}

function PlatoonInfoFields({ group, groupFields, setGroupInfo }) {
  const saved = group.info && typeof group.info === 'object' ? group.info : {}
  const [draft, setDraft] = useState(saved)
  const [msg, setMsg] = useState('')
  // Compared field by field over the CATEGORIES on screen, not by comparing the two objects:
  // a draft picks up a key the moment a textarea is touched, so `{}` and `{ a: '' }` are the
  // same information and must not read as a change.
  const dirty = groupFields.some((f) => (draft[f.id] || '') !== (saved[f.id] || ''))
  async function save() {
    const ok = await setGroupInfo(group.id, draft)
    setMsg(ok ? 'Saved.' : 'Could not save.')
  }
  return (
    <>
      {groupFields.map((f) => (
        <div key={f.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{f.label}</p>
          <textarea
            ref={autoGrowTextarea}
            value={draft[f.id] || ''}
            onChange={(e) => { setDraft({ ...draft, [f.id]: e.target.value }); setMsg(''); autoGrowTextarea(e.target) }}
            rows={1}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 16, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--separator)', background: 'var(--card)', color: 'var(--text)', resize: 'none', overflow: 'hidden' }}
          />
        </div>
      ))}
      <button className="btn-primary" style={{ width: '100%', marginTop: -6, opacity: dirty ? 1 : 0.4 }}
        disabled={!dirty} onClick={save}>Save</button>
      {msg && <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0 0' }}>{msg}</p>}
    </>
  )
}

function CreateSectionCard({ groups, addMiniGroup, renameMiniGroup, removeMiniGroup, setMiniGroupOrder, open, onOpen, onClose }) {
  // Starts empty so the dropdown shows "Select a Platoon" rather than silently
  // pointing the form at the first platoon.
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const confirmTimer = useRef(null)
  // ms is per button: a Reset that wipes a whole ICT or manifest gets longer to read
  // its own warning than a single row's delete does.
  function requestConfirm(id, action, ms = 3000) {
    if (confirmId === id) { clearTimeout(confirmTimer.current); action(); setConfirmId(null); return }
    setConfirmId(id); clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmId(null), ms)
  }
  const group = groups.find((g) => g.id === selectedGroupId) || null
  const sections = group ? [...(group.miniGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []
  return (
    <PopupCard grouped title="Section" icon={Layers} subtitle="Create sections within a platoon." open={open} onOpen={onOpen} onClose={onClose}>
      {groups.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Create a platoon first.</p>
      ) : (
        <>
        <select className="select-arrow" value={selectedGroupId} onChange={(e) => { setSelectedGroupId(e.target.value); setEditingId(null) }}
          style={{ width: '100%', marginBottom: 10, color: selectedGroupId ? 'var(--text)' : 'var(--text-secondary)' }}>
          <option value="" disabled hidden>Select a Platoon</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {sections.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <ReorderList items={sections} onReorder={(ids) => setMiniGroupOrder(group.id, ids)} ghostLabel={(m) => m.name}
              rowPadding="10px 8px" itemGap={4} handlePadding={0}
              renderRow={(m, dragHandle) => (
                editingId === m.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameDirty(editingName, m.name)) { renameMiniGroup(group.id, m.id, editingName); setEditingId(null) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      style={{ flex: 1, marginRight: 10 }}
                    />
                    {/* gap 6 — the same air the pencil and the bin sit in on this row's other face. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { renameMiniGroup(group.id, m.id, editingName); setEditingId(null) }} disabled={!renameDirty(editingName, m.name)} aria-label="Save" style={renameTick(renameDirty(editingName, m.name))}><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} aria-label="Cancel" style={renameCross(renameChanged(editingName, m.name))}><X size={16} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    {dragHandle && <button aria-label="Drag to reorder" {...dragHandle}><GripVertical size={16} /></button>}
                    <span style={{ flex: 1, minWidth: 0, transform: 'translateY(-1px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(m.id); setEditingName(m.name) }} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex' }}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => requestConfirm(m.id, () => removeMiniGroup(group.id, m.id))} style={{ background: 'none', border: 'none', color: confirmId === m.id ? 'var(--red)' : 'var(--text-secondary)', fontSize: 12 }}>
                        {confirmId === m.id ? 'Confirm' : <Trash2 size={16} />}
                      </button>
                    </div>
                  </>
                )
              )} />
          </div>
        )}
        {group && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newName}
              placeholder="Section Name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { addMiniGroup(group.id, newName); setNewName('') } }}
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" style={{ background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: newName.trim() ? 1 : 0.4 }} onClick={() => { if (newName.trim()) { addMiniGroup(group.id, newName); setNewName('') } }}><Plus size={16} /></button>
          </div>
        )}
        </>
      )}
    </PopupCard>
  )
}

function PopupCard({ title, icon: Icon, subtitle, open, onOpen, onClose, onBack, children, footer, maxHeight, grouped, trigger: customTrigger }) {
  const trigger = customTrigger || (
    <button
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', background: 'none', border: 'none', padding: '13px 16px', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {Icon && (
          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--separator)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} color="var(--text-secondary)" />
          </span>
        )}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
          {subtitle && <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{subtitle}</span>}
        </span>
      </span>
      <ChevronRight size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
    </button>
  )
  // Stays mounted through the slide-down after `open` goes false.
  const [shown, closing] = useExiting(open)
  return (
    <>
      {(grouped || customTrigger) ? trigger : <div className="card" style={{ padding: 0 }}>{trigger}</div>}
      {shown && createPortal(
        <div
          className={`rc-modal-overlay${closing ? ' rc-modal-closing' : ''}`}
          style={MODAL_OVERLAY_STYLE}
          onClick={onBack || onClose}
        >
          <div
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: maxHeight || '55vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 600 }}>
                {/* A named pill, not a bare chevron. It sits in the slot the card's ICON
                    would occupy, so a lone `‹` there read as decoration beside the title
                    rather than as the way out of a sub-view — and it was the only control on
                    these three cards you had to already know about.
                    SOLID blue, where the header pills on the Today and Activity screens are
                    tinted. Those sit among other pills and must not shout; this one sits
                    alone against a title and a close cross, and it is the only way back to
                    the list behind it.
                    12px in a 16px title's row. The left padding is 5 against the right's 10,
                    and the gap is the point: lucide draws its chevron as the middle third of
                    the box, so a 14px icon carries 5.25px of empty box before any ink. Padded
                    evenly the mark sat 5px right of centre; at 5 the INK is balanced —
                    measured 10.25px left of the glyph against 10px right of the word. */}
                {onBack ? (
                  <button onClick={onBack} aria-label="Back"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexShrink: 0, padding: '4px 10px 4px 5px', borderRadius: 999, background: 'var(--blue)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer' }}>
                    <ChevronLeft size={14} />Back
                  </button>
                ) : (Icon && <Icon size={18} color="var(--blue)" />)}
                {title}
              </span>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--red)', display: 'flex', padding: 4, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '14px 16px 16px', overflowY: 'auto', flex: 1 }}>
              {children}
            </div>
            {footer && (
              <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--separator)', flexShrink: 0 }}>
                {footer}
              </div>
            )}
          </div>
        </div>,
        modalRoot()
      )}
    </>
  )
}

function hsvToHex(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
function hexToHsv(hex) {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

// Single-column drag-to-reorder list, same interaction as the status grid: a
// floating ghost follows the finger, the dragged row becomes a dashed gap, rows
// reflow live, and the new order persists on drop via onReorder(orderedIds).
// renderRow(item, dragHandle) returns the row's inner content and spreads
// dragHandle onto its grip button; ghostLabel(item) is the text for the ghost.
// rowPadding/itemGap/handlePadding control the whitespace around the leading
// grip; they default to the original spacing so existing callers are
// unaffected until a caller opts into tighter values.
// `staticItems` render above the draggable ones in the same row chrome but with no grip,
// and take no part in the drag: they hold a fixed position by definition (PES and Medical
// Excuse lead the personnel-info list). Keeping them here rather than in a separate block
// is what makes the two look like one list instead of two.
function ReorderList({ items, staticItems, onReorder, renderRow, ghostLabel, rowPadding = '10px 12px', itemGap = 8, handlePadding = 2 }) {
  const [dragOrder, setDragOrder] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const dragOrderRef = useRef(null)
  const draggingRef = useRef(null)
  const cellRefs = useRef({})
  const ghostRef = useRef(null)
  const grab = useRef({ dx: 0, dy: 0, w: 0 })
  const lastPt = useRef({ x: 0, y: 0 })

  const ids = dragOrder || items.map((x) => x.id)
  const byId = Object.fromEntries(items.map((x) => [x.id, x]))
  const list = ids.map((id) => byId[id]).filter(Boolean)

  function positionGhost(x, y) {
    lastPt.current = { x, y }
    const g = ghostRef.current
    if (g) g.style.transform = `translate(${x - grab.current.dx}px, ${y - grab.current.dy}px)`
  }

  function startDrag(e, id) {
    e.preventDefault()
    const rect = cellRefs.current[id]?.getBoundingClientRect()
    grab.current = { dx: rect ? e.clientX - rect.left : 20, dy: rect ? e.clientY - rect.top : 20, w: rect ? rect.width : 240 }
    lastPt.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = id
    dragOrderRef.current = items.map((x) => x.id)
    setDraggingId(id)
    setDragOrder(dragOrderRef.current)

    const move = (ev) => {
      ev.preventDefault()
      positionGhost(ev.clientX, ev.clientY)
      let targetId = null
      for (const sid in cellRefs.current) {
        const el = cellRefs.current[sid]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { targetId = sid; break }
      }
      if (!targetId || targetId === draggingRef.current) return
      const arr = [...(dragOrderRef.current || [])]
      const from = arr.indexOf(draggingRef.current)
      const to = arr.indexOf(targetId)
      if (from < 0 || to < 0 || from === to) return
      arr.splice(from, 1)
      arr.splice(to, 0, draggingRef.current)
      dragOrderRef.current = arr
      setDragOrder(arr)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const arr = dragOrderRef.current
      draggingRef.current = null
      dragOrderRef.current = null
      setDraggingId(null)
      setDragOrder(null)
      if (arr) onReorder(arr)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ghost = draggingId ? byId[draggingId] : null
  const cell = (item, dragging, dragHandle) => (
    <div key={item.id} ref={(el) => { cellRefs.current[item.id] = el }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: rowPadding, borderRadius: 10, minWidth: 0,
        background: dragging ? 'transparent' : 'var(--card)', border: dragging ? '1.5px dashed var(--separator)' : '1px solid var(--separator)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: itemGap, visibility: dragging ? 'hidden' : 'visible' }}>
        {renderRow(item, dragHandle)}
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(staticItems || []).map((item) => cell(item, false, null))}
      {list.map((item) => {
        const dragging = draggingId === item.id
        // Nothing to reorder with a single item — hand renderRow a null handle so
        // it omits the grip.
        const dragHandle = items.length > 1
          ? { onPointerDown: (e) => startDrag(e, item.id), style: { background: 'none', border: 'none', padding: handlePadding, display: 'flex', color: 'var(--text-secondary)', flexShrink: 0, cursor: 'grab', touchAction: 'none' } }
          : null
        return cell(item, dragging, dragHandle)
      })}
      {ghost && createPortal(
        <div ref={(el) => { ghostRef.current = el; if (el) { const { x, y } = lastPt.current; el.style.transform = `translate(${x - grab.current.dx}px, ${y - grab.current.dy}px)` } }}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 500, pointerEvents: 'none', width: grab.current.w,
            display: 'flex', alignItems: 'center', gap: itemGap, padding: rowPadding, borderRadius: 10,
            background: 'var(--card)', border: '1px solid var(--separator)', boxShadow: '0 10px 24px rgba(0,0,0,0.35)' }}>
          <GripVertical size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ghostLabel(ghost)}</span>
        </div>,
        document.body
      )}
    </div>
  )
}

// A member's own vehicle, and nobody else's. Everything here comes off their own
// attendanceSelf card — they never touch the manifest, which is company-wide and would
// hand every member every name in the company. Read-only by nature: a manifest is the
// admin's plan, and there is nothing on this screen a passenger could change.
function MyMovementView({ seat, kind, account }) {
  // He is on one manifest and not the other — which is the ordinary case, not an error.
  // The segment stays selectable so he can see for himself rather than wondering whether
  // the app has lost something.
  if (!seat) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '34px 16px' }}>
          <Truck size={38} style={{ color: 'var(--separator)' }} />
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 14 }}>No Vehicle Assigned</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '7px 0 0', lineHeight: 1.5 }}>
            You are not on the {kind === 'activity' ? 'Activity' : 'Outfield'} manifest.
          </p>
        </div>
      </div>
    )
  }
  const crew = Array.isArray(seat.crew) ? seat.crew : []
  // Chain of command first — vehicle commander, then driver — and everyone else by
  // name, so a passenger looking for someone can scan straight to the letter.
  const rank = { vc: 0, driver: 1, pax: 2 }
  const sorted = crew.slice().sort((a, b) => ((rank[a.r] ?? 2) - (rank[b.r] ?? 2)) || (a.n || '').localeCompare(b.n || ''))
  const headerStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 4px 8px' }
  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <section style={{ marginBottom: 14 }}>
        {/* Named after the kind of manifest the seat came from, the same test the Today
            board uses: an activity has no party, so a seat with no party is not a move-out
            and must not call itself one. Never the stored movement name — a member is being
            told which vehicle he is on, and the manifest itself is an admin's document. */}
        <h2 style={headerStyle}>{seat.party ? 'Outfield Vehicle' : 'Vehicle'}</h2>
        <div className="card">
          {/* Callsign, plate, then type on one line: the callsign is what he is told to
              board, the plate is how he finds it in the vehicle park, and the type is what
              it looks like. None of the three is a fact of its own. */}
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            {seat.callsign}
            {(seat.plate || seat.type) && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}> · {[plateLabel(seat.plate), seat.type].filter(Boolean).join(' · ')}</span>}
          </p>
          {/* WHEN, always — a range on a movement that runs more than a day, one date on a
              movement that does not. It used to appear only on the multi-day case, on the
              reasoning that the vehicle is already known by the second morning; but this tab
              is not pinned to a day the way the Today board is, so on a single-day move-out
              the card said which lorry and never said which morning. The admin's own manifest
              header states it either way — `FMC · 1 SEP` — and the two should not disagree
              about whether a date is worth printing. */}
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {outlookDates({ from: seat.date, to: seat.until })}
          </p>
          {/* Party first, then role: which wave you move with is the thing you need at
              0450, and your appointment on the truck only matters once you are on it. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {seat.party && (
              <span style={{ background: 'color-mix(in srgb, var(--orange) 16%, transparent)', border: AMBER_EDGE, color: 'color-mix(in srgb, var(--orange) 75%, var(--text))', fontSize: 11, fontWeight: 600, lineHeight: '16px', padding: '3px 11px', borderRadius: 999 }}>
                {seat.party === 'adv' ? 'Advance Party' : 'Main Body'}
              </span>
            )}
            <span style={rolePill(seat.role)}>
              <RoleIcon role={seat.role} />{MOVEMENT_ROLE_LABEL[seat.role] || MOVEMENT_ROLE_LABEL.pax}
            </span>
          </div>
        </div>
      </section>

      {/* One row per person, the same grouped list the manifest and the Today board use.
          Nothing is tappable: there is nothing here a passenger could change. */}
      {sorted.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <h2 style={headerStyle}>Vehicle Manifest · {sorted.length} Total</h2>
          <div style={{ borderRadius: 14, overflow: 'hidden' }}>
            {sorted.map((c) => (
              <div key={c.id} className="list-row">
                {/* Only men from ANOTHER platoon are labelled — his own platoon-mates need
                    no telling, and on a truck drawn mostly from one platoon the labels are
                    then exactly the people he does not know. Read off the seat's own copy;
                    a member cannot look a platoon up.
                    Skipped for attached personnel: their holding group is itself named
                    ATTACHED, so printing it put the word twice on one line, once as text and
                    once as the pill right beside it. The admin's manifest already skips it
                    for the same reason — the section pill is the part that says anything. */}
                {/* UserCircle for "this row is you", the same marker the platoon roster
                    already uses for the same job — not the word "(you)", which read as part
                    of the man's name and grew the row it sat on. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, minWidth: 0 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.n}
                    {!c.att && c.gn && (c.g || '') !== (account.groupId || '') && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> · {c.gn}</span>
                    )}
                  </span>
                  {c.id === account.id && <UserCircle size={17} color="var(--text-secondary)" style={{ flexShrink: 0 }} />}
                  {/* Only on loaned personnel, so a truck of your own men gains no clutter
                      and these are the only names that catch the eye. The same two pills the
                      admin's manifest carries, read off the seat's own copy. */}
                  {c.att && (
                    <span style={{ ...ATTACH_PILL, background: TINT_AMBER, border: AMBER_EDGE, color: TINT_AMBER_INK }}>ATTACH</span>
                  )}
                  {c.att && c.sec && (
                    <span style={{ ...ATTACH_PILL, background: TINT_VIOLET, border: VIOLET_EDGE, color: TINT_VIOLET_INK, textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: -4 }}>{c.sec}</span>
                  )}
                </span>
                {/* Every appointment wears the same solid pill, Troop included. Troop used to be
                      grey text while VC and Driver were pills, which made the commander and the
                      driver look like the only ones with a place on the truck. They are all
                      seated, and the row should say so in one shape. */}
                <span style={rolePill(c.r || 'pax', { flexShrink: 0, marginLeft: 10 })}><RoleIcon role={c.r || 'pax'} />{MOVEMENT_ROLE_LABEL[c.r || 'pax']}</span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}

// The manifest itself — the tab, not a popup. Read top to bottom the way it is used:
// the tally a duty officer asks for, then who is still unaccounted for, then the
// vehicles. A manifest is a PLAN; nothing here writes a daily status.
// Both sheets in the manifest slide up from the bottom over a dimmed page, the way Set
// Status does. They used to replace the whole tab, which is a screen the app has nowhere
// else.
//
// Portalled to the body for the same reason Set Status is: a transformed ancestor makes
// `position: fixed` resolve against IT rather than the viewport, which dropped this sheet
// 87px too low and hid its buttons behind the tab bar.
//
// Declared out here, NOT inside MovementView: a component defined in a render body is a
// new function identity every render, so React unmounts and remounts the whole subtree —
// which threw focus out of the search field after every single letter typed.
function Sheet({ onClose, closing, children }) {
  return createPortal(
    <div className={`rc-modal-overlay${closing ? ' rc-sheet-closing' : ''}`} style={SHEET_OVERLAY_STYLE} onClick={onClose}>
      {/* No top padding here, and each sheet supplies its own. A sticky child's
          `top: 0` resolves against this box's CONTENT edge, not its padding edge —
          so with padding-top the picker's pinned header parked 18px down and rows
          scrolled through the strip above it. */}
      <SheetPanel onClose={onClose} style={{ background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '0 16px 28px', maxHeight: sheetFrac(0.86), overflowY: 'auto' }}>
        {children}
      </SheetPanel>
    </div>,
    modalRoot()
  )
}

function MovementView({ movement, roster, dayStatuses, accounts, groups, statuses, account, assignToVehicle, setMovementRole, unassignFromMovement, setMovementPublished, onSetUpVehicles }) {
  const [picker, setPicker] = useState(null)   // { vehicleId }
  const [sheet, setSheet] = useState(null)     // { accountId }
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState({})
  const [pickRole, setPickRole] = useState('pax')   // the role the assign sheet will save
  const [shutGroups, setShutGroups] = useState({})   // platoons folded away in the picker
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [copied, setCopied] = useState(null)   // which Copy Report pill is showing its tick
  const [err, setErr] = useState('')
  // Vehicles start closed: five trucks of twenty is a hundred rows to scroll past, and
  // the question on a move-out morning is nearly always about ONE truck. Closed, the
  // whole manifest is a five-line index. A single-vehicle manifest opens itself —
  // there is no list to get lost in, so a tap to see it would be a tax.
  const [openVeh, setOpenVeh] = useState(() => {
    const ids = Object.keys(movement.vehicles || {})
    return ids.length === 1 ? { [ids[0]]: true } : {}
  })
  const toggleVeh = (id) => setOpenVeh((s) => ({ ...s, [id]: !s[id] }))

  // Seat writes report rather than vanish: on failure the sheet stays open and says
  // why, so a rejected write can't look like a successful one.
  const run = async (p) => {
    const r = await p
    setErr(r && r.ok === false ? r.message : '')
    return !r || r.ok !== false
  }

  const assign = movement.assign || {}
  const vehicles = Object.entries(movement.vehicles || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
  const sourceLabel = (statuses.find((s) => s.id === (movement.statusId || statuses[0]?.id)) || {}).label || ''
  // Present is statuses[0], the default source. A manifest rostered from it is an ordinary
  // activity — a range day, a turnout — not a move-out, and none of the outfield's apparatus
  // applies: no advance party, no wave to command, and no claim in the title that this is an
  // exercise. Everything below keys off THIS, never off a status label, for the same reason
  // the roster source itself does: renaming Outfield must not change how the app behaves.
  const isActivity = !movement.statusId || movement.statusId === (statuses[0] || {}).id
  // On screen it is just "Vehicle Manifest", both kinds. The selector directly above says
  // which one you are looking at, so naming it again in the heading underneath said the same
  // word twice — and "OUTFIELD VEHICLE MANIFEST" was long enough to crowd everything else off
  // its row.
  //
  // The REPORT keeps the full name. That message is pasted into a chat that carries no
  // selector with it, so it has to say what it is. Derived rather than two hardcoded cases,
  // so a third roster source added later names itself.
  const manifestTitle = 'Vehicle Manifest'
  const reportTitle = isActivity ? 'VEHICLE MANIFEST' : `${sourceLabel.toUpperCase()} VEHICLE MANIFEST`
  const unassigned = roster.people.filter((p) => !assign[p.id])
  // Platoon counts, and whether they need two lines.
  const platoonCounts = groups
    .map((g) => [g, Object.values(assign).filter((a) => (a.g || '') === g.id).length])
    .filter(([, n]) => n > 0)
  // Five or more entries go on two lines, always — not only when they overflow. Whether
  // five happen to FIT depends on the dates beside them (`17-23 AUG` leaves room,
  // `30 AUG - 2 SEP` is 21px wider and does not), so measuring made the card change shape
  // between one exercise and the next for no reason a reader could see. A fixed rule is
  // one shape per platoon count.
  //
  // floor(n/2) above the break, the rest below: five goes 2/3, six goes 3/3. The smaller
  // half on top, so the block reads as one shape instead of a full line with an orphan
  // hanging under it — which is what plain flex wrapping gives you (4 and 1).
  const countsBreakAt = platoonCounts.length >= 5 ? Math.floor(platoonCounts.length / 2) : -1
  // A grid, not a wrapping row, so the two lines agree on their columns — PLT4 sits under
  // PLT1 rather than wherever the line above happened to stop. Columns are max-content, so
  // each is as wide as its own widest entry and nothing is padded out to match "PLT1 - 11".
  //
  // The short line goes on TOP and is pushed to the right-hand columns, which is what makes
  // the block rectangular: auto-placement would fill row one first and give 3/2, so the
  // first entry is placed by hand at the column that leaves exactly countsBreakAt cells
  // before the row ends.
  const countsCols = countsBreakAt > 0 ? Math.ceil(platoonCounts.length / 2) : platoonCounts.length
  const countsStart = countsBreakAt > 0 ? countsCols - countsBreakAt + 1 : 1
  const nameOf = (id) => memberLabel(accounts.find((a) => a.id === id)) || (assign[id] && assign[id].n) || '—'
  // Read off the account, the same place the personnel popup reads it. A platoon admin
  // cannot see other platoons' accounts, so for them this is simply false — which is
  // right, since loaned personnel are not theirs to identify.
  // Seat first, personnel record second. The seat carries these for platoon admins, who
  // cannot read another platoon's records at all; the record covers seats written before
  // the fields existed, which only a super admin can resolve.
  const isAttached = (id, seat) => !!((seat && seat.att) || (accounts.find((a) => a.id === id) || {}).attached)
  const platoonName = (gid) => (groups.find((x) => x.id === (gid || '')) || {}).name || ''
  // A platoon admin cannot read the other platoons' attendance, so he cannot count the
  // company's rostered men — but every seat on the manifest rides on the movement doc
  // itself, which he CAN read. So his headline is the company's seated strength, the same
  // number the TOTAL row adds up across VC, DVR and TRP. It trails the super admin's
  // rostered figure until the last man is assigned, and the amber "yet to be Assigned"
  // line below says so while that is true.
  // Bodies on trucks, for every admin — not the number marked for the movement. A super
  // admin can read both, and the two disagree while anyone is still unassigned; the one
  // worth putting at the top of a manifest is the one the manifest actually accounts for.
  // It reaches the rostered figure the moment the last man is seated, and the amber line
  // below says how many are still missing until then.
  const headlineTotal = Object.keys(assign).length
  // The headline figure wears the primary status colour, the same as the big number on
  // the Count tab's card — one number, one colour, wherever a strength is stated.
  // Declared after the figure it measures: centreUnderPill needs the digit count.
  const totalInk = { display: 'inline-block', ...centreUnderPill(headlineTotal), fontSize: 24, fontWeight: 700, lineHeight: 1, color: statuses[0]?.color || 'var(--blue)' }
  // "Assigned", not the roster source. This number counts SEATS FILLED, and labelling it
  // with the status the roster came from described the wrong thing entirely — it only ever
  // read correctly because nearly everyone marked Outfield ends up on a truck. An activity
  // showed the flaw plainly: "0 Present" beside 35 available men, when every one of them
  // was present and none of them was seated.
  //
  // It also pairs with the amber line directly beneath — "28 Assigned" over "5 Personnel yet
  // to be Assigned" — so the two figures visibly belong to each other and add up to the
  // roster. Which status filled the roster is stated in the setup card, where it is chosen.
  // "5/35 Assigned" — seated, out of everyone the manifest can draw from. The denominator is
  // what the expandable "Not on the Manifest" row used to be: the same fact as one figure, in
  // the place the eye already goes, with no row of its own and no list repeating what the
  // Assign sheet shows anyway. Only the numerator is big, so the centring under the FMC pill
  // still measures a single number.
  // Shaped like the Count tab's "0 / 32 Present": the figure big and in the primary status
  // colour, the rest 13px secondary a hair to its right. The two cards sit one tab apart and
  // state the same kind of thing, so they should not be read as two different kinds of
  // number.
  //
  // The DENOMINATOR is deliberately not the Count tab's. That one is company strength, which
  // leaves attached personnel out; this is everyone the manifest can seat, and a Land Rover's
  // driver is often one of them. Same shape, different question.
  const totalLine = (
    <>
      <b style={totalInk}>{headlineTotal}</b>
      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>/ {roster.people.length} Assigned</span>
    </>
  )
  // Platoon names are typed by an admin, so this can only be a rule, not a lookup:
  // "Platoon 3" -> PLT3 (the shape every platoon here uses), anything else -> its first
  // three letters. Short forms are only ever used under the full total, never alone.
  const shortGroup = (name) => {
    const m = /^\s*platoon\s*(\w+)\s*$/i.exec(name || '')
    return m ? `PLT${m[1].toUpperCase()}` : (name || '').trim().slice(0, 3).toUpperCase()
  }
  // A platoon admin already knows his own men — labelling them with the platoon he is
  // standing in is noise. What he needs marked is everyone from ELSEWHERE on the truck.
  // A super admin has no "own" platoon in this sense, so he sees every label.
  const showPlatoon = (gid) => account.isSuperAdmin || (gid || '') !== (account.groupId || '')
  // Sections in the ATTACHED platoon are used to record what a loaned man is here to do
  // (Driver, Medic, Signaller), so his section name is the most useful thing about him on
  // a manifest — hence a pill of its own next to the ATTACHED flag.
  const sectionOf = (id, seat) => {
    if (seat && seat.sec) return seat.sec
    const a = accounts.find((x) => x.id === id)
    if (!a || !a.miniGroupId) return ''
    const g = groups.find((x) => x.id === (a.groupId || ''))
    return (((g && g.miniGroups) || []).find((m) => m.id === a.miniGroupId) || {}).name || ''
  }
  const inVehicle = (vid) => Object.entries(assign).filter(([, a]) => a.v === vid)
  // ---- Plan versus record -------------------------------------------------------
  // The manifest says who was MEANT to be on each truck. The board says what is true on the
  // day. Nothing here changes either one; it only reports where they disagree.
  //
  // Only from the start date. Before it, every man is unmarked and every row would carry a
  // chip saying so — a warning about a morning that has not happened yet.
  const expectedId = movement.statusId || statuses[0]?.id
  const dayArrived = todayISO() >= movement.date
  // Two ways the plan and the morning disagree, and both need saying.
  //
  // SEATED, NEVER MARKED. A seat is only dropped on a status WRITE — mark a man MC and he
  // comes off the truck at once — but nobody writes anything for a man nobody touches, so he
  // sits there undeclared and no drop ever fires. That is the ordinary state of a manifest
  // built in advance: everyone on it is unmarked until the morning. On the morning this is
  // the to-do list, emptying as the roll call is taken; what is left at the end is men on
  // trucks the roll call never accounted for.
  //
  // MARKED, ON NO VEHICLE — the man left standing at the parade square.
  //
  // Both apply to an activity exactly as to an outfield. No status is not Present: an
  // unmarked row wears the TINTED Present pill, which is the offer to mark him, and only the
  // solid one is the record. So neither line can be waved away as "he was Present anyway".
  const seatedUnmarked = !dayArrived ? [] : Object.keys(assign).filter((id) => (dayStatuses || {})[id] !== expectedId)
  // Which truck each one is on, so the vehicle can say so while it is still shut. The count
  // above tells you how many there are; this tells you where to look, without opening five
  // vehicles to find the one man holding the manifest up.
  const vehHasUnmarked = (vid) => seatedUnmarked.some((id) => assign[id] && assign[id].v === vid)
  const markedNotSeated = !dayArrived ? [] : roster.people.filter((p) => !assign[p.id] && (dayStatuses || {})[p.id] === expectedId)
  const partyOf = (p) => vehicles.filter(([, v]) => (v.party || 'main') === p)
  // How the vehicles divide, what each division is called, and which vehicles are in it.
  //
  // An outfield moves in two waves and the advance party commander needs his own half of
  // the manifest — so the parties are the grouping, and each carries its own Copy Report.
  // An activity has no waves: the only thing its vehicles differ by is what they are, so
  // they group by type and there is ONE report for the whole thing, because nobody commands
  // "the 5-Tonners".
  //
  // Types come out in the order the vehicles are already sorted in, so the grouping follows
  // the order an admin arranged rather than an alphabet they didn't choose.
  //
  // Smallest vehicle first, by seats. A Land Rover leads a Chalk and the 5-Tonners follow
  // it, which is the order a manifest is read in and the same order the outfield's own
  // ADVANCE PARTY / MAIN BODY already puts them in. Sorting on the seat count rather than
  // on the word "Land Rover" keeps it true for a fleet this app has never seen. A type with
  // no seat count recorded sorts last, since there is nothing to place it by.
  const typeSeats = (t) => Math.min(...vehicles.filter(([, v]) => (v.type || 'Vehicle') === t).map(([, v]) => Number(v.seats) || Infinity))
  const vehicleGroups = isActivity
    ? [...new Set(vehicles.map(([, v]) => v.type || 'Vehicle'))]
        .sort((a, b) => typeSeats(a) - typeSeats(b))
        .map((t) => [t, t, vehicles.filter(([, v]) => (v.type || 'Vehicle') === t)])
    : [['adv', 'ADVANCE PARTY', partyOf('adv')], ['main', 'MAIN BODY', partyOf('main')]]

  // A truck with no driver, two drivers, no commander or too many bodies is flagged and
  // still saves. Move-out mornings outrun any constraint you could write.
  function warnings(vid, v) {
    const rows = inVehicle(vid)
    const w = []
    const drivers = rows.filter(([, a]) => a.r === 'driver').length
    const vcs = rows.filter(([, a]) => a.r === 'vc').length
    if (drivers === 0) w.push('No DVR')
    if (drivers > 1) w.push(`${drivers} DVRs`)
    // "VC" and "DVR", not "Vehicle Cmdr" and "Driver": these pills sit on the vehicle's own
    // line, beside the plate, type and seat count, and the long forms pushed that line onto a
    // second row. Both are already the words this screen uses — they head columns in the
    // summary table directly above. The member's own card still spells the role out in full,
    // where the reader is the passenger rather than the man building the manifest.
    if (vcs === 0) w.push('No VC')
    if (vcs > 1) w.push(`${vcs} VCs`)
    // No 'Over Capacity' chip, because there is no such state to report: the assign
    // sheet refuses a pick that would exceed the seats, and the fleet refuses a seat
    // count lowered under the men already on board. A truck cannot be overfilled, so
    // the row never has to find room for a fourth chip — which it did not have.
    return w
  }

  // The app's section header, the same one the Today board and the Personnel list use.
  const headerStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 4px 8px' }
  const amber = 'color-mix(in srgb, var(--orange) 16%, transparent)'
  const amberInk = 'color-mix(in srgb, var(--orange) 75%, var(--text))'
  // The manifest as a message: same *bold* markers as the FMC report, because it goes to
  // the same place. Roll names, not the nicknames the card is read by.
  // The roll name, never the nickname the card is read by: this message goes to higher.
  // A super admin resolves every record; a platoon admin resolves only his own platoon,
  // which is what `fn` on the seat is for.
  const rollName = (id, a) => (((accounts.find((x) => x.id === id) || {}).displayName) || a.fn || a.n || '').toUpperCase()

  function buildManifestReport(onlyKey) {
    // The move-out's own dates, not today's. This message is normally sent the evening
    // before — dating it "today" put the wrong day at the top of something that goes to
    // higher, and said nothing about a manifest that runs into a second day.
    const dayLabel = spanTag(movement.date, movement.until)
    const seats = Object.entries(assign)
    const GROUPS = vehicleGroups.filter(([key]) => !onlyKey || key === onlyKey)
    const lines = [
      `*FMC · ${dayLabel}*`,
      `*${reportTitle}*`,
      '',
    ]
    // The two kinds print their summary differently, because the two are read
    // differently. An OUTFIELD goes to higher as a strength return: the party name
    // carries the number of MEN, the trucks are a footnote under it. An ACTIVITY is read
    // by whoever is loading the vehicles, so the type name carries how many VEHICLES
    // there are and the men are counted underneath.
    //
    // A group with no vehicles is left out entirely rather than printed as a row of
    // zeroes. A group with vehicles but nobody on them still prints: an empty 5-Tonner
    // is a fact the manifest has to state, not an absence.
    //
    // Only when the report covers the whole move-out. On one party the grand total
    // would be a number nothing else in the message adds up to.
    //
    // "TOTAL STRENGTH", not "TOTAL", on both kinds: every other total in the message is
    // a total of one truck or one group, and this is the only one that counts the whole
    // body of men. Naming it settles that before the reader has to work it out.
    if (!onlyKey) lines.push(`*TOTAL STRENGTH: ${seats.length}*`)
    let printed = 0
    GROUPS.forEach(([, label, vs]) => {
      if (!vs.length) return
      const crew = vs.flatMap(([id]) => inVehicle(id))
      const n = (r) => crew.filter(([, a]) => (a.r || 'pax') === r).length
      // Counted, not indexed: an outfield with an empty ADVANCE PARTY skips the first
      // group, and `i` would have opened the block with a stray blank line.
      if (isActivity && printed++) lines.push('')
      lines.push(
        // A one-party report has no grand total above it, so the party's own line is the
        // strength figure for the whole message and says so. In the full report it sits
        // under TOTAL STRENGTH and would be the second "strength" in three lines.
        `*${label.toUpperCase()}${onlyKey ? ' STRENGTH' : ''}: ${isActivity ? vs.length : crew.length}*`,
        ...(isActivity ? [`*TOTAL: ${crew.length}*`] : []),
        `*VC: ${n('vc')} · DVR: ${n('driver')} · TRP: ${n('pax')}*`,
        ...(isActivity ? [] : [`*VEH: ${vs.length}*`]),
      )
    })
    GROUPS.forEach(([, label, vs]) => {
      if (!vs.length) return
      vs.forEach(([id, v]) => {
        lines.push('')
        // The party is repeated above every vehicle, not printed once per party: read on a
        // phone the blocks get scrolled past one at a time, and a truck has to say which
        // party it belongs to without scrolling back up to find out.
        //
        // Not on an activity: there the group IS the vehicle type, which the vehicle's own
        // line prints one row further down anyway.
        //
        // Not on a one-party report either: every truck in that message belongs to the
        // one party its summary already named, so repeating it above each vehicle was
        // answering a question the message cannot raise.
        if (!isActivity && !onlyKey) lines.push(`*${label.toUpperCase()}*`)
        // Same order the card lists them in: commander, driver, then troops by name.
        const rank = { vc: 0, driver: 1, pax: 2 }
        const crew = inVehicle(id).slice()
          .sort((x, y) => ((rank[x[1].r] ?? 2) - (rank[y[1].r] ?? 2)) || rollName(x[0], x[1]).localeCompare(rollName(y[0], y[1])))
        lines.push(`*${[v.callsign, plateLabel(v.plate), v.type].filter(Boolean).join(' · ')}*`, `*TOTAL: ${crew.length}*`)
        crew.forEach(([accId, a]) => {
          const r = a.r === 'vc' ? 'VC - ' : a.r === 'driver' ? 'DVR - ' : ''
          lines.push(`${r}${rollName(accId, a)}${a.att ? ' (ATTACH)' : ''}`)
        })
      })
    })
    return lines.join('\n')
  }
  async function copyManifestReport(onlyParty) {
    try { await navigator.clipboard.writeText(buildManifestReport(onlyParty)) } catch (e) {}
    setCopied(onlyParty || 'all')
    setTimeout(() => setCopied(null), 1500)
  }
  // The same pill in three places, so it is one shape to change.
  // Outlined, not just tinted. --blue-tint is 18% blue, which on a card reads as a
  // faint wash rather than an edge; the stroke is what makes it a button you can see
  // the boundary of. TINT_EDGE, so it is the app's one rule rather than a second
  // opinion. The pill is intrinsically sized, so the stroke adds to it rather than
  // eating the padding: 105x24 becomes 107x26.
  const copyPill = (key, onClick) => (
    <button onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: '4px 10px 4px 8px', borderRadius: 999, background: 'var(--blue-tint)', border: BLUE_EDGE, fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
      {copied === key ? <Check size={14} /> : <DocOnDoc size={14} />}
      {copied === key ? 'Copied' : 'Report'}
    </button>
  )

  // The section a platoon calls "Driver" is where the company keeps its licence holders,
  // so membership of it — in ANY platoon — is what marks a man as a trained driver.
  // Who may take the wheel. The Driver section is the company's licence register; CAH is
  // the exception — its men drive the ambulance, so they are cleared for the role without
  // sitting in a Driver section. One rule, used by the pill, the assign list and the role
  // picker alike, so the three cannot disagree.
  // Two rules, not one. The Driver section is the company's licence register, and that is
  // what the purple pill announces. CAH men drive the ambulance, so they are CLEARED for
  // the role — but they are not the company's drivers and wear no pill; marking a medic as
  // a driver in the picker would be telling an admin something that isn't true.
  const sectionNameOf = (a) => {
    const g = groups.find((x) => x.id === ((a && a.groupId) || ''))
    return (((g && g.miniGroups) || []).find((m) => m.id === (a && a.miniGroupId)) || {}).name || ''
  }
  const isDriverName = (name) => /^\s*drivers?\s*$/i.test(name || '')
  const canDriveName = (name) => isDriverName(name) || /^\s*cah\s*$/i.test(name || '')
  // Pill: licensed drivers only.
  const isDriverSection = (a) => isDriverName(sectionNameOf(a))
  // Eligibility: those, plus CAH. Reads the seat first, so a platoon admin can apply the
  // rule to a man whose record he cannot open.
  const canDrive = (a) => canDriveName(sectionNameOf(a))
  const isDriverRole = (id, seat) => canDriveName(sectionOf(id, seat))

  const violet = 'color-mix(in srgb, var(--purple) 16%, transparent)'
  const violetInk = 'color-mix(in srgb, var(--purple) 75%, var(--text))'
  const errLine = err ? (
    <p style={{ background: 'color-mix(in srgb, var(--red) 14%, transparent)', color: 'var(--red)', borderRadius: 10, padding: '9px 12px', fontSize: 12, margin: '12px 0 0', lineHeight: 1.5 }}>{err}</p>
  ) : null

  // Both sheets shut through here, so the slide-down plays whichever way you leave —
  // the X, Cancel, the scrim, or a role that saved and closed behind you. The state has
  // to live out here rather than inside Sheet: those buttons are the sheet's own children
  // and call these handlers directly, so a flag owned by Sheet would never see them.
  const [sheetClosing, setSheetClosing] = useState(false)
  const exitTimer = useRef(null)
  useEffect(() => () => clearTimeout(exitTimer.current), [])
  const exit = (done) => {
    if (sheetClosing) return
    setSheetClosing(true)
    exitTimer.current = setTimeout(() => { setSheetClosing(false); done() }, RC_SHEET_EXIT_MS)
  }
  const closePicker = () => exit(() => { setPicker(null); setPicked({}); setPickRole('pax'); setSearch(''); setShutGroups({}); setErr('') })
  const closeSheet = () => exit(() => { setSheet(null); setConfirmRemove(false); setErr('') })

  const pickerSheet = (() => {
    if (!picker) return null
    const veh = movement.vehicles[picker.vehicleId] || {}
    const taken = inVehicle(picker.vehicleId).length
    const left = veh.seats ? veh.seats - taken : null
    const q = search.trim().toLowerCase()
    // Only today's roster, with no escape hatch: a seat on a truck and the status board
    // must agree, so the way onto a vehicle is to be marked for the movement first.
    // Personnel loaned to the company get an attached record and the same status
    // (see createAccount) rather than a side door into the manifest.
    // Choosing Driver narrows the list to the men who hold a licence — the Driver
    // section of any platoon. Picking a driver is the one assignment where the wrong
    // name is not just untidy, so the sheet stops offering them.
    const pool = unassigned
      .filter((p) => pickRole !== 'driver' || canDrive(p))
      .filter((p) => !q || memberLabel(p).toLowerCase().includes(q))
    const byGroup = groups.map((g) => [g, pool.filter((p) => (p.groupId || '') === g.id)]).filter(([, list]) => list.length)
    // Counted across every platoon, not per platoon: what makes the sheet unusable is
    // its total height, and five names spread over three platoons still fits.
    const foldByDefault = pool.length > 5
    const pickedIds = unassigned
      .filter((p) => pickRole !== 'driver' || canDrive(p))
      .filter((p) => picked[p.id])
      .map((p) => p.id)
    const n = pickedIds.length
    const over = left !== null && n > left
    return (
      <Sheet onClose={closePicker} closing={sheetClosing}>
        {/* Title and search pinned, the list scrolling under them. Both used to go
            with the list, which on a full truck meant scrolling back up twenty rows
            to reach either the search box or the way out.
            Negative margins on the SIDES only, to bleed the block over the sheet's
            16px gutters so no row shows past its edges on the way under. Never on the
            top: a negative top margin moves the block up in flow but `top: 0` clamps
            it back down, so it paints lower than the space it reserved and the first
            platoon heading ends up under it. The sheet's top padding lives in this
            block's own padding instead — see the Sheet above. */}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--card)', borderBottom: '0.5px solid var(--separator)', margin: '0 -16px 12px', padding: '18px 16px 12px' }}>
          {/* Title line carrying a red X on the right, the same close affordance Set
              Status and the names sheets use. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', minWidth: 0 }}>
              Assign to <span style={{ color: 'var(--text)', fontWeight: 600 }}>{veh.callsign}</span>
              <span style={{ opacity: 0.5 }}> | </span>
              {[veh.type, veh.seats ? `${taken}/${veh.seats} Seats` : `${taken} on board`].filter(Boolean).join(' · ')}
            </p>
            <button onClick={closePicker} aria-label="Close"
              style={{ background: 'none', border: 'none', padding: 0, flexShrink: 0, display: 'flex', cursor: 'pointer' }}>
              <X size={22} color="var(--red)" />
            </button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for Personnel" style={{ width: '100%' }} />
          {/* The role they arrive in, chosen before the tap rather than fixed afterwards one
              man at a time. Troop is the default because that is what most of a truck is; the
              Driver pill on a name says who CAN drive, and this says who IS. Segmented, the
              same control the vehicle rows use for party.
              Pinned up here with the search rather than under the list: on a full company
              these are the two controls you need most and were the only ones you had to
              scroll past everybody to reach — and switching to Driver after picking names
              silently drops the ones who cannot drive, which you could not see happen from
              the bottom of the sheet. */}
          {/* Equal air above and below: it sat flush under the search box and 10px clear of
              the button, so it read as belonging to the search rather than as its own step
              between finding a name and committing it. */}
          <div className="segmented" style={{ margin: '10px 0' }}>
            <span className="seg-pill" />
            {['pax', 'driver', 'vc'].map((r) => (
              <button key={r} type="button" className={pickRole === r ? 'active' : ''}
                onClick={() => {
                  setPickRole(r)
                  // Names picked under the old role can fall out of the new list. Left in
                  // `picked` they would be assigned invisibly, off a list that no longer
                  // shows them.
                  if (r === 'driver') setPicked((sel) => {
                    const next = {}
                    Object.keys(sel).forEach((id) => { if (sel[id] && canDrive(accounts.find((a) => a.id === id) || {})) next[id] = true })
                    return next
                  })
                }}
                style={{ flex: '1 1 0', minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <RoleIcon role={r} />{MOVEMENT_ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <button className="btn-primary" style={{ width: '100%', opacity: n && !over ? 1 : 0.4 }}
            onClick={async () => {
              if (!n) return
              if (pickRole === 'vc' || pickRole === 'driver') {
                const label = MOVEMENT_ROLE_LABEL[pickRole]
                if (n > 1) { setErr(`A vehicle has one ${label} — pick one name.`); return }
                const held = inVehicle(picker.vehicleId).find(([, x]) => x.r === pickRole)
                if (held) { setErr(`${label} already assigned - ${held[1].n}.`); return }
              }
              // The seat count is a limit, not a warning. A truck that leaves with more
              // men than seats is a decision made at the tailboard, not one the manifest
              // should be able to record the night before — so the sheet refuses it here
              // and the vehicle row downstream never has to display an overfull truck.
              if (over) { setErr(left ? `Only ${left} ${left === 1 ? 'seat' : 'seats'} left on ${veh.callsign}.` : `${veh.callsign} is full.`); return }
              if (await run(assignToVehicle(movement.id, picker.vehicleId, pickedIds, pickRole))) closePicker()
            }}>
            {/* Neither the count nor the callsign: the names you ticked are on screen above
                this button and the vehicle is named in the sheet's own title, so both were
                reading the room back to you. The role is the one thing the button decides. */}
            {n ? `Assign as ${MOVEMENT_ROLE_LABEL[pickRole]}` : 'Select Personnel'}
          </button>
          {/* Moved up with the button that raises it. Left at the bottom of the sheet, a
              refused assignment printed its reason a full company's worth of scrolling away
              from the button you had just pressed. */}
          {errLine}
        </div>
        {/* Two different empty states wearing one line before this: a search that
            matched nobody, and a pool with nobody left in it. Only the first is about
            what was typed. */}
        {pool.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '14px 4px' }}>
            {q ? 'No such Personnel.' : pickRole === 'driver' ? 'No more Drivers.' : 'Everyone is already assigned.'}
          </p>
        )}
        {/* One card per platoon, folding the same way the vehicle list on the tab
            behind this sheet does — and the Count tab's day accordion before it: the
            whole header is the toggle, the chevron sits right and rotates, and the
            rows bleed to the card's edges. A bare uppercase heading over a floating
            box, which is what this was, is the app's SECTION header — it belongs to
            things that don't fold. gap 8 between cards, as there.
            Gated on there being any: an empty stack still carried its 12px bottom
            margin, which stacked onto the empty-state line's own 14px and left 26px
            of nothing under "Everyone is already assigned." */}
        {byGroup.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {byGroup.map(([g, list]) => {
          // A search overrides the fold — a name filtered down to one hit inside a
          // shut platoon would look like no hit at all. Failing that, an explicit tap
          // wins; failing THAT, the size of the pool decides: a handful of names is
          // quicker read than opened, but a full company's worth is a card taller than
          // the sheet, so those arrive folded.
          const open = !!q || (shutGroups[g.id] === undefined ? !foldByDefault : !shutGroups[g.id])
          const allPicked = list.every((p) => picked[p.id])
          // Records the state being LEFT, not a flip of the stored value — with an
          // undefined default the two are not the same thing.
          const toggle = () => setShutGroups((s) => ({ ...s, [g.id]: open }))
          return (
            <div key={g.id} className="card" style={{ overflow: 'hidden' }}>
              {/* A div, not a button, for the reason the vehicle header is one: Select
                  All sits on this line and a button cannot nest inside a button. */}
              <div role="button" tabIndex={0} aria-expanded={open} onClick={toggle}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}>
                {/* Full-strength ink while folded, grey once open: shut, the platoon name
                    is the only thing in the card and stands as its title; open, it is a
                    heading over the names, which are what you are reading. */}
                <span style={{ fontSize: 12, fontWeight: 600, color: open ? 'var(--text-secondary)' : 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                {/* 12, not the 8 the vehicle header uses between Assign and its
                    chevron: this pill is a two-word label and sat too close to read as
                    a separate control. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  {/* Only while the platoon is open — a whole platoon selected out of a
                      folded card is a change you cannot see. Turns into Clear All once
                      everything showing is picked, so the button is never a dead tap.
                      Same size and edged tint as Assign on the vehicle header. */}
                  {open && (
                    <button className="btn-secondary" style={{ fontSize: 11, lineHeight: '16px', padding: '3px 11px', border: BLUE_EDGE }}
                      onClick={(e) => { e.stopPropagation(); setPicked((s) => { const next = { ...s }; list.forEach((p) => { next[p.id] = !allPicked }); return next }) }}>
                      {allPicked ? 'Clear All' : 'Select All'}
                    </button>
                  )}
                  <ChevronDown size={16} color="var(--text-secondary)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </span>
              </div>
              {open && (
                <div className="accordion-body" style={{ margin: '10px -16px -14px' }}>
                  {list.map((p) => (
                    <button key={p.id} className="list-row" onClick={() => setPicked((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: picked[p.id] ? 'none' : '1.5px solid var(--text-secondary)', background: picked[p.id] ? 'var(--blue)' : 'transparent', color: '#fff' }}>
                          {picked[p.id] && <Check size={14} />}
                        </span>
                        <span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberLabel(p)}</span>
                        {/* A trained driver, wherever he sits. The section named Driver is
                            the company's own record of who holds a licence, so the picker
                            says it out loud rather than making an admin remember — and it
                            is the same purple, non-status pill an attached man's section
                            wears on the manifest — with the same wheel the Driver role pill
                            already uses, so the two read as the same idea. */}
                        {isDriverSection(p) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: violet, border: VIOLET_EDGE, color: violetInk, fontSize: 10, fontWeight: 600, lineHeight: '15px', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
                            <SteeringWheel size={11} />Driver
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        </div>
        )}
        {over && (
          <p style={{ background: amber, color: amberInk, borderRadius: 10, padding: '9px 12px', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
            {n} selected, {left} {left === 1 ? 'seat' : 'seats'} left — {veh.callsign} cannot take {n - left} more.
          </p>
        )}
              </Sheet>
    )
  })()

  const roleSheet = (() => {
    if (!sheet) return null
    const a = assign[sheet.accountId]
    const veh = a && movement.vehicles[a.v]
    // A platoon admin can take another platoon's man OFF a truck but could never put him
    // back — the picker only offers his own platoon's roster. So the one-way door is shut:
    // removal belongs to whoever can undo it. Changing a ROLE stays open, because he can
    // change it straight back.
    const mine = account.isSuperAdmin || (a && a.g) === account.groupId
    // Built like Set Status, because it is the same kind of decision: a name at the
    // top, the choices as tiles, the current one filled in, and the destructive action
    // paired with Cancel along the bottom.
    return (
      <Sheet onClose={closeSheet} closing={sheetClosing}>
        {/* Title line carrying the red X on its right — the same row the assign sheet
            uses, rather than a box the X floats inside. On this line it sits level with
            the title instead of hanging below it. The sheet has no top padding of its
            own, so this row carries it. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '18px 0 4px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', minWidth: 0 }}>
          Role Picker <span style={{ opacity: 0.5 }}>|</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{nameOf(sheet.accountId)}</span>
          {/* Platoon and section ride with the name they belong to. Left on the line
              below they read as facts about the vehicle, which is what that line is. The
              section comes off the seat for an attached man and off his record otherwise,
              so it shows whenever this admin can resolve it at all. */}
          {[(groups.find((g) => g.id === (a && a.g)) || {}).name, sectionOf(sheet.accountId, a)]
            .filter(Boolean)
            .map((t) => <Fragment key={t}><span style={{ opacity: 0.5 }}> · </span>{t}</Fragment>)}
        </p>
        <button onClick={closeSheet} aria-label="Close"
          style={{ background: 'none', border: 'none', padding: 0, flexShrink: 0, display: 'flex', cursor: 'pointer' }}>
          <X size={22} color="var(--red)" />
        </button>
        </div>
        {/* Callsign, plate, type — the same order the manifest card and a member's seat
            card give them, so the truck is named the same way everywhere. */}
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
          {veh && [veh.callsign, plateLabel(veh.plate), veh.type].filter(Boolean).join(' · ')}
        </p>
        {/* One column, not the two Set Status uses: three roles in a 2-up grid leave a
            half-empty last row, and there is no list of ten here to keep compact. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {['driver', 'vc', 'pax'].map((r) => {
            const selected = a && a.r === r
            return (
              <button key={r}
                onClick={async () => {
                  // Only a man from a Driver section may be made the driver. The pool in
                  // the assign sheet already filters to them; this is the same rule at the
                  // other door into the role, so it cannot be walked around.
                  if (r === 'driver' && !isDriverRole(sheet.accountId, a)) {
                    setErr(`${nameOf(sheet.accountId)} is not a Driver.`)
                    return
                  }
                  // One commander and one driver to a truck. The warning chips used to be
                  // the only thing saying so, which meant the second one still saved.
                  const heldBy = (r === 'vc' || r === 'driver') && inVehicle(a.v).find(([id, x]) => x.r === r && id !== sheet.accountId)
                  if (heldBy) {
                    setErr(`${MOVEMENT_ROLE_LABEL[r]} already assigned - ${heldBy[1].n || nameOf(heldBy[0])}.`)
                    return
                  }
                  if (await run(setMovementRole(movement.id, sheet.accountId, r))) closeSheet()
                }}
                /* Just above the row pills' 3, and well under the 8 a Set Status tile
                   uses between its dot and label: a dot is solid to its edge, an icon
                   carries its own empty margin. */
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${selected ? 'var(--blue)' : 'var(--separator)'}`, background: selected ? 'var(--blue)' : 'transparent', color: selected ? '#fff' : 'var(--text)' }}>
                <RoleIcon role={r} size={16} />
                <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{MOVEMENT_ROLE_LABEL[r]}</span>
              </button>
            )
          })}
        </div>
        {errLine}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {mine && (
            <button className="btn-secondary" style={{ flex: 1, ...dangerFill(confirmRemove) }}
              onClick={async () => {
                if (!confirmRemove) { setConfirmRemove(true); setTimeout(() => setConfirmRemove(false), 3000); return }
                if (await run(unassignFromMovement(movement.id, sheet.accountId))) closeSheet()
              }}>
              {confirmRemove ? 'Tap Again to Confirm' : 'Remove'}
            </button>
          )}
          {/* No solid-blue override: btn-secondary is already tinted blue, which is what
              Cancel should be. Filled, it competed with the selected role tile — the one
              thing on this sheet that means "chosen" — and when Remove is hidden it sat
              there full-width looking like the sheet's main action rather than the way
              out. */}
          <button className="btn-secondary" style={{ flex: 1 }} onClick={closeSheet}>Cancel</button>
        </div>
      </Sheet>
    )
  })()

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <section style={{ marginBottom: 14 }}>
        {/* Title and the copy action on one row: the report IS this card, so the button
            belongs against its heading rather than buried under the vehicle list. Same
            tinted pill and tick-on-success as the Count tab's Copy Report. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {/* Title, then the way to take it back. Beside the title rather than buried in
              Manifest Setup: this is where you are looking when you decide the thing on
              screen is not fit to be read, and it is the same row the Copy Report that
              SENDS it sits on. Only on a published manifest — a draft is already hidden,
              and its own banner carries Publish.
              "Hide", not "Unpublish": it says what happens to the people reading it, in a
              word nobody has to be taught, and the banner it produces spells out the rest. */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={{ ...headerStyle, margin: '0 0 8px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manifestTitle}</h2>
            {movement.published !== false && account.isSuperAdmin && (
              <button aria-label="Edit manifest" onClick={() => setMovementPublished(movement.id, false)}
                style={{ ...CHIP_STYLE, flexShrink: 0, marginBottom: 8, display: 'inline-flex', alignItems: 'center', padding: '3px 8px', background: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)' }}>
                <Pencil size={13} />
              </button>
            )}
          </span>
          <span style={{ marginBottom: 8 }}>{copyPill('all', () => copyManifestReport())}</span>
        </div>
        {err && !picker && !sheet && (
          <p style={{ background: 'color-mix(in srgb, var(--red) 14%, transparent)', color: 'var(--red)', borderRadius: 10, padding: '9px 12px', fontSize: 12, margin: '0 0 8px', lineHeight: 1.5 }}>{err}</p>
        )}
        <div className="card">
          {/* Breakdown sits opposite the FMC pill, right-aligned. EVERY admin sees every
              platoon now: this counts seats, and seats live on the movement document with
              the platoon written onto each one — so a platoon admin reads the whole company
              here without reading a single record he has no right to. That was the only
              thing standing in the way of showing him the full breakdown.
              It wraps rather than truncates if it ever outgrows the space —
              a missing platoon is worse than a second line.
              No flex gap between the entries, and the dot carries equal margin on both
              sides. With a gap the dot sat inside the item that follows it, so it got the
              gap on its left and only a text space on its right — it read as belonging to
              the count after it rather than sitting between two. */}
          {/* gap 8 and the breakdown pushed out with auto, NOT space-between: with three
              items space-between spread all three evenly, so the dates floated 17px
              off the pill and read as their own column rather than as a caption on
              it. This is the Count tab's company row exactly — same pill, same 8px,
              same auto. 6 rather than the Count tab's 8: there the pill's neighbour is the
              day being reported, a fact of its own; here it is the manifest's own dates,
              which belong to the pill closely enough to sit tighter against it. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* The unit the manifest belongs to, in the same pill the Count tab's company
                card wears — same orange, same ink blend, so the two cards are visibly the
                same company. It takes the total's old place so the platoon breakdown keeps
                the full width of the row: five platoons and an attached tally left three
                pixels of slack there, and a sixth would have wrapped. */}
            <span style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 999, background: 'var(--orange)', fontSize: 12, fontWeight: 600, color: 'color-mix(in srgb, var(--orange) 30%, #000)' }}><span style={PILL_INK_CAPS}>FMC</span></span>
            {/* The days the move-out runs, next to the unit whose move-out it is — the
                same pairing the Count tab's company card uses for the day it reports on.
                It matters more here than it did there: a manifest is opened days before
                the morning it is for, so "which days is this" is not answered by the fact
                that you are looking at it. */}
            <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{spanTag(movement.date, movement.until, { collapse: true })}</span>
            {/* Spaced, not dotted. A separator dangles at every width where this wraps:
                the dot lives inside one entry or the other, so it wraps with that entry —
                leading, it strands itself at the start of line two; trailing, it hangs off
                the end of line one. CSS cannot drop a separator only where a line breaks,
                so the separator goes and the gap does the work. Each entry already reads
                as a unit ("PLT1 - 11"), which is what let the dots be redundant.

                Everything on this row stays at the card's 11px — shrinking the counts to
                buy a fourth or fifth entry on one line would have made the one figure an
                admin actually reads smaller than the label above it. The second line is
                the answer instead, and it is a rule rather than an overflow (see
                countsBreakAt), so the block is the same shape for the same platoon count
                whatever the dates beside it happen to measure.

                Entries are left-aligned in their columns, so PLT4 starts under PLT1 and
                the two lines read as one block; the numbers are consequently ragged on the
                right, which is the trade. */}
            <span style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${countsCols}, max-content)`, justifyContent: 'end', justifyItems: 'start', gap: '0 6px', fontSize: 11, lineHeight: 1.15, color: 'var(--text-secondary)', minWidth: 0 }}>
              {/* Seated men, not rostered ones — the same thing the headline beside it
                  counts, so the platoons add up to it. The platoon rides on each seat, so
                  a platoon admin can read every platoon's share even though he cannot read
                  their records. */}
              {platoonCounts.map(([g, n], i) => (
                <span key={g.id} style={{ whiteSpace: 'nowrap', ...(i === 0 ? { gridColumnStart: countsStart } : null) }}>
                  {/* The platoon is the label, the number is the answer — same split as
                      the table below, where the headings are white and read across grey
                      figures. */}
                  {shortGroup(g.name)} - <span style={{ color: 'var(--text)' }}>{n}</span>
                </span>
              ))}
            </span>
          </div>
          {/* Normally the total rides in the table's empty heading cell below. With no
              vehicles there is no table, so it needs a line of its own. */}
          {/* marginTop 2, the same as the table below — this is the same figure sitting under
              the same pill, and it must not shift by 4px just because no vehicles have been
              added yet. 2 is the tally tab's gap, which is where the number came from. */}
          {vehicles.length === 0 && <div style={{ fontSize: 14, marginTop: 2 }}>{totalLine}</div>}
          {vehicles.length > 0 && (
            <>
              {/* Strength by appointment, not one lump of "pax". A table rather than two
                  run-on strings: the numbers line up under their heading, so the two
                  parties compare down the column instead of being read word by word.
                  The heading row is what lets the abbreviations be abbreviations.
                  A zero VC or driver goes amber here — the same warning the vehicle chip
                  gives, visible without opening a party. */}
              {/* Narrow number columns with the label column absorbing the slack: at 1fr
                  each they stretched across the card and the eye had to travel to compare
                  two rows.
                  A CEILING of 38px, not a fixed 38. Fixed, the five columns demanded 210px
                  and the headline beside them another 112, which is 322 in a card that is
                  only 294 wide on a 360px phone — so TOTAL fell off the right edge and the
                  truck counts collided with the headline. Their text needs 14 to 32px, so
                  min-content leaves 55px of room at that width: they hold 38 while there is
                  space for it and give the difference back when there is not. Nothing moves
                  on a wide phone, and nothing overflows on a narrow one. */}
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr minmax(min-content, 48px) repeat(4, minmax(min-content, 38px))', gap: '3px 2px', alignItems: 'baseline', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>
                {/* Rules the truck count off from the three that count men. Absolutely
                    positioned, so it does not occupy a cell and shove the auto-placed
                    numbers sideways — but PLACED in the VEH column all the same: an
                    absolutely positioned grid child may name a grid area, which becomes
                    its containing block without entering auto-placement. So it follows
                    that column's right edge at whatever width the column has resolved to,
                    where a hardcoded offset from the card's right edge only held while
                    every column was exactly 38px. `right: 2` keeps it where it was: 2px
                    inside VEH rather than centred in the 2px gap, which at that width is
                    the only way to see daylight on both sides of it. Started 10px down rather than at the
                    row's top edge: the heading row is as tall as the 24px total beside it,
                    so a line from the top rose well clear of VEH and VC and read as
                    pointing at the platoon breakdown above the card's table.
                    The COLUMN is named and the row deliberately is not. Naming one axis
                    puts the containing block's other edges at the grid container's own
                    padding edges, so the rule spans every row down to TOTAL while still
                    tracking that column sideways. Name both and `-1` means the last line
                    of the EXPLICIT grid — and there are no explicit rows here, so it
                    collapses onto the heading row and stops there. */}
                <span style={{ position: 'absolute', gridColumn: '2 / 3', top: 10, bottom: 0, right: 2, width: '0.5px', background: 'var(--separator)' }} />
                {/* The heading row's label cell was empty, and the total was spending a
                    whole line of its own directly above it. It belongs here: it names what
                    the four columns are counting, on the same baseline as they sit. */}
                <span style={{ textAlign: 'left', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>{totalLine}</span>
                {/* Full-strength ink: these name the columns, and greyed at the same
                    weight as the numbers they were reading as another row of data.
                    VEH carries extra room on its right: it counts trucks, the other four
                    count men, and without the gap the eye reads all five as one series. */}
                {['VEH', 'VC', 'DVR', 'TRP', 'TOTAL'].map((h) => <span key={h} style={{ color: 'var(--text)', fontWeight: 600, ...(h === 'VEH' ? { paddingRight: 10 } : null) }}>{h}</span>)}
                {/* The card's divider, moved inside the table so it rules the headings off
                    from the rows instead of floating above them. */}
                <span style={{ gridColumn: '1 / -1', height: '0.5px', background: 'var(--separator)', margin: 0 }} />
                {vehicleGroups.flatMap(([p, label, vs]) => {
                  if (!vs.length) return []
                  const seats = vs.flatMap(([id]) => inVehicle(id))
                  const byRole = (r) => seats.filter(([, a]) => (a.r || 'pax') === r).length
                  // Short, not empty. Every vehicle needs one commander and one driver, so
                  // the row is short whenever it has fewer than it has vehicles — amber at
                  // 1 driver across 2 trucks, which is a truck that cannot move. Testing
                  // for zero missed exactly that case: the row read a calm grey `1` while a
                  // truck below it carried an amber "No DVR", and the card is the thing an
                  // admin checks first. Troops never warn: a group with no troops is an
                  // empty group, not a group missing someone.
                  const cell = (k, count, need = null, extra) => <span key={`${p}${k}`} style={{ ...(need != null && count < need ? { color: amberInk, fontWeight: 600 } : null), ...extra }}>{count}</span>
                  // Bodies on the group's vehicles — VEH is deliberately not in it: you
                  // cannot add trucks to men.
                  const bodies = byRole('vc') + byRole('driver') + byRole('pax')
                  return [
                    <span key={`${p}l`} style={{ textAlign: 'left', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.toUpperCase()}</span>,
                    cell('veh', vs.length, null, { paddingRight: 10 }), cell('vc', byRole('vc'), vs.length), cell('dvr', byRole('driver'), vs.length), cell('tp', byRole('pax')),
                    cell('tot', bodies, null, { color: 'var(--text)', fontWeight: 600 }),
                  ]
                })}
                {/* What the whole move-out is lifting, which the rows above otherwise leave
                    you to add up. Ruled off rather than bolded: it is the same kind of number
                    as the rows, just their sum. No amber here — the total is short exactly
                    when some row above it is short, so warning twice would only say the same
                    thing louder, and the row is the one that tells you WHERE. */}
                <span style={{ gridColumn: '1 / -1', height: '0.5px', background: 'var(--separator)', margin: 0 }} />
                <span style={{ textAlign: 'left', color: 'var(--text)', fontWeight: 600 }}>TOTAL</span>
                {(() => {
                  const seats = Object.values(assign)
                  const byRole = (r) => seats.filter((x) => (x.r || 'pax') === r).length
                  const bodies = byRole('vc') + byRole('driver') + byRole('pax')
                  return [vehicles.length, byRole('vc'), byRole('driver'), byRole('pax'), bodies]
                    .map((n, i) => <span key={i} style={{ color: 'var(--text)', ...(i === 0 ? { paddingRight: 10 } : null), ...(i === 4 ? { fontWeight: 600 } : null) }}>{n}</span>)
                })()}
              </div>
            </>
          )}
          {/* The roster is everyone on strength now, so this can only mean the platoon or the
              company has nobody in it — not that nobody has been marked yet, which is what it
              used to say and is no longer a reason for an empty manifest. */}
          {roster.people.length === 0 && vehicles.length > 0 && (
            <>
              <div style={{ height: '0.5px', background: 'var(--separator)', margin: '10px 0' }} />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                No Personnel to assign.
              </p>
            </>
          )}
        </div>

        {/* Closed by default, like the vehicles below it: the count is the headline,
            and 96 names is a wall to scroll past to reach the trucks. Open, it is the
            whole list one per line — the run-on "· · ·" it used to be could only ever
            show the first eight, and a name you were hunting for might be in the
            "+88 more". */}
        {/* Where the plan and the morning disagree. Only from the start date, and only the
            counts — the detail is on the rows themselves, which is where you act on it. */}
        {(seatedUnmarked.length > 0 || markedNotSeated.length > 0) && (
          /* An edge, like every other amber thing on this screen. AMBER_EDGE is the same
              stroke the No DVR and No VC chips carry, so the bar reads as the same kind of
              warning at card scale rather than as a tinted panel that happens to be
              orange — and on a card that is itself a filled surface, a wash with no
              boundary is the one shape here that does not say where it ends. */
          <div style={{ background: amber, border: AMBER_EDGE, borderRadius: 14, padding: '12px 16px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {seatedUnmarked.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TriangleAlert size={14} color={amberInk} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: amberInk, fontWeight: 600 }}>
                  {seatedUnmarked.length} Not Marked {sourceLabel} Yet.
                </span>
              </span>
            )}
            {markedNotSeated.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TriangleAlert size={14} color={amberInk} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: amberInk, fontWeight: 600 }}>
                  {markedNotSeated.length} marked {sourceLabel}, Not Assigned a Vehicle Yet.
                </span>
              </span>
            )}
          </div>
        )}
      </section>

      {vehicles.length === 0 ? (
        /* Vehicles are created in Admin, not here — without a way through, this screen
           is a dead end with nothing to press. */
        <div style={{ textAlign: 'center', padding: '44px 20px 8px' }}>
          <Truck size={38} style={{ color: 'var(--separator)' }} />
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 14 }}>No Vehicles Assigned Yet</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '7px 0 0', lineHeight: 1.5 }}>Add the vehicles, then assign personnel.</p>
          <button className="btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onSetUpVehicles}>Set Up Vehicles</button>
        </div>
      ) : vehicleGroups.map(([p, heading, vs]) => {
        if (!vs.length) return null
        // Everyone under this heading, across its trucks — the number the party
        // commander is actually asked for, and one you cannot get by reading three
        // truck counts and adding them up on a move-out morning.
        const heads = vs.reduce((n, [id]) => n + inVehicle(id).length, 0)
        return (
          // Party → vehicle → person, laid out exactly like the Today board's
          // platoon → Section → person. The vehicle is a SUB-HEADING above its rows, not
          // a card of its own: as separate cards, two trucks in the same party read as
          // two unrelated things. The gap between vehicles (14) is deliberately smaller
          // than the gap between parties (24), so the hierarchy is visible without
          // reading a word.
          <section key={p} style={{ marginBottom: 24 }}>
            {/* The party's own report, for the party commander who only needs his half.
                An activity has no such reader — its groups are vehicle types, and nobody
                commands "the 5-Tonners" — so there the one report at the top of the card
                covers everything and these are left off. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={headerStyle}>
                {heading.toUpperCase()}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · </span>
                <span style={{ color: 'var(--text)', fontWeight: 400, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{heads} Total</span>
              </h2>
              {!isActivity && <span style={{ marginBottom: 8 }}>{copyPill(p, () => copyManifestReport(p))}</span>}
            </div>
            {/* gap 8 between cards, the spacing the Count tab's day accordion uses. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vs.map(([id, v]) => {
              const rows = inVehicle(id)
              const w = warnings(id, v)
              // Same order the passenger's own seat card uses: chain of command first,
              // then everyone else by name.
              const rank = { vc: 0, driver: 1, pax: 2 }
              const seated = rows.slice().sort((x, y) => ((rank[x[1].r] ?? 2) - (rank[y[1].r] ?? 2)) || nameOf(x[0]).localeCompare(nameOf(y[0])))
              // The warning chips and Assign, as one list, because where they go depends on
              // how many of them there are rather than on what each one is.
              //
              // Warnings show while the vehicle is CLOSED too: a truck with no driver has to
              // be visible from the index, not one tap inside it. Assign only shows while it
              // is open — closed, the list is an index you scan, and the action to fix a
              // truck belongs with the crew you are looking at.
              const chips = [
                ...w.map((t) => (
                  // 10px, under the app's usual 11px floor: these are the densest chips it
                  // has, three of them share a line with the callsign, and every pixel here
                  // is one the plate line below needs to stay on one row.
                  <span key={t} style={{ background: amber, border: AMBER_EDGE, color: amberInk, fontSize: 10, fontWeight: 600, lineHeight: '16px', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t}</span>
                )),
                // Only while the manifest is a draft. A published manifest is what the
                // company has already been told; changing it from under them is the thing
                // Draft Mode exists to prevent, so the way to change it is to take it back
                // into draft first — which is what the pencil beside the title does.
                // Gone once the truck is full, not left there to open a sheet that can only
                // refuse. Seats are a hard limit now, so a full vehicle has no assignment to
                // offer — and the row reads as finished rather than as one more thing to do.
                // A vehicle with no seat count recorded has no limit and keeps the button.
                ...(openVeh[id] && movement.published === false && !(v.seats && rows.length >= v.seats) ? [(
                  // UserPlus, not Plus: Plus is this app's "make a new record" (New Vehicle,
                  // Create Account), and this seats a man who already exists. Not UserRoundPlus
                  // either — the round head is a different family from the UserCheck/UserCircle/
                  // UserCog already in use. Same edged tint as Mark All on the Today board.
                  // Solid, where the warning chips beside it are tinted: they report a state,
                  // this does something about it, and a filled pill is the app's shape for the
                  // one action on a row. Being the only solid thing on the line is what makes
                  // it findable among three pills.
                  <button key="assign" aria-label="Assign"
                    // Height pinned to 24 to match the chips beside it. They reach 24 from a
                    // 16px line box, 6px of padding and a 1px border; an icon button has no
                    // line box and no border, so the same padding left it 4px short and
                    // reading as a smaller thing than the two pills it sits between.
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 24, boxSizing: 'border-box', padding: '0 7px', borderRadius: 999, border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setPicker({ vehicleId: id }) }}><UserPlus size={14} /></button>
                )] : []),
              ]
              return (
                <div key={id} className="card" style={{ overflow: 'hidden' }}>
                  {/* The Count tab's day accordion, which is the one the app already
                      ships: the whole header is the toggle, and the chevron sits on the
                      right and ROTATES rather than being swapped for a different icon. */}
                  {/* A div, not a button: Assign has to live on this line — after twenty
                      names it would be off the bottom of the screen — and a button
                      cannot be nested inside another button. */}
                  <div role="button" tabIndex={0} aria-expanded={!!openVeh[id]}
                    onClick={() => toggleVeh(id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVeh(id) } }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer' }}>
                    {/* Two lines, not one: the callsign is the name of the thing and
                        carries full-strength ink, while the type and the plate are its
                        detail and sit under it in grey.
                        A COLUMN, and the plate line is a sibling of the chips rather than
                        sitting in a box beside them. Nested inside one, it only ever got
                        what the chips left over — 166px of 336 on a 402px phone, and 124 on
                        a 360px one, against the 136 it needs. That is why it folded on a
                        real phone and not in a preview: the margin was single-digit pixels
                        and a different typeface spent them. Out here it has the card's full
                        width and the question does not arise at any width. */}
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                      {/* Head count rides with the callsign: closed, it is the one thing
                          being scanned down the list. Bodies only — the vehicle's seat
                          capacity is the fleet's business, and over-capacity already
                          speaks for itself as a warning chip. */}
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.callsign}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>·</span>
                        {/* What the truck HAS over what it can TAKE, as one figure. The
                            capacity used to sit on the grey line below as "· 20 Seats",
                            which left that line needing every pixel it had — 151 of 151 —
                            so a phone rendering SF Pro where a desktop renders Segoe UI
                            folded it onto a second row. Up here the two numbers read
                            against each other, in the shape the tab header above already
                            uses ("0 / 35 Assigned") and the assign sheet with it ("0/5
                            Seats"). A vehicle with no seat count recorded has no
                            denominator and says the bare number.

                            No word after it. "ASSIGNED" is 87px of flexShrink: 0 against a
                            callsign that shrinks, which on a 360px viewport left the
                            callsign 21px of the 35 "MID 1" needs — so the fold moved off
                            the plate line and onto the name instead. Bare, it is 26px and
                            the callsign keeps 82: real slack, and room for callsigns far
                            longer than this company's. A fraction beside a truck reads as
                            seats filled without being told so. */}
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{rows.length}{v.seats ? `/${v.seats}` : ''}</span>
                        {/* Beside the head count, because it is a fact about the men on this
                            truck rather than about the truck itself — and it has to be
                            readable with the vehicle shut, which is how the list is scanned
                            on a move-out morning. */}
                        {vehHasUnmarked(id) && <TriangleAlert size={12} color={amberInk} style={{ flexShrink: 0, alignSelf: 'center', position: 'relative', top: 0.5 }} />}
                      </span>
                    {/* The chips share the callsign's line and nothing else. They used to
                        share it with a two-line block whose second line was the plate, which
                        is what made the plate the only thing in the row that could give. */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {chips}
                      {/* The chevron stands off the chips rather than sitting in the run of
                          them: it opens the card, while they describe it, and at the chips'
                          own 5px it read as one more of them. Measured before taking it —
                          the row has 52px spare at the worst case (two warnings plus Assign),
                          so this cannot push the plate line onto a second row. */}
                      <ChevronDown size={16} color="var(--text-secondary)" style={{ marginLeft: 4, transform: openVeh[id] ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </span>
                    </span>
                    {/* The card's full width, under the chips as well as under the callsign.
                        Plate then type, the order a member's own seat card gives them. */}
                    {(v.type || v.plate) && <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[plateLabel(v.plate), v.type].filter(Boolean).join(' · ')}</span>}
                  </div>
                  {openVeh[id] && (<>
                  {/* Bled to the card's edges so the rows sit flush — what the
                      .accordion-body rules in styles.css exist to do.
                      Ruled off from the header above it, the same way the summary card's
                      table rules its headings off from its rows. Open, the callsign line
                      and the first name were two rows of the same list with nothing to say
                      which was the heading. The rule is on the bled edges, so it reaches
                      the card's sides rather than stopping at the text. */}
                  <div className="accordion-body" style={{ margin: '10px -16px -14px', borderTop: '0.5px solid var(--separator)' }}>
                  {seated.length === 0 && (
                    <div className="list-row" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No Personnel assigned yet.</div>
                  )}
                  {seated.map(([accId, a]) => {
                    // Tappable only in draft, for the same reason Assign is: the sheet
                    // behind this row changes a man's appointment or takes him off the
                    // truck, and a published manifest is one the company has already been
                    // given. Rendered as a plain row when published rather than a dead
                    // button — nothing to press is clearer than something that does nothing.
                    const editable = movement.published === false
                    const Row = editable ? 'button' : 'div'
                    return (
                    <Row key={accId} className="list-row" {...(editable ? { onClick: () => setSheet({ accountId: accId }) } : null)}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {/* Platoon rides on the name's own line rather than under it:
                              a second line costs 17px on every row, which on a 20-man
                              truck is half a screen of scrolling. The name keeps the
                              ellipsis, so a long one truncates before the platoon does.
                              Read off the assignment's own `g`, not the account — a
                              platoon admin cannot read other platoons' accounts, and this
                              is why the platoon was denormalised onto the seat. Skipped
                              for attached personnel; their pill already says ATTACHED. */}
                          <span style={{ fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nameOf(accId)}
                            {!isAttached(accId, a) && showPlatoon(a.g) && platoonName(a.g) && (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> · {platoonName(a.g)}</span>
                            )}
                          </span>
                          {/* Only on loaned personnel, so a truck of your own men gains no
                              clutter and these are the only names that catch the eye. Same
                              tag their personnel popup carries, so it reads the same
                              everywhere. */}
                          {isAttached(accId, a) && (
                            <span style={{ background: amber, border: AMBER_EDGE, color: amberInk, fontSize: 10, fontWeight: 600, lineHeight: '15px', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>ATTACH</span>
                          )}
                          {/* Purple: the one hue in the palette carrying no state meaning
                              — blue is action, orange warns, green is checked-in, red
                              deletes — so it reads as a plain category, which is what a
                              section name is. Same 16% wash / 75%-toward-text ink as the
                              ATTACHED pill, so it sits at equal weight beside it. */}
                          {isAttached(accId, a) && sectionOf(accId, a) && (
                            <span style={{ background: violet, border: VIOLET_EDGE, color: violetInk, fontSize: 10, fontWeight: 600, lineHeight: '15px', padding: '2px 8px', borderRadius: 999, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: -4 }}>{sectionOf(accId, a)}</span>
                          )}
                          {/* The roll call has not accounted for this man. Same triangle the
                              vehicle header wears, on the name it is actually about — the
                              header says which truck to open, this says who to look for. He
                              is not dropped, because nothing was ever written for him to
                              drop on; marking him is what settles it either way. */}
                          {seatedUnmarked.includes(accId) && (
                            // marginLeft pulls it back from the row's 8px gap to 4. It is not
                            // another tag in the series beside it — it is a mark ON the name,
                            // and at the pills' own spacing it read as a third pill.
                            <TriangleAlert size={12} color={amberInk} style={{ flexShrink: 0, alignSelf: 'center', position: 'relative', top: 0.5, marginLeft: -4 }} />
                          )}
                        </span>
                      </span>
                      {/* Every appointment wears the same solid pill, Troop included. Troop used to be
                            grey text while VC and Driver were pills, which made the commander and the
                            driver look like the only ones with a place on the truck. They are all
                            seated, and the row should say so in one shape. */}
                      <span style={rolePill(a.r || 'pax', { flexShrink: 0, marginLeft: 10 })}><RoleIcon role={a.r || 'pax'} />{MOVEMENT_ROLE_LABEL[a.r || 'pax']}</span>
                    </Row>
                    )
                  })}
                  </div>
                  </>)}
                </div>
              )
            })}
            </div>
          </section>
        )
      })}
      {pickerSheet}
      {roleSheet}
    </div>
  )
}

// Setting up the vehicle manifests. Segments, not stacked sections: the two manifests are
// each "this Saturday", the fleet is "the trucks you always have", and the fleet outlives
// every manifest. Stacking them implied the fleet belonged to one movement, which is
// backwards.
//
// Flat, one row of three, rather than a manifest/fleet split with a second control nested
// inside it. Two segmented tracks stacked in a 402px card is a lot of switching furniture,
// and you stop being sure which one you last touched.
//
// Opens on Outfield Setup rather than the leftmost tab: the fleet is the thing you set up
// once, and the manifest is the thing you come back to.
function MovementSetupCard({ movements, fleet, statuses, onDone, saveMovement, removeMovement, removeMovementVehicle, setVehicleParty, setMovementRange, setMovementPublished, saveFleetVehicle, removeFleetVehicle, onBackChange, eventFrom, eventTo }) {
  const [seg, setSeg] = useState('outfield')
  const kind = seg === 'fleet' ? null : seg
  const movement = (kind && movements[kind]) || null
  // The roster source IS the kind, not a choice made alongside it. A move-out draws from the
  // first status flagged rosterSource (Outfield); an activity draws from Present, stored as
  // `''` — the same empty value that has always meant "the default status".
  //
  // Never a label match, always the flag: renaming Outfield must not quietly switch this off,
  // exactly as with MC's requiresDoc. If no status carries the flag there is nothing for a
  // move-out to roster from, and it falls back to Present rather than to nothing at all.
  const sourceFor = (k) => (k === 'activity' ? '' : ((statuses.find((x) => x.rosterSource) || {}).id || ''))
  const statusId = sourceFor(kind)
  const isActivity = kind === 'activity'
  // An outfield and an activity only happen DURING an ICT, so the period is the frame their
  // dates sit in - the same frame a reporting-location override already sits in. Enforced
  // only while a period exists: with none set there is nothing to be inside, and a manifest
  // drawn up before the dates were punched in would otherwise have nowhere to go.
  //
  // Nothing re-clamps a manifest when the ICT dates later move. A manifest is a PLAN for the
  // days named on it, and once those days pass it is the record of what went out - unlike an
  // override, which is a rule that keeps applying until something stops it. So this is a rule
  // about what can be typed, not one the manifests already stored are held to.
  const inIct = !!(eventFrom && eventTo)
  // Where a manifest with no dates of its own opens. Inside the period when there is one:
  // opening on today would put a NEW manifest outside the window it has to sit in, and the
  // first thing on screen would be a complaint about a date nobody chose.
  const startDefault = () => {
    const t = todayISO()
    if (!inIct) return t
    return t < eventFrom ? eventFrom : (t > eventTo ? eventTo : t)
  }
  const [date, setDate] = useState(movement?.date || startDefault())
  // Last day of the movement. Its own field rather than a duration, because an outfield
  // is announced by its dates. Equal to `date` for the ordinary one-day move-out, which
  // is what everything downstream falls back to when `until` is missing entirely.
  const [to, setTo] = useState(movement?.until || movement?.date || startDefault())
  // The manifest names itself after what it rosters from, so there is still nothing to type
  // into a name field. It was fixed to 'OUTFIELD' when a move-out was the only thing this
  // could be; an activity rostered from Present is not one. Written on every save, so an
  // older manifest picks up its own name the next time it is touched.
  //
  // Must sit below `statusId`: reaching a `const` declared further down is a temporal dead
  // zone the production build compiles happily and the first render throws on.
  const name = ((statuses.find((x) => x.id === (statusId || statuses[0]?.id)) || {}).label || 'OUTFIELD').toUpperCase()
  // Each tab is a different manifest, so the draft starts again on its own dates when the
  // tab changes. Without this, switching to Activity would show the outfield's dates in a
  // form that saves to the activity.
  const firstSeg = useRef(seg)
  useEffect(() => {
    if (firstSeg.current === seg) return
    firstSeg.current = seg
    if (!kind) return
    const mv = movements[kind]
    setDate(mv?.date || startDefault())
    setTo(mv?.until || mv?.date || startDefault())
  }, [seg])
  const [adding, setAdding] = useState(false)
  const [vehDraft, setVehDraft] = useState(null)
  // What the vehicle looked like when the form opened, so Save can tell a change from a look.
  // Held beside the draft rather than snapshotted on mount: this form is a branch of the SAME
  // component, so it does not remount between one vehicle and the next and an initial-value
  // ref would keep the first vehicle's baseline forever. `openVeh` is the only way in — all
  // three doors (fleet edit, fleet add, manifest add) go through it, so the two cannot drift.
  const [vehBase, setVehBase] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [msg, setMsg] = useState('')
  // The vehicle editor is a sub-view of this card, but the header that would carry a back
  // chevron belongs to the PopupCard one level up — so the way out is reported upward and
  // the parent hands it to `onBack`. Reported as null whenever the editor is closed, and on
  // unmount, so a chevron cannot outlive the view it goes back from.
  useEffect(() => {
    if (!onBackChange) return undefined
    onBackChange(vehDraft ? () => { setVehDraft(null); setMsg('') } : null)
    return () => onBackChange(null)
  }, [vehDraft, onBackChange])
  // Report a rejected write instead of closing the form as though it worked.
  const run = async (p) => { const r = await p; setMsg(r && r.ok === false ? r.message : ''); return !r || r.ok !== false }

  // Present is always offered; anything else has to carry rosterSource, the same flag
  // the activity feature reads. Never a label match — renaming Outfield must not
  // silently switch this off, exactly as with MC's requiresDoc.
  const vehicles = Object.entries(movement?.vehicles || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
  const fleetList = Object.entries(fleet || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
  const inManifest = new Set(vehicles.map(([id]) => id))
  const arm = (id, run, ms = 3000) => { if (confirmId === id) { run(); setConfirmId(null) } else { setConfirmId(id); setTimeout(() => setConfirmId((c) => (c === id ? null : c)), ms) } }

  // Save lights up only when the draft differs from what is stored, so the button
  // itself says whether there is anything outstanding — no "Saved." line needed.
  // The manifest's id is minted once, from the kind and the date it was created on, and then
  // never moves. It is a key, not a fact — letting it track `date` would mean changing a
  // start date silently created a SECOND document and orphaned the first, which is what the
  // date-keyed build did.
  const mvId = movement?.id || movementDocId(kind, date)
  const dirty = !movement || date !== movement.date || to !== (movement.until || movement.date) || (statusId || '') !== (movement.statusId || '')
  const saveSetup = async () => {
    // An empty end date is its own complaint, not a comparison. A date field hands back an
    // empty string both when it was never filled in and when what was typed is not a real
    // day - 31 September being the one that catches people - and the browser gives no way to
    // tell those apart. Folded into the range check it blamed the start date for a month
    // that has thirty days.
    if (!to) { setMsg('Pick a valid End Date.'); return }
    if (to < date) { setMsg('End Date cannot be before the Start Date.'); return }
    // The two manifests cannot cover the same day. A man holds ONE seat — his card carries a
    // single movement — so a day claimed by both would let him be seated twice and show him
    // whichever seat was written last. Blocked here, at the dates, rather than policed later
    // at every assignment.
    //
    // Ranges overlap when each starts on or before the other ends. ISO dates compare as
    // strings, so this needs no parsing.
    const other = movements[kind === 'outfield' ? 'activity' : 'outfield']
    if (other && date <= (other.until || other.date) && other.date <= to) {
      setMsg(`Dates overlap with ${kind === 'outfield' ? 'Activity' : 'Outfield'}.`)
      return
    }
    // Belt to the pickers' braces below. min/max stops the arrows and the calendar going
    // outside the period, but a TYPED date is not held by them - the browser accepts it and
    // merely reports the field as invalid, which nothing here reads.
    if (inIct && (date < eventFrom || to > eventTo)) {
      setMsg('Dates must be within the ICT Period.'); return
    }
    // A manifest that does not exist yet is created as a DRAFT — the whole point is that it
    // is built before anyone is told about it. An existing one keeps whatever it already is,
    // so saving a date on a published manifest does not silently pull it off every phone.
    if (!(await run(saveMovement(mvId, date, { name: name.trim(), kind, statusId: statusId || null, until: to, ...(movement ? null : { published: false }) })))) return
    // Each rider's own card carries the movement's dates AND its party, so a changed end
    // date or a changed roster source has to be mirrored onto all of them — saveMovement
    // alone only touches the manifest.
    //
    // The source matters because a party is written onto every seat and an activity has
    // none: switch a move-out to Present and, without this, every man's phone would go on
    // saying "Main Body" for a wave that no longer exists.
    const wasActivity = movement && (!movement.statusId || movement.statusId === statuses[0]?.id)
    if (movement && ((movement.until || movement.date) !== to || wasActivity !== isActivity)) {
      await run(setMovementRange(mvId, date, to, statusId || null))
    }
    // Save is the end of this card's job — the dates and the roster source are set, and
    // the vehicles below are edited on the Movement tab. Only on the way through: a
    // rejected write leaves the card open with its message.
    if (onDone) onDone()
  }

  const newId = () => 'veh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  // The same field label, section header and row-delete affordances the Reporting
  // Location card uses — this card had its own set of each, which is what made it read
  // as a different app.
  const label0 = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }
  // The three "nothing here yet" lines on this sheet are 11px, a step under the 13 the app
  // uses for body copy. Roy's call. They stand in for a LIST, under a 12px label, and at 13
  // they were the largest text in the block - the absence of vehicles reading louder than
  // the heading that named them.
  const label = { fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 6px' }
  const hint = { fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }
  const errMsg = msg ? <p style={{ fontSize: 12, color: 'var(--red)', margin: '10px 0 0', lineHeight: 1.5 }}>{msg}</p> : null
  const delBtn = (id, onDel, aria) => (
    <button onClick={() => arm(id, onDel)} aria-label={aria}
      style={{ background: 'none', border: 'none', padding: 4, color: confirmId === id ? 'var(--red)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
      {confirmId === id ? 'Confirm' : <Trash2 size={16} />}
    </button>
  )

  async function addFromFleet(id) {
    const v = fleet[id]
    if (!v) return
    if (await run(saveMovement(mvId, date, { name: name.trim(), kind, statusId: statusId || null, until: to, ...(movement ? null : { published: false }), vehicles: { [id]: { ...v, party: 'main', order: vehicles.length } } }))) setAdding(false)
  }

  // Every field, not just the callsign: a vehicle with no plate or no seat count is a
  // half-record that has to be chased down later, and the manifest takes its own copy of
  // whatever is saved here — so a gap gets frozen into the movement as well.
  const vehSig = (d) => JSON.stringify([d.callsign.trim(), d.type.trim(), (d.plate || '').trim(), String(d.seats || '').trim()])
  const openVeh = (d) => { setVehDraft(d); setVehBase(vehSig(d)) }
  const vehDirty = !!vehDraft && vehSig(vehDraft) !== vehBase

  const vehMissing = (d) => [
    !d.callsign.trim() && 'Callsign',
    !d.type.trim() && 'Type',
    !(d.plate || '').trim() && 'Plate No.',
    !(parseInt(d.seats, 10) > 0) && 'Seats',
  ].filter(Boolean)

  async function saveVehicle() {
    const d = vehDraft
    if (!d) return
    const missing = vehMissing(d)
    if (missing.length) { setMsg(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} still empty.`); return }
    // The other way a truck could end up overfull: not by seating one man too many, but
    // by taking a seat away from under the men already on it. A fleet edit is pushed onto
    // the live manifest below, so lowering the count there would do it at a distance —
    // from a card that isn't showing the manifest. Refused, and it names the number to
    // beat so the fix is obvious: take men off first, or keep the count.
    const onBoard = d.id ? Object.values((movement && movement.assign) || {}).filter((x) => x.v === d.id).length : 0
    if (onBoard > (parseInt(d.seats, 10) || 0)) {
      setMsg(`${onBoard} already on board — Seats cannot go below ${onBoard}.`)
      return
    }
    const veh = { callsign: d.callsign.trim(), type: d.type.trim(), plate: (d.plate || '').trim(), seats: parseInt(d.seats, 10) || 0, order: d.order ?? fleetList.length }
    let ok
    if (d.target === 'fleet') {
      ok = await run(saveFleetVehicle(d.id || newId(), veh))
      // The manifest holds its own copy of a vehicle, so a fleet edit would otherwise
      // leave the truck already rostered showing the old details. Push the correction
      // across at write time — one extra write, and only when that vehicle is actually
      // on the LIVE manifest. Past movements are left alone: they are the record of what
      // went out that day, not a view of the fleet as it is now.
      if (ok && d.id && inManifest.has(d.id)) {
        const cur = (movement && movement.vehicles && movement.vehicles[d.id]) || {}
        ok = await run(saveMovement(mvId, date, { name: name.trim(), kind, statusId: statusId || null, until: to, vehicles: { [d.id]: { ...veh, party: cur.party || 'main', order: cur.order ?? vehicles.length } } }))
      }
    } else {
      const isNew = !d.id
      const id = d.id || newId()
      ok = await run(saveMovement(mvId, date, { name: name.trim(), kind, statusId: statusId || null, until: to, vehicles: { [id]: { ...veh, party: d.party || 'main', order: d.order ?? vehicles.length } } }))
      // A vehicle typed in here ALWAYS joins the standing fleet as well. This used to be a
      // `Save to fleet` tick, off by default, and the default was wrong: the fleet is the
      // trucks the unit has, and typing a callsign, type, plate and seat count is saying
      // this is one of them. Leaving it unticked meant retyping the same truck for the next
      // movement, and a fleet that quietly disagreed with the manifests drawn from it.
      // New only. An EDIT here is a change to this movement's copy — the fleet keeps its own
      // (see the `target === 'fleet'` branch above, which pushes the other way).
      if (ok && isNew) ok = await run(saveFleetVehicle(id, veh))
    }
    if (ok) setVehDraft(null)
  }

  if (vehDraft) {
    return (
      <div>
        <p style={label0}>Callsign</p>
        <input value={vehDraft.callsign} onChange={(e) => setVehDraft((d) => ({ ...d, callsign: e.target.value }))} placeholder="12A, 14B, etc." style={{ width: '100%' }} />
        <p style={label}>Type</p>
        <input value={vehDraft.type} onChange={(e) => setVehDraft((d) => ({ ...d, type: e.target.value }))} placeholder="LUV, 5-Tonner, WRV, etc." style={{ width: '100%' }} />
        {/* Sits with Type rather than with Seats: callsign, type and plate are the three
            ways the same vehicle gets named, and the seat count is a capacity. */}
        <p style={label}>Plate No.</p>
        {/* Digits only, so it raises the keypad rather than the full keyboard — pattern as
            well as inputMode, which is the pair iOS Safari actually acts on. The MID is
            never typed; plateLabel puts it back wherever the plate is shown. */}
        {/* The MID is printed INSIDE the field rather than prefilled into it: a prefilled
            value can be backspaced away, and then the stored plate carries a prefix the app
            is also adding. This way it is visibly part of the field and cannot be typed
            over — the caret starts after it. Left padding clears the affix at 16px. */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-secondary)', pointerEvents: 'none' }}>MID</span>
          <input value={vehDraft.plate || ''} onChange={(e) => setVehDraft((d) => ({ ...d, plate: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric" pattern="[0-9]*" style={{ width: '100%', paddingLeft: 50 }} />
        </div>
        <p style={label}>Seats</p>
        <input value={vehDraft.seats} onChange={(e) => setVehDraft((d) => ({ ...d, seats: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric" pattern="[0-9]*" placeholder="Total QTY of Seats incl. Driver and VC" style={{ width: '100%' }} />
        {errMsg}
        {/* No Cancel. The card's header carries a back chevron wired to the same thing
            (PopupCard `onBack`, reported up by the effect near the top of this component),
            so the button was a second copy of a control already on screen — and it took half
            the row from the only action the form is for. */}
        {/* Solid only when there is a change to save, like every other Save in the app.
            `disabled` on `!vehDirty` alone, NOT on a missing field: a half-filled vehicle has
            to stay tappable, because tapping it is what names the field that is empty — a
            dead button leaves you hunting for the reason yourself. Nothing typed at all is
            the one case with nothing to explain. */}
        <button className="btn-primary" disabled={!vehDirty} style={{ width: '100%', marginTop: 12, opacity: vehDirty && !vehMissing(vehDraft).length ? 1 : 0.4 }} onClick={saveVehicle}>Save</button>
      </div>
    )
  }

  if (adding) {
    const available = fleetList.filter(([id]) => !inManifest.has(id))
    return (
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>Pick from the Vehicle Fleet or add a new Vehicle.</p>
        {available.length === 0
          ? <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>All Vehicles have been selected. Create a new one.</p>
          : (
            <div style={{ borderRadius: 14, overflow: 'hidden' }}>
              {available.map(([id, v]) => (
                <button key={id} className="list-row" onClick={() => addFromFleet(id)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}><span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.callsign}</span>{v.plate && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>· {plateLabel(v.plate)}</span>}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{[v.type, v.seats ? `${v.seats} Seats` : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  {/* A span, not a button: the whole row is already the button, and a
                      button cannot nest inside one. Styled as the app's small pill so it
                      reads as the action it is rather than a bare icon. */}
                  <span style={{ fontSize: 11, lineHeight: '16px', padding: '3px 11px', borderRadius: 999, flexShrink: 0, marginLeft: 10, whiteSpace: 'nowrap', color: 'var(--blue)', background: 'var(--blue-tint)', border: BLUE_EDGE }}>Add to Manifest</span>
                </button>
              ))}
            </div>
          )}
        <button className="btn-primary" style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14 }}
          onClick={() => { setAdding(false); openVeh({ id: null, callsign: '', type: '', plate: '', seats: '', target: 'movement', party: 'main' }) }}>
          <Plus size={16} /> New Vehicle
        </button>
        {errMsg}
        <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => { setAdding(false); setMsg('') }}>Cancel</button>
      </div>
    )
  }

  return (
    <>
      <div className="segmented segmented--fill" style={{ marginBottom: 8 }}>
        <span className="seg-pill" />
        {[['fleet', 'Vehicle Fleet'], ['outfield', 'Outfield Setup'], ['activity', 'Activity Setup']].map(([key, text]) => (
          <button key={key} type="button" className={seg === key ? 'active' : ''} onClick={() => setSeg(key)}>{text}</button>
        ))}
      </div>

      {kind ? (
        <>
          {/* Two fields, not one: a movement that runs Tuesday to Thursday is the normal
              shape of an outfield, and the manifest has to survive to the last morning
              of it. Same day in both is the one-day move-out.
              Side by side because they are one answer — a span reads left to right, and
              stacked they looked like two unrelated settings. */}
          {/* Labels on their own row above the inputs, the same shape the ICT Period card
              uses — which is what leaves a slot for Reset's warning to sit directly under
              the chip instead of below the date boxes. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end', margin: '0 0 3px' }}>
            {/* Named after the tab you are on, so the two forms cannot be mistaken for each
                other at a glance — they are otherwise identical. */}
            <p style={{ ...label0, margin: 0 }}>{kind === 'activity' ? 'Activity' : 'Outfield'} Start Date</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, minHeight: 22 }}>
              <p style={{ ...label0, margin: 0 }}>End Date</p>
              {/* Throws away the whole manifest, so it sits up here as a small chip
                  rather than a full-width button among the ordinary actions. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {movement && (
                  <button onClick={() => arm('delmanifest', () => removeMovement(mvId), 5000)}
                    style={{ ...CHIP_STYLE, flexShrink: 0, background: 'var(--red-tint)', color: 'var(--red)' }}>
                    {/* "Clear", not "Reset". Roy's call. Reset says "put it back how it
                        was"; this deletes the manifest outright, and the two are not the
                        same promise. */}
                    {confirmId === 'delmanifest' ? 'Confirm' : 'Clear'}
                  </button>
                )}
              </span>
            </div>
          </div>
          {confirmId === 'delmanifest' && (
            <p style={{ fontSize: 11, color: 'var(--red)', textAlign: 'right', margin: '0 0 6px' }}>Deletes Vehicle Manifest</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Held to the ICT period, the same way a reporting-location override is: the
                pickers simply will not go outside it, so the rule is a shape rather than a
                message. Unbounded when no period is set. */}
            <input type="date" min={eventFrom || undefined} max={eventTo || undefined} value={date} onChange={(e) => { const v = e.target.value; setDate(v); if (to < v) setTo(v) }} style={{ width: '100%' }} />
            {/* A date field fires onChange on EVERY keystroke, so typing "20" arrives
                first as the 2nd of the month. Clamping that to the start date rewrote the
                field mid-word and the "0" was never typed — the end date could not be
                moved at all. So a half-typed date is left alone on screen; nothing here
                writes anyway until Save. */}
            <input type="date" value={to} min={date} max={eventTo || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: '100%' }} />
          </div>

          {/* Under the fields it is about and directly above the button that raised it. It
              used to sit at the very bottom of the card, below the whole vehicle list — far
              enough from Save that a rejected save looked like nothing had happened. */}
          {errMsg}
          {/* The dates and the roster source used to write on every keystroke and every
              dropdown flick, so brushing past them silently re-dated a live manifest.
              They are a draft now, and this is the only thing that commits them. */}
          <button className="btn-primary" style={{ width: '100%', marginTop: 14, opacity: dirty ? 1 : 0.4 }}
            disabled={!dirty} onClick={saveSetup}>Save</button>
          {/* Everything above the line is the movement itself and is held until Save;
              everything below writes the moment you touch it. */}
          <div style={{ height: '0.5px', background: 'var(--separator)', margin: '16px 0 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '18px 0 6px' }}>
            {/* "Total", spelled out, the way the platoon header counts its personnel. A
                bare number after a dot reads as an index - "Vehicles · 1" looks like the
                first of several - and the word is what turns it into a count. */}
            {/* No count at zero. Roy's call. The empty state right below already says
                "No Vehicles Assigned Yet", so "Vehicles · 0 Total" over it is the same
                nothing said twice - and a zero beside a heading reads as a figure worth
                reading when it is only the absence of one. The dot goes with it: a
                separator with nothing on its right is a line that looks unfinished.

                TOTAL in capitals against a sentence-case "Vehicles". Roy's call. The word
                is not part of the name of the thing - it labels the number - so setting
                it apart is what stops it reading as "Vehicles Total". */}
            <p style={{ ...label0, margin: 0 }}>Vehicles{vehicles.length ? ` · ${vehicles.length} TOTAL` : ''}</p>
            <button className="btn-secondary" onClick={() => { setMsg(''); setAdding(true) }}
              style={{ fontSize: 11, lineHeight: '16px', padding: '3px 11px', flexShrink: 0, border: BLUE_EDGE }}>
              Add Vehicle
            </button>
          </div>
          {vehicles.length === 0
            /* Two lines, not one sentence run on. The first states what is true, the second
               says what to do about it — the same split every other stand-down in the app
               makes, and on a 402px screen a single line wrapped wherever it happened to run
               out of room rather than between the two thoughts. */
            ? <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>No Vehicles Assigned Yet.<br />Add Vehicles, then Assign Personnel.</p>
            : (
              <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                {vehicles.map(([id, v]) => (
                  <div key={id} className="list-row">
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}><span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.callsign}</span>{v.plate && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>· {plateLabel(v.plate)}</span>}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{[v.type, v.seats ? `${v.seats} Seats` : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 10 }}>
                      {!isActivity && (
                        <div className="segmented">
                          <span className="seg-pill" />
                          {[['adv', 'ADV'], ['main', 'MAIN']].map(([p, t]) => (
                            <button key={p} type="button" className={(v.party || 'main') === p ? 'active' : ''} style={{ fontSize: 12, padding: '4px 9px' }}
                              onClick={() => run(setVehicleParty(mvId, id, p))}>{t}</button>
                          ))}
                        </div>
                      )}
                      {delBtn(id, () => removeMovementVehicle(mvId, id), 'Remove vehicle')}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </>
      ) : (
        <>
          {fleetList.length === 0
            ? <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>No saved vehicles yet.</p>
            : (
              <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                {fleetList.map(([id, v]) => (
                  <div key={id} className="list-row">
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}><span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.callsign}</span>{v.plate && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>· {plateLabel(v.plate)}</span>}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{[v.type, v.seats ? `${v.seats} Seats` : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    {/* Pencil then bin, the same pair in the same order the manifest rows
                        above carry — and the reason the edit form no longer keeps a Delete
                        of its own. Removing a vehicle from a list you are already looking at
                        should not cost opening the vehicle first, and a full-width red
                        button at the bottom of an edit form is a heavy way to say what a
                        16px bin on the row says. `arm` is keyed `fleet:<id>` rather than the
                        bare id: the manifest's rows use the SAME vehicle ids, so a row armed
                        here would otherwise leave its twin over there showing Confirm when
                        the segment is switched. */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                      <button aria-label="Edit vehicle" style={{ background: 'none', border: 'none', padding: 4, color: 'var(--text-secondary)', flexShrink: 0 }}
                        onClick={() => openVeh({ id, callsign: v.callsign || '', type: v.type || '', plate: v.plate || '', seats: v.seats ? String(v.seats) : '', order: v.order, target: 'fleet' })}><Pencil size={15} /></button>
                      {delBtn(`fleet:${id}`, () => removeFleetVehicle(id), 'Delete vehicle')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          <button className="btn-primary" style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14 }}
            onClick={() => openVeh({ id: null, callsign: '', type: '', plate: '', seats: '', target: 'fleet' })}>
            <Plus size={16} /> Add Vehicle
          </button>
        </>
      )}
    </>
  )
}

// Text input with optional trailing action icons inside the field border:
// a blue "use my location" (LocateFixed) tap target and a grey clear (CircleX)
// that appears only when the field has text (iOS convention).
// inputMode is passed through so number-only fields (radius, minutes) raise the
// numeric keypad on iOS instead of the full keyboard. Kept as type=text so the
// existing digit-stripping onChange stays in control of the value.
function IconInput({ value, onChange, onClear, onLocate, placeholder, autoFocus, inputMode }) {
  return (
    <div className="icon-field">
      <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} inputMode={inputMode} />
      {onLocate && (
        <button type="button" aria-label="Use my location" title="Use my current location" onClick={onLocate}
          style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: 'var(--blue)', flexShrink: 0, cursor: 'pointer' }}>
          <LocateFixed size={16} />
        </button>
      )}
      {onClear && value && (
        <button type="button" aria-label="Clear" onClick={onClear}
          style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer' }}>
          <CircleX size={16} />
        </button>
      )}
    </div>
  )
}

// Password field with a trailing eye toggle to reveal/mask the input, matching
// the .icon-field look used elsewhere. Reveal state is local to each field.
function PasswordInput({ value, onChange, onBlur, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="icon-field">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}
        style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: show ? 'var(--blue)' : 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer' }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function AdminView({
  accounts, groups, account,
  createAccount, removeAccount, returnToPlatoon, addGroup, removeGroup, renameGroup, reorderGroup, setGroupOrder, setAccountGroup,
  addMiniGroup, renameMiniGroup, removeMiniGroup, reorderMiniGroup, setMiniGroupOrder, setAccountMiniGroup, reorderMember,
  lockdown, saveLockdown, setAccountPassword, setAccountDisplayName, setAccountNickname, setAccountUsername, renameMigratedAccount,
  deviceLogins, clearDeviceLock, setLockoutsOpen,
  setGroupInfo,
  groupFields, addGroupField, removeGroupField, reorderGroupField, setGroupFieldOrder, renameGroupField,
  accountFields, addAccountField, removeAccountField, reorderAccountField, setAccountFieldOrder, renameAccountField, setAccountFieldEditable, setAccountInfo, setAccountRole,
  adminSubTab, setAdminSubTab,
}) {
  const [openPopup, setOpenPopup] = useState(null)
  // Tells App when Device Lockouts is on screen, which is the only moment their listener
  // runs. Every route in and out of the card moves `openPopup`, including opening some
  // other card, so watching it covers all of them. The two pages beside this one on the
  // swipe are handed a no-op — an off-screen Settings page must not open a listener.
  useEffect(() => {
    setLockoutsOpen(openPopup === 'lockouts')
    return () => setLockoutsOpen(false)
  }, [openPopup, setLockoutsOpen])
  const [newAcc, setNewAcc] = useState({ username: '', displayName: '', nickname: '', groupId: '', miniGroupId: '', role: '', attached: false })
  const [accMsg, setAccMsg] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [platoonInfoTab, setPlatoonInfoTab] = useState('categories')
  const [newAccountFieldLabel, setNewAccountFieldLabel] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [editMsg, setEditMsg] = useState('')
  const [popupAccount, setPopupAccount] = useState(null)
  const [shownAccount, accountClosing] = useExiting(popupAccount)
  const [editPw, setEditPw] = useState('')
  const [editFields, setEditFields] = useState({ displayName: '', username: '', groupId: '', locationId: '', role: 'member' })
  const [editingRow, setEditingRow] = useState(null) // 'displayName' | 'nickname' | 'username' | 'password' | null
  const [editInfo, setEditInfo] = useState({})
  const [renamePending, setRenamePending] = useState(null) // account id awaiting rename+reset confirmation
  // Is there anything to save on each editable row of the personnel popup. The tick used to
  // look identical whether you had typed or not, so opening a row to look at it offered the
  // same solid invitation as one you had actually changed — and on Login ID that tick starts
  // a rename that resets the man's password.
  // Password is the odd one: it has no stored value to compare against, so anything typed at
  // all IS the change.
  const acctRow = shownAccount || {}
  const nameDirty = editFields.displayName !== (acctRow.displayName || '')
  const usernameDirty = editFields.username !== (acctRow.username || '')
  const nicknameDirty = editFields.nickname !== (acctRow.nickname || '')
  const pwDirty = !!editPw
  // ONE fill, faded when there is nothing to commit — not a tint that becomes a fill. Every
  // other Save in the app is btn-primary at `opacity: dirty ? 1 : 0.4`: the ICT Period card,
  // the Vehicle Manifest, the activity sheet. Swapping the background between a tint and a
  // solid made this the only control that changed what it WAS rather than how loud it was.
  // On Login ID there is a third state: armed. Tapping the tick on a changed login id does
  // not rename — it asks again, because the rename resets the password and relinks the
  // account — and the app's rule is that SOLID RED means the next tap acts. It was a red
  // TINT, which said "warning" without saying "and this one does it".
  // Which row's cross is waiting for a second tap. One at a time, and dropped whenever the
  // open row changes so a half-tapped cross on Nickname cannot still be armed over Password.
  const [cancelArmed, setCancelArmed] = useState(null)
  const cancelArmTimer = useRef(null)
  useEffect(() => () => clearTimeout(cancelArmTimer.current), [])
  useEffect(() => { setCancelArmed(null); clearTimeout(cancelArmTimer.current) }, [editingRow, shownAccount && shownAccount.id])
  // Discard, or ask first when there is something to discard. `dirty` is the whole guard:
  // backing out of a row you only opened to look at loses nothing, and making that cost two
  // taps would be friction charged for no risk — the same shape armPick already uses for the
  // status picker, where the second tap only appears when a file is at stake.
  function tapCancel(field, dirty) {
    if (!dirty || cancelArmed === field) {
      clearTimeout(cancelArmTimer.current)
      setCancelArmed(null)
      cancelRow(field)
      return
    }
    setCancelArmed(field)
    clearTimeout(cancelArmTimer.current)
    cancelArmTimer.current = setTimeout(() => setCancelArmed(null), 3000)
  }
  // Grey while it only closes a row; solid red once the next tap throws typing away. Same
  // rule as every other destructive control in the app.
  const crossStyle = (armed) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 9, padding: 6,
    ...(armed ? { background: 'var(--red)', color: '#fff' } : { background: 'var(--separator)', color: 'var(--text-secondary)' }),
  })
  const tickStyle = (dirty, armed) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 9, padding: 6,
    ...(armed ? { background: 'var(--red)', color: '#fff' } : { background: 'var(--blue)', color: '#fff' }),
    opacity: dirty || armed ? 1 : 0.4,
  })
  const [tempPwInfo, setTempPwInfo] = useState(null) // { name, username, password } to relay after a rename
  const [copiedTempPw, setCopiedTempPw] = useState(false)
  async function copyTempPassword() {
    try { await navigator.clipboard.writeText(tempPwInfo.password) } catch (e) {}
    setCopiedTempPw(true)
    setTimeout(() => setCopiedTempPw(false), 1500)
  }
  const [panelMsg, setPanelMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  // The way out of the Vehicle Manifest card's vehicle editor, reported up by that card so
  // the PopupCard header can carry it as a back chevron. Held as a value, so setting it
  // needs the `() => fn` wrapper or React would run it as a state updater.
  const [mvStats, setMvStats] = useState(null)   // null = not loaded yet
  const [mvArmed, setMvArmed] = useState(false)
  const [mvMsg, setMvMsg] = useState('')
  const [mvBusy, setMvBusy] = useState(false)
  const mvTapTimer = useRef(null)
  // Tapped with nothing to delete. The button stays live rather than going `disabled`,
  // because a disabled button swallows the tap and answers nothing — and "why won't this
  // work" is exactly the question the held-back line above it already answers. The tap
  // turns that line red instead.
  const [mvDenied, setMvDenied] = useState(false)
  const confirmTimer = useRef(null)
  const adminSectionHeaderStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }
  const todaysLocks = Object.entries(deviceLogins).filter(([, lock]) => lock.date === todayISO())
  // The personnel list, and everything picked from it. Deferred personnel are
  // listed on their own card below instead — from the moment the defer is set,
  // not from the day it takes the person off the board. This list has no date of
  // its own, so it shows a standing state, and a defer is standing the instant
  // it's made; the admin who just set it should see it where the undo lives.
  const filteredAccounts = adminSubTab === 'general' ? [] : accounts.filter((a) =>
    (adminSubTab === 'unassigned' ? !groups.some((g) => g.id === a.groupId) : a.groupId === adminSubTab)
    && !a.deferredFrom
  )
  const deferredAccounts = adminSubTab === 'general' ? [] : accounts.filter((a) =>
    (adminSubTab === 'unassigned' ? !groups.some((g) => g.id === a.groupId) : a.groupId === adminSubTab)
    && !!a.deferredFrom
  )
  const activeGroupObj = groups.find((g) => g.id === adminSubTab) || null
  // Which overrides this platoon's Reporting Location card counts and lists. Anything
  // touching the current ICT PERIOD belongs to it, whether or not its own days are behind
  // us — an exercise is planned as one thing and read back as one thing. Anything still
  // running or still to come counts too, so an exception set for next month does not go
  // missing between periods. With no period set there is nothing to scope to and the old
  // rule stands: what has not finished.
  //
  // Undated legacy overrides pass: they apply every day, so they are always in scope, and
  // hiding one would hide the only place it can be found and fixed.
  const overrideInScope = (from, to) => {
    if (!from) return true
    const ev = (groups[0] || {})
    const ef = ev.eventFrom || ''
    const et = ev.eventTo || ef
    if (ef && et && (to || from) >= ef && from <= et) return true
    return !overrideEnded(from, to, todayISO())
  }


  // ms is per button: a Reset that wipes a whole ICT or manifest gets longer to read
  // its own warning than a single row's delete does.
  function requestConfirm(id, action, ms = 3000) {
    if (confirmId === id) { clearTimeout(confirmTimer.current); action(); setConfirmId(null); return }
    setConfirmId(id); clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmId(null), ms)
  }


  function openAccountPopup(a) {
    setPopupAccount(a)
    setEditPw('')
    setPanelMsg('')
    setInfoMsg('')
    setRenamePending(null)
    setTempPwInfo(null)
    setEditingRow(null)
    setEditFields({ displayName: a.displayName || '', nickname: a.nickname || '', username: a.username || '', groupId: a.groupId || '', miniGroupId: a.miniGroupId || '', locationId: a.locationId || '', role: a.isSuperAdmin ? 'superAdmin' : a.isAdmin ? 'admin' : 'member' })
    setEditInfo(a.info && typeof a.info === 'object' ? a.info : {})
  }

  async function handleSaveAccountInfo() {
    const ok = await setAccountInfo(popupAccount.id, editInfo)
    setInfoMsg(ok ? 'Saved.' : 'Could not save.')
  }

  async function handleCreateAccount() {
    const groupId = newAcc.groupId === 'unassigned' ? '' : newAcc.groupId
    const miniGroupId = newAcc.miniGroupId === 'unassigned' ? '' : newAcc.miniGroupId
    const res = await createAccount({ ...newAcc, groupId, miniGroupId })
    if (!res.ok) { setAccMsg(res.message); return }
    setAccMsg('Account created.')
    setNewAcc({ username: '', displayName: '', nickname: '', groupId: '', miniGroupId: '', role: '', attached: false })
  }

  async function handleSavePassword(id) {
    if (!editPw) { setEditingRow(null); return }
    const ok = await setAccountPassword(id, editPw)
    setPanelMsg(ok ? 'Password updated.' : 'Could not update password.')
    setEditPw('')
    if (ok) setEditingRow(null)
  }

  async function handleSaveDisplayName(id) {
    const res = await setAccountDisplayName(id, editFields.displayName)
    setPanelMsg(res.ok ? 'Display name updated.' : res.message)
    if (res.ok) setEditingRow(null)
  }

  async function handleSaveNickname(id) {
    const res = await setAccountNickname(id, editFields.nickname)
    setPanelMsg(res.ok ? 'Nickname updated.' : res.message)
    if (res.ok) setEditingRow(null)
  }

  // Returns true once the row should close (success, or failure with nothing
  // left to confirm) — false while a migrated-account rename is still
  // awaiting its second confirm tap, so the row stays open for it.
  async function handleSaveUsername(id) {
    const target = accounts.find((a) => a.id === id)
    const migrated = target && target.authUid && !target.password
    if (!migrated) {
      const res = await setAccountUsername(id, editFields.username)
      setPanelMsg(res.ok ? 'Login name updated.' : res.message)
      return true
    }
    // Migrated account: renaming must also reset the password (see
    // renameMigratedAccount). Require an explicit second click to confirm,
    // since it invalidates their current password.
    if (renamePending !== id) {
      setTempPwInfo(null)
      setRenamePending(id)
      setPanelMsg('This personnel has already logged in, so renaming also resets their password. Tap the checkmark again to confirm.')
      return false
    }
    setRenamePending(null)
    const res = await renameMigratedAccount(id, editFields.username)
    if (res.ok) {
      setPanelMsg('')
      setTempPwInfo({ name: target.displayName || res.username, username: res.username, password: res.tempPassword })
    } else {
      setPanelMsg(res.message)
    }
    return true
  }

  async function commitUsername(id) {
    const close = await handleSaveUsername(id)
    if (close) setEditingRow(null)
  }

  function cancelRow(field) {
    if (field === 'displayName') setEditFields((f) => ({ ...f, displayName: popupAccount.displayName || '' }))
    else if (field === 'nickname') setEditFields((f) => ({ ...f, nickname: popupAccount.nickname || '' }))
    else if (field === 'username') { setEditFields((f) => ({ ...f, username: popupAccount.username || '' })); setRenamePending(null); setTempPwInfo(null) }
    else if (field === 'password') setEditPw('')
    setEditingRow(null)
  }

  async function handleChangeGroup(id, groupId) {
    // Moving groups clears the mini-group (they're group-scoped) — mirror the DB write.
    setEditFields({ ...editFields, groupId, miniGroupId: '' })
    await setAccountGroup(id, groupId)
    setPanelMsg('Group updated.')
  }

  async function handleChangeMiniGroup(id, miniGroupId) {
    setEditFields({ ...editFields, miniGroupId })
    await setAccountMiniGroup(id, miniGroupId)
    setPanelMsg('Section updated.')
  }













  // ---- Finished vehicle manifests ------------------------------------------
  // The manifest document itself is not what this is for. Nothing reads a finished one
  // — the app's listener asks for `until >= today` — and a manifest is a few KB against
  // a gigabyte of free storage.
  //
  // What it IS for is the seat each rider is left holding. A published seat is copied
  // onto the rider's own attendanceSelf card, carrying his vehicle AND the whole crew
  // list of that vehicle, because a member cannot read the manifest itself. That copy is
  // cleared when he is taken off a truck or the manifest is deleted — and by nothing
  // else. A manifest that simply ends leaves its seat on every rider's card for good.
  //
  // attendanceSelf is read on every one of that member's logins, and Firestore caps a
  // document at 1 MiB. At roughly a couple of KB a seat, that is hundreds of manifests
  // away, so this is not urgent — but it never stops growing, and the clean-up has to
  // happen HERE because a finished manifest is not in the app's live state and so cannot
  // be reached, or deleted, from the Movement tab at all.
  //
  // One query a year, and it reads only what it is about to delete.
  // The whole collection, filtered here rather than by the query. Two reasons, both of
  // which cost a manifest its sweep if you take the shortcut:
  //
  //   - `where('until', '<', ...)` silently skips any document that has no `until` at
  //     all, and a one-day manifest saved before ranges existed has none. Those are the
  //     OLDEST ones — exactly what a clean-up is for — and they would never appear.
  //   - the count has to include the manifests still running, or the card cannot say how
  //     many are being kept.
  //
  // `movements/fleet` is the vehicle fleet, not a manifest: same collection, no dates.
  // It is skipped by name, because a sweep that took it would delete every vehicle the
  // company owns.
  const MV_FLEET_DOC = 'fleet'
  async function loadMvStats() {
    try {
      const snap = await getDocs(collection(db, 'movements'))
      const today = todayISO()
      const list = snap.docs.filter((d) => d.id !== MV_FLEET_DOC).map((d) => {
        const v = d.data()
        const date = v.date || d.id
        return { id: d.id, date, end: v.until || date, riders: Object.keys(v.assign || {}) }
      })
      setMvStats({ count: list.length, docs: list, done: list.filter((x) => x.end < today) })
    } catch (e) {
      setMvStats({ count: 0, docs: [], done: [] })
    }
  }

  function mvTargets() {
    return (mvStats && mvStats.done) || []
  }

  async function runMvPurge() {
    const targets = mvTargets()
    if (!targets.length || mvBusy) return
    setMvBusy(true)
    setMvMsg('')
    try {
      // Same chunking as the document purge: a batch caps at 500 writes, and one
      // manifest costs one delete plus one card per rider.
      let batch = writeBatch(db)
      let writes = 0
      for (const m of targets) {
        for (const accId of m.riders) {
          // Only this manifest's key is removed. A rider may hold a live seat on another
          // manifest at the same time, and the card is one document shared by both.
          batch.set(doc(db, 'attendanceSelf', accId), { mvSeats: { [m.id]: deleteField() } }, { merge: true })
          writes++
          if (writes >= 400) { await batch.commit(); batch = writeBatch(db); writes = 0 }
        }
        batch.delete(doc(db, 'movements', m.id))
        writes++
        if (writes >= 400) { await batch.commit(); batch = writeBatch(db); writes = 0 }
      }
      if (writes) await batch.commit()
      setMvMsg(`${targets.length} manifest${targets.length !== 1 ? 's' : ''} cleared.`)
      loadMvStats()
    } catch (e) {
      setMvMsg("Couldn't clear. Check your connection and try again.")
    }
    setMvBusy(false)
  }

  function tapMvPurge() {
    if (mvBusy) return
    setMvMsg('')
    clearTimeout(mvTapTimer.current)
    if (!mvTargets().length) {
      setMvArmed(false); setMvDenied(true)
      mvTapTimer.current = setTimeout(() => setMvDenied(false), 3000)
      return
    }
    setMvDenied(false)
    if (mvArmed) { setMvArmed(false); runMvPurge(); return }
    setMvArmed(true)
    mvTapTimer.current = setTimeout(() => setMvArmed(false), 3000)
  }

  function startEdit(key, draft) {
    setConfirmId(null)
    setEditingId(key)
    setEditDraft(draft)
    setEditMsg('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({})
    setEditMsg('')
  }

  async function saveFieldEdit(id, renameFn) {
    if (!editDraft.label || !editDraft.label.trim()) return
    await renameFn(id, editDraft.label)
    cancelEdit()
  }

  // Row content for a field inside a ReorderList (Personnel Info / Platoon Info
  // categories). Returns the inner content; the list wraps it and provides the
  // dragHandle for the grip. Personnel Info only ever passes custom fields here
  // (the app-managed built-ins are edited elsewhere), so there's no built-in row.
  function renderFieldRow(f, dragHandle, removeFn, renameFn, keyPrefix, toggleFn) {
    const key = `${keyPrefix}:${f.id}`
    // Both Personnel Info and Platoon Info draw their rows through here, and both take the
    // shared rename rule near the top of this file. Guarding Enter on the same flag keeps an
    // unchanged name from spending a Firestore write to store what is already there.
    const fieldDirty = renameDirty(editDraft.label, f.label)
    if (editingId === key) {
      return (
        <>
          <input autoFocus value={editDraft.label || ''} onChange={(e) => setEditDraft({ label: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && fieldDirty) saveFieldEdit(f.id, renameFn); if (e.key === 'Escape') cancelEdit() }}
            style={{ flex: 1, marginRight: 10 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={() => saveFieldEdit(f.id, renameFn)} disabled={!fieldDirty} aria-label="Save" style={renameTick(fieldDirty)}><Check size={15} /></button>
            <button onClick={cancelEdit} aria-label="Cancel" style={renameCross(renameChanged(editDraft.label, f.label))}><X size={16} /></button>
          </div>
        </>
      )
    }
    return (
      <>
        {dragHandle && <button aria-label="Drag to reorder" {...dragHandle}><GripVertical size={16} /></button>}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, transform: 'translateY(-1px)' }}>
          {toggleFn && (
            <button
              onClick={() => toggleFn(f.id, !f.editableByUser)}
              aria-label={f.editableByUser ? 'Personnel can edit this field — tap to make admin-only' : 'Admin-only field — tap to let personnel edit it'}
              title={f.editableByUser ? 'Personnel can edit' : 'Admin only'}
              style={{ background: 'none', border: 'none', color: f.editableByUser ? 'var(--blue)' : 'var(--text-secondary)', display: 'flex', padding: 0, flexShrink: 0 }}
            >
              {f.editableByUser ? <UserCheck size={16} /> : <Lock size={15} />}
            </button>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => startEdit(key, { label: f.label })} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex' }}>
            <Pencil size={15} />
          </button>
          <button onClick={() => requestConfirm(key, () => removeFn(f.id))} style={{ background: 'none', border: 'none', color: confirmId === key ? 'var(--red)' : 'var(--text-secondary)', fontSize: 12 }}>
            {confirmId === key ? 'Confirm' : <Trash2 size={16} />}
          </button>
        </div>
      </>
    )
  }

  return (
    <div>
      {adminSubTab === 'general' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }}>Company Setup</p>
            <div className="card" style={{ padding: 0 }}>
              <PopupCard grouped title="Personnel" icon={UserCircle} subtitle="Create new personnel or admin account." open={openPopup === 'account'} onOpen={() => setOpenPopup('account')} onClose={() => setOpenPopup(null)}>
            <div>
              {/* RED, where this was secondary grey. It is not an error, and red normally
                  means one here — but a default password every new account is created with is
                  the one line on this form that is about a credential, and it stays true until
                  the man changes it on first login. Read as a warning is the right way to read
                  it. */}
              <p style={{ fontSize: 12, margin: '0 0 8px', color: 'var(--red)' }}>Default Password for New Accounts will be set as <strong>FMC</strong></p>
              {/* Login IDs are phone numbers, so raise the number pad — same as the
                  login page and the edit-login-ID field. pattern is what iOS reads. */}
              <input placeholder="Login ID (Mobile No.)" value={newAcc.username} onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })} style={{ width: '100%', marginBottom: 8 }} autoCapitalize="none" inputMode="numeric" pattern="[0-9]*" />
              <input placeholder="Personnel Name" value={newAcc.displayName} onChange={(e) => setNewAcc({ ...newAcc, displayName: e.target.value })} style={{ width: '100%', marginBottom: 8 }} required />
              <input placeholder="Nickname (shown in lists)" value={newAcc.nickname} onChange={(e) => setNewAcc({ ...newAcc, nickname: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
              <select className="select-arrow" value={newAcc.groupId} onChange={(e) => setNewAcc({ ...newAcc, groupId: e.target.value, miniGroupId: '' })} style={{ width: '100%', marginBottom: 8, color: newAcc.groupId === '' ? '#757575' : 'var(--text)' }}>
                <option value="" disabled hidden>Platoon</option>
                <option value="unassigned">Unassigned</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {(() => {
                const mg = [...((groups.find((g) => g.id === newAcc.groupId)?.miniGroups) || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                if (!mg.length) return null
                return (
                  <select className="select-arrow" value={newAcc.miniGroupId} onChange={(e) => setNewAcc({ ...newAcc, miniGroupId: e.target.value })} style={{ width: '100%', marginBottom: 8, color: newAcc.miniGroupId === '' ? '#757575' : 'var(--text)' }}>
                    <option value="" disabled hidden>Section</option>
                    <option value="unassigned">Unassigned</option>
                    {mg.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )
              })()}
              <select className="select-arrow" value={newAcc.role} onChange={(e) => setNewAcc({ ...newAcc, role: e.target.value })} style={{ width: '100%', marginBottom: 8, color: newAcc.role === '' ? '#757575' : 'var(--text)' }}>
                <option value="" disabled hidden>Personnel or Admin</option>
                <option value="member">Personnel</option>
                <option value="admin">Admin</option>
                {account.isSuperAdmin && <option value="superAdmin">Super Admin</option>}
              </select>
              {/* Sits last, under the role: it is the exception, and reading the form top
                  to bottom you decide who they are before you decide they cannot log in. */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '2px 0 10px' }}>
                <input type="checkbox" checked={!!newAcc.attached} onChange={(e) => setNewAcc({ ...newAcc, attached: e.target.checked })} />
                Attached In Personnel
              </label>
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreateAccount}>Create Account</button>
              {accMsg && <p style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }}>{accMsg}</p>}
            </div>
          </PopupCard>
              <div style={{ height: 1, background: 'var(--separator)', margin: '0 16px' }} />
              <PopupCard grouped title="Platoon" icon={UsersGroup} subtitle="Create, rename and reorder platoons." open={openPopup === 'groups'} onOpen={() => setOpenPopup('groups')} onClose={() => setOpenPopup(null)}>
            <div style={{ marginBottom: 10 }}>
              <ReorderList items={groups} onReorder={setGroupOrder} ghostLabel={(g) => g.name}
                rowPadding="10px 8px" itemGap={4} handlePadding={0}
                renderRow={(g, dragHandle) => (
                  editingGroupId === g.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && renameDirty(editingGroupName, g.name)) { renameGroup(g.id, editingGroupName); setEditingGroupId(null) }
                          if (e.key === 'Escape') setEditingGroupId(null)
                        }}
                        style={{ flex: 1, marginRight: 10 }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { renameGroup(g.id, editingGroupName); setEditingGroupId(null) }} disabled={!renameDirty(editingGroupName, g.name)} aria-label="Save" style={renameTick(renameDirty(editingGroupName, g.name))}><Check size={16} /></button>
                        <button onClick={() => setEditingGroupId(null)} aria-label="Cancel" style={renameCross(renameChanged(editingGroupName, g.name))}><X size={16} /></button>
                      </div>
                    </>
                  ) : (
                    <>
                      {dragHandle && <button aria-label="Drag to reorder" {...dragHandle}><GripVertical size={16} /></button>}
                      <span style={{ flex: 1, minWidth: 0, transform: 'translateY(-1px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex' }}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => requestConfirm(g.id, () => removeGroup(g.id))} style={{ background: 'none', border: 'none', color: confirmId === g.id ? 'var(--red)' : 'var(--text-secondary)', fontSize: 12 }}>
                          {confirmId === g.id ? 'Confirm' : <Trash2 size={16} />}
                        </button>
                      </div>
                    </>
                  )
                )} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Platoon Name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { addGroup(newGroupName); setNewGroupName('') } }} />
              <button className="btn-secondary" style={{ background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: newGroupName.trim() ? 1 : 0.4 }} onClick={() => { addGroup(newGroupName); setNewGroupName('') }}><Plus size={16} /></button>
            </div>
          </PopupCard>
              <div style={{ height: 1, background: 'var(--separator)', margin: '0 16px' }} />
              <CreateSectionCard groups={groups} addMiniGroup={addMiniGroup} renameMiniGroup={renameMiniGroup} removeMiniGroup={removeMiniGroup} setMiniGroupOrder={setMiniGroupOrder} open={openPopup === 'sections'} onOpen={() => setOpenPopup('sections')} onClose={() => setOpenPopup(null)} />
            </div>
          </div>

          <div>
            {/* "Presets", not the "Info and Status" it was. Roy's call, after Reporting
                Locations joined it. Every row here is a LIST THE REST OF THE APP PICKS FROM -
                the fields a profile shows, the fields a platoon shows, the statuses a man can
                be marked with, the places he can be told to report to. None of them does
                anything on its own; each one decides what is on offer somewhere else. Listing
                them in the heading was fine at two and would only get longer. */}
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }}>Presets</p>
            <div className="card" style={{ padding: 0 }}>
              <PopupCard grouped title="Personnel Info" icon={UserCog} subtitle="Info shown on each personnel's profile." open={openPopup === 'accountfields'} onOpen={() => setOpenPopup('accountfields')} onClose={() => setOpenPopup(null)}>
            {(() => {
              // Rank never appears here: the app owns it, so there is no rename, no delete,
              // no order and no lock for an admin to decide. PES and Medical Excuse do
              // appear, but as static rows above the draggable ones — everything about them
              // is editable except where they sit.
              const listed = accountFields.filter((f) => !isPermanentAccountField(f))
              if (listed.length === 0) return null
              const row = (f, dragHandle) => renderFieldRow(f, dragHandle, removeAccountField, renameAccountField, 'acctfield', setAccountFieldEditable)
              return (
                <div style={{ marginBottom: 10 }}>
                  <ReorderList items={listed.filter((f) => !isPinnedAccountField(f))} staticItems={listed.filter(isPinnedAccountField)}
                    onReorder={setAccountFieldOrder} ghostLabel={(f) => f.label}
                    rowPadding="10px 8px" itemGap={4} handlePadding={0} renderRow={row} />
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="New Personnel Info (e.g. PES)" value={newAccountFieldLabel} onChange={(e) => setNewAccountFieldLabel(e.target.value)} style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { addAccountField(newAccountFieldLabel); setNewAccountFieldLabel('') } }} />
              <button className="btn-secondary" style={{ background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: newAccountFieldLabel.trim() ? 1 : 0.4 }} onClick={() => { addAccountField(newAccountFieldLabel); setNewAccountFieldLabel('') }}><Plus size={16} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 4px 0' }}>Tap <Lock size={11} style={{ verticalAlign: -1 }} /> to make info field self-editable for personnel.</p>
          </PopupCard>
              <div style={{ height: 1, background: 'var(--separator)', margin: '0 16px' }} />
              <PopupCard grouped title="Platoon Info" icon={UsersCog} subtitle="Info shown on each platoon's profile." open={openPopup === 'groupinfo'} onOpen={() => setOpenPopup('groupinfo')} onClose={() => setOpenPopup(null)}>
            <div className="segmented segmented--fill" style={{ marginBottom: 16 }}>
              <span className="seg-pill" />
              {[['categories', 'Categories'], ['entry', 'Info Entry']].map(([key, label]) => (
                <button key={key} type="button" className={platoonInfoTab === key ? 'active' : ''} onClick={() => setPlatoonInfoTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            {platoonInfoTab === 'categories' ? (
              <>
                {groupFields.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <ReorderList items={groupFields} onReorder={setGroupFieldOrder} ghostLabel={(f) => f.label}
                      rowPadding="10px 8px" itemGap={4} handlePadding={0}
                      renderRow={(f, dragHandle) => renderFieldRow(f, dragHandle, removeGroupField, renameGroupField, 'field')} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="New Platoon Info (e.g. PC, PS)" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} style={{ flex: 1 }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { addGroupField(newFieldLabel); setNewFieldLabel('') } }} />
                  <button className="btn-secondary" style={{ background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: newFieldLabel.trim() ? 1 : 0.4 }} onClick={() => { addGroupField(newFieldLabel); setNewFieldLabel('') }}><Plus size={16} /></button>
                </div>
              </>
            ) : (
              <PlatoonInfoEntry groups={groups} groupFields={groupFields} setGroupInfo={setGroupInfo} />
            )}
          </PopupCard>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 8px' }}>System</p>
            <div className="card" style={{ padding: 0 }}>
              {/* First in the card. Lockdown is the one entry here that changes the app
                  for everyone the moment it is tapped; the rest are settings and clean-up
                  you go looking for. It also owns the banner at the top of every tab, so
                  the switch and the notice read in the same order. */}
              {account.isSuperAdmin && (<>
              <PopupCard grouped title="Lockdown" icon={Ban} subtitle="Turn on Lockdown Mode for the app."
                open={openPopup === 'lockdown'}
                onOpen={() => setOpenPopup('lockdown')}
                onClose={() => setOpenPopup(null)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 0 12px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Grants access only to super admins.</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>All other users will be logged out automatically.</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Setup the nominal roll while in Lockdown Mode.</p>
                </div>
                {/* Turning it OFF needs no confirmation — it only ever opens a door.
                    Either way the card closes once the switch has moved: the banner
                    at the top is the answer, and there's nothing left to do here.
                    Red whenever the tap will change the app's state for everyone —
                    the armed confirm, and the live Turn off. */}
                <button className="btn-primary" style={{ width: '100%', background: (lockdown || confirmId === 'lockdown') ? 'var(--red)' : undefined }}
                  onClick={() => { if (lockdown) { saveLockdown(false); setOpenPopup(null); return } requestConfirm('lockdown', () => { saveLockdown(true); setOpenPopup(null) }) }}>
                  {lockdown ? 'Turn off Lockdown Mode' : confirmId === 'lockdown' ? 'Tap Again to Lockdown' : 'Turn on Lockdown Mode'}
                </button>
              </PopupCard>
              <div style={{ height: 1, background: 'var(--separator)', margin: '0 16px' }} />
              </>)}
              <PopupCard grouped title="Device Lockouts" icon={TabletSmartphone} subtitle="Manage account/device lockouts." open={openPopup === 'lockouts'} onOpen={() => setOpenPopup('lockouts')} onClose={() => setOpenPopup(null)}>
            {todaysLocks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No devices are locked today.</p>
            ) : (
              <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                {todaysLocks.map(([deviceId, lock]) => (
                  <div key={deviceId} className="list-row">
                    <div>
                      <p style={{ fontWeight: 500, margin: 0 }}>{lock.accountDisplay}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Device {deviceId.slice(0, 8)}…</p>
                    </div>
                    <button
                      onClick={() => requestConfirm(`lock:${deviceId}`, () => clearDeviceLock(deviceId))}
                      style={{ background: 'none', border: 'none', color: confirmId === `lock:${deviceId}` ? 'var(--red)' : 'var(--blue)', fontSize: 12, fontWeight: 600 }}
                    >
                      {confirmId === `lock:${deviceId}` ? 'Confirm' : 'Re-enable'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PopupCard>
          {account.isSuperAdmin && (
              <>
              <div style={{ height: 1, background: 'var(--separator)', margin: '0 16px' }} />
              {/* One errand, done once a year: clear out the year that has finished.
                  Both halves are super-admin-only, both delete in bulk, and neither
                  can be undone — so they share a card. Lockdown stays out of it and
                  sits above: it is a live switch rather than a clean-up, and a mode
                  change that takes one tap does not belong in the same box as two
                  irreversible deletions. */}
              <PopupCard grouped title="Clear Manifests" icon={Archive} subtitle="Clear out past vehicle manifests." maxHeight="70vh"
                open={openPopup === 'purgeArchive'}
                onOpen={() => {
                  setOpenPopup('purgeArchive')
                  setMvMsg(''); setMvArmed(false); setMvStats(null); loadMvStats()
                }}
                onClose={() => setOpenPopup(null)}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Vehicle Manifests</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                  Vehicle Manifests will be cleared.
                </p>
                {mvStats === null ? (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>
                ) : mvStats.count === 0 ? (
                  <p style={{ fontSize: 13, margin: 0 }}>No manifests to clear.</p>
                ) : (
                  (() => {
                    const n = mvTargets().length
                    const held = mvStats.count - n
                    return (
                      <>
                        <p style={{ fontSize: 13, margin: '0 0 4px' }}>{mvStats.count} manifest{mvStats.count !== 1 ? 's' : ''}.</p>
                        {held > 0 && <p style={{ fontSize: 12, color: (mvArmed || mvDenied) ? 'var(--red)' : 'var(--text-secondary)', margin: '0 0 10px' }}>{held} manifest{held !== 1 ? 's' : ''} still active and will be kept.</p>}
                        <button className="btn-primary" disabled={mvBusy}
                          onClick={tapMvPurge}
                          style={{ width: '100%', marginTop: held > 0 ? 0 : 8, background: mvArmed ? 'var(--red)' : undefined, opacity: n === 0 ? 0.4 : 1 }}>
                          {mvBusy ? 'Clearing…' : mvArmed ? 'Tap Again to Clear Manifests' : 'Clear Manifests'}
                        </button>
                      </>
                    )
                  })()
                )}
                {mvMsg && <p style={{ fontSize: 12, marginTop: 8, color: mvMsg.startsWith("Couldn't") ? 'var(--red)' : 'var(--blue)' }}>{mvMsg}</p>}
              </div>
            </PopupCard>
              </>
          )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* A platoon admin had an In-Camp-Training Setup section here holding one row,
              Activity Attendance, because he has no General sub-tab and that was the only
              place he could reach sheet creation from. He reaches it the same way everybody
              does now — Today → Activities → New Activity, which creates for his own platoon
              because it is the only platoon he has. The heading went with the row: it existed
              for that one row and nothing else, so leaving it would have given him an empty
              titled box. */}
          {/* The Reporting Location card was here. It has gone to the Today tab, behind
              the Location pill on the platoon card - see PlatoonDayCard. It was the only
              card in Settings that had to guess which day it meant: it hardcoded today,
              so a super admin planning next Wednesday was reading exceptions scoped to
              this morning. On the day screen the day is on the row beside the pill, and
              the card is asked about it. */}
          {/* Where the platoon reports, alongside its own header — the same line the
              Sections already carry. It falls back to the company location for EVERYONE
              now. It used to hold that back from a super admin, because he had the
              Reporting Location card right above it saying the same thing; that card has
              gone to the Today tab, so holding it back would leave this screen silent
              about where the platoon reports on every day it is not overridden. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Personnel · {filteredAccounts.length} total</p>
          </div>
          {filteredAccounts.length === 0 && deferredAccounts.length === 0 ? (
            <div className="card"><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No Personnel assigned yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(() => {
              const secs = groupByMiniGroup(filteredAccounts, activeGroupObj?.miniGroups || [])
              const rows = secs.map((sec) => (
                <div key={sec.id || 'ungrouped'}>
                  {sec.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 4px 6px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{sec.name}</p>
                    </div>
                  )}
                  {sec.members.length === 0 ? (
                    <div className="card"><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No Personnel assigned yet.</p></div>
                  ) : (
                  <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                    {sec.members.map((a, i) => {
                      return (
                      <div key={a.id} className="list-row">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ fontWeight: 500 }}>{memberLabel(a)}</span>
                            {a.isSuperAdmin ? <ShieldCheck size={13} color="var(--orange)" style={{ flexShrink: 0 }} /> : a.isAdmin ? <Shield size={13} color="var(--blue)" style={{ flexShrink: 0 }} /> : null}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <button onClick={() => reorderMember(a.id, -1)} disabled={i === 0} aria-label="Move up" style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: i === 0 ? 'var(--separator)' : 'var(--text-secondary)' }}>
                            <ChevronUp size={16} />
                          </button>
                          <button onClick={() => reorderMember(a.id, 1)} disabled={i === sec.members.length - 1} aria-label="Move down" style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: i === sec.members.length - 1 ? 'var(--separator)' : 'var(--text-secondary)' }}>
                            <ChevronDown size={16} />
                          </button>
                          {/* The gear, matching the card it opens and the Admin tab it lives
                              in. UserCog stays with the Personnel Info card, which is about
                              what a profile shows rather than about administering an account. */}
                          <button onClick={() => openAccountPopup(a)} aria-label="Edit account" style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: 'var(--text-secondary)' }}>
                            <Settings size={16} />
                          </button>
                          {a.id !== account.id ? (
                            <button onClick={() => requestConfirm(a.id, () => removeAccount(a.id))} style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: confirmId === a.id ? 'var(--red)' : 'var(--text-secondary)', fontSize: 12 }}>
                              {confirmId === a.id ? 'Confirm' : <Trash2 size={16} />}
                            </button>
                          ) : (
                            // You can't delete yourself — hold the slot so the reorder
                            // and edit icons still line up with every other row.
                            <span style={{ width: 24, flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                  )}
                </div>
              ))
              // The only way back. A deferring status takes someone off every screen
              // that could undo it — including this list — so the undo lives here
              // rather than in General, which basic admins never see. It goes just
              // above Ungrouped: both are end-of-list buckets rather than Sections,
              // and with no Ungrouped bucket it lands at the end of the list.
              const at = secs.findIndex((s) => s.name === 'Ungrouped')
              rows.splice(at === -1 ? rows.length : at, 0, deferredAccounts.length > 0 && (
                <div key="deferred">
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 4px 6px' }}>Deferred Personnel</p>
                  <div style={{ borderRadius: 14, overflow: 'hidden' }}>
                    {orderedMembers(deferredAccounts).map((a) => (
                      <div key={a.id} className="list-row">
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberLabel(a)}</p>
                          {/* The day the defer was set, which is the day it reads from —
                              not deferredFrom, which is the first day they come off the
                              board. Derived rather than stored: deferredFrom is always
                              set to the day after, so the day before it is that day. */}
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>From {fmtNav(addDays(a.deferredFrom, -1))} Onwards</p>
                        </div>
                        <button onClick={() => returnToPlatoon(a.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                          Return to Platoon
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
              return rows
              })()}
            </div>
          )}
        </div>
      )}
      {shownAccount && createPortal(
        <div
          className={`rc-modal-overlay${accountClosing ? ' rc-modal-closing' : ''}`}
          style={MODAL_OVERLAY_STYLE}
          onClick={() => setPopupAccount(null)}
        >
          <div
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600 }}>
                {/* The Admin tab's own gear. This card is Settings reached from a personnel
                    row rather than a thing about a person — everything in it is administration
                    (login ID, password, role, platoon), and UserCog belongs to the Personnel
                    Info card, which is a different thing wearing the same glyph. */}
                <Settings size={16} color="var(--blue)" />
                {memberLabel(shownAccount)}
                {shownAccount.attached && (
                  <span style={{ background: 'color-mix(in srgb, var(--orange) 16%, transparent)', border: AMBER_EDGE, color: 'color-mix(in srgb, var(--orange) 75%, var(--text))', fontSize: 10, fontWeight: 600, lineHeight: '15px', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>ATTACH</span>
                )}
              </span>
              <button onClick={() => setPopupAccount(null)} style={{ background: 'none', border: 'none', color: 'var(--red)', display: 'flex', padding: 4, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '3px 10px 5px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Personnel Name</p>
                {editingRow === 'displayName' ? (
                  /* The pair sits BELOW the input, the same half-width pill pair the Login ID,
                     Nickname and Password rows use. Beside the input it was two bare icons —
                     the only pair in the card with no fill to go solid, and it squeezed the
                     name itself into what was left of a 402px row. Full width for the field
                     that holds the longest value in the card, and one shape for all four. */
                  <div>
                    <input autoFocus value={editFields.displayName} onChange={(e) => setEditFields({ ...editFields, displayName: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDisplayName(shownAccount.id); if (e.key === 'Escape') cancelRow('displayName') }}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '7px 10px' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => handleSaveDisplayName(shownAccount.id)} disabled={!nameDirty}
                        aria-label="Save" style={tickStyle(nameDirty, false)}><Check size={16} /></button>
                      <button onClick={() => tapCancel('displayName', nameDirty)} aria-label={cancelArmed === 'displayName' ? 'Tap again to discard' : 'Cancel'} style={crossStyle(cancelArmed === 'displayName')}><X size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--separator)', borderRadius: 10, padding: '7px 10px' }}>
                    <span style={{ fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editFields.displayName || '—'}</span>
                    <button onClick={() => setEditingRow('displayName')} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}><Pencil size={15} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Login ID (Mobile No.)</p>
                  {editingRow === 'username' ? (
                    <div>
                      <input autoFocus value={editFields.username} autoCapitalize="none" inputMode="numeric" pattern="[0-9]*"
                        onChange={(e) => { setEditFields({ ...editFields, username: e.target.value }); if (renamePending) setRenamePending(null); if (tempPwInfo) setTempPwInfo(null) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitUsername(shownAccount.id); if (e.key === 'Escape') cancelRow('username') }}
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '7px 10px' }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => commitUsername(shownAccount.id)} disabled={!usernameDirty}
                          aria-label={renamePending === shownAccount.id ? 'Confirm rename' : 'Save'}
                          style={tickStyle(usernameDirty, renamePending === shownAccount.id)}><Check size={16} /></button>
                        <button onClick={() => tapCancel('username', usernameDirty)} aria-label={cancelArmed === 'username' ? 'Tap again to discard' : 'Cancel'} style={crossStyle(cancelArmed === 'username')}><X size={16} /></button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--separator)', borderRadius: 10, padding: '7px 10px' }}>
                      <span style={{ fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editFields.username || '—'}</span>
                      <button onClick={() => setEditingRow('username')} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}><Pencil size={15} /></button>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Nickname</p>
                  {editingRow === 'nickname' ? (
                    <div>
                      <input autoFocus value={editFields.nickname} placeholder="Shown in lists" onChange={(e) => setEditFields({ ...editFields, nickname: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(shownAccount.id); if (e.key === 'Escape') cancelRow('nickname') }}
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '7px 10px' }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => handleSaveNickname(shownAccount.id)} disabled={!nicknameDirty}
                          aria-label="Save" style={tickStyle(nicknameDirty, false)}><Check size={16} /></button>
                        <button onClick={() => tapCancel('nickname', nicknameDirty)} aria-label={cancelArmed === 'nickname' ? 'Tap again to discard' : 'Cancel'} style={crossStyle(cancelArmed === 'nickname')}><X size={16} /></button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--separator)', borderRadius: 10, padding: '7px 10px' }}>
                      <span style={{ fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: editFields.nickname ? 'var(--text)' : 'var(--text-secondary)' }}>{editFields.nickname || '—'}</span>
                      <button onClick={() => setEditingRow('nickname')} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}><Pencil size={15} /></button>
                    </div>
                  )}
                </div>
              </div>
              {tempPwInfo && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--separator)', fontSize: 13 }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 600 }}>New login details for {tempPwInfo.name}.</p>
                  <p style={{ margin: '0 0 2px' }}>Login ID: <span style={{ fontFamily: 'monospace' }}>{tempPwInfo.username}</span></p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ margin: 0 }}>Password: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tempPwInfo.password}</span></p>
                    {/* Blue at rest, matching the Copy login ID button — see the note there. */}
                    <button onClick={copyTempPassword} aria-label="Copy temp password" style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'var(--blue)' }}>
                      {copiedTempPw ? <Check size={14} /> : <DocOnDoc size={14} />}
                    </button>
                  </div>
                  <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Remind personnel to change password immediately.</p>
                </div>
              )}
              {/* Attached personnel have no credential to show or reset — offering a
                  password field would write a hash that still cannot log anyone in,
                  since no authIndex entry exists for them. The row is dropped outright
                  rather than explained: the ATTACHED tag on the title already says why,
                  and a row that only ever says "not applicable" is a row to scroll past.
                  Their Login ID stays — that is where the contact number lives. */}
              {!shownAccount.attached && (
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Password</p>
                {editingRow === 'password' ? (
                  <div>
                    <input autoFocus placeholder="New password" value={editPw} onChange={(e) => setEditPw(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(shownAccount.id); if (e.key === 'Escape') cancelRow('password') }}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '7px 10px' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => handleSavePassword(shownAccount.id)} disabled={!pwDirty}
                        aria-label="Save" style={tickStyle(pwDirty, false)}><Check size={16} /></button>
                      <button onClick={() => tapCancel('password', pwDirty)} aria-label={cancelArmed === 'password' ? 'Tap again to discard' : 'Cancel'} style={crossStyle(cancelArmed === 'password')}><X size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--separator)', borderRadius: 10, padding: '7px 10px' }}>
                    <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>••••••••</span>
                    <button onClick={() => setEditingRow('password')} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}><Pencil size={15} /></button>
                  </div>
                )}
              </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Role</p>
                  <div style={{ position: 'relative' }}>
                    <select value={editFields.role} onChange={async (e) => { const r = e.target.value; setEditFields({ ...editFields, role: r }); const ok = await setAccountRole(shownAccount.id, r); setPanelMsg(ok ? 'Role updated.' : 'Could not update role.') }} style={{ width: '100%', fontSize: 16, padding: '7px 28px 7px 10px', appearance: 'none', WebkitAppearance: 'none' }}>
                      <option value="member">Personnel</option>
                      <option value="admin">Admin</option>
                      {account.isSuperAdmin && <option value="superAdmin">Super Admin</option>}
                    </select>
                    <ChevronDown size={14} color="var(--text-secondary)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Platoon</p>
                  <div style={{ position: 'relative' }}>
                    <select value={editFields.groupId} onChange={(e) => handleChangeGroup(shownAccount.id, e.target.value)} style={{ width: '100%', fontSize: 16, padding: '7px 28px 7px 10px', appearance: 'none', WebkitAppearance: 'none' }}>
                      <option value="">Unassigned</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="var(--text-secondary)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
              {(() => {
                const mg = [...((groups.find((g) => g.id === editFields.groupId)?.miniGroups) || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                if (!mg.length) return null
                return (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>Section</p>
                    <div style={{ position: 'relative' }}>
                      <select value={editFields.miniGroupId || ''} onChange={(e) => handleChangeMiniGroup(shownAccount.id, e.target.value)} style={{ width: '100%', fontSize: 16, padding: '7px 28px 7px 10px', appearance: 'none', WebkitAppearance: 'none', color: (editFields.miniGroupId || '') === '' ? 'var(--text-secondary)' : 'var(--text)' }}>
                        <option value="" style={{ color: 'var(--text-secondary)' }}>No Section</option>
                        {mg.map((m) => <option key={m.id} value={m.id} style={{ color: 'var(--text)' }}>{m.name}</option>)}
                      </select>
                      <ChevronDown size={14} color="var(--text-secondary)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                )
              })()}
              {panelMsg && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>{panelMsg}</p>}
              {accountFields.length > 0 && (
                <div style={{ borderTop: '1px solid var(--separator)', paddingTop: 5, marginTop: 3 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
                    {accountFields.map((f) => (
                      <div key={f.id}>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 3px' }}>{f.label}</p>
                        <textarea
                          ref={autoGrowTextarea}
                          value={editInfo[f.id] || ''}
                          onChange={(e) => { setEditInfo({ ...editInfo, [f.id]: e.target.value }); setInfoMsg(''); autoGrowTextarea(e.target) }}
                          onBlur={handleSaveAccountInfo}
                          rows={1}
                          style={{ width: '100%', fontFamily: 'inherit', fontSize: 16, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--separator)', background: 'var(--card)', color: 'var(--text)', resize: 'none', overflow: 'hidden' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        modalRoot()
      )}
    </div>
  )
}
