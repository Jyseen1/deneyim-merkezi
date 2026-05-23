"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/hooks/useToast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
