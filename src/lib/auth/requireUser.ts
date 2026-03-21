import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { UserRole } from "@/types";

export class RequestAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new RequestAuthError("Missing Authorization header");
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new RequestAuthError("Missing Firebase ID token");
  }

  const decoded = await adminAuth.verifyIdToken(idToken);
  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  const role = (userSnap.data()?.role as UserRole | undefined) ?? "worker";

  return {
    uid: decoded.uid,
    role,
    email: decoded.email ?? "",
  };
}
