# Elephant House Dessert Cafe POS

Private repository for the responsive Cashier, Supervisor and Admin POS.

## Firebase project

- Project ID: `elephant-house-pos`
- Firestore / Cloud Functions region configured in source: `asia-south1`
- Hosting: Firebase Hosting
- Cloud Functions runtime: Node.js 22

## Source restoration and deployment

The complete POS source archive is stored in the private `.source/` folder as ordered Base64 segments. The GitHub Actions workflow restores the source into the repository, commits the full source tree to `main`, then deploys Firestore rules, Cloud Functions and Hosting.

The workflow is currently **manual-only**. Run it from GitHub Actions after configuring the credentials and Firebase PIN secrets below. Once the first deploy is verified, the workflow can be switched to automatic deployment on pushes to `main`.

## One-time secrets

Add this GitHub Actions repository secret:

- `FIREBASE_SERVICE_ACCOUNT_ELEPHANT_HOUSE_POS`: service-account JSON key for a dedicated Google Cloud service account with permission to deploy Firebase Hosting, Firestore Rules and Cloud Functions, use Cloud Build, and deploy Secret Manager-backed functions.

Do not commit the service-account JSON or share it in chat.

Create the two Firebase Functions secrets in the `elephant-house-pos` project using Firebase CLI:

```bash
firebase functions:secrets:set ADMIN_PIN
firebase functions:secrets:set SUPERVISOR_PIN
```

Enter the Admin PIN `2026` and Supervisor PIN `5678` when the CLI prompts. Do not put these PINs in source code or GitHub files.

## Deploy

In GitHub, open **Actions → Deploy Elephant House POS to Firebase → Run workflow**.

Cloud Functions and Secret Manager deployment may require the Firebase Blaze plan and a linked billing account. Review billing and budgets before running the deployment.

See `README-FIREBASE-SETUP.txt` for the detailed Firebase setup, local testing, role access and backup/clear behavior.
