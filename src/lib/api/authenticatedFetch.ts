"use client";

import { auth } from "@/lib/firebase/client";

function normalizeHeaders(headers?: HeadersInit) {
  return new Headers(headers);
}

export async function getAuthenticatedHeaders(headers?: HeadersInit) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("AUTH_REQUIRED");
  }

  const token = await currentUser.getIdToken();
  const merged = normalizeHeaders(headers);
  merged.set("Authorization", `Bearer ${token}`);
  return merged;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const headers = await getAuthenticatedHeaders(init.headers);
  return fetch(input, { ...init, headers });
}
