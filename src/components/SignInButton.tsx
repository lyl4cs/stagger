"use client";
import { signInWithGoogle } from "@/lib/auth-client";

export function SignInButton({ label = "Sign in with Google" }: { label?: string }) {
  return (
    <button onClick={signInWithGoogle} className="btn-primary">
      {label}
    </button>
  );
}
