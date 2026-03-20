"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { User, UserRole, SupportedLocale } from "@/types";

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as User);
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
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const now = new Date().toISOString();
    const userData: User = {
      uid: cred.user.uid,
      role,
      displayName,
      email,
      phone: "",
      language,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "users", cred.user.uid), userData);

    // Create wallet for new user
    await setDoc(doc(db, "wallets", cred.user.uid), {
      uid: cred.user.uid,
      pointsBalance: 0,
      currency: "TWD",
      updatedAt: now,
    });

    setUser(userData);
    return userData;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", cred.user.uid));
    if (userDoc.exists()) {
      setUser(userDoc.data() as User);
    }
  };

  const signInWithGoogle = async (
    role: UserRole = "worker",
    language: SupportedLocale = "zh-TW"
  ) => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const userDoc = await getDoc(doc(db, "users", cred.user.uid));
    if (userDoc.exists()) {
      const existing = userDoc.data() as User;
      setUser(existing);
      return existing;
    }
    // New Google user — auto-create user doc + wallet
    const now = new Date().toISOString();
    const userData: User = {
      uid: cred.user.uid,
      role,
      displayName: cred.user.displayName || "",
      email: cred.user.email || "",
      phone: cred.user.phoneNumber || "",
      language,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "users", cred.user.uid), userData);
    await setDoc(doc(db, "wallets", cred.user.uid), {
      uid: cred.user.uid,
      pointsBalance: 0,
      currency: "TWD",
      updatedAt: now,
    });
    setUser(userData);
    return userData;
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
