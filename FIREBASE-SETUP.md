# Firebase setup

The app uses Firebase browser SDK modules from Google's CDN; there is no npm install or build step.

1. In Firebase Console, register a Web app in the project and copy its config into `firebase-config.js`.
2. Enable **Authentication > Email/Password** and add an administrator under **Authentication > Users**. The old demo credentials have been removed.
3. Create a Cloud Firestore database.
4. Publish the rules in `firestore.rules` from **Firestore Database > Rules**.
5. Serve this folder over HTTP (for example Firebase Hosting). Opening pages as `file://` can prevent browser modules from loading.

The app stores the community state in `communities/bistekville`. On first connection, it imports saved browser data if present, otherwise the included sample residents. Later edits are written to Firestore and cached locally. The rules require Firebase Authentication. Create accounts only for trusted administrators; each authenticated user can read and update this community document.

Firebase web config is public browser configuration. Never put service account keys or private credentials in this project. Firebase config is not included yet; fill it in before running the app.
