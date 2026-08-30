import type { Metadata } from "next";
import { Heart } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { LoginForm } from "@/features/auth/components/LoginForm";

/** Week 2 Day 9 — an auth form has nothing worth indexing, and duplicate login pages across sites are a common thin-content SEO smell. */
export const metadata: Metadata = { title: "Log In", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="flex items-center justify-center gap-2 font-display text-3xl text-text-primary">
          Welcome Back
          <Heart className="h-5 w-5 fill-primary text-primary" aria-hidden="true" />
        </h1>
        <p className="mt-1 font-body text-sm text-text-secondary">Login to your account</p>
      </div>

      <LoginForm />

      <p className="mt-6 text-center font-body text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
