import { Card } from "@woobe/ui";
import { LoginForm } from "@/features/auth/components/LoginForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="font-display text-3xl text-text-primary">Welcome back</p>
        <p className="mt-1 font-body text-sm text-text-secondary">Log in to your Woobe account</p>
      </div>
      <Card className="p-6">
        <LoginForm />
      </Card>
      <p className="text-center font-body text-sm text-text-secondary">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
