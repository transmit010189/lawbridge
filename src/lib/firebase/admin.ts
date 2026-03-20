import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Server-side Firebase Admin initialization
// Uses GOOGLE_APPLICATION_CREDENTIALS env var or service account JSON
function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // If service account key is provided as env var (for local dev)
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
    });
  }

  // In production (Cloud Run / GCP), uses default credentials
  return initializeApp();
}

const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export default adminApp;
