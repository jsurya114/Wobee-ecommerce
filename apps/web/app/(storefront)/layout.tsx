import type { ReactNode } from "react";

// Pass-through for now — header/nav/footer land alongside Day 2-3 pages
// (see project_planning/woobe_ui_design_plan.md §10 for the mobile nav spec).
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
