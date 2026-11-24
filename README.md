# Elephant House Dessert Cafe POS

Private repository for the responsive cashier, supervisor and admin POS application.

## Firebase project

- Project ID: `elephant-house-pos`
- Firestore / Functions region: `asia-south1`
- Hosting: Firebase Hosting
- Runtime: Node.js 22

## Source upload

Upload the contents of the supplied `elephant-house-pos-github-ready-v2.zip` archive to the repository root (not the ZIP file itself). Keep the paths as packaged, including `possrc/`, `functions/`, `.github/workflows/`, `firebase.json`, `.firebaserc`, and `firestore.rules`.

## GitHub Actions deployment

The workflow in `.github/workflows/deploy-firebase.yml` deploys Firestore rules, Cloud Functions and Hosting when changes are pushed to `main`.

Before enabling deployment, add this repository Actions secret:

- `FIREBASE_SERVICE_ACCOUNT_ELEPHANT_HOUSE_POS`: Google Cloud service-account JSON with permissions needed to deploy Firebase Hosting, Firestore rules, Cloud Functions and access Firebase Secret Manager.

Never commit service-account JSON, PINs, or private keys. Firebase PINs are set separately via Firebase CLI secrets:
`ADMIN_PIN` and `SUPERVISOR_PIN`.

Review `README-FIREBASE-SETUP.txt` after uploading the full source for the complete setup and deployment checklist.
