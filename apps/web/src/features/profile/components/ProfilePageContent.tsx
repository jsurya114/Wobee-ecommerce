"use client";

import { Spinner } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ProfileForm } from "./ProfileForm";

/** Same auth-guard shape as AccountView — unreachable without a real session. */
export function ProfilePageContent() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // redirect effect above is already firing
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-xl text-text-primary">Edit profile</h1>
      <ProfileForm />
    </main>
  );
}
