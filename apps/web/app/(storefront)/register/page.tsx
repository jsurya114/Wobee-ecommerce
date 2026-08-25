import { RegisterForm } from "@/features/auth/components/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="font-display text-2xl text-text-primary">Create your account</p>
        <p className="font-body text-sm text-text-secondary">Fashion, by weight — join Woobe</p>
      </div>
      <RegisterForm />
      <p className="text-center font-body text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
