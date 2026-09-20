# Observability (Prometheus, Grafana, Node Exporter)

Phase 1, single EC2 (`t4g.small`, 2 GiB, Amazon Linux 2023, arm64). This document is the reference for what is
measured, where it is stored, who can see it, and what it costs on a small box. The operational "what do I do when
X fires" companion is [`observability-runbook.md`](observability-runbook.md).

> **What this is not.** There is **no Alertmanager**, so no alert sends an email, Slack message or page: alert rules
> are evaluated by Prometheus and are *visible* (Prometheus UI → Alerts, and the `ALERTS` series). There is no
> tracing, no log aggregation, no HA and no long-term metrics storage (7 days, one disk, one host). If the instance
> is replaced, Prometheus and Grafana **data is lost** (it lives on the instance's root volume).

## 1. Who measures what

| Tool | Answers | Source of truth for |
|---|---|---|
| **CloudWatch** (already in place) | Is the AWS-managed stuff healthy? RDS CPU/storage/connections, EC2 status checks, CloudFront, the two Valkey custom metrics | AWS-native infrastructure and service health |
| **Prometheus** | How is the *application* behaving over time? Request rate/errors/latency, Node.js runtime, BullMQ queue, business events | Time-series of *operational* metrics — **never** business truth |
| **Node Exporter** | How is the *Linux host* doing? CPU, memory, disk, network, load | Host resource metrics |
| **Grafana** | Visualisation and ad-hoc PromQL over Prometheus | Nothing; it stores no metrics of its own |
| **PostgreSQL** | What actually happened to orders, payments, refunds, inventory | **All business/financial truth.** A metric can be wrong, missing after a restart, or reset; the database cannot |

A counter such as `woobe_orders_created_total` tells you the *rate* orders are being created. It is not an order
count you can reconcile against: it resets when the API restarts, and it is best-effort by design (§4).

## 2. Architecture

```
                         EC2 host (all listeners on 127.0.0.1, host networking, no security-group rule for any of them)
  Cloudflare ─► nginx :443 ─► API :4000 ◄──────────┐  scrape /metrics every 15s (never via nginx)
   (public)   (/metrics → 403)   worker :9102 ◄─────┤
                                 Node Exporter :9100 ◄┤──── Prometheus :9090 ◄──── Grafana :3000 ◄── SSM port-forward ◄── you
                                 Prometheus :9090 ◄──┘        (7d / 2GB TSDB)      (provisioned from Git)
                                 Valkey :6379 (unchanged)
```

- **API** and **worker** are separate Node.js processes (same image, different command), so each has its **own
  in-memory metrics registry** and its own scrape target (`job="woobe-api"`, `job="woobe-worker"`). Metrics cannot
  cross a process boundary; the worker runs a tiny loopback-only HTTP server (`WORKER_METRICS_PORT`, default 9102).
- **Prometheus never scrapes through Cloudflare or nginx.** All targets are loopback addresses on the same host.
- **Delivery is not user_data and not the app deploy.** Terraform (`modules/observability`) publishes an SSM document
  and a State Manager association that converges the host. See §11 for why.

## 3. Metrics reference

Client library: `@prometheus-io/client` 0.16.x (the current name of the official Prometheus Node.js client, formerly
`prom-client`), always with an **explicit `Registry`** — never the library's global default — so the API and worker
registries are isolated and tests can create their own.

### 3.1 HTTP RED (API)

| Metric | Type | Labels |
|---|---|---|
| `woobe_http_requests_total` | counter | `method`, `route`, `status_code` |
| `woobe_http_request_duration_seconds` | histogram (5 ms … 10 s) | `method`, `route`, `status_code` |
| `woobe_http_requests_in_flight` | gauge | — |

- `route` is the **Express route template** (`/api/v1/orders/:id`), never the URL. It is captured at the moment Express
  matches the route (not at response time — Express restores `baseUrl` on `next(err)`, which would otherwise label every
  error response `/:id`). A trailing slash is normalised away.
- A request that never reached a route is `route="NOT_FOUND"` (404) or `route="UNMATCHED"` (anything else, e.g. a
  malformed-JSON 400 or a 413 rejected by the body parser). A route registered with a RegExp path is `UNKNOWN_ROUTE`.
- **Excluded from all three metrics:** `/metrics`, `/health`, `/ready` (matched case-insensitively, trailing slash
  ignored). Uptime probes and scrapes would otherwise swamp real traffic in `rate()`.
- The middleware is the **first** in the chain (before helmet, CORS and the body parser) so parse errors are counted and
  durations include the body read. Duration uses a monotonic timer. An aborted connection releases its in-flight slot
  exactly once and is **not** counted as a completed request.
- Client errors from the body parser (malformed JSON, oversized body) are answered **4xx, not 500**. They used to fall
  through to the generic 500 handler, which made a client posting junk indistinguishable from a server failure —
  and would have tripped the 5xx alert.

### 3.2 Node.js runtime (API and worker) — prefix `woobe_node_`

From the client's `collectDefaultMetrics`, collected at scrape time: `process_cpu_seconds_total`,
`process_resident_memory_bytes`, `process_start_time_seconds`, `nodejs_heap_size_{used,total}_bytes`,
`nodejs_external_memory_bytes`, `nodejs_eventloop_lag_{mean,p50,p90,p99,max}_seconds`, `nodejs_gc_duration_seconds`
(histogram, `kind` label), `nodejs_active_{handles,resources,requests}_total`, `nodejs_version_info`. Only names this
client version actually exports are used anywhere (e.g. there is no `process_open_fds` and no event-loop-utilization
gauge, so none are queried). The `job` label — not a different name — distinguishes API from worker.

### 3.3 Business events (API) — bounded labels, best-effort

| Metric | Labels | Recorded when |
|---|---|---|
| `woobe_orders_created_total` | `payment_method` ∈ {online, cod} | **After** the checkout transaction commits. A rolled-back checkout is never counted. |
| `woobe_orders_event_total` | `event` ∈ {confirmed, cancelled, delivered, returned_to_origin, payment_failed} | Only when the transition actually changed state (`changed: true`) and its transaction committed. An idempotent replay (COD re-confirm, duplicate webhook) adds nothing. Recorded *before* the follow-up notification, so a notification failure cannot erase a durable transition. |
| `woobe_refunds_total` | `result` ∈ {success, failure} | A refund actually attempted at the gateway. "Not applicable" (COD, nothing captured) and idempotent replays are not refund attempts. |
| `woobe_inventory_reservations_total` | `result` ∈ {success, failure} | Each reservation attempt (stock contention rate). It is an *attempt*, not a completed order. |
| `woobe_payment_webhooks_total` | `event_type`, `result` ∈ {processed, deduped, ignored, amount-mismatch, stale} | Once per authenticated delivery. An invalid signature records **nothing** (an unauthenticated caller cannot write metrics). `event_type` is sanitised to Razorpay's event-name shape, anything else → `other`. |
| `woobe_payment_webhook_duration_seconds` | `result` | Same point; seconds from signature verification to outcome. |

Every bounded series is **pre-created at 0**. Prometheus's `increase()` needs a previous sample: a labelled counter that
first appears already at 1 has nothing to diff against, so the *first* order/refund/failure after each process start
would otherwise be invisible. (HTTP series are dynamic and cannot be pre-created.)

Not instrumented on purpose: returns, testimonials, shipping/packing transitions, cache hit/miss, individual Redis
operations, per-repository DB timings. None answers an operational question the dashboards need; each is one label-set
away if that changes. RDS metrics stay in CloudWatch, and **no query is ever run against PostgreSQL to serve a scrape.**

### 3.4 Notification worker (`job="woobe-worker"`)

| Metric | Type | Meaning |
|---|---|---|
| `woobe_notification_jobs_completed_total` | counter | Jobs that completed. Exactly once per job — a job that succeeds on its 3rd try counts once. |
| `woobe_notification_job_attempt_failures_total` | counter | Every failed **attempt**, including ones BullMQ will retry. |
| `woobe_notification_jobs_failed_total{reason}` | counter | **Terminal** failures only (`unrecoverable`, `attempts_exhausted`): the job will not run again. |
| `woobe_notification_job_duration_seconds{result}` | histogram (50 ms … 30 s) | Per **attempt**, `result` ∈ {success, failure}. |
| `woobe_notification_jobs_active` | gauge | Jobs this worker process is running now (≤ concurrency 5). |
| `woobe_notification_queue_jobs{state}` | gauge | `waiting`/`active`/`delayed`/`failed`, read from Valkey **at scrape time** (one small count call, 2 s timeout). |

A retry is never a completion and a retry is never a terminal failure. If Valkey is unreachable the queue gauges are
**absent** (not zero, not stale) and the rest of the scrape still succeeds. The queue gauges live in the worker, so they
disappear while the worker is down — `WoobeWorkerDown` is the alert for that case, `WoobeNotificationQueueBacklog` is
for "worker up but not keeping up".

### 3.5 Cardinality rules (enforced)

Allowed label values are **closed sets defined in code** (`observability.port.ts` unions,
`metric-definitions.ts`). `metric-definitions.test.ts` asserts the exact label set of every metric and that no label is
identifier-shaped. **Never** a label: user/customer/order/product/variant/payment/request id, email, phone, IP, raw
URL, query string, token, or error message. Adding a metric or label means editing the reviewed tables in that test on
purpose. The Prometheus client is importable **only** from `shared/infrastructure/observability/**` (ESLint
`no-restricted-imports`), so business code cannot mint ad-hoc metrics.

Approximate series (idle, local, measured): API 179, worker 150, Node Exporter ~1,580 (a Linux VM with many virtual
devices; expect fewer on the EC2), Prometheus itself 931.

## 4. Failure semantics — metrics never break business

Every `ObservabilityPort` method is fire-and-forget (`void`, never a `Promise`) and wrapped in `try/catch`. If the
metrics library throws (bad label, bug), the data point is dropped and one structured log line is written; checkout,
webhooks, refunds and notifications are unaffected (`prometheus-observability.test.ts` proves it with a metrics library
that throws on every call). Metrics are not a source of truth; PostgreSQL is.

## 5. Prometheus

- Config: `infra/observability/prometheus/prometheus.yml` — **identical** locally and in production. Only the tiny
  `targets/*.yml` files (file-based service discovery, reloaded automatically) differ.
- Scrape interval 15 s; jobs: `woobe-api`, `woobe-worker`, `node`, `prometheus`.
- Storage: `/opt/woobe/prometheus-data` (bind mount, deterministic, mode 700, owner `nobody`). Retention **7 days *or*
  2 GB, whichever first** — the size cap exists so a cardinality mistake cannot fill the 30 GB root volume that also
  holds Docker images, the Valkey AOF and Grafana. Estimate: ~5–6k series × 15 s ≈ 40 MB/day ≈ 0.3 GB for 7 days.
- Recording rules (`rules/woobe-recording.rules.yml`, named `level:metric:operations`): request rate, 5xx rate, 5xx
  ratio, p50/p95/p99 latency, notification p95. Ratios are computed only when there is traffic, so an idle site
  yields **no data**, never NaN or a divide-by-zero.
- Alert rules (`rules/woobe-alerts.rules.yml`) — small and actionable, each with `summary`, `description` and a
  `runbook` path:

| Alert | Fires when | For |
|---|---|---|
| `WoobeApiDown` | API target down **or absent** | 2 m |
| `WoobeWorkerDown` | worker target down or absent | 2 m |
| `NodeExporterDown` | node target down or absent | 5 m |
| `WoobeApiHigh5xxRate` | 5xx ratio > 5 % **and** > 0.05 req/s (≥ ~15 requests / 5 m) | 5 m |
| `WoobeApiHighP95Latency` | p95 > 1 s **and** > 0.05 req/s | 10 m |
| `WoobeNotificationQueueBacklog` | > 50 jobs waiting | 10 m |
| `HostFilesystemPressure` | root volume < 15 % free (tmpfs/overlay ignored) | 10 m |
| `HostMemoryPressure` | < 10 % memory available | 10 m |

Thresholds are starting points chosen for a small store on one small box, **not tuned against production traffic**
(none exists yet). The traffic guards stop a quiet night from alerting on a handful of requests. `promtool test rules`
covers firing, not-firing, brief blips, idle traffic and absent targets (§9).

## 6. Node Exporter

Official image `prom/node-exporter` v1.12.1, pinned by digest. `network_mode: host` + `pid: host` + a **read-only**
`/:/host:ro,rslave` bind with `--path.rootfs=/host` — the official container guidance. `pid: host` is required:
verified empirically that without it the collector reads its own container's mount namespace and never reports the
host's real filesystems. It runs as `nobody`, read-only rootfs, **all capabilities dropped**, `no-new-privileges`, no
Docker socket, 64 MiB limit. Listens on `127.0.0.1:9100` only; **no security-group rule exists for 9100.**

## 7. Grafana

- Official image, v12.4.11, pinned by digest, `127.0.0.1:3000` only, 256 MiB limit, data in `/opt/woobe/grafana-data`.
- Auth on, anonymous off, sign-up off, gravatar/analytics/update-checks off, `SameSite=Strict`. `cookie_secure` is
  **false** only because Grafana is reached over plain HTTP on loopback via a port-forward; set it `true` if Grafana
  is ever fronted by HTTPS.
- **Credentials.** The admin password is generated **on the instance** at first sync (192 random bits), stored as an SSM
  SecureString `/woobe-production/grafana/admin-password`, and handed to Grafana as a mode-400 file
  (`GF_SECURITY_ADMIN_PASSWORD__FILE`). It is **not** in Git, compose, Terraform config, or **Terraform state** (a
  Terraform-managed `aws_ssm_parameter` would write the real value into state on the next refresh — deliberately not
  used). The instance role may Get/Put that single parameter name and nothing else; the sync script itself is create-only (`put-parameter`
  without `--overwrite`): a rerun can never rotate it. First-login: fetch it with the AWS CLI (below) — **do not paste it
  into chat, tickets or scripts.**
- **Provisioning from Git** (nothing is configured by hand): datasource `Prometheus` (uid `woobe-prometheus`,
  read-only) and three dashboards in the `Woobe` folder, `allowUiUpdates: false`, `disableDeletion: true`.

| Dashboard | Shows |
|---|---|
| **Woobe API Overview** | target up, req/s, 5xx %, p50/p95/p99, in-flight, uptime, RSS/heap, event-loop lag, GC, CPU, top routes by rate and p95, and the business-event panels |
| **Woobe Worker / Notifications** | completed/failed(attempt vs terminal)/duration, queue depth by state, active jobs, worker target, RSS/heap/loop lag/GC |
| **Woobe Infrastructure** | CPU, memory (used/available), load, disk used/free, disk I/O, network in/out, host uptime, Node Exporter + Prometheus target health, Prometheus RSS / head series / TSDB size |

`infra/observability/scripts/validate-dashboards.py --prometheus URL` runs every panel query against a live Prometheus
and fails on any that is not valid PromQL. Panels for event-driven counters (refunds, webhooks…) legitimately show "No
data" until the first event.

- **Access: SSM port-forward (chosen).** No public monitoring domain, no Cloudflare change, no extra attack surface.
  ```bash
  # 1. get the admin password (goes to your clipboard, not the terminal)
  aws ssm get-parameter --profile woobe --region ap-south-2 --with-decryption \
     --name /woobe-production/grafana/admin-password --query Parameter.Value --output text | pbcopy
  # 2. tunnel (needs the Session Manager plugin and ssm:StartSession on the instance)
  aws ssm start-session --profile woobe --region ap-south-2 --target <instance-id> \
     --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}'
  # 3. browse http://localhost:3000  (user: admin). Prometheus is the same with 9090.
  ```
  nginx has **no** monitoring route: it never proxies Prometheus, Node Exporter or Grafana (asserted in the nginx
  test suite). Putting Grafana behind Cloudflare later is a separate, deliberate change.

## 8. Security model

| Concern | Control |
|---|---|
| `/metrics` reachable from the Internet | **Two independent layers.** (1) nginx: case-insensitive regex `location ~* ^/metrics(/\|$) { return 403; }` — covers `/Metrics`, `/METRICS/`, `/metrics/x`, `//metrics`, `/%6Detrics` (an exact-match rule would let `/Metrics` and `/metrics/` through: Express serves them; verified). (2) The API returns 404 for `/metrics` on any request carrying `X-Forwarded-*`/`Forwarded`/`X-Real-IP`/`CF-Connecting-IP`, which nginx always adds and a client cannot strip. Plus the API binds `127.0.0.1` in production. |
| Prometheus / Node Exporter / Grafana exposed | All bind `127.0.0.1`; the security group has no rule for 9090/9100/3000/9102 (this module creates **no** network resources) |
| Worker metrics exposed | `WORKER_METRICS_HOST` defaults to `127.0.0.1` and must be an IP literal (env-validated); binding failure is logged and the worker keeps sending notifications |
| Container privilege | read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, no Docker socket, non-root users (Prometheus `nobody`, Grafana 472), memory/CPU/PID limits, json-file log rotation |
| Secrets | none in Git/compose/Terraform/state/logs; password file mode 400; instance role scoped to one parameter ARN |
| PII in metrics | none: closed label sets, no ids, no free text; a forged webhook event name cannot become a label |

## 9. Tests and what they prove

| Layer | Where | Covers |
|---|---|---|
| Unit | `metric-definitions.test.ts`, `prometheus-observability.test.ts`, use-case tests | exact metric/label/type surface; forbidden labels absent; never-throws; each business rule (rollback not counted, replay not double-counted, notify-throw still counted…) |
| HTTP | `http-metrics.middleware.test.ts` (real Express + sockets) | route templates, query strings/ids never labels, error-path template, exclusions, in-flight returns to baseline, aborted requests, `UNMATCHED`/`NOT_FOUND` |
| Integration (real Postgres/Redis, real app) | `business-metrics.integration.test.ts` | checkout/COD/webhook/dedupe/amount-mismatch deltas, race for the last unit counts exactly one order, forged webhook records nothing, `/metrics` content type/no leakage/proxy refusal |
| Worker (real BullMQ + Redis) | `notification-worker-bullmq.integration.test.ts`, `notification-worker-metrics.test.ts` | flaky→success = 2 attempt failures + 1 completion; exhausted = 1 terminal, 0 completed; unrecoverable; queue depth at scrape time; Redis down/hung |
| Rules | `infra/observability/prometheus/tests/rules.test.yml` (`promtool test rules`) | every alert fires/doesn't; recording rules; idle traffic |
| Nginx | `modules/ec2/tests/run-nginx-tests.sh` | every `/metrics` spelling → 403 through real nginx; `/health`, `/ready` still proxied; no proxy to 9090/9100/3000 |
| Sync (real Docker-in-Docker at `/opt/woobe`) | `modules/observability/tests/run-sync-tests.sh` | install, ownership/modes, loopback-only listeners, Grafana login + provisioning, idempotency (no container recreated), in-place reload, pruning, **app-deploy isolation**, no secret leakage, failure modes |

## 10. Resource budget — `t4g.small`, 2 GiB, no swap

Measured **idle** on an arm64 Linux VM (same architecture), then rounded up. These are *not* production numbers —
re-measure on the instance after the first real deploy (`docker stats --no-stream`, `free -m`, the Infrastructure dashboard).

| Component | Measured idle | Hard limit set | Notes |
|---|---|---|---|
| OS + systemd + SSM agent + dockerd/containerd | — (estimate ~300 MB) | — | not measured here |
| nginx | — (~10 MB) | — | |
| API | ~70 MB RSS | — | grows with traffic/heap; watch `woobe_node_process_resident_memory_bytes` |
| Worker | ~67 MB RSS | — | |
| Valkey | small | 384 MiB (`maxmemory` 256 MB) | unchanged |
| Prometheus | ~55–110 MiB (3k series) | **256 MiB** (+ `GOMEMLIMIT` 200 MiB) | scales with series count |
| Grafana | ~130 MiB | **256 MiB** | |
| Node Exporter | ~17 MiB | **64 MiB** | |

Sum of *limits* + estimates for the rest ≈ 1.7 GB of ~1.9 GB usable in the worst case; typical is far lower. It fits, but
without much slack for a traffic spike. If it gets tight, in this order: (1) shorten retention, (2) raise the scrape
interval to 30 s, (3) trim high-series dashboards/labels, (4) lower Grafana's limit, and only then consider a larger
instance — **nothing here silently upgrades the EC2 or adds a second one.** Docker healthchecks only *mark*
containers unhealthy; only `restart: unless-stopped` restarts a *crashed* container (an unhealthy-but-running one is
not restarted).

## 11. Terraform delivery (why SSM, not user_data)

`aws_instance.backend` has `user_data_replace_on_change = true` and user_data is capped at 16 KB. Embedding the
Prometheus config, rules and three dashboards there would mean **every dashboard or alert tweak replaces the only
production instance** — wiping `api.env`, the Cloudflare Origin certificate and Valkey's data. So:

- `modules/observability` publishes an **SSM document** (`woobe-production-observability-sync`, all config embedded
  gzip+base64) and a **State Manager association** targeting the instance ID. It runs when the instance registers, on
  every change to the document, and every 12 hours (drift correction).
- `files/sync.sh` (on the host, idempotent): waits for Docker → creates directories/ownership → creates the Grafana
  password once → writes only changed config files → `docker compose up -d` (recreates only what changed) → SIGHUP
  Prometheus / restart Grafana only if their config changed → waits for all three to be healthy.
- Nothing in this module touches `aws_instance`, its user_data, security groups or any network resource. The
  instance role gains one inline policy (Get/Put on the single Grafana parameter).
- **Application deploys are independent.** `deploy.sh` removes only the containers `woobe-api` and `woobe-worker`;
  its `docker image prune -af --filter until=168h` cannot remove an image an existing container uses. Tested with the
  stronger `image prune -af` (§9).
- **Data survives**: container recreation, `docker compose down/up`, image bumps, host reboot (`restart:
  unless-stopped`). **Data does not survive** replacing the instance (root volume) — the Grafana password parameter does.
- The instance needs **outbound internet** to pull the three images from Docker Hub on first sync (it has a public IP; there is no NAT). Docker Hub's anonymous pull limit is generous for three pulls.

## 12. Configuration you must set by hand (production)

In `/opt/woobe/app/api.env` (see `docs/deployment.md`): `API_BIND_HOST=127.0.0.1`, and — only if you change them —
`API_PORT` and `WORKER_METRICS_PORT` (default 9102) **and** the matching Terraform variables `api_port` /
`worker_metrics_port`, or Prometheus scrapes the wrong port. Leave `WORKER_METRICS_HOST` unset (loopback).

## 13. Local development

```bash
docker compose up -d                                   # unchanged: Postgres + Redis only
pnpm dev                                               # API :4000, worker metrics :9102 (host processes)
infra/observability/scripts/observability-local.sh up  # Prometheus :9090, Grafana :3000, node-exporter
infra/observability/scripts/observability-local.sh password   # the generated (gitignored) Grafana password
infra/observability/scripts/observability-local.sh down        # stop; `reset` also deletes the local data volumes
python3 infra/observability/scripts/validate-dashboards.py --prometheus http://localhost:9090
```

Because the API and worker run on your machine, the local Prometheus reaches them at `host.docker.internal`
(`prometheus/targets.local/`). Local Node Exporter reports the **Docker VM's** metrics, not your Mac's, and Docker
Desktop's VM root is not an ext4/xfs `/`, so the *root-filesystem* panels stay empty locally — they target the EC2's
root volume.

```bash
# validation without any running stack (all three were run for real; `promtool` ships in the pinned Prometheus image)
P=infra/observability/prometheus; IMG=prom/prometheus:v3.13.3
docker run --rm --entrypoint promtool -v "$PWD/$P/prometheus.yml:/etc/prometheus/prometheus.yml:ro" -v "$PWD/$P/rules:/etc/prometheus/rules:ro" \
  -v "$PWD/$P/targets.local:/etc/prometheus/targets:ro" $IMG check config /etc/prometheus/prometheus.yml   # config + both rule files
docker run --rm --entrypoint promtool -v "$PWD/$P:/p:ro" $IMG test rules /p/tests/rules.test.yml            # alert/recording-rule unit tests
python3 infra/observability/scripts/validate-dashboards.py                                                  # dashboard structure (add --prometheus URL to run every query)
```

## 14. Troubleshooting

See [`observability-runbook.md`](observability-runbook.md) for the alert-by-alert procedures.

## 15. Known limitations

- No notifications: alerts are visible, not delivered (no Alertmanager, by decision).
- Single host, single disk, 7-day retention; replacing the instance loses history.
- The queue-depth gauges are served by the worker, so they vanish while it is down (covered by `WoobeWorkerDown`).
- Thresholds are untuned defaults; the root-filesystem panels/alert target `mountpoint="/"` and were **not verified on
  the real host** (Docker Desktop's VM has no such mount) — confirm on the EC2 after first sync.
- `refund` failure semantics follow the use-case: if the gateway refund succeeds but recording the refund row fails, the
  use-case treats that as a failure and so does the metric (pre-existing behaviour, not changed here).
- The 5xx alert counts every 5xx; a single noisy endpoint can trip it — check the "top routes" panels first.
