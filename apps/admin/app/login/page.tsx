import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-2xl text-text-primary">Woobe Admin</h1>
      <LoginForm />
    </main>
  );
}
