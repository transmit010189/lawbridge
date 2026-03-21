import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const MOCK_PASSWORD = "LawBridge!2026";
const MOCK_LAWYER_EMAIL = "demo-lawyer@lawbridge.test";
const MOCK_WORKER_EMAIL = "demo-worker@lawbridge.test";
const BASE_RATE_PER_MINUTE = 25;

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not configured.");
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccount)),
  });
}

const adminApp = getAdminApp();
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

async function listUsers() {
  let pageToken;
  const rows = [];

  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    result.users.forEach((user) => {
      rows.push({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        disabled: user.disabled,
      });
    });
    pageToken = result.pageToken;
  } while (pageToken);

  rows
    .sort((left, right) => left.email.localeCompare(right.email))
    .forEach((row) => console.log(JSON.stringify(row)));
}

async function safeDeleteUserByEmail(email) {
  try {
    const user = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(user.uid);
    await Promise.all([
      adminDb.doc(`users/${user.uid}`).delete().catch(() => {}),
      adminDb.doc(`wallets/${user.uid}`).delete().catch(() => {}),
      adminDb.doc(`lawyer_profiles/${user.uid}`).delete().catch(() => {}),
    ]);
    console.log(`Deleted auth/firestore data for ${email}`);
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      console.log(`No auth user found for ${email}`);
      return;
    }
    throw error;
  }
}

async function createOrReplaceAuthUser({ email, password, displayName }) {
  try {
    const existing = await adminAuth.getUserByEmail(email);
    return adminAuth.updateUser(existing.uid, {
      email,
      password,
      displayName,
      disabled: false,
      emailVerified: true,
    });
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      return adminAuth.createUser({
        email,
        password,
        displayName,
        emailVerified: true,
      });
    }
    throw error;
  }
}

async function seedMockUsers() {
  const now = new Date().toISOString();

  await Promise.all([
    safeDeleteUserByEmail(MOCK_LAWYER_EMAIL),
    safeDeleteUserByEmail(MOCK_WORKER_EMAIL),
  ]);

  const [lawyerAuth, workerAuth] = await Promise.all([
    createOrReplaceAuthUser({
      email: MOCK_LAWYER_EMAIL,
      password: MOCK_PASSWORD,
      displayName: "測試律師 Lin",
    }),
    createOrReplaceAuthUser({
      email: MOCK_WORKER_EMAIL,
      password: MOCK_PASSWORD,
      displayName: "測試外勞 Dewi",
    }),
  ]);

  await Promise.all([
    adminDb.doc(`users/${lawyerAuth.uid}`).set(
      {
        uid: lawyerAuth.uid,
        role: "lawyer",
        displayName: "測試律師 Lin",
        email: MOCK_LAWYER_EMAIL,
        phone: "",
        language: "zh-TW",
        nationality: "Taiwan",
        status: "active",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    ),
    adminDb.doc(`users/${workerAuth.uid}`).set(
      {
        uid: workerAuth.uid,
        role: "worker",
        displayName: "測試外勞 Dewi",
        email: MOCK_WORKER_EMAIL,
        phone: "",
        language: "id",
        nationality: "Indonesia",
        status: "active",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        testCreditsGrantedAt: now,
      },
      { merge: true }
    ),
    adminDb.doc(`lawyer_profiles/${lawyerAuth.uid}`).set(
      {
        uid: lawyerAuth.uid,
        fullName: "測試律師 Lin",
        licenseNo: "台北律字第 2026-TEST 號",
        licenseStatus: "verified",
        verificationStage: "verified",
        verificationId: "seeded-demo-lawyer",
        verifiedName: "測試律師 Lin",
        payoutBankLast4: "6688",
        payoutAccountVerified: true,
        payoutScheduleNote: "完成 KYC 後，每週二 / 週五 14:00 對帳，預計 T+2 個工作日撥款。",
        payoutEtaNote: "平台收益先入帳 LawBridge 錢包，銀行撥款完成後會更新狀態。",
        complianceAcceptedAt: now,
        complianceVersion: "lawyer-kyc-v1",
        translationAssistEnabled: true,
        specialties: ["勞動契約", "外籍勞工", "申訴與調解"],
        serviceLanguages: ["zh-TW"],
        ratingAvg: 4.9,
        ratingCount: 12,
        bio: "模擬律師帳號，已完成證照與撥款帳戶驗證，可直接用於語音測試。",
        ratePerMinute: BASE_RATE_PER_MINUTE,
        isOnline: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    ),
    adminDb.doc(`wallets/${lawyerAuth.uid}`).set(
      {
        uid: lawyerAuth.uid,
        pointsBalance: 0,
        availablePayoutPoints: 0,
        pendingPayoutPoints: 0,
        currency: "TWD",
        updatedAt: now,
      },
      { merge: true }
    ),
    adminDb.doc(`wallets/${workerAuth.uid}`).set(
      {
        uid: workerAuth.uid,
        pointsBalance: 100,
        availablePayoutPoints: 0,
        pendingPayoutPoints: 0,
        currency: "TWD",
        updatedAt: now,
      },
      { merge: true }
    ),
  ]);

  console.log(
    JSON.stringify({
      lawyer: {
        email: MOCK_LAWYER_EMAIL,
        password: MOCK_PASSWORD,
        uid: lawyerAuth.uid,
      },
      worker: {
        email: MOCK_WORKER_EMAIL,
        password: MOCK_PASSWORD,
        uid: workerAuth.uid,
      },
    })
  );
}

async function main() {
  const command = process.argv[2];
  const emails = process.argv.slice(3);

  if (command === "list") {
    await listUsers();
    return;
  }

  if (command === "seed") {
    await seedMockUsers();
    return;
  }

  if (command === "delete" && emails.length > 0) {
    for (const email of emails) {
      await safeDeleteUserByEmail(email);
    }
    return;
  }

  console.error(
    "Usage: node scripts/manage-test-users.mjs <list|seed|delete email...>"
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
