"use client";

import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { User, UserRole, SupportedLocale } from "@/types";
import type { User as FirebaseUser } from "firebase/auth";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  signUpWithEmail: (
    email: string,
    password: string,
    role: UserRole,
    language: SupportedLocale,
    displayName: string
  ) => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (role?: UserRole, language?: SupportedLocale) => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
