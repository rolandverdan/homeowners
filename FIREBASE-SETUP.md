# Firebase setup

The app uses Firebase browser SDK modules from Google's CDN; there is no npm install or build step.

1. In Firebase Console, register a Web app in the project and copy its config into `firebase-config.js`.
2. Enable **Authentication > Email/Password** and add an administrator under **Authentication > Users**. The old demo credentials have been removed.
3. Create a Cloud Firestore database.
4. Publish the updated rules in `firestore.rules` from **Firestore Database > Rules**. Payment proofs are compressed in the browser and saved as separate authenticated Firestore documents, so the app does not use Firebase Storage for proofs.
5. Install the Firebase CLI, sign in, then deploy Hosting and Firestore rules from this folder:

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase deploy --only hosting,firestore:rules
   ```

   The project is preselected in `.firebaserc`. `firebase.json` serves this folder as a static site and deploys `firestore.rules` with it. Opening pages as `file://` can prevent browser modules from loading; use the deployed Hosting URL instead.

The app stores the community state in `communities/bistekville` and proof images in its `paymentProofs` subcollection. On first connection, it imports saved browser data if present; otherwise it starts with an empty resident list. Later edits are written to Firestore and cached locally. The rules require Firebase Authentication. Create accounts only for trusted administrators; each authenticated user can read and update community data and payment proofs.

Firebase web config is public browser configuration. Never put service account keys or private credentials in this project. This app's web config is in `firebase-config.js`.
