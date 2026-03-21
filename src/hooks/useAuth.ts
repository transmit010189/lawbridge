"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { SupportedLocale, User, UserRole } from "@/types";

const LOCAL_TEST_POINTS = 100;

function isLocalPreviewHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

async function logAuthEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/auth/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best effort only.
  }
}

function mapAuthErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "這個 Email 已經註冊過，請直接登入或改用忘記密碼流程。";
    case "auth/unauthorized-domain":
      return "目前網域尚未加入 Firebase Auth 的 Authorized Domains。請把 localhost 與正式網址加入授權網域後再試。";
    case "auth/popup-blocked":
      return "瀏覽器封鎖了登入彈窗，請允許彈窗後重新操作。";
    case "auth/popup-closed-by-user":
      return "登入視窗已被關閉，請重新操作一次。";
    case "auth/account-exists-with-different-credential":
      return "這個 Email 已綁定其他登入方式，請改用原本的方式登入。";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "帳號或密碼不正確。";
    case "auth/too-many-requests":
      return "嘗試次數過多，請稍後再試。";
    case "auth/network-request-failed":
      return "網路連線失敗，請檢查網路後再試。";
    case "auth/email-not-verified":
      return "註冊驗證信已寄出，請先完成 Email 驗證後再登入。";
    default:
      return error instanceof Error ? error.message : "登入流程發生錯誤。";
  }
}

async function ensureWallet(uid: string) {
  const walletRef = doc(db, "wallets", uid);
  const walletDoc = await getDoc(walletRef);
  const targetBalance = isLocalPreviewHost() ? LOCAL_TEST_POINTS : 0;
  const now = new Date().toISOString();

  if (!walletDoc.exists()) {
    await setDoc(walletRef, {
      uid,
      pointsBalance: targetBalance,
      currency: "TWD",
      availablePayoutPoints: 0,
      pendingPayoutPoints: 0,
      updatedAt: now,
    });
    return;
  }

  const currentBalance = walletDoc.data()?.pointsBalance ?? 0;
  if (isLocalPreviewHost() && currentBalance < targetBalance) {
    await setDoc(
      walletRef,
      {
        pointsBalance: targetBalance,
        updatedAt: now,
      },
      { merge: true }
    );
  }
}

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const userRef = doc(db, "users", fbUser.uid);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            const data = userDoc.data() as User;
            const nextUser = {
              ...data,
              emailVerified: fbUser.emailVerified,
            };

            setUser(nextUser);
            await ensureWallet(fbUser.uid);

            if (
              nextUser.emailVerified !== data.emailVerified ||
              (isLocalPreviewHost() && !data.testCreditsGrantedAt)
            ) {
              await setDoc(
                userRef,
                {
                  emailVerified: fbUser.emailVerified,
                  ...(isLocalPreviewHost()
                    ? { testCreditsGrantedAt: new Date().toISOString() }
                    : {}),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error("Auth state sync error:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUpWithEmail = async (
    email: string,
    password: string,
    role: UserRole,
    language: SupportedLocale,
    displayName: string
  ) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const now = new Date().toISOString();
      const userData: User = {
        uid: cred.user.uid,
        role,
        displayName,
        email,
        phone: "",
        language,
        status: "pending",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        ...(isLocalPreviewHost() ? { testCreditsGrantedAt: now } : {}),
      };

      await setDoc(doc(db, "users", cred.user.uid), userData);
      await ensureWallet(cred.user.uid);
      await sendEmailVerification(cred.user);
      await firebaseSignOut(auth);
      setUser(null);
      return userData;
    } catch (error) {
      await logAuthEvent({
        stage: "register_email",
        email,
        code:
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown",
        host: typeof window !== "undefined" ? window.location.host : "",
      });
      throw new Error(mapAuthErrorMessage(error));
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        await firebaseSignOut(auth);
        throw { code: "auth/email-not-verified" };
      }

      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as User;
        setUser({ ...data, emailVerified: true });
      }
      await ensureWallet(cred.user.uid);
    } catch (error) {
      await logAuthEvent({
        stage: "login_email",
        email,
        code:
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown",
        host: typeof window !== "undefined" ? window.location.host : "",
      });
      throw new Error(mapAuthErrorMessage(error));
    }
  };

  const signInWithGoogle = async (
    role: UserRole = "worker",
    language: SupportedLocale = "zh-TW"
  ) => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", cred.user.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const existing = userDoc.data() as User;
        setUser({ ...existing, emailVerified: true });
        await ensureWallet(cred.user.uid);
        return existing;
      }

      const now = new Date().toISOString();
      const userData: User = {
        uid: cred.user.uid,
        role,
        displayName: cred.user.displayName || "",
        email: cred.user.email || "",
        phone: cred.user.phoneNumber || "",
        language,
        status: "active",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        ...(isLocalPreviewHost() ? { testCreditsGrantedAt: now } : {}),
      };

      await setDoc(userRef, userData);
      await ensureWallet(cred.user.uid);
      setUser(userData);
      return userData;
    } catch (error) {
      await logAuthEvent({
        stage: "login_google",
        code:
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown",
        host: typeof window !== "undefined" ? window.location.host : "",
      });
      throw new Error(mapAuthErrorMessage(error));
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  return {
    firebaseUser,
    user,
    loading,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
  };
}
