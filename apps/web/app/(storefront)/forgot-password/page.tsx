import type { Metadata } from "next";
import { Heart } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

/** Same reasoning as /login and /register — an auth form has nothing worth indexing. */
export const metadata: Metadata = { title: "Reset Password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="flex items-center justify-center gap-2 font-display text-3xl text-text-primary">
          Reset Password
          <Heart className="h-5 w-5 fill-primary text-primary" aria-hidden="true" />
        </h1>
        <p className="mt-1 font-body text-sm text-text-secondary">We&apos;ll email you a code to set a new one</p>
      </div>

      <ForgotPasswordForm />

      <p className="mt-6 text-center font-body text-sm text-text-secondary">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
