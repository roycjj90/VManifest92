---
name: drive-preview
description: Drive and verify the running VManifest 92 (VManifest92) app in the browser preview — log in as a role, navigate tabs, fill and save fields, and confirm results reliably. Use whenever you need to click through the live app to verify a UI or behaviour change (not just eyeball the diff): logging in, switching tabs, editing Personnel Info / account fields, opening member popups, or checking a change actually rendered. Encodes the React-input and verification tricks that are easy to get subtly wrong.
---

# Driving the VManifest 92 preview

VManifest 92 is a mobile-first React 18 + Vite app; almost all UI is in `src/App.jsx`. Verifying changes here means clicking through the *running* app, not reading the diff. Several things about this app + the preview tools are non-obvious and cost repeated wasted cycles when re-derived from scratch — this skill front-loads them.

Start the dev server with the preview tool (launch config `vmanifest-92`, port 5173) at mobile width (~375px). Run page-context JS through the browser/preview eval tool. Tool names have varied across sessions (`preview_eval`, `javascript_tool`, `mcp__Claude_Browser__javascript_tool`) — the JS snippets below are tool-independent (they run in the page); only the wrapper changes.

## Ground rules (these bite every time if ignored)

1. **`preview_logs` is NOT a source of truth.** Its buffer holds stale compile/JSX errors across reloads and triggers false "the build is broken" alarms. Confirm build/UI state from a **screenshot**, **live DOM** (eval), or **computed styles** (inspect) instead. Only believe a log line if a *fresh reload* reproduces it.
2. **Dev-login buttons re-login (fresh `getDoc`).** Switching roles this way re-reads the account, which **masks non-live-update behaviour** — a value looks "instantly synced" only because login re-read it. To test whether something updates *live*, use two genuine sessions or a manual write, not a role switch. (See project memory `account-state-live-sync`.)
3. **After a reload the session may or may not persist** — always check who's logged in (`document.body.innerText.slice(0,60)`) before assuming.
4. **Don't over-reload.** Vite HMR applies most edits live; a full reload re-runs the app's initial Firestore reads (free-tier cost). Re-read the DOM after an edit instead; reload only to reset state or clear mocks.

## Reusable page-context helpers

```js
// Log in as a role. Buttons: "Dev: Super Admin" | "Dev: Admin" | "Dev: User".
// (These re-read the account — see ground rule 2. All test passwords are 123 /
//  built-ins may differ; the dev buttons handle credentials themselves.)
const devLogin = (label) => [...document.querySelectorAll('button')]
  .find(x => x.textContent.trim() === `Dev: ${label}`)?.click();

// Tab-bar buttons are ICON-ONLY (empty textContent) — select by aria-label:
// Today | Count | Platoon | Personnel | Admin
const goTab = (label) => [...document.querySelectorAll('.tab-bar button')]
  .find(x => x.getAttribute('aria-label') === label)?.click();

// Set a React-controlled input's value. React ignores el.value = x; use the
// native setter, then fire an input event.
const setInput = (el, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

// Fire React's onBlur / save. el.blur() does NOT trigger it in automation
// (React 18 delegates via bubbling focusout). Dispatch focusout instead.
// IMPORTANT: after setInput, wait ~300ms for the re-render before committing,
// or onBlur fires with the STALE closure value and nothing saves.
const commit = (el) => {
  el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
};

// Open an admin member popup in the Platoon tab (rows are buttons for admins).
const openMember = (name) => [...document.querySelectorAll('button.list-row')]
  .find(x => x.textContent.includes(name))?.click();
```

Typical edit-a-field flow (note the deliberate delays):

```js
openMember('Dembele');
// then, after the popup renders:
const card = [...document.querySelectorAll('.rc-modal-overlay .card')].find(c => c.textContent.includes('Rifle No.'));
card.querySelector('button[aria-label="Edit"]').click();
// after ~200ms:
const inp = card.querySelector('input'); inp.focus(); setInput(inp, 'B99');
// after ~300ms (let React re-render with the draft), then:
commit(inp);
// then close + reopen the popup to confirm it PERSISTED (fresh read from the live listener), not just a local draft.
```

## Verifying

- **Prove it, don't assume.** After a save, close/reopen (or reload) to confirm the value came back from Firestore, since the grid prefers a local draft over the (non-live) prop and can look saved when it wasn't.
- Use a screenshot for layout/spacing; `read_page`/eval for text and structure; inspect for computed styles (e.g. confirming a padding or font-size actually applied).
- Follow the project's verification preference in memory (`ui-change-verification-preference`): for small text/style tweaks the user usually has the preview open — ask before a full screenshot pass; verify substantive behaviour changes properly.

## Related project memory
`preview-testing-techniques` (GPS/touch/theme mocks, screenshot-hang restart), `account-state-live-sync`, `ios-input-zoom-16px`, `keep-firebase-reads-low`, `dev-login-testing-preference`.
