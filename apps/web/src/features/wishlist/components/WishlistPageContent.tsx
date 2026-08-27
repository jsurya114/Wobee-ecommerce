"use client";

import { buttonVariants, Card, Skeleton } from "@woobe/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";
import { WishlistLineItem } from "./WishlistLineItem";

export function WishlistPageContent() {
  const { status } = useAuth();
  const { wishlist, isLoading } = useWishlist();

  if (status === "loading" || (status === "authenticated" && isLoading)) {
    return (
      <div className="flex flex-col gap-5">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-28 w-24 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-4 h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Heart className="h-10 w-10 text-text-secondary" strokeWidth={1.25} aria-hidden="true" />
        <p className="font-body text-sm text-text-secondary">Log in to view and save your wishlist.</p>
        <Link href="/login" className={buttonVariants()}>
          Log in
        </Link>
      </div>
    );
  }

  if (!wishlist || wishlist.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Heart className="h-10 w-10 text-text-secondary" strokeWidth={1.25} aria-hidden="true" />
        <p className="font-body text-sm text-text-secondary">Your wishlist is empty.</p>
        <Link href="/products" className={buttonVariants()}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <Card className="p-5">
      {wishlist.items.map((line) => (
        <WishlistLineItem key={line.itemId} line={line} />
      ))}
    </Card>
  );
}
