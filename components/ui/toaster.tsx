"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        style: {
          borderRadius: "0.75rem",
          border: "1px solid #e2e8f0",
          fontSize: "0.875rem",
        },
      }}
    />
  );
}
