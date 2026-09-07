---
name: compare-styles
description: Decide a visual question in VManifest 92 (VManifest92) — colour, contrast, weight, spacing, size, or which of two treatments to use — by rendering the real options side by side in both themes before implementing. Use whenever the user gives directional style feedback ("not enough contrast", "too dark", "make it wider", "doesn't look like a button") or asks which of several looks better. Do not implement a visual change from a one-line description without showing the options first.
---

# Deciding a visual change in VManifest 92

VManifest 92's UI lives almost entirely in inline styles in `src/App.jsx`, themed through CSS custom properties in `src/styles.css`. Roy iterates on small visual details constantly and expects Apple-conventional results (`ios-hig-design-preference`). Two failure modes recur:

1. **One-line directional feedback is ambiguous.** "Darker", "wider", "more transparent", "not enough contrast" each have several valid readings, and implementing the wrong one wastes a round trip. Project memory `ambiguous-style-feedback-clarify` says to confirm the interpretation — this skill is *how*.
2. **Describing a colour in words tells him nothing.** "A darker amber" is not a decision he can make. A rendered swatch on the real card background is.

The `suggest-icon` skill is the icon-specific version of this. Use that one for icons; use this for everything else visual.

## The checklist

**1. Read the actual style before theorising.** Find the element in `src/App.jsx` and read its real inline style. The cause is usually a specific token or expression, not a vague "needs more contrast" — e.g. status pills rendered `color: s.color` on `color-mix(in srgb, ${s.color} 25%, transparent)`, which is a pale colour on a paler version of itself. Name the mechanism in your response; it's what makes the options make sense.

**2. Check the theme tokens you're about to depend on.** Pull the real values from `src/styles.css` — `--card` is `#FFFFFF` light / `#2C2C2E` dark, `--text` is `#1C1C1E` / `#FFFFFF`, `--separator` is `#E5E5EA` / `#48484A`. Two traps:
   - **`--card-border` is `transparent` in light mode.** An outline-only treatment is invisible there — this is why bordered tiles once "didn't look like buttons". Use a filled background instead.
   - **A fix that works in light mode often inverts in dark.** Darkening text helps on a white card and hurts on a dark one. Prefer an expression that is theme-aware by construction — blending toward `var(--text)` pushes ink away from the card in whichever theme is active, and needs no new variable.

**3. Build 2–3 genuinely distinct options**, not variations of one idea. Include the current treatment as the baseline so the comparison is honest.

**4. Render them with `visualize` / `show_widget` — both themes, real values.** Two panels side by side, one on `#FFFFFF` and one on `#2C2C2E`, with each option stacked and labelled. Use the app's real colours, real font sizes, real border-radius — not the visualize tool's default palette. Put no explanatory prose inside the widget; that goes in your response text.

**5. Recommend one, then ask with `AskUserQuestion`.** Put the recommendation first and label it. Flag any option that has a side effect he'd have to accept — e.g. filling a pill with its status colour collides with the existing "Confirm *X*" pending state, so that option also requires restyling the confirm affordance. Never hide that cost inside an option description he'd skim past.

**6. Implement only the chosen option**, and comment the *why* in the code — the non-obvious part is usually which direction the value moves and what it's relative to, not the value itself. Keep the comment above the JSX element; `//` inside a JSX opening tag is a parse error.

## Verifying afterwards

Roy usually has the preview open and watches live, so don't default to a screenshot pass (`ui-change-verification-preference`). Read the computed values instead — `getComputedStyle(el).color` on the real elements, per `drive-preview` — and report before/after numbers. For a contrast fix, compute the actual ratio and say whether it clears 3:1 (large/bold) or 4.5:1 (normal text); state it plainly if it lands between the two rather than calling the fix done.

To check the other theme without a reload, set `data-theme` on `<html>`, read, then restore the previous value:

```js
const prev = document.documentElement.getAttribute('data-theme')
document.documentElement.setAttribute('data-theme', 'dark')
// …read computed styles…
prev ? document.documentElement.setAttribute('data-theme', prev) : document.documentElement.removeAttribute('data-theme')
```
