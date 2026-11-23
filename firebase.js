import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
const firebaseApp = configured ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const auth = configured ? getAuth() : null;
export const authReady = auth ? auth.authStateReady() : Promise.resolve();
const communityRef = db ? doc(db, "communities", "bistekville") : null;

export async function loadCommunity() {
  if (!communityRef) throw new Error("Add your Firebase web app settings to firebase-config.js.");
  const snapshot = await getDoc(communityRef);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCommunity(community) {
  if (!communityRef) throw new Error("Add your Firebase web app settings to firebase-config.js.");
  await setDoc(communityRef, { ...community, updatedAt: serverTimestamp() });
}

