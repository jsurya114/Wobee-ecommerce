// Homepage placeholder — Week 1 Day 1 foundation only. Real sections
// (hero, New Drops, Shop by Vibe, ...) land per
// project_planning/woobe_ui_design_plan.md §8 starting Week 2, with the
// walking-skeleton pages (login/register, PLP/PDP, cart, checkout) landing
// Days 2-5 per project_planning/week1_excecution_prompt.md.
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-3xl text-primary">Woobe</p>
      <p className="font-body text-sm text-text-secondary">Fashion, by weight.</p>
      <p className="max-w-sm font-body text-base text-text-primary">
        Foundation is in place. Catalogue, cart, and checkout land Day 3 onward.
      </p>
    </main>
  );
}
