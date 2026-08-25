// Composition root for the auth module — wires use-cases to repos to routes
// (ARCHITECTURE.md §3.2). Routes currently return 501; Day 2 replaces the
// controller's stub bodies with real use-case calls, no route-file changes needed.
export { router } from "./interface/http/auth.routes";
