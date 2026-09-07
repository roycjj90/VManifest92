---
name: ship-batch
description: Commit, PR and deploy a batch of VManifest 92 (VManifest92) changes. Use whenever the user says it's time to deploy, ship, push, merge, or "put this live" — and also read it BEFORE committing anything, since the batching rule decides whether a commit should happen at all. Encodes the pre-flight gates (build, Firestore rules, branch hygiene) and the hard rule that only the user decides when a deploy happens.
---

# Shipping a VManifest 92 batch

VManifest 92 auto-deploys to Vercel from `main`. Every merge is a production deploy, and the user actively minimizes them — so changes accumulate on one branch and go out together, on his word alone. The default agent instinct (commit eagerly, push when a task looks done) is exactly wrong here.

## The rule that governs everything else

**Never commit, merge, push, or deploy unless the user has said to.** Finishing a change is not a signal to ship it. Leave completed work in the working tree and say so; he batches several sessions' worth of edits into one deploy. See project memory `pr-workflow`.

When he *does* say to deploy, that authorizes the whole sequence below — don't stop midway to re-ask.

## Pre-flight

Run these before touching git, from the repo root.

1. **`git fetch --all --prune`, then read the state.** Never reason from stale local state (`stale-repo-state-check`). Check `git branch -vv`, `git status --short`, and `git log --oneline -5`. Expect to find work sitting uncommitted on `main` — that's the normal batching state, not a mistake.
2. **`git diff --stat`** and skim the full diff. A batch spanning two sessions can be 1000+ lines; you are about to write a commit message describing changes you may not have made yourself. Read them.
3. **`npm run build`** — a hard gate. Vite build failure means the deploy would ship a broken bundle. This also catches JSX that HMR tolerated but the production build won't.
4. **Did `firestore.rules` change?** `git diff --name-only -- firestore.rules`. If yes, STOP and flag it: rules are published by hand through the Firebase Console, and per `firebase-rollout-discipline` they must be additive-first and published in the right order relative to the code. Never let a rules-dependent deploy go out assuming the Console is already updated.
5. **Did a Firestore data migration need to happen first?** If the new code reads a field that existing docs lack, the backfill must already be done (see `firestore-from-preview`) *and* the currently-deployed build must still work against the migrated data. State explicitly why there's no broken window.

## Sequence

```bash
git checkout -b <short-kebab-branch>
git add <specific files>          # not -A; don't sweep in dist/ or scratch files
git commit -F - <<'EOF'
...
EOF
git push -u origin <branch>
gh pr create --title "..." --body-file - <<'EOF'
...
EOF
gh pr merge <n> --squash --delete-branch
git checkout main && git pull --ff-only
```

**Use bash heredocs (`<<'EOF'`), not PowerShell here-strings (`@'…'@`).** The Bash tool is Git Bash; a PowerShell here-string is not a parse error there — it silently produces a commit message with a literal `@` prefix and mangled body. If it happens, `git commit --amend -F -` before pushing.

Branch off `main`, always. Squash-merge keeps `main` one-commit-per-batch, matching the existing history (`#105`…`#113`).

## Writing the commit and PR

The commit message is the only durable record of a multi-session batch — the conversation is gone. Lead with what the model/feature now *is*, not a changelog of edits:

- Subject: imperative, what the batch accomplishes as a whole.
- Body: the data-model or behavior change first, then UI regrouping, then copy/contrast fixes. Note anything with an operational precondition (a backfill, a rules publish).
- End with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

The PR body carries what a reviewer needs that the diff doesn't show: why a design was chosen, what was verified in the preview and as which roles, whether rules changed, and any migration already applied. End with the Claude Code attribution line.

## After merging

Report the merge SHA and confirm Vercel picks up from `main`. Then state plainly what is still outstanding — anything left uncommitted, and any relevant items from the pre-launch checklist in `CLAUDE.md` (dev quick-login buttons are still live in production; the seed `admin`/`123` password is unchanged). Don't imply the app is launch-ready just because a deploy succeeded.
