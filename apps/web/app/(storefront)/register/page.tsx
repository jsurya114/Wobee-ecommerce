import { Card } from "@woobe/ui";
import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import Link from "next/link";

/** Week 2 Day 9 — same reasoning as /login. */
export const metadata: Metadata = { title: "Register", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="font-display text-3xl text-text-primary">Create your account</p>
        <p className="mt-1 font-body text-sm text-text-secondary">Fashion, by weight — join Woobe</p>
      </div>
      <Card className="p-6">
        <RegisterForm />
      </Card>
      <p className="text-center font-body text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
