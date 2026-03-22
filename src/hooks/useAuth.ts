"use client";

import { useEffect, useRef, useState } from "react";
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { SupportedLocale, User, UserRole } from "@/types";

const LOCAL_TEST_POINTS = 100;
const PHONE_RECAPTCHA_CONTAINER_ID = "phone-auth-recaptcha";

type PhoneAuthMode = "login" | "register";

interface PendingPhoneAuth {
  confirmationResult: ConfirmationResult;
  phoneNumber: string;
}

function isLocalPreviewHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function normalizePhoneNumber(input: string) {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (!compact) {
    throw new Error("請先輸入手機號碼。");
  }

  if (compact.startsWith("+")) {
    const nextValue = `+${compact.slice(1).replace(/\D/g, "")}`;
    if (/^\+\d{8,15}$/.test(nextValue)) {
      return nextValue;
    }
  }

  const digitsOnly = compact.replace(/\D/g, "");
  if (/^09\d{8}$/.test(digitsOnly)) {
    return `+886${digitsOnly.slice(1)}`;
  }

  if (/^9\d{8}$/.test(digitsOnly)) {
    return `+886${digitsOnly}`;
  }

  if (/^8869\d{8}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  if (/^\d{10,15}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  throw new Error("手機號碼格式無效，請使用 +8869xxxxxxxx 或 09xxxxxxxx。");
}

function maskPhoneForLogs(phoneNumber: string) {
  return phoneNumber.length > 4 ? phoneNumber.slice(-4) : phoneNumber;
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
  if (error instanceof Error && !("code" in error)) {
    return error.message;
  }

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "這個 Email 已經註冊過了，請改用登入或換另一個 Email。";
    case "auth/unauthorized-domain":
      return "目前網域還沒加入 Firebase Auth 的 Authorized Domains，請把 localhost 與正式網域都加入。";
    case "auth/popup-blocked":
      return "瀏覽器擋住了登入視窗，請允許彈出視窗後再試一次。";
    case "auth/popup-closed-by-user":
      return "登入視窗已被關閉，請重新操作一次。";
    case "auth/account-exists-with-different-credential":
      return "這個 Email 已經用其他登入方式註冊，請改用原本方式登入。";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "帳號或密碼不正確。";
    case "auth/too-many-requests":
      return "嘗試次數太多，請稍後再試。";
    case "auth/network-request-failed":
      return "網路連線失敗，請檢查網路後再試。";
    case "auth/email-not-verified":
      return "Email 尚未驗證，系統已重新寄送驗證信，請先完成驗證。";
    case "auth/invalid-phone-number":
      return "手機號碼格式無效，請使用 +8869xxxxxxxx 或 09xxxxxxxx。";
    case "auth/missing-phone-number":
      return "請先輸入手機號碼。";
    case "auth/captcha-check-failed":
      return "reCAPTCHA 驗證失敗，請重新整理頁面後再試。";
    case "auth/quota-exceeded":
      return "簡訊額度已滿，請稍後再試。";
    case "auth/invalid-verification-code":
      return "簡訊驗證碼錯誤，請重新輸入。";
    case "auth/code-expired":
    case "auth/session-expired":
      return "簡訊驗證碼已過期，請重新取得新的驗證碼。";
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

function buildPhoneUserRecord(params: {
  uid: string;
  role: UserRole;
  displayName: string;
  phoneNumber: string;
  language: SupportedLocale;
}) {
  const now = new Date().toISOString();

  return {
    uid: params.uid,
    role: params.role,
    displayName: params.displayName.trim(),
    email: "",
    phone: params.phoneNumber,
    language: params.language,
    status: params.role === "lawyer" ? "pending" : "active",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...(isLocalPreviewHost() ? { testCreditsGrantedAt: now } : {}),
  } satisfies User;
}

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const pendingPhoneAuthRef = useRef<PendingPhoneAuth | null>(null);

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
              emailVerified: fbUser.emailVerified || data.emailVerified,
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
                  emailVerified: nextUser.emailVerified,
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

    return () => {
      pendingPhoneAuthRef.current = null;
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      unsubscribe();
    };
  }, []);

  const resetPhoneOtp = () => {
    pendingPhoneAuthRef.current = null;
  };

  const getRecaptchaVerifier = async () => {
    if (typeof window === "undefined") {
      throw new Error("Phone verification only works in the browser.");
    }

    const container = document.getElementById(PHONE_RECAPTCHA_CONTAINER_ID);
    if (!container) {
      throw new Error("驗證元件尚未準備好，請重新整理頁面後再試。");
    }

    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        auth,
        PHONE_RECAPTCHA_CONTAINER_ID,
        {
          size: "invisible",
        }
      );
      await recaptchaVerifierRef.current.render();
    }

    return recaptchaVerifierRef.current;
  };

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
        status: role === "lawyer" ? "pending" : "active",
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

  const requestPhoneOtp = async (
    phoneNumber: string,
    language: SupportedLocale
  ) => {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    try {
      auth.languageCode = language;
      const verifier = await getRecaptchaVerifier();
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        normalizedPhoneNumber,
        verifier
      );
      pendingPhoneAuthRef.current = {
        confirmationResult,
        phoneNumber: normalizedPhoneNumber,
      };

      await logAuthEvent({
        stage: "phone_otp_send",
        phoneLast4: maskPhoneForLogs(normalizedPhoneNumber),
        host: typeof window !== "undefined" ? window.location.host : "",
      });

      return normalizedPhoneNumber;
    } catch (error) {
      await logAuthEvent({
        stage: "phone_otp_send_failed",
        phoneLast4: maskPhoneForLogs(normalizedPhoneNumber),
        code:
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown",
        host: typeof window !== "undefined" ? window.location.host : "",
      });
      throw new Error(mapAuthErrorMessage(error));
    }
  };

  const verifyPhoneOtp = async (
    code: string,
    mode: PhoneAuthMode,
    role: UserRole,
    language: SupportedLocale,
    displayName: string
  ) => {
    const pendingPhoneAuth = pendingPhoneAuthRef.current;
    if (!pendingPhoneAuth) {
      throw new Error("請先取得簡訊驗證碼。");
    }

    if (!code.trim()) {
      throw new Error("請輸入簡訊驗證碼。");
    }

    try {
      const credential = await pendingPhoneAuth.confirmationResult.confirm(
        code.trim()
      );
      const userRef = doc(db, "users", credential.user.uid);
      const userDoc = await getDoc(userRef);
      const now = new Date().toISOString();

      if (userDoc.exists()) {
        const existing = userDoc.data() as User;
        const nextUser: User = {
          ...existing,
          phone: pendingPhoneAuth.phoneNumber,
          email: existing.email || credential.user.email || "",
          updatedAt: now,
          emailVerified: true,
        };

        await setDoc(
          userRef,
          {
            phone: nextUser.phone,
            email: nextUser.email,
            updatedAt: now,
            emailVerified: true,
          },
          { merge: true }
        );

        await ensureWallet(credential.user.uid);
        setUser(nextUser);
        pendingPhoneAuthRef.current = null;
        return nextUser;
      }

      if (mode === "login") {
        pendingPhoneAuthRef.current = null;
        await firebaseSignOut(auth);
        throw new Error("找不到這支手機對應的帳號，請先改用註冊建立帳號。");
      }

      const trimmedDisplayName = displayName.trim();
      if (!trimmedDisplayName) {
        pendingPhoneAuthRef.current = null;
        await firebaseSignOut(auth);
        throw new Error("註冊手機帳號前，請先填寫姓名。");
      }

      const userData = buildPhoneUserRecord({
        uid: credential.user.uid,
        role,
        displayName: trimmedDisplayName,
        phoneNumber: pendingPhoneAuth.phoneNumber,
        language,
      });

      await setDoc(userRef, userData);
      await ensureWallet(credential.user.uid);
      setUser(userData);
      pendingPhoneAuthRef.current = null;
      return userData;
    } catch (error) {
      await logAuthEvent({
        stage: "phone_otp_verify_failed",
        phoneLast4: maskPhoneForLogs(pendingPhoneAuth.phoneNumber),
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
    pendingPhoneAuthRef.current = null;
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
    requestPhoneOtp,
    verifyPhoneOtp,
    resetPhoneOtp,
    signOut,
  };
}
