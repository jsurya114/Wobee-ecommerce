/**
 * Pure domain function (ARCHITECTURE.md §3.1) — admin analytics dashboard
 * (2026-09-03). Guards the zero-orders case explicitly rather than letting
 * a NaN leak into the response (a period with no sales is a real, valid
 * state, not an error).
 */
export function calculateAverageOrderValuePaise(totalRevenuePaise: number, orderCount: number): number {
  return orderCount > 0 ? Math.round(totalRevenuePaise / orderCount) : 0;
}
