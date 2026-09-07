# VManifest 92

An attendance app with admin-created accounts, custom statuses, group tabs,
and location-based check-in (must be near the set location AND near an
admin who has shared their location recently).

Default login after first deploy: **username `admin`, password `123`**.
Change this immediately from the Admin tab once you're in.

## 1. Create a Firebase project (free)

1. Go to https://console.firebase.google.com and create a project.
2. In the project, go to **Build -> Firestore Database -> Create database**.
   Choose "production mode" and any region.
3. Go to **Project settings -> General**, scroll to "Your apps," click the
   web icon (`</>`), register an app (any nickname), and copy the config
   values it gives you (apiKey, authDomain, projectId, etc).
4. Go to **Firestore Database -> Rules** and paste the contents of
   `firestore.rules` from this project, then click **Publish**.
   (This keeps the database open so the app works without Firebase Auth —
   fine for a small trusted group, not for sensitive data.)

## 2. Run it locally (optional but recommended first)

```
npm install
cp .env.example .env
```

Fill in `.env` with the values from step 1.3, then:

```
npm run dev
```

Open the printed local URL and log in with `admin` / `123`.

## 3. Put this code in your GitHub repo

If you don't already have these files in `github.com/roycjj90/vmanifest92`:

```
git clone https://github.com/roycjj90/vmanifest92.git
# copy all files from this project into that folder, then:
cd vmanifest92
git add .
git commit -m "Add VManifest 92 app"
git push
```

## 4. Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New -> Project**, select the `VManifest92` repo.
3. Vercel auto-detects Vite. Before clicking Deploy, open **Environment
   Variables** and add the same six `VITE_FIREBASE_...` keys/values from
   your `.env`.
4. Click **Deploy**.

Your app will be live at a `*.vercel.app` URL. Log in with `admin` / `123`
and change the password right away from the Admin tab.
