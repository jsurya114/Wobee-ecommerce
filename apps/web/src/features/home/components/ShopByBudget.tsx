import { SectionHeader, chipVariants } from "@woobe/ui";
import Link from "next/link";

/**
 * Discovery by final selling price (redesign spec §B) — Woobe-appropriate:
 * the shopper browses by what they'll actually pay. Uses the existing
 * `maxPrice` catalogue filter (paise), no backend work. `price_desc` so the
 * best items under the cap surface first.
 */
const BUDGETS = [
  { label: "Under ₹499", maxPaise: 49900 },
  { label: "Under ₹799", maxPaise: 79900 },
  { label: "Under ₹999", maxPaise: 99900 },
];

export function ShopByBudget() {
  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Shop by budget</SectionHeader>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((budget) => (
            <Link
              key={budget.maxPaise}
              href={`/products?maxPrice=${budget.maxPaise}&sort=price_desc`}
              className={chipVariants({ size: "md" })}
            >
              {budget.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
