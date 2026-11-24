# Firebase + Netlify setup

The frontend Firebase Web App config is already in `possrc/firebase-config.js`. It is a browser config, not an admin credential. Never add a service-account JSON file or admin/supervisor PIN to this repository.

## 1. Firebase Console (one-time)

1. Open the Firebase project **elephant-house-pos**.
2. Authentication -> Sign-in method -> enable **Anonymous**.
3. Firestore Database -> create the database in production mode, if it does not already exist.
4. Confirm the web app in Project settings has the same project ID and app ID as `possrc/firebase-config.js`.
5. For Admin and Supervisor PIN login, the project must have billing enabled for Cloud Functions (Blaze plan).

## 2. Deploy Firestore rules and Cloud Functions from your PC

Install Node.js 22 and Firebase CLI, then open a terminal in a clone of this repository:

```bash
npm install -g firebase-tools
git clone https://github.com/RHCreations1/elephant-house-dessert-cafe-pos.git
cd elephant-house-dessert-cafe-pos
firebase login
firebase use elephant-house-pos
```

Set two private PIN secrets. The CLI prompts you for each value; do not put PIN values in source files or command history:

```bash
firebase functions:secrets:set ADMIN_PIN --project elephant-house-pos
firebase functions:secrets:set SUPERVISOR_PIN --project elephant-house-pos
```

Deploy the backend:

```bash
npm install --prefix functions
firebase deploy --only firestore:rules,functions --project elephant-house-pos
```

If Firebase asks to enable APIs or billing, follow the Firebase Console prompts. Cloud Functions deployment requires a billing-enabled project.

## 3. Deploy the frontend on Netlify

Import this GitHub repository in Netlify. The included `netlify.toml` sets the publish directory to `possrc`. No Netlify environment variables are required for the Firebase browser config because it is in `possrc/firebase-config.js`.

## 4. POS URLs

After Netlify gives you the site domain, use:

- Cashier 1: `https://YOUR-SITE.netlify.app/?cashier=1`
- Cashier 2: `https://YOUR-SITE.netlify.app/?cashier=2`
- Supervisor: `https://YOUR-SITE.netlify.app/?role=supervisor`
- Admin: `https://YOUR-SITE.netlify.app/?role=admin`

Admin and Supervisor will be asked for their PIN. Cashiers use Firebase Anonymous Authentication. Each cashier device/browser profile should keep its own session.

## Important before real sales

- Test anonymous sign-in, create/read a test bill from each cashier device, and verify Admin/Supervisor can see both.
- Verify bill edit/delete, stock entry, menu toggles and Excel export.
- Firestore rules are committed in `firestore.rules`, but they do not take effect until the backend deployment in step 2 succeeds.
- Keep the Admin and Supervisor PINs private. If the repository was public while any real PIN or service-account key was committed, rotate it immediately.
