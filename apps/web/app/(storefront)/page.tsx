import Link from "next/link";

// Homepage placeholder — Week 1 walking-skeleton only. Real sections (hero,
// New Drops, Shop by Vibe, ...) land per
// project_planning/woobe_ui_design_plan.md §8 starting Week 2; this just
// needs to get a person to the catalogue for now.
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-3xl text-primary">Woobe</p>
      <p className="font-body text-sm text-text-secondary">Fashion, by weight.</p>
      <p className="max-w-sm font-body text-base text-text-primary">
        Browse the catalogue, add pieces to your bag — checkout lands Day 4.
      </p>
      <Link href="/products" className="mt-2 rounded-control bg-primary px-5 py-2.5 font-body text-white hover:bg-primary-hover">
        Shop now
      </Link>
    </main>
  );
}
