import { LoginForm } from "@/features/auth/components/LoginForm";

/**
 * Admin sign-in (2026-09-29 redesign). A calm split layout: a quiet brand
 * panel on wide screens, and one focused card with the form. Nothing here
 * changes how signing in works — see LoginForm / useAdminAuth.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section
        aria-hidden="true"
        className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex"
      >
        <span className="font-display text-2xl">Woobe</span>
        <div className="max-w-sm">
          <p className="font-display text-4xl leading-tight">Run the store, calmly.</p>
          <p className="mt-4 font-body text-sm leading-relaxed text-white/80">
            Products, orders, offers and stock — everything the team needs day to day, in one place.
          </p>
        </div>
        <span className="font-body text-xs uppercase tracking-[0.2em] text-white/60">Admin console</span>
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -right-10 top-24 h-40 w-40 rounded-full bg-white/5" />
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <span className="font-display text-xl text-primary lg:hidden">Woobe Admin</span>
            <h1 className="mt-6 font-display text-3xl text-text-primary lg:mt-0">Sign in</h1>
            <p className="mt-2 font-body text-sm text-text-secondary">Use your staff account to manage the store.</p>
          </div>
          <LoginForm />
          <p className="mt-8 font-body text-xs leading-relaxed text-text-secondary">
            New to the team? Use the activation link in your invitation email to set your password first.
          </p>
        </div>
      </section>
    </main>
  );
}
