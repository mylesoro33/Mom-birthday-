"use client";

import { useFormStatus } from "react-dom";

export function Submit({ children, pending, className = "btn" }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={busy} aria-busy={busy}>
      {busy ? pending ?? "Working…" : children}
    </button>
  );
}
