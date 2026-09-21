import type { DashboardRange } from "@woobe/types";

export const RANGE_PRESETS: { value: DashboardRange; label: string; long: string }[] = [
  { value: "today", label: "Today", long: "Today" },
  { value: "7d", label: "7 days", long: "Last 7 days" },
  { value: "30d", label: "30 days", long: "Last 30 days" },
  { value: "90d", label: "90 days", long: "Last 90 days" },
  { value: "mtd", label: "MTD", long: "Month to date" },
  { value: "custom", label: "Custom", long: "Custom range" },
];

export const rangeLongLabel = (range: DashboardRange): string => RANGE_PRESETS.find((p) => p.value === range)?.long ?? range;
