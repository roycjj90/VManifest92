---
name: suggest-icon
description: Suggest, compare, or pick a lucide-react icon for a UI element in the VManifest 92 (VManifest92) app. Use this whenever the user asks for icon suggestions, a "better icon", or which icon fits a tab/button/badge — even if they don't say "lucide" or name a specific icon, and even for quick one-off asks like "suggest a new icon for X" or "what icon should I use for Y". Always render a real side-by-side comparison rather than describing icons in words.
---

# Suggesting an icon for VManifest 92

VManifest 92 is a mobile-first React app using `lucide-react` icons and CSS custom properties for theming (`src/styles.css`, light/dark variants). Icon requests here are cheap to get visibly wrong — a description in words ("a calendar with a checkmark") doesn't tell the user what it actually looks like at 22px in their real color scheme, and picking by the label alone often misses what the element actually does. This skill exists to close both gaps: verify semantics before picking candidates, and show the real render before recommending.

## The checklist

**1. Find out what the element actually does, not just what it's called.**
A label can undersell or mislead — e.g. a "Count" tab that shows live per-day tallies needs a counting-oriented icon, not a chronology one, even though "browsing past dates" sounds history-shaped at first glance. Read the component that renders behind the tab/button (or ask the user one clarifying question) before shortlisting candidates.

**2. Shortlist 2-4 candidate icon names**, including the current one if replacing it. Prefer names that map to the verified behavior from step 1, not just the label.

**3. Rule out collisions.** Grep `src/App.jsx` for each candidate name. If an icon is already used elsewhere in the app for a *different* meaning, drop it or flag the conflict explicitly — reusing an icon across unrelated contexts quietly erodes the whole icon system's legibility (this app leans on the same icon meaning the same thing everywhere).

**4. Pull the exact SVG data — never redraw from memory.** Each icon ships as a real file at `node_modules/lucide-react/dist/esm/icons/<kebab-case-name>.js`. It exports a `createLucideIcon(name, [[tag, props], ...])` call — those `[tag, props]` pairs are the literal `<path>`/`<rect>`/`<circle>` children. Read the file and copy them verbatim; a hand-approximated icon can look subtly wrong (wrong stroke count, wrong proportions) in exactly the way that matters for a comparison.

**5. Render a real comparison, not a description.** Use the `visualize` tool (`show_widget`) to build actual `<svg>` elements from the extracted path data:
- Size them to match the real context (e.g. 22px for a tab-bar icon).
- Color them with the app's *actual* theme values, pulled from `src/styles.css` — the real `--tab-bg` / `--text-secondary` / `--blue` / `--blue-tint` hex or rgba for both the inactive and active states — not placeholder colors from the visualize tool's own default palette.
- Show the current icon alongside every candidate so the comparison is literally accurate, not imagined.

**6. Recommend, don't decide.** In your response text (never inside the widget — the widget is visuals-only), give one clear top pick with a reason tied to what the element actually does, and a short line on why each other candidate is weaker (name-collision, wrong concept, illegible at small size, etc.). Stop there — don't touch `src/App.jsx` until the user confirms which one they want.

## If the user has already confirmed a choice

Only then: add the import if missing, swap the icon reference, and verify per this project's own testing conventions (mock GPS/touch via `preview_eval` where relevant; screenshot only if the change is non-trivial or the user hasn't said otherwise — check project memory for the current verification preference before defaulting to a full screenshot pass).
