"use client";

import { useSession } from "next-auth/react";

export function useBackendToken(): string | undefined {
  const { data: session } = useSession();
  return session?.backendToken;
}
