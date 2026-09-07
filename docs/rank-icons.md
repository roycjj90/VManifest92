# Rank insignia icons

`src/rank-icons.jsx` holds 35 SAF rank insignia as filled SVG paths. It is build output —
edit the generator, never the strings.

## Why they aren't lucide icons

Every other icon in the app is a lucide glyph: a 24-square outline drawn in 2px strokes.
Rank insignia can't be. A specialist's chevron stack rendered as strokes turns to mud below
about 20px, and rank is something you read at a glance in a list. So the shape is the ink —
filled paths, nonzero fill rule (the browser default), which is also what lets the laurels
and the state crest overlap themselves without punching holes.

The grid is 22 wide by 31 tall. Sizing is by **height**, because height is the dimension a
rank actually grows along as it gains chevrons; width follows at 22/31.

## Ranks vs insignia — they are not the same list

`RANK_PATHS` is keyed by **artwork**; `RANK_GROUPS` lists the **ranks a man can actually hold**.
Three things pull them apart:

- **REC** is a rank with no insignia — a recruit wears a bare patch. Listed, deliberately
  pathless. `rankKey()` returns null for it and the card falls back to large centred text.
- **Military Experts are held at a sub-rank** — ME3-2, never plain ME3 — and ME1 through ME7
  all start at their -1. Only ME8 and ME9 are held bare. The device does not change with the
  sub-rank, so ME1-1 and ME1-2 both draw the ME1 insignia. The sub-rank lives only in the label.
- **ME4A** is a rank in its own right with its own device, not an ME4 sub-rank. The `A` is
  why `canonRank()` only re-hyphenates a *digit* pair.

So `rankKey(rank)` answers "what do I draw" and `rankLabel(rank)` answers "what do I write",
and for any ME sub-rank those two differ. Both tolerate sloppy input: `me3 2`, `ME3/2` and
`ME3-2` all canonicalise to ME3-2 drawn as ME3.

## Provenance

Traced from MINDEF's own rank artwork (124×200 PNGs), not drawn by hand and not copied from
a third-party set.

- Ink threshold is luminance < 200 (stable anywhere in 190–210). Lower shreds the
  anti-aliased strokes into dots and forces a dilate/erode that rounds the shape off.
- The state crest is MINDEF's, taken off the **MAJ** rank, flooded from the outside and
  mirrored about x=35.0. It is the crest *without* the "Majulah Singapura" banner — that is
  what MINDEF's rank artwork uses.
- The laurel under CWO comes off the **CWO** rank; the officers' laurel off **BG**. Both are
  left halves mirrored about a best-fit axis (IoU 0.949–0.950).
- The star and the ME diamond are generated, not traced: both are exact geometric figures
  (MINDEF's star measures 1.06 w/h against a regular five-point star's 1.051).
- The tapered patch outline and the "SINGAPURA" text are deliberately excluded, as are the
  (T) trainee ranks and the SAF Volunteer Corps ranks.

**Never un-taper the patch before extracting elements.** Straightening a trapezoid stretches
each row by a different factor and skews everything inside it.

## Signed-off build parameters

Enlistee / specialist / warrant officer (`v24.py`, `cap.py`, `v18.py`):

| | |
|---|---|
| specialist up-chevron thinning | 4 |
| specialist down-chevron thinning | 7 |
| specialist down-chevron V-drop | 1.3 |
| enlisted arc steepness | 1.3 |
| enlisted arc thinning | 1 |
| enlisted down-chevron thinning | 2 |
| enlisted down-chevron steepness | 1.5 |
| arc slope cap (straight parallel ends) | 1.6 |
| up-chevron pitch | 19.2 |
| crest drop (SSG, MSG) | 0.019 |
| CWO crest + laurel drop | 0.015 |

Officers (`off.py`): bars 10/10 at the full 80-unit width. MAJ–LG from element boxes
measured off MINDEF's devices.

Military Experts (`me.py`, `me_layout.json`): diamond stroke 4, crest nudge 0.03 below
centre, thin-to-thin gap 18, thin-to-thick 26, thick-to-thick 16 (ME7 only), thin bar 5,
thick bar 17. ME8/ME9's band stays at its measured 20 and is not re-spaced.

## Path format

Emitted at 2dp; the laurels are Douglas-Peuckered at eps 5. 70.1 KB → 44.0 KB across the 35
ranks, measured at most 3 differing pixels at 26px and 43 at 96px, none visible. A coarser
simplification on its own caps out near 6% before pixels start flipping.

## Regenerating

The generator scripts live outside this repo (they were written in a scratch directory) and
are **not** preserved here. If the icons ever need rebuilding, the parameters above are the
record of what was signed off; the trace itself has to be redone from MINDEF's artwork.
