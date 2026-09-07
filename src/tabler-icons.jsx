// Icons vendored from Tabler Icons (MIT © Paweł Kuna, https://tabler.io/icons), for the
// jobs lucide has no glyph for — checked against this version's set each time.
//
// Tabler draws on the same 24px grid with the same 2px round stroke as lucide, so these sit
// with the rest of the set instead of looking imported. Copied rather than installed: a
// whole icon package for a handful of icons isn't worth the dependency, and fixed path data
// has nothing to keep up to date.
//
// Same props as a lucide icon — `size` and inherited `currentColor`.

function TablerIcon({ size = 24, paths, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

// lucide has no steering wheel.
const STEERING_WHEEL = [
  'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  'M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  'M12 14l0 7',
  'M10 12l-6.75 -2',
  'M14 12l6.75 -2',
]

export function SteeringWheel(props) {
  return <TablerIcon {...props} paths={STEERING_WHEEL} />
}

// The PLATOON mark, everywhere: the tab, the empty states, the Settings card. Three heads
// over a shared base rather than lucide's `Users`, which is two heads one behind the other —
// a platoon reads as a body of people standing together, which is what the app means by it.
// `icons/outline/users-group.svg`.
const USERS_GROUP = [
  'M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1',
  'M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M17 10h2a2 2 0 0 1 2 2v1',
  'M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M3 13v-1a2 2 0 0 1 2 -2h2',
]

export function UsersGroup(props) {
  return <TablerIcon {...props} paths={USERS_GROUP} />
}

// The ACTIVITY mark: the tab, the empty day, the Settings cards. A checklist said "a list
// with ticks", which is every other screen in this app; a running figure is the glyph that
// already means "activity" wherever anyone has seen one, and it shares no shape with its
// neighbours in the tab bar — Today is a calendar, Platoon is three heads, this is a body
// in motion. Tabler's `icons/outline/run.svg`, with speed lines added.
//
// The runner's own coordinates are MOVED +3 in x, which is the whole trick. Tabler draws
// him from x4 to x18 with the right quarter of the box empty, so streaks had nowhere to go
// but the gap beside his back arm — and at the 22px the tab bar draws this at, two 2px
// strokes a unit apart stop being two strokes. Shifted into the space on his right, the
// left five units come free and the streaks trail BEHIND him with four units of clear air.
//
// Moved, not scaled. A transform would take the stroke width with it, and a 1.8px runner
// beside 2px icons is the one thing that would make this read as a foreign glyph.
//
// Two streaks, tapered — the upper one shorter — and right-aligned on x6 so they read as
// trailing off behind him rather than as a stack of equal dashes. They sit high, level with his
// head and back arm rather than his waist: low down they crowded the trailing leg, and a
// speed line reads as air being cut, which happens above a runner and not under him. Three even ones were
// drawn and are legible, but at 22px the gaps between them close up faster than two do.
const RUN = [
  'M16 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M7 17l5 1l.75 -1.5',
  'M18 21l0 -4l-4 -3l1 -6',
  'M10 12l0 -3l5 -1l3 3l3 1',
  'M3 6h3',
  'M2 11h4',
]

export function Run(props) {
  return <TablerIcon {...props} paths={RUN} />
}

// The activity mark with a plus after it: "make one of these".
//
// A WIDER BOX, 32x24, and that is the whole trick. The runner is 14 units across and his
// streaks another 4, so the mark already spans x2 to x21 of a 24-square — nineteen of the
// twenty-four. A plus needs six. Squeezing all three into a square meant moving him, or
// cutting the streaks back, or both, and every version of that stopped looking like the icon
// it is a variant OF. Nothing requires the box to be square: it is Tabler's convention, and
// this glyph is only ever drawn on its own in an icon-only pill, where a wider button is the
// entire cost.
//
// So RUN is spread verbatim — same runner, same +3 shift, same two tapered streaks, not one
// coordinate touched — and the plus lives out at x28, in space that did not exist before.
// Two and a half clear units between his leading hand and the plus's ink.
//
// `size` still means HEIGHT, and the width follows the box at 32/24, so the stroke comes out
// at exactly the weight a 24-square icon of the same `size` draws. That is why this does not
// route through TablerIcon: that one is square by definition.
const RUN_PLUS = [...RUN, 'M28 3.5v5', 'M25.5 6h5']

export function RunPlus({ size = 24, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={(size * 32) / 24} height={size} viewBox="0 0 32 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {RUN_PLUS.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

// Tabler's six-spoke cog, bottom-right, verbatim from `icons/outline/user-cog.svg`. Shared
// by both `-Cog` icons below so the two Settings cards that sit next to each other wear the
// same gear rather than one of Tabler's and one of lucide's eight-spoke ones.
const COG = [
  'M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  'M19.001 15.5v1.5',
  'M19.001 21v1.5',
  'M22.032 17.25l-1.299 .75',
  'M17.27 20l-1.3 .75',
  'M15.97 17.25l1.3 .75',
  'M20.733 20l1.3 .75',
]

// One person + cog: editing a man. Tabler's, with the body widened LEFTWARD — the upright
// moved from x6 to x4 and the top edge run back out to its original x12.5, so the shoulder
// gains two units without moving a hair closer to the gear.
//
// Tabler's own body is narrow: x6 to x12.5 under a head spanning x8–16, which reads as a
// small figure hunched under a large one. lucide's `user-cog`, which this replaced, sweeps
// out to x2. Growing it rightward would have been the obvious fix and is the wrong one —
// the right end is short precisely because that is the corner the cog occupies.
//
// The open right end is Tabler's own idea and stays: that truncation is how it clears the
// corner a cog occupies, and it is the pattern UsersCog below copies.
const USER_COG = [
  'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0',
  'M4 21v-2a4 4 0 0 1 4 -4h4.5',
  ...COG,
]

export function UserCog(props) {
  return <TablerIcon {...props} paths={USER_COG} />
}

// Platoon + cog. Tabler has `user-cog` but no `users-cog` — checked — so this one is
// composed, and composed the way Tabler composes its own: take the base glyph, truncate
// whatever runs into the bottom-right corner, and put the cog there.
//
// The base is UsersGroup above, unchanged but for ONE cut: the front figure's shoulders lose
// their right upright, `h4a2 2 0 0 1 2 2v1` becoming `h2`. Left whole, that upright rises
// through x16 y18–21 and the cog's lower-left spoke crosses it — at 16px, the size the
// Settings list draws this at, the corner turns to a smudge.
//
// Cut back to x12, not to x13.5 as it was first drawn. The cog's nearest point is x15.97 at
// y17.25, less than a unit above the shoulder line — so a horizontal gap that reads fine on
// a 96px preview closes up at 16px, where one grid unit is two thirds of a pixel and the
// stroke itself is one and a third. Four units of gap is what it takes for the two to read
// as separate things at the size this is actually drawn. The open end is the character of
// Tabler's own `user-cog` body.
//
// Nothing is scaled. A transform on the group would scale the stroke with it, and a 1.6px
// cog beside 2px people is the one thing that would make this read as a foreign icon.
const USERS_COG = [
  'M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M8 21v-1a2 2 0 0 1 2 -2h2',
  'M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M17 10h2a2 2 0 0 1 2 2v1',
  'M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M3 13v-1a2 2 0 0 1 2 -2h2',
  ...COG,
]

export function UsersCog(props) {
  return <TablerIcon {...props} paths={USERS_COG} />
}

// The COPY mark: both Copy Report pills, Copy login ID, Copy temp password.
//
// NOT a Tabler icon — drawn to match SF Symbols' `doc.on.doc`, the glyph iOS puts on Copy.
// It lives in this file anyway because this is where hand-held path data goes, and it is
// drawn to the same 24px grid and 2px round stroke as the rest. Hand-drawn because it has
// to be: no pack carries it, and Apple's own licence keeps SF Symbols to Apple platforms.
//
// Two differences from lucide's `Copy`, which this replaces, and both are the point.
//
// The shapes are PAGES, 11x14, not the 14x14 squares lucide uses. A square pair reads as
// "duplicate this shape"; a page pair reads as "copy this document", which is what all
// four of these buttons do — a report, a login ID, a password.
//
// The offset is MIRRORED against lucide's: front page at the lower LEFT, rear behind it
// up-right. That is the direction the whole SF Symbols `.on.` family runs, and lucide runs
// the other way. It is the difference you notice without being able to name it — which is
// the kind that makes a borrowed icon look borrowed.
//
// The rear page is cut to its top and right edges. Drawn whole, its outline would cross
// the front page's, and at the 14px these render at a crossing of two 2px strokes fills
// in solid. The cut ends ON the front page's own outline rather than stopping short: a
// line ending in mid-air reads as a broken icon, one running into another reads as going
// behind it.
const DOC_ON_DOC = [
  'M6 8h7a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z',
  'M19 16a2 2 0 0 0 2 -2v-10a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2',
]

export function DocOnDoc(props) {
  return <TablerIcon {...props} paths={DOC_ON_DOC} />
}
