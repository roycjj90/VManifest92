# Maintenance scripts

## cleanup-orphan-auth-users.cjs

Deletes Firebase Auth users left orphaned when the app rotates a member's synthetic
email (on a password reset or username change). Orphans are harmless — the security
rules deny them everything — but this keeps the Auth user list tidy.

**How it decides:** a user is kept if its `uid` is the `authUid` currently linked on
some `accounts` doc; everything else is an orphan. Auth users created within the last
`GRACE_HOURS` (default 24) are skipped so an in-flight migration is never deleted.

### Automatic (recommended)
The `.github/workflows/cleanup-orphan-auth-users.yml` GitHub Action runs this monthly.
One-time setup:

1. **Firebase Console → Project settings → Service accounts → Generate new private key** → download the JSON.
2. **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**, name it `FIREBASE_SERVICE_ACCOUNT`, and paste the entire JSON as the value.

That's it — it runs on the 1st of each month. You can also run it on demand from the
**Actions** tab → *Cleanup orphan auth users* → *Run workflow* (tick *Dry run* to preview,
or lower *Grace hours* below the default 24 to delete orphans sooner than the next
scheduled run — e.g. after a known burst of test/migration activity).

> The service-account key has broad project access. Keep it secret; rotate it if exposed.

### Manual / local
```bash
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" DRY_RUN=true \
  node scripts/cleanup-orphan-auth-users.cjs     # preview
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  node scripts/cleanup-orphan-auth-users.cjs     # delete
```

**Safety:** if no account has an `authUid` yet (e.g. before the auth rollout is live),
the script refuses to delete anything.
