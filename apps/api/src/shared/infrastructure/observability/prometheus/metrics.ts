import { createMetrics } from "./metric-definitions";
import { registry } from "./metrics-registry";

/** The one production Metrics instance, registered against the process-wide registry. Everything else (the HTTP middleware, the Prometheus ObservabilityPort adapter, the /metrics route) imports this, never constructs its own. */
export const metrics = createMetrics(registry);
