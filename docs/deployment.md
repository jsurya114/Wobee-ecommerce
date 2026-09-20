# Deployment — GitHub Actions → AWS (OIDC, ECR, SSM)

**Status: implemented and tested locally; not yet applied to AWS** (account `185658217213`, region `ap-south-2`). Nothing in this document runs until you complete [First-time setup](#first-time-setup).

**What this is:** a *safe single-instance in-place deployment with health verification and automatic rollback*. It is **not** zero-downtime, **not** highly available, and **not** a rolling deploy: there is one EC2 instance and no load balancer, so the API is briefly unavailable each time containers are swapped.

**Initial architecture:** one EC2 (Graviton `t4g.small`, arm64) · no ALB · self-hosted Valkey on that EC2 · RDS PostgreSQL (private) · private ECR · SSM for deployment · media in a private S3 bucket delivered through CloudFront · Cloudflare → nginx on the same EC2 → API (prepared; see "HTTPS edge" below — not live yet) · web/admin on Vercel (deployed by Vercel's own Git integration, not by this pipeline).

## 1. Architecture

```
PR ──► ci.yml (lint, typecheck, tests, build)                        [no AWS, no deploy]

push to main ──► deploy.yml
   ci  ──►  approve (GitHub Environment "production")  ──►  image  ──►  deploy
   (ci.yml)   gate only, no AWS                          OIDC │          OIDC │
                                                              ▼               ▼
                                              ECR woobe-production-api    SSM Run Command
                                              <git-sha> → digest          document woobe-production-deploy
                                                                                │
                                                                                ▼
                                                     EC2: pull by digest → migrate (if needed)
                                                          → swap woobe-api + woobe-worker
                                                          → verify → roll back on failure
                                                          ├─► RDS PostgreSQL (private subnet)
                                                          ├─► Valkey (127.0.0.1)
                                                          └─► S3 (private; API writes/deletes only)

Media:  Browser ──► CloudFront (OAC, HTTPS) ──► private S3 bucket      (see §7 "Media")
```

## 2. GitHub OIDC flow and IAM roles

No AWS access keys exist in GitHub. Each AWS-touching job requests a short-lived GitHub OIDC token (`permissions: id-token: write`) and exchanges it for temporary STS credentials via `aws-actions/configure-aws-credentials`.

**Role 1 — `woobe-github-actions-deploy` (CI/CD identity).** Trust policy, exact `StringEquals`, no wildcards:
- `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`
- `token.actions.githubusercontent.com:sub` = `repo:jsurya114/Wobee-ecommerce:ref:refs/heads/main`

| Grant | Scope |
|---|---|
| `ecr:GetAuthorizationToken` | `*` (IAM cannot scope it) |
| ECR push/pull, `DescribeImages` | only `woobe-production-api` |
| `ssm:SendCommand` | only the document `woobe-production-deploy` (not `AWS-RunShellScript`) |
| `ssm:SendCommand` | only instances tagged `Project=Woobe`, `Environment=production` |
| `ssm:GetCommandInvocation`, `ListCommandInvocations` | `*` (read-only; not scopable) |

**Role 2 — `woobe-production-ec2-role` (runtime identity, separate).** Instance profile on the EC2: SSM managed-instance core (Session Manager, Run Command), ECR **pull-only** for the one repository, S3 `PutObject`/`DeleteObject` on the media bucket only (no read, no list — CloudFront does the reading), CloudWatch metrics/log writes under `/woobe-production/*`, read of the Valkey password (SSM) and RDS master secret. No AWS keys are placed in env files or containers.

> **Why `environment: production` is on the `approve` job only.** A job that declares a GitHub environment gets the OIDC subject `repo:…:environment:production` *instead of* `…:ref:refs/heads/main`. The role is required to trust exactly the branch subject, so the environment (protection rules, deployment history) sits on a gate job that never touches AWS, and the two jobs that assume the role are environment-free. They `needs:` the gate, so environment approvals still block them. To trust the environment subject instead, change `subject` in `modules/github-oidc` — a deliberate decision, not a default.

## 3. ECR

One private repository, `woobe-production-api`, holding **one image used for both API and worker** (same code; the worker is just a different command: `tsx src/worker.ts`). No second image is needed. Tags are the full git SHA and are **immutable**; scan-on-push is on; lifecycle expires untagged images after 7 days and keeps the newest 20 (`ecr_image_retention_count`) — that is also your rollback window. Images are built `linux/arm64` (the host is Graviton) and the deploy verifies image architecture against the host. **Deployments use the image digest** (`repo@sha256:…`), resolved from ECR after the build and cross-checked against the build's reported digest; `latest` is never used.

## 4. CI (`.github/workflows/ci.yml`)

Runs on `pull_request` into `main` and via `workflow_call`. Uses the repo's own scripts: gitleaks, `pnpm audit --prod`, migration checks, `pnpm run lint`, `typecheck`, `boundaries:check`, `test` (Postgres + Redis services), `build`. It never deploys and never touches AWS. There is no separate e2e/browser test suite in the repo, so none is run.

## 5. CD (`.github/workflows/deploy.yml`)

Triggers: `push` to `main` and `workflow_dispatch`. Never PRs or feature branches. Concurrency: see [Concurrency](#concurrency-pushes-redeploys-and-rollbacks) below (`cancel-in-progress: false` everywhere; a running deploy is never cancelled). Permissions: `contents: read`, plus `id-token: write` only on the two AWS jobs (and `actions: read` on the gate, read-only). No `continue-on-error`.

1. **gate** — no AWS. Refuses (the run turns **red**) any run not on `main`. If the repository variable `DEPLOY_ENABLED` is not exactly `true`, it passes but reports **DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED** as a warning annotation and a run-summary banner. Otherwise it asks GitHub whether **another manual run** (redeploy or rollback) is queued, waiting for approval or running; if so this run is **BLOCKED** (below). If GitHub cannot be asked, it fails closed.
2. **ci** — the CI workflow above. It still runs when deployment is disabled (pushes are always tested) and is skipped when redeploying an existing image.
3. **approve** — `environment: production`, and only if the gate enabled deployment and CI passed or was skipped.
4. **image** — OIDC → build/push (skipped if that SHA is already in ECR) → resolve digest.
5. **deploy** — `ssm send-command` (document `woobe-production-deploy`) → poll → print output → fail unless `Success`. Output also goes to CloudWatch log group `/woobe-production/deploy` (30-day retention).
6. **result** — always runs last. Its title carries the deploy job's result (`Deployment result (deploy job skipped|success|failure)`), and it states the outcome explicitly:
   - **DEPLOYED** — the deploy job succeeded and the instance verified health, readiness and stability.
   - **DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED** — deployment is disabled (`DEPLOY_ENABLED` is not `true`). Warning annotation plus summary; the run stays green because CI passed, but it is never labelled a deployment, and the deploy job shows as *skipped*.
   - **DEPLOYMENT BLOCKED — NOT DEPLOYED** — a manual deployment/rollback was queued or running when this run started (CI still runs). The run is red so it cannot be mistaken for a deploy.
   - **DEPLOYMENT FAILED — NOT DEPLOYED** — anything else (CI, image, deploy failed or cancelled; gate refused). The run is red.

   A green run therefore does **not** mean "deployed"; only a `DEPLOYED` result does. The logic lives in `.github/scripts/deploy-status.sh` and is unit-tested by `.github/scripts/test-deploy-status.sh` (16 cases, no GitHub needed). The `DEPLOY_ENABLED` safety gate is unchanged; it is now just impossible to miss. A manual redeploy/rollback (`image_sha`) goes through the same jobs and the same result reporting.

### Concurrency: pushes, redeploys and rollbacks

GitHub keeps at most **one running and one pending** run per concurrency group, and a newer pending run **replaces (cancels)** the older pending one. The earlier single shared group (`production`) therefore let a newer push silently replace a queued, explicitly requested rollback. The design now separates the two concerns:

- **Run level:** pushes share the group `production-push` (a newer pending push still replaces an older pending push — the latest commit wins). Every **manual** run (`workflow_dispatch`: redeploy or rollback) gets its **own** group (`production-manual-<run id>`), so nothing can replace or cancel it.
- **Job level — the serialization:** only the `deploy` job (the one that changes production) holds a lock, the shared group `production-deploy`, `cancel-in-progress: false`. Every run queues for it, so two AWS deployments never run at the same time and a running deploy is never cancelled.
- **The gate refuses instead of replacing:** while another manual run is queued, waiting for approval or running, any run that starts is **BLOCKED** loudly (red, nothing deployed). A manual run never fails because a push is deploying — it waits its turn in the lock.

| Situation | What happens |
|---|---|
| **A. Normal push to `main`** | Runs immediately if no push run is active: gate → CI → approve → image → deploy (lock) → result. |
| **B. Two rapid pushes** | The first runs. While it runs, a newer push waits (pending at run level); a still-newer push replaces that pending one (cancelled, loudly). So the first and the newest push deploy, one after the other; the middle one is superseded. |
| **C. Manual deployment** (no `image_sha`) | Starts immediately (its own group); gate checks no *other* manual run is active; CI runs; its `deploy` job waits for the lock if a push deploy is running, then deploys. Cannot be replaced by a push. |
| **D. Manual rollback** (`image_sha`) | Same as C, without CI or a rebuild. If a push deploy is running, the rollback's `deploy` job waits for the lock and runs right after it. Cannot be replaced by a push. A second manual run started meanwhile is BLOCKED, so two explicit operations never race. |
| **E. Rollback, then a push right after** | The push is **BLOCKED** (red, nothing deployed) while the rollback is queued or running — it never replaces or overtakes it, and after a rollback you usually do *not* want the bad commit auto-redeployed. Once the rollback finishes, re-run the push's workflow if you still want it deployed. A push that had already passed the gate before the rollback was dispatched simply deploys first; the rollback then waits for the lock and applies last. |

**Limits:** (1) two manual runs dispatched within the same second can both pass the gate, and the job-level lock could then replace the earlier one's pending deploy. (2) A manual run left waiting for environment approval counts as "in flight" and blocks pushes until it is approved, rejected or cancelled. (3) A cancelled/superseded run shows as failed in the result job (its message lists every job's result). (4) The behavior rests on GitHub's documented concurrency semantics; it is unit-tested structurally (`.github/scripts/test-deploy-status.sh`) but has not been exercised on GitHub itself.

## 6. Production deployment sequence (on the instance — `infra/terraform/modules/ssm-deploy/deploy.sh`)

This is a **safe single-instance in-place deployment with health verification and automatic rollback.** There is one host, one API port and no load balancer, so it is **not zero-downtime**: the API is unavailable from the moment the old release is stopped until the new one is healthy. That gap is unavoidable on this architecture (host networking means two APIs cannot share port 4000); the script prints the measured figure (`The API was unavailable for about Ns`) and bounds it (see below). It is not highly available, not self-healing, and does not scale horizontally.

**Order of operations — each phase only starts if the one before it succeeded:**

0. **Validate and pre-flight** — inputs; `api.env` present, required keys (incl. the four media settings), `MEDIA_STORAGE_DRIVER=s3`, `https://` `MEDIA_PUBLIC_BASE_URL`, no quoted values, and no lines Docker cannot parse (reported by line number only). *Touches nothing.*
1. **Pull** the image by digest (bounded by a 10-minute timeout) and check its architecture. *Touches nothing.*
2. **Migrate** (only if `RunMigrations=true`): `prisma migrate deploy`. *Touches nothing running.* **A migration failure aborts here: the old API and worker keep running, untouched, and the deploy fails.** Migrations always run before any replacement begins.
3. **Candidate check** — the new API is started as `woobe-api-candidate` on a spare port (`API_PORT + 100`) **beside** the running one, against the real database and Redis but with no traffic, and verified (running, port open, `/health`, `/ready`, then the stability window). If Docker cannot start it, it crashes, it never becomes healthy/ready, or it dies during the window, the deploy fails here with **the old release never disturbed and no downtime**. The candidate is always removed.
4. **Swap** — only now is the running release replaced:
   1. **Graceful stop.** `docker stop -t 30` sends **SIGTERM** to `woobe-api` and `woobe-worker` in parallel. The API closes its server and exits 0 (it force-exits itself after 10 s); the worker finishes its in-flight job. **`STOP_TIMEOUT_SECONDS=30`**: only if a container is still alive after 30 s does Docker send SIGKILL (exit 137) — the last-resort fallback, never the first move. The output says which happened per container (`stopped gracefully (SIGTERM handled, exit 0)` vs `force-terminated (SIGKILL, exit 137)`). Parallel stops make the worst case one timeout (30 s), not two, so the step cannot hang. A worker job that needs more than 30 s is killed and re-delivered by BullMQ (jobs are idempotent).
   2. **Start** the new API and worker on the real port (`--restart unless-stopped`).
   3. **Verify** as in phase 3, plus the worker: both containers running, port open, `/health` 200, `/ready` 200, then a stability window with no restarts (crash loop), containers still running, container healthcheck not `unhealthy`, `/health` and `/ready` still 200.
5. **Success** → the release is recorded as verified-good, old images older than 7 days are pruned, and `DEPLOY SUCCESS` is printed. **Any failure in phase 4 → rollback** (below). From phase 4 on, nothing is allowed to abort the script implicitly: `set -e` is switched off and every step is checked explicitly, so a failed `docker run` reaches the rollback path instead of leaving a half-deployed host.

**Worst-case downtime bound:** 30 s stop + up to 90 s to become healthy + 20 s stability ≈ 2.5 minutes, only if the new release fails after the swap and is rolled back (add the same again for the rollback's own verification). On a healthy deploy it is the few seconds the script reports.

**Verified-good rule.** The state files (`/opt/woobe/app/state/api.image`, `worker.image`) are written **only after a release passed full verification**, and rollback uses **only** those. A merely pulled image, an image that exists locally, a container that happens to be running or stopped, an image from a failed attempt, or an arbitrary ECR tag is never a rollback target — a state file that is not a digest reference into this repository is ignored. If containers are running but nothing is recorded as verified-good, the script says so (and a post-swap failure then has nothing to roll back to).

**Failure outcomes**

| What fails | Outcome |
|---|---|
| Bad input, `api.env` problem, ECR login, image pull, wrong architecture | Deploy fails; running release untouched |
| Database migration | Deploy fails; running release untouched (nothing was stopped) |
| New API: Docker won't start it, crashes, `/health` or `/ready` fail, crash loop (candidate phase) | Deploy fails; running release untouched; no downtime |
| Old release cannot be stopped | Diagnostics, then the rollback path |
| New API or worker fails after the swap (worker-specific failure, port issue, crash loop, `docker run` error) | Diagnostics, failed containers removed, **automatic rollback to the last verified-good release**, deploy fails (`DEPLOY FAILED + ROLLBACK ATTEMPTED — rollback SUCCEEDED`) |
| Failure after the swap and no verified-good release exists (first deploy) | Failed containers removed; deploy fails with `service is DOWN`; no rollback is claimed |
| Rollback itself fails | Deploy fails with `rollback FAILED; the service is DOWN` — manual intervention |

Every failure exits non-zero and never prints `DEPLOY SUCCESS`. Rolled-back migrations are **not** reverted — see §8.

The worker cannot be tried beside the running worker on a spare port (it has no port, and a second worker would compete for real queue jobs), so a worker-only failure is found in phase 4 (brief downtime, then rollback) rather than in phase 3.

## HTTPS edge: Cloudflare → nginx → API (current, single EC2)

**Status: prepared and validated locally only. Nothing is applied, nothing is live.** `https://api.woobe.in` does not exist yet, and none of this has been run against real AWS or Cloudflare.

```
Browser / Razorpay
     │  HTTPS (Cloudflare's edge certificate)
     ▼
Cloudflare  — DNS record for api.woobe.in, PROXIED; SSL/TLS mode "Full (strict)"
     │  HTTPS to the origin (Cloudflare's IP ranges only)
     ▼
EC2 security group — 443 from Cloudflare ranges only · 80 closed · nothing on 4000 / 22 / 6379
     ▼
nginx container (host network) :80 / :443 — TLS terminates HERE (Cloudflare Origin CA certificate)
     │  plain HTTP over loopback
     ▼
API container 127.0.0.1:4000 — never reachable from the internet
```

This is the **current** architecture: **one EC2 instance, no load balancer.** Deployments still have brief downtime (§6); this is **not** highly available and **not** zero-downtime. An ALB with Auto Scaling is future work (§15) and would take over TLS termination from this nginx.

### What was added
- **nginx as its own container** (`nginx:1.28-alpine`, pinned by digest, multi-arch incl. arm64), separate from the application image, in `/opt/woobe/nginx/docker-compose.yml`, started by `user_data` alongside Valkey. The API, worker and deploy pipeline are unchanged; `deploy.sh` still verifies the API directly on `127.0.0.1:4000`.
- **Config rendered by Terraform** from `infra/terraform/modules/ec2/templates/nginx/api.conf.tpl` (domain, API port and the Cloudflare ranges come from Terraform variables) into `/opt/woobe/nginx/conf.d/api.conf`.
- **`TRUST_PROXY_HOPS` in the API.** Behind nginx every request arrives from `127.0.0.1`; without a trusted proxy `req.ip` is that address for everyone, and the rate limiters (`middleware/rate-limit.ts`, keyed by `req.ip`) would share **one bucket for all users** — a few failed logins by anyone would lock everyone out. The API now trusts exactly one hop by default in production (0 elsewhere); nginx overwrites `X-Forwarded-For` with the real client address, so it cannot be forged.
- **No security-group change was needed** — the existing rules already are the desired set (below).

### nginx behavior
| Concern | Behavior |
|---|---|
| Ports | Listens on **80 and 443** only. It never listens on, and the host never publishes, the API port. |
| Unknown names | Requests to any other hostname, the bare IP, or an unknown TLS server name are refused (plain HTTP: connection closed; TLS: handshake rejected). |
| HTTP | `301` to `https://api.woobe.in<path+query>` (fixed target, not built from the `Host` header). Port 80 is closed in the security group by default; Cloudflare's "Always Use HTTPS" redirects at the edge, and this is the origin's own backstop. |
| Proxying | To `127.0.0.1:4000` over HTTP/1.1 with keep-alive. Method, path, query, body and all other headers pass through untouched (including `Content-Type`, `Authorization`, `X-Razorpay-*`). |
| Preserved / set | `Host` (kept), `X-Forwarded-Proto` (`https`), `X-Forwarded-Host`, `X-Real-IP` and `X-Forwarded-For` (both = the real client address; any client-sent value is **overwritten**, not appended). |
| Real client IP | `CF-Connecting-IP` is believed **only** from Cloudflare's IPv4 ranges (the same list as the security group, one Terraform variable). From anyone else it is ignored. |
| Timeouts | connect 5 s, send 60 s, read 60 s (below Cloudflare's 100 s, so slow upstreams answer `504` from nginx, not Cloudflare's `524`); no retry to another upstream. |
| Body limit | `client_max_body_size 6m` (the API accepts images up to 5 MB; nginx's 1 MB default would 413 every upload). |
| TLS | TLS 1.2 and 1.3, no session tickets. |
| `/health`, `/ready` | Proxied, GET and HEAD only. |

### HTTPS certificate approach: Cloudflare Origin CA (chosen)
TLS terminates at nginx using a **Cloudflare Origin CA certificate** for `api.woobe.in`. It is trusted by Cloudflare only, which is all that ever connects (the security group admits nothing else), and it needs no renewal automation (validity up to 15 years). **Let's Encrypt/Certbot is deliberately not used:** HTTP-01 validation needs Let's Encrypt to reach port 80, which the security group closes and Cloudflare proxies away; DNS-01 would need a Cloudflare API token stored on the host, another secret to manage. **No certificate or key is ever in Git or `user_data`; they exist only on the instance.**

Create it on the instance (Session Manager) so the private key never leaves the host:
```bash
sudo -i
cd /opt/woobe/certs                                   # root-only directory (700), created by user_data
openssl req -new -newkey rsa:2048 -nodes -keyout origin.key -out origin.csr -subj "/CN=api.woobe.in"
chmod 600 origin.key
cat origin.csr                                        # copy this
# Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate → "Use my private key and CSR"
#   hostnames: api.woobe.in · validity: 15 years → paste the returned "Origin Certificate" into:
nano origin.pem && chmod 600 origin.pem
# sanity checks
openssl x509 -in origin.pem -noout -subject -enddate
[ "$(openssl x509 -in origin.pem -noout -pubkey | openssl md5)" = "$(openssl pkey -in origin.key -pubout | openssl md5)" ] && echo "key matches certificate"
```
Until **both** `origin.pem` and `origin.key` exist the nginx container simply **waits** (it does not crash-loop); within about 5 seconds of the second file appearing it validates the config (`nginx -t`) and starts serving.

**Renewal / expiry.** There is no automatic renewal: an Origin CA certificate lasts as long as you chose (up to 15 years). Put the expiry date (`openssl x509 -in origin.pem -noout -enddate`) in a calendar. To replace it: repeat the commands above (new key + CSR), overwrite `origin.key` and `origin.pem`, then reload without dropping connections: `sudo docker exec woobe-nginx nginx -t && sudo docker exec woobe-nginx nginx -s reload`. If the certificate expires, Cloudflare in Full (strict) mode fails with `526`. (The reload step was tested locally: the new certificate is served immediately.)

### Cloudflare configuration (done by hand — nothing here changes Cloudflare)
| Setting | Value |
|---|---|
| DNS record | Type **A**, name **`api`** (→ `api.woobe.in`), content = the instance's Elastic IP (`terraform output ec2_public_ip`; also printed by `terraform output cloudflare_dns_record`), **Proxied (orange cloud)**. It must be proxied: the security group only admits Cloudflare's ranges, so an unproxied record cannot work. |
| SSL/TLS mode | **Full (strict)** — HTTPS from Cloudflare to the origin, certificate validated (the Origin CA certificate above satisfies it). Never "Flexible" (plain HTTP to the origin) or "Full" (unvalidated). |
| Always Use HTTPS | On. Minimum TLS version 1.2. |
| Recommended hardening | **Authenticated Origin Pulls**: the security group admits *any* Cloudflare customer's traffic, so a third party could point their own proxied zone at this IP. AOP makes nginx accept only your zone. Not configured here (it needs the Cloudflare origin-pull CA on the host plus `ssl_verify_client on`); worth doing before launch. |
| Razorpay webhook | Bot Fight Mode / "Super Bot Fight Mode" / managed challenges can block Razorpay's server-to-server POSTs. Add a WAF **skip** rule for `POST /api/v1/payments/razorpay/webhook` (the HMAC signature is the authentication). |
| Rate limiting / WAF | Optional, at the edge (e.g. `/api/v1/auth/*`); the API also rate-limits per client IP. |

No other DNS records are assumed here. The storefront/admin domains, `WEB_ORIGIN`, `ADMIN_ORIGIN`, `COOKIE_DOMAIN` and the web apps' `NEXT_PUBLIC_API_URL` (`https://api.woobe.in`) still need their final values (§7).

### Security-group behavior (unchanged by this work)
| Port | Inbound |
|---|---|
| 443 | Cloudflare's 15 IPv4 ranges only (`cloudflare_ipv4_cidrs`) |
| 80 | **Closed** by default (`allow_http_80 = false`); if enabled, Cloudflare ranges only |
| 4000 (API) | **No rule** — reachable only from nginx on the same host, over loopback |
| 22 | No rule (Session Manager only) |
| 6379 (Valkey) | No rule (loopback only) |
| 5432 (RDS) | Only from the EC2 security group |

The API is kept private by two layers: the security group has no rule for its port, and in production the API itself binds to loopback only (`API_BIND_HOST=127.0.0.1`, see "Why the API binds to loopback" below). If `API_BIND_HOST` is not set the API listens on every interface of the host and the security group is the only barrier.

### Why the API binds to loopback (`API_BIND_HOST=127.0.0.1`)
The API container uses **host networking**, so by default it listens on every interface of the instance — the VPC address, and the Docker bridges other containers sit on — and only the security group keeps port 4000 private. Production therefore sets, in `/opt/woobe/app/api.env`:

```
API_BIND_HOST=127.0.0.1
```
The API then listens on `127.0.0.1:4000` only. Tested locally (real Docker, host network namespace): with the setting the socket is `127.0.0.1:4000` and every other host address (`eth0`, bridges) and a container in a separate network namespace get *connection refused*, while loopback answers; without it the same probes get `200`.

**Why this is safe with the current architecture.** Everything that talks to the API is on the same host and already uses the literal `127.0.0.1`: nginx's upstream (nginx also uses host networking), the container `HEALTHCHECK`, and `deploy.sh`'s port probe and `/health` / `/ready` checks — including the candidate API on `API_PORT + 100`, which reads the same `api.env`. Nothing uses `localhost` (which can resolve to `::1`) or the host's own address. The worker has no HTTP server.

**Behavior of the setting**
- **Unset = unchanged** (`listen(port)`: every interface, IPv4 and IPv6). It is deliberately *not* defaulted to `0.0.0.0` because that would silently drop IPv6.
- It must be an **IP address**. A blank value, `localhost`, or a malformed address makes the API **refuse to start** — a blank hardening setting silently meaning "listen everywhere" would be the worst failure mode. An address that is not on the host also fails at startup, so a wrong value is caught by the deploy's candidate check before anything is replaced.
- Forgetting the line is safe but not hardened: nothing breaks, the API just stays on every interface (security group only).
- `[::1]` is not served when bound to `127.0.0.1`; nothing in this design uses it. `curl localhost:4000/health` on the host still works (curl falls back to IPv4).

**Revisit this setting if the network architecture changes.**
- **Bridge networking** for nginx or the API: a bridged nginx cannot reach the host's loopback, so the API would have to listen on an address that container can reach (and only that).
- **An ALB, or any load balancer or other host, reaching the instance directly** (the future architecture, §15): traffic arrives on the instance's private address, so `API_BIND_HOST` must be unset (or that private address), and the security group must then admit that port **only from the load balancer's security group**.
- **Multiple instances** behind a load balancer: the same applies to each.
These are configuration changes; no code change is needed.

### Health endpoints
`https://api.woobe.in/health` (liveness, no dependencies) and `https://api.woobe.in/ready` (Postgres + Valkey) reach the API through nginx; GET and HEAD only. `/ready` returns only booleans (`database`, `redis`), no addresses or credentials. The container `HEALTHCHECK` and `deploy.sh` verification are unchanged (direct to `127.0.0.1:4000`). An external uptime monitor must go through Cloudflare, since nothing else can reach the origin.

### Razorpay webhook
Register **`https://api.woobe.in/api/v1/payments/razorpay/webhook`** in the Razorpay dashboard **only after the real HTTPS endpoint exists** — Razorpay cannot reach anything else and there is nothing useful to test before then. The proxy preserves the method, path, query, `Content-Type`, `X-Razorpay-Signature` / `X-Razorpay-Event-Id` and the **exact request bytes** (the signature is an HMAC over the raw body). Tested locally against the real handler: a correctly signed body is accepted, the same signature over a changed body is rejected with 401. The Razorpay business logic was not touched. Also set `RAZORPAY_WEBHOOK_SECRET` in `api.env`.

### Changing the nginx configuration
The config is applied at **first boot** from `user_data`, and Terraform replaces the instance when `user_data` changes (`user_data_replace_on_change`) — a new instance means re-creating `api.env` and the certificate by hand. For a small change on a running host: edit `/opt/woobe/nginx/conf.d/api.conf` over Session Manager, run `sudo docker exec woobe-nginx nginx -t && sudo docker exec woobe-nginx nginx -s reload`, and make the same change in `api.conf.tpl` so Terraform and the host do not drift.

### Troubleshooting
| Symptom | Likely cause |
|---|---|
| `521` from Cloudflare | nginx is not running or not on 443: `docker ps`, `docker logs woobe-nginx` (usually still waiting for the certificate files). |
| `526` | Origin certificate missing, expired, wrong hostname, or the private key does not match it. |
| `525` | TLS handshake failed: SSL mode "Full (strict)" but nginx has no valid certificate yet. |
| `522` / timeouts | Security group is not admitting Cloudflare (stale range list) or the record is not proxied. |
| `502` from nginx | API container is down or not on `API_PORT` (must equal Terraform's `api_port`, default 4000): `docker ps`, `curl -s localhost:4000/health` on the host. |
| `504` | API took longer than 60 s. |
| `502` and the API container is running | `API_BIND_HOST` is set to something other than `127.0.0.1` (e.g. the private IP): nginx connects to `127.0.0.1:4000`. A value that is not an address of the host makes the API exit at startup instead. |
| `413` on uploads | Over 6 MB (the API limit is 5 MB). |
| Everyone gets rate-limited after a few attempts | `TRUST_PROXY_HOPS` is 0, so all clients look like `127.0.0.1`. Leave it unset in production. |
| Wrong client IPs in logs | Cloudflare ranges changed; update `cloudflare_ipv4_cidrs` (it feeds both the security group and nginx). |
| nginx restarts in a loop | `docker logs woobe-nginx` shows the `nginx -t` error. |

## Valkey persistence and reliability (current: Phase 1, self-hosted)

**Role.** Valkey is infra-only: rate-limit counters, the guest-order-claim attempt counter, and the BullMQ notification queue's own job state. RDS PostgreSQL remains the sole source of truth for orders, payments, inventory, refunds, returns, users and products — Valkey holding job state is a convenience, not a second database of record.

**CURRENT PHASE 1 — self-hosted on the same EC2, hardened for persistence:**

| Setting | Value | Why |
|---|---|---|
| Persistence | AOF, `appendfsync everysec` | Primary recovery mechanism. At most ~1 s of the most recent writes can be lost on a hard crash; everything before that replays on restart. `everysec` is both Valkey's own compiled default and the production-appropriate middle ground between `always` (fsync per write, far too slow for a shared 2 GiB host) and `no` (OS-timed, unbounded loss window). |
| RDB snapshots | `save 900 1 300 10 60 10000` | Secondary, compact fallback alongside AOF — a faster cold-start path and a second recovery format if the AOF file is ever suspect. Set explicitly rather than left to Valkey's implicit compiled-in default, so the exact behavior is documented here, not inferred. |
| AOF format | `aof-use-rdb-preamble` (Valkey 8's own default, left untouched) | The AOF file itself starts with a compact RDB-format preamble followed by incremental AOF commands — already the modern default, no extra config needed. |
| Host directory | `/opt/woobe/valkey-data`, bind-mounted to the container's `/data`, `chmod 700` | A real directory on the EBS root volume, not an ephemeral anonymous Docker volume — survives `docker compose up`/container recreation. Ownership is fixed automatically on every container start by the official image's own entrypoint (runs as root, `chown`s its working directory — this bind mount — to the image's built-in `valkey` user, UID 999, then steps down via `setpriv`; verified directly from `valkey-container`'s `docker-entrypoint.sh`, `mainline/8.0/alpine` — the source behind the `valkey/valkey:8-alpine` tag). No manual `chown` needed or attempted. |
| Eviction policy | `noeviction` (was `allkeys-lru`) | BullMQ queue keys must never be silently dropped under memory pressure. `noeviction` is also Valkey's own compiled-in default — this reverts an earlier explicit override, it does not introduce new engine behavior. **Consequence:** once `maxmemory` is reached, write commands fail with an OOM-style error instead of evicting a key; read commands keep working. `notification.queue.ts`'s `queue.add()` call has no try/catch today, so an OOM error there would surface as an unhandled rejection up the call stack rather than a silent drop — worse-looking in logs, but strictly safer than a queue job vanishing with no trace. This is a known consequence, not a bug introduced here; watch the new memory-pressure alarm below before it happens in practice. |
| `maxmemory` | 256 MB (`valkey_maxmemory_mb`, unchanged default) | Derived from the `t4g.small`'s 2048 MiB total, not chosen blindly: ~350 MiB reserved for AL2023 OS/kernel/Docker daemon/SSM Agent/`dnf-automatic`, ~20–30 MiB for nginx, ~400 MiB budgeted each for the API and Worker Node processes (no `--max-old-space-size` is set on either, so this is a working estimate, not a hard ceiling on them) — leaving roughly 850–900 MiB of headroom. 256 MB is deliberately far below that ceiling: Woobe's actual Redis usage (rate limits, claim counters, a queue with `removeOnComplete: true` and `removeOnFail: 1000`) is narrow and bounded, not cache-sized. |
| Docker `mem_limit` | `valkey_maxmemory_mb * 1.5` = 384 MB (derived, not a separate variable) | A hard cgroup ceiling above the logical `maxmemory` cap, giving headroom for AOF-rewrite/RDB-save fork() copy-on-write overhead and Valkey's own non-dataset memory (connection/output buffers, internal structures) without letting a worst case consume unbounded host RAM. Always stays proportional if `valkey_maxmemory_mb` is changed later, since it's computed from it rather than set independently. |
| Restart policy | `restart: unless-stopped` (unchanged) | Docker restarts the container automatically whenever its process exits, for any reason — crash, OOM-kill, `docker kill`. **This is a Docker restart policy acting on container exit, not a healthcheck-triggered restart** — a container that stays running but reports `unhealthy` is not restarted by this or by anything else in this stack (see Healthcheck, next). |
| Healthcheck | `valkey-cli ping`, 10s interval, 3s timeout, 3 retries, 10s start period | Verifies Valkey actually answers PING with the right auth, not merely that the process exists. Reports container health status (visible via `docker ps`/`docker inspect`) for operator visibility and for future tooling — it does **not** itself restart anything; only `restart: unless-stopped` reacting to a process exit does that. Authentication uses `REDISCLI_AUTH` as a container **environment** variable (which `valkey-cli` reads automatically), not a `-a <password>` command-line flag — keeps the password out of `ps aux`-style process listings. (The password is still visible via `docker inspect` on this container, same as the existing `--requirepass` flag already was — no new exposure, same trust boundary as before: anyone who can inspect this container already has host/docker-group access, equivalent to reading the 600-permissioned compose file directly.) |
| Public exposure | `127.0.0.1:6379:6379` only, no security-group rule for 6379 (unchanged) | Not weakened by any of the above — persistence and eviction changes are entirely internal to the container and the bind mount. |
| Monitoring | Two CloudWatch custom metrics (`ValkeyUp`, `ValkeyUsedMemoryBytes`) pushed once a minute by a systemd timer running `/opt/woobe/valkey/push-metrics.sh`, under the `woobe-production` namespace the EC2 role already has `cloudwatch:PutMetricData` for | Deliberately **not** the full CloudWatch Agent: a config file, a new systemd unit and a broader IAM surface for two numbers isn't worth it at Phase 1 scale. Both metrics stay inside CloudWatch's always-free 10-custom-metric allotment (2 used) — **$0.00 added cost**. Two new alarms (`woobe-production-valkey-down`, evaluates `ValkeyUp`; `woobe-production-valkey-memory-pressure`, evaluates `ValkeyUsedMemoryBytes` against 80% of `maxmemory`) — still within CloudWatch's 10-free-alarm allotment alongside the existing 6, so **$0.00 added cost** there too. Detects sustained outages/crash-loops and memory pressure; does **not** guarantee catching a restart faster than the 60 s check interval — a deliberate Phase 1 simplicity trade-off, not an oversight. |

**What AOF persistence protects against:** a Valkey process crash, a container restart, and an EC2 reboot — the queue/rate-limit/claim-counter state on disk at `/opt/woobe/valkey-data` survives all three.

**What it does NOT protect against — be precise about this:** the loss of this specific EC2 instance/EBS volume pair (instance replacement without preserving the volume, EBS volume loss, or the AZ/instance being terminated and rebuilt from Terraform). Valkey is not backed up off this one volume, and RDS remains the only durable, off-instance store. If the EC2 instance is ever replaced, the Valkey dataset (queued notification jobs, rate-limit windows, claim counters) starts empty — this is an accepted, documented limitation for Phase 1, not a hidden risk. Nothing here turns Valkey into a second database of record.

**Manual recovery / verification commands (on the instance, via SSM Session Manager):**
```
# Confirm the container is up and healthy
docker ps --filter name=woobe-valkey

# Confirm auth + persistence config as actually running
docker exec -e REDISCLI_AUTH="$(grep VALKEY_PASSWORD /opt/woobe/valkey/valkey.env | cut -d= -f2)" woobe-valkey valkey-cli ping
docker exec -e REDISCLI_AUTH="$(grep VALKEY_PASSWORD /opt/woobe/valkey/valkey.env | cut -d= -f2)" woobe-valkey valkey-cli CONFIG GET appendonly
docker exec -e REDISCLI_AUTH="$(grep VALKEY_PASSWORD /opt/woobe/valkey/valkey.env | cut -d= -f2)" woobe-valkey valkey-cli CONFIG GET maxmemory-policy

# Confirm the AOF directory is actually on the host bind mount, not an anonymous volume
ls -la /opt/woobe/valkey-data/appendonlydir

# Manually trigger the metrics push once (for troubleshooting, outside its usual 60s timer cadence)
sudo /opt/woobe/valkey/push-metrics.sh

# Check the metrics timer itself
systemctl status woobe-valkey-metrics.timer
```

**Tests (real Docker, no AWS — `infra/terraform/modules/ec2/tests/run-valkey-tests.sh`):** executes the actual `valkey` block of the rendered `user_data` (real Compose, the pinned image, a stubbed `aws` for the SSM password fetch), writes a real BullMQ job shaped exactly like `notification.queue.ts`'s own `enqueue()` call, `SIGKILL`s the container, confirms `restart: unless-stopped` brings it back automatically and the job is still there (the actual persistence proof, not a config-file check), confirms a new job can be added afterward, confirms the real API and worker reconnect, confirms no non-loopback 6379 exposure, runs the *actual* rendered `push-metrics.sh` body against the real container (up and down) and asserts on what it would have pushed to CloudWatch, and proves `noeviction` on a separate small-`maxmemory` instance (a write fails with an OOM-style error; an earlier "protected" key is not silently evicted). **Not exercised:** `systemctl enable --now` itself (no systemd inside a plain Docker container — meaningful only on the real AL2023 host) and a real EC2 reboot.

**FUTURE PHASE 2 — managed Valkey (ElastiCache):** see "§15. Future: ALB + multiple EC2 instances" — moving off self-hosted Valkey to ElastiCache is a `REDIS_URL` repoint, nothing else in the app changes. The trigger for that migration is a second EC2 instance needing to share cache/queue state (self-hosted Valkey on one box stops being valid once there's more than one app instance), not a persistence concern — the hardening above is sufficient for Phase 1's single-instance reality on its own.

## Observability (Prometheus, Grafana, Node Exporter)

Full reference: [`observability.md`](observability.md); alert-by-alert procedures: [`observability-runbook.md`](observability-runbook.md).
In short: the API exposes `/metrics` (RED + Node.js + business events), the worker exposes its own on `127.0.0.1:9102`, Prometheus
(7 days / 2 GB), Grafana and Node Exporter run as containers on the same EC2 — **every listener on loopback, no security-group rule, no public monitoring route.**

- **How it gets onto the box:** Terraform `modules/observability` → an SSM document + State Manager association (**not** `user_data`, so changing a dashboard never
  replaces the instance, and **not** the application deploy, so a deploy never touches it). It installs itself when the instance registers with SSM (the first run waits for
  Docker) and converges again on every change and every 12 hours. It needs **outbound access to Docker Hub** to pull three images.
- **What you must do by hand:** nothing new beyond `API_BIND_HOST=127.0.0.1` in `api.env`. The Grafana admin password is generated on the instance at first sync
  (SSM SecureString `/woobe-production/grafana/admin-password`, not in Terraform state). Open Grafana over an SSM port-forward (`observability.md` §7).
- **`/metrics` is never public:** nginx returns 403 for every spelling of it (`/Metrics`, `/metrics/`, …) and the API itself refuses it to any proxied request.
- **Alerts are visible, not delivered** — there is no Alertmanager.
- **Application deploys** (`deploy.sh`) remove only `woobe-api` and `woobe-worker`; the observability containers and their data (`/opt/woobe/prometheus-data`,
  `/opt/woobe/grafana-data`, `/opt/woobe/observability`) are outside its boundary (`/opt/woobe/app`). Its `docker image prune` cannot remove an image an existing container uses.

## 7. Environment and secrets model

The image contains **no** env file and no secrets. On the instance everything is in `/opt/woobe/app/api.env` (`root:root`, mode `600`, created once by hand over Session Manager; Docker `--env-file` format: `KEY=value`, **no quotes**, unlike `.env.example`).

Non-secret hardening lines the production `api.env` should contain (alongside the required secrets and media settings below):
```
# /opt/woobe/app/api.env — docker --env-file format: NAME=value, no quotes
API_BIND_HOST=127.0.0.1      # API reachable only over loopback (nginx on the same host)
# TRUST_PROXY_HOPS           # leave unset: defaults to 1 in production (one proxy hop: nginx)
# WORKER_METRICS_PORT        # leave unset: 9102 (loopback). If you change it, change Terraform's worker_metrics_port too
# WORKER_METRICS_HOST        # leave unset: 127.0.0.1. Never set this to a public interface
```

| Class | Variables |
|---|---|
| Public / non-secret config | `API_BIND_HOST` (set `127.0.0.1` in production — see "Why the API binds to loopback"), `TRUST_PROXY_HOPS` (leave unset: 1 in production behind nginx), `WORKER_METRICS_HOST/PORT` (leave unset: loopback:9102 — the worker's Prometheus endpoint), `MEDIA_STORAGE_DRIVER` (must be `s3`), `AWS_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_PUBLIC_BASE_URL` (see §7), `API_PORT`, `WEB_ORIGIN`, `ADMIN_ORIGIN`, `COOKIE_DOMAIN`, `API_PUBLIC_URL`, `MEDIA_UPLOAD_DIR`, `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`, `BCRYPT_SALT_ROUNDS`, `SMTP_HOST/PORT/SECURE/FROM`, `SUPPORT_EMAIL`, `STAFF_INVITATION_TTL_HOURS`, `GOOGLE_CLIENT_ID` (required in production), `RAZORPAY_KEY_ID`; `NODE_ENV=production` is set in the image |
| Runtime secrets | `DATABASE_URL`, `REDIS_URL` (contains the Valkey password), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_USER`, `SMTP_PASS` |
| AWS-provided identity | Credentials — including the S3 access the media adapter uses — come from the EC2 instance role via the metadata service (IMDSv2, hop limit 2 so containers can reach it). Nothing to configure, and no access keys exist anywhere. |
| Deploy-time config | Workflow `env`: role ARN, ECR repo, SSM document, instance name tag, log group (identifiers, not secrets). Repo variable `DEPLOY_ENABLED`. GitHub Environment `production`. **No GitHub secrets are used.** |

`REDIS_URL` → `redis://:<password>@127.0.0.1:6379`, password at SSM `/woobe-production/valkey/password`. `DATABASE_URL` → RDS endpoint (`terraform output rds_endpoint`), credentials in the AWS-managed secret (`rds_master_user_secret_arn`); URL-encode the password. RDS PostgreSQL 16 enforces TLS (`rds.force_ssl=1`, checked against the AWS default parameter group), so add `sslmode=require`. Modelled locally against a private-CA, TLS-only Postgres: Prisma negotiates TLS 1.3 (with or without the parameter) and does **not** verify the CA chain, so RDS's private CA does not break it — but that also means the connection is encrypted, not server-authenticated. Not yet run against real RDS. Generate the rest with `openssl rand -hex 32`; never reuse dev values.

**Gap (deliberate):** the repo has no secret-management mechanism, and none was invented. The recommended next step (needs your approval) is rendering `api.env` at deploy time from SSM Parameter Store SecureStrings.

### Media (private S3 + CloudFront)

```
Admin/customer ──► API (authenticated upload/delete) ──► private S3 bucket
                                                              ▲ read-only, this distribution only
Browser ──► CloudFront (HTTPS, cacheable, OAC) ────────────────┘
```

- **Storage:** `S3MediaStorage` (`apps/api/src/modules/media/infrastructure/storage/`) implements the existing `MediaStoragePort`; `createMediaStorage` selects it from `MEDIA_STORAGE_DRIVER`. Controllers and use-cases are unchanged and unaware of S3. The `LocalDiskMediaStorage` adapter stays for local dev and the existing integration tests (default driver `local`); **the API refuses to start with `NODE_ENV=production` unless the driver is `s3`**, and the API mounts no `/uploads` route in that mode.
- **The bucket is private:** Block Public Access (all four), ACLs disabled (`BucketOwnerEnforced`), SSE-S3 encryption, versioning with a lifecycle that removes superseded versions after 30 days plus orphaned delete markers and abandoned multipart uploads. No public bucket policy exists.
- **CloudFront** (`modules/cloudfront-media`): S3 origin via **Origin Access Control** (not the legacy OAI), `redirect-to-https`, `GET`/`HEAD` only, compression, managed `CachingOptimized` policy (honors the origin's `Cache-Control`, up to one year) and the managed security-headers policy, IPv6/HTTP3, price class 200 (includes India). The bucket policy lets **only this distribution** read (`cloudfront.amazonaws.com` + `AWS:SourceArn`) — and deliberately not `ListBucket`, so the bucket cannot be listed through the CDN. Missing objects would surface as S3's 403; CloudFront maps that to a 404.
- **Caching:** every object key is a fresh UUID, never overwritten, and is uploaded with `Cache-Control: public, max-age=31536000, immutable`. No presigned URLs; the browser only ever sees `https://<distribution>.cloudfront.net/<key>`. The URL stored in `media.url` is that CloudFront URL.
- **Permissions:** the API's EC2 role may only `s3:PutObject` / `s3:DeleteObject` on the bucket's objects. No credentials ever reach a browser or a container's environment.
- **Configuration** (all non-secret; values from `terraform output`):

| Variable | Value |
|---|---|
| `MEDIA_STORAGE_DRIVER` | `s3` |
| `AWS_REGION` | `ap-south-2` |
| `MEDIA_S3_BUCKET` | `terraform output s3_media_bucket_name` |
| `MEDIA_PUBLIC_BASE_URL` | `terraform output media_public_base_url` (`https://dxxxx.cloudfront.net`, no trailing slash needed) |

- **Behaviors to know:** (1) deleting media removes the S3 object, but because URLs are cached for up to a year a deleted image can keep being served from CloudFront edges until they expire — no CloudFront invalidation is issued (adding one needs `cloudfront:CreateInvalidation`; a manual `aws cloudfront create-invalidation --paths "/<key>"` works today). (2) A custom media domain (e.g. `media.woobe.in`) needs an ACM certificate in `us-east-1`, a distribution alias and DNS; only `MEDIA_PUBLIC_BASE_URL` changes in the API. (3) Existing `media.url` rows keep whatever URL they were written with; nothing here migrates old rows (there is no production data yet). (4) Frontends need no change: they already render absolute image URLs.

## 8. Database migration strategy

- Production runs **only** `prisma migrate deploy` — committed migrations, applied in order, under a database advisory lock. Never `migrate dev`, `migrate reset`, `db push`, or anything that generates a migration.
- Existing gates still apply: `check:migrations` (destructive migrations need an explicit reviewed flag, DEVELOPMENT_RULES #7) and `migrate:diff:check` in CI.
- **Only when appropriate:** the deploy passes `RunMigrations`. Push-to-main and build deploys run it (a no-op if nothing is pending); a redeploy/rollback of an existing image defaults to **not** migrating.
- A failed migration aborts before any container is touched; output is kept on the instance (`/var/log/woobe-deploy/<ts>-migrate.log`) and printed (credentials masked). No SQL is ever auto-reverted.
- **Image rollback ≠ schema rollback.** Rolling back restarts old code against the *already-migrated* schema. So migrations must be backward-compatible with the previous release — **expand/contract**: release N adds (nullable column, new table, dual-write); release N+1 switches reads; a later release drops the old thing. Never rename/drop in the same release that stops using it.
- Before a risky migration, take a manual RDS snapshot (`aws rds create-db-snapshot`); automated backups (7 days) also exist.

## 9. Health checks and failure classes

Endpoints (already in the API): `/health` = process liveness (never touches dependencies); `/ready` = Postgres + Redis reachable. The Dockerfile's `HEALTHCHECK` polls `/health` (API only; the worker has none).

| Failure | What handles it |
|---|---|
| **Process crash** | Docker `--restart unless-stopped` restarts it (also after a host reboot). |
| **Unhealthy application** (running, `/health` failing) | Docker only *marks* it `unhealthy`; **nothing restarts it automatically.** During a deploy the verification catches it and rolls back. Between deploys, nothing acts — add an external uptime check on the public URL (gap). |
| **Failed deployment** | Verification fails → automatic rollback → workflow fails. |
| **Unhealthy EC2 host** | CloudWatch status-check/CPU alarms notify via SNS. There is no auto-recovery (no ASG): reboot or replace manually; containers start on boot. |

## 10. Rollback

**Automatic:** step 8 above. **Manual, no rebuild** (preferred — same OIDC role, same checks): Actions → *Deploy* → *Run workflow* on `main` → `image_sha` = the previous 40-char SHA, leave `run_migrations` **unchecked**. It confirms the image exists in ECR, resolves its digest, and runs the same verified in-place deploy. Find SHAs: Actions history, `journal.md`, or

```bash
aws ecr describe-images --profile woobe --region ap-south-2 --repository-name woobe-production-api \
  --query 'sort_by(imageDetails,&imagePushedAt)[].[imageTags[0],imagePushedAt]' --output text
```
Fallback if GitHub is unavailable (your own AWS credentials): `aws ssm send-command --document-name woobe-production-deploy --targets "Key=tag:Name,Values=woobe-production-backend" --parameters '{"ImageTag":["<sha>"],"ImageDigest":["sha256:<digest>"],"RunMigrations":["false"]}'`.
**Verify:** the workflow prints `DEPLOY SUCCESS`; on the instance `docker ps`, `curl -s localhost:4000/ready`. **Migrations already applied stay applied** (§8). A SHA older than the newest 20 images has expired from ECR.

## 11. Manual deployment

*Run workflow* on `main` with no inputs = build and deploy the current `main` (CI runs first). With `image_sha` = redeploy an existing image without CI or rebuild — safe because only this pipeline can push to that repository, and only after CI passed. The workflow refuses non-`main` refs (the IAM role would too).

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Not on `main`, repo renamed, or a job got an `environment:` (changes the `sub`). Compare `terraform output github_oidc_trusted_subject`. |
| `approve`/`image`/`deploy` skipped | `DEPLOY_ENABLED` is not `true`, or CI failed, or the ref isn't `main`. |
| Waiting on `approve` | Environment `production` has required reviewers pending. |
| `No instance … is online in SSM` | Instance stopped/booting, or SSM agent / instance role problem. |
| Deploy output: `api.env is missing` / `required variables missing` | First-time step 3 not done or incomplete. |
| `could not authenticate to ECR from the instance` / `pull access denied` | EC2 role lacks the ECR pull policy — apply the full Terraform, not only `-target`. |
| `image architecture is amd64 but this host is arm64` | Image was built for the wrong platform. |
| `database migration failed` | Nothing running was touched. Read the printed output / `/var/log/woobe-deploy/*-migrate.log`; fix and push again. |
| `the new image failed verification on the candidate API` | The new image was rejected BEFORE the running release was touched; the reason and a log excerpt follow it. Nothing to roll back. |
| `not healthy within 90s` / crash loop | Bad value in `api.env` (quotes!), DB/Redis unreachable, or an app startup error — see the log excerpt in the output, or Session Manager → `docker logs woobe-api`. |
| Rollback also failed | Manual: Session Manager → `docker ps -a`, `docker logs`, redeploy a known-good SHA. |

Where to look: the workflow log (deploy output, stdout + stderr groups), CloudWatch `/woobe-production/deploy`, SSM → Run Command history, on-instance `/var/log/woobe-deploy/` and `/opt/woobe/app/state/history.log`.

## 13. First-time setup

```bash
# 1. Review the plan (nothing is applied without your explicit go-ahead)
cd infra/terraform/environments/production
terraform init && terraform plan -var aws_profile=woobe

# 2a. Everything (74 resources; EC2, RDS, Elastic IP start billing; the CloudFront distribution takes several minutes) …
terraform apply -var aws_profile=woobe
# 2b. … OR only the OIDC/ECR/SSM foundation first (no EC2/RDS billing)
terraform apply -var aws_profile=woobe -target=module.github_oidc -target=module.ssm_deploy

# 3. After the EC2 exists: create /opt/woobe/app/api.env over Session Manager (see §7; include API_BIND_HOST=127.0.0.1).
#    Media values: terraform output s3_media_bucket_name / media_public_base_url
aws ssm start-session --profile woobe --region ap-south-2 --target "$(terraform output -raw ec2_instance_id)"

# 3b. HTTPS: create the Origin CA certificate ON the instance (commands in "HTTPS edge" above),
#     then, in Cloudflare, create the proxied A record and set SSL/TLS to Full (strict).
#     terraform output cloudflare_dns_record   # the values to enter

# 3c. Monitoring: within a few minutes of the instance registering with SSM, the observability sync installs Prometheus/Grafana/Node Exporter.
#     Check it, then open Grafana over a port-forward (docs/observability.md §7):
aws ssm list-association-executions --profile woobe --region ap-south-2 \
  --association-id "$(aws ssm list-associations --profile woobe --region ap-south-2 --association-filter-list key=AssociationName,value=woobe-production-observability-sync --query 'Associations[0].AssociationId' --output text)" --max-results 3

# 4. GitHub: Settings → Environments → New "production" → deployment branches: main only
#    (optionally required reviewers). Then turn the pipeline on:
gh variable set DEPLOY_ENABLED --body true

# 5. After the first successful deploy, verify from OUTSIDE (through Cloudflare):
curl -sS https://api.woobe.in/health && curl -sS https://api.woobe.in/ready
#    then register the Razorpay webhook URL (see "Razorpay webhook").
```
Run a full `terraform apply` before the first deploy — the EC2 role's ECR pull policy is part of it.

## 14. Revoking access

No long-lived AWS credentials exist to rotate. Stop deploys immediately: unset `DEPLOY_ENABLED`, and/or edit the role's trust policy or delete its inline policy (`terraform apply` restores it). Issued sessions last at most one hour; IAM "Revoke active sessions" ends them sooner. Application secrets: edit `api.env`, redeploy (rotating JWT secrets signs everyone out).

## 15. Future: ALB + multiple EC2 instances

The pipeline is already built on immutable images, digests, and external orchestration (SSM), so scaling out is additive: put Cloudflare → ALB → instances (ASG launch template pulling the same digest), replace the single-instance `deploy.sh` swap with instance-refresh / rolling replacement behind health-checked target groups (true rolling deploy and connection draining become possible then), move Valkey to ElastiCache by changing `REDIS_URL`, and keep migrations as a separate one-off step before the roll. The app already meets the prerequisites: media is off local disk (S3 + CloudFront) and nothing else in the API holds process-local state (JWT + DB sessions, Postgres row locks, no sticky sessions).

## 16. Known limitations and open items

- Media: see §7 "Behaviors to know" — deleted images can linger in the CDN cache, and custom media domains are a later step. The S3/CloudFront path has been unit-tested with a fake S3 client; it has **not** been exercised against real AWS (OAC read path, IAM, the 403→404 mapping) and needs a first-deploy check: upload an image through the admin and load its CloudFront URL.
- **HTTPS edge is prepared, not live.** nginx + certificate + Cloudflare steps are documented and were validated locally against real Docker (including the real API, worker and Valkey), but nothing has run on real AWS or Cloudflare: the Origin CA certificate, the Cloudflare DNS/SSL settings and the security-group path are unverified until the first real deploy. Until then the API is not reachable from the internet. Recommended before launch: Authenticated Origin Pulls (see "HTTPS edge").
- Availability: single instance, brief downtime per deploy, no automatic recovery of a dead host, no alarm on API health.
- **Image size (measured):** the API image is 856 MB unpacked / 181 MiB compressed in ECR (was 1.74 GB / 366 MiB — 50.7% smaller). The old size was ~735 MB of pnpm store/caches left in the layer plus devDependencies; the multi-stage build now keeps caches on BuildKit cache mounts and installs production dependencies only. What remains is required: the Node base (~247 MB) and Prisma (client + CLI + engines, ~208 MB). `node dist/server.js` still cannot run: all four workspace packages export raw TypeScript (`main: ./src/index.ts`, no build script), which Node loads as ESM and rejects (`ERR_UNSUPPORTED_DIR_IMPORT` on `../generated/client`); the Next apps consume those packages as source, so pre-compiling them is a repo-wide change. `tsx` and the `prisma` CLI are therefore runtime dependencies (moved from devDependencies in `apps/api` and `packages/database`; same versions).
- Cross-builds arm64 under QEMU (slow); a native `ubuntu-24.04-arm` runner is faster if your plan allows.
- GitHub Actions are pinned to major-version tags, not commit SHAs. The base image is pinned by digest and needs deliberate bumps for security patches.
- Terraform state is local (inherited from Phase 1); use a remote backend before a second operator applies.
- **HTTPS edge tests (real Docker, no AWS, no Cloudflare, no real certificate):** `infra/terraform/modules/ec2/tests/run-nginx-tests.sh` renders the nginx config with `terraform console` (offline), **executes the nginx block of the rendered `user_data`** (real Compose, the pinned nginx image) and drives it with a header/body-echo stub and then the real API, a real worker and a real Valkey (with a password): waits for the certificate then starts on its own; HTTP→HTTPS redirect; unknown hosts / SNI / bare IP refused; path, query, method, body (byte-for-byte), `Content-Type` and `X-Razorpay-*` preserved; client-sent `X-Forwarded-For`/`X-Real-IP` overwritten; `CF-Connecting-IP` believed only from Cloudflare ranges; 5 MB upload passes, 7 MB gets 413; slow upstream gets 504; `/health` and `/ready` through nginx; a correctly signed Razorpay webhook accepted by the real handler and the same signature over a changed body rejected (401); rate-limit buckets keyed by the real client IP; certificate renewal by file replacement + `nginx -s reload`. 57 assertions, mutation-checked (trusting any IP, appending `X-Forwarded-For`, dropping the upload limit, altering `Host`, and switching off `TRUST_PROXY_HOPS` are each caught by the intended assertions). **Not tested:** a real Cloudflare Origin CA certificate, real Cloudflare in front, the security group on real AWS, or Docker Compose v2.29.7 on Amazon Linux (the tests ran Compose v5 locally).
- **Tested locally (real Docker, no AWS):** `infra/terraform/modules/ssm-deploy/tests/run-tests.sh` runs `deploy.sh` end to end against a local registry, Postgres 16, Redis and the real image, with stub images that fail in specific ways and a `docker` shim that injects failures: first deploy, redeploy, graceful and forced shutdown, API-startup / health / readiness / crash-window failures (old release untouched), worker-startup failure and post-swap crash loop and `docker run` failure (rollback), migration failure, pull failure, malformed `api.env`, Docker rejecting the env file, failed first-ever deploys (no false success, nothing left behind, no rollback claimed), a leftover container never used as a rollback target, and no secrets or shell tracing in any output. `.github/scripts/test-deploy-status.sh` covers the workflow's skipped/success/failure reporting (also run in CI). Run it with Docker running; it refuses to start if `woobe-api`, `woobe-worker` or `woobe-api-candidate` containers exist. Also tested: the optimized image (API, worker, Prisma migrate + client queries), Amazon Linux 2023 package resolution for `user_data`, RDS 16.15 orderability on `db.t4g.micro` in ap-south-2, and Cloudflare CIDRs vs the live list. **Not tested against real AWS:** SSM tag-targeting, ECR pull via the instance role, the real RDS TLS handshake, CloudFront OAC reads, a real upload, CloudWatch output config. Expect to verify the first deploy by hand.

### Review findings (2026-09-19); the deploy.sh and DEPLOY_ENABLED items are now fixed, see the first two bullets

Important, not blocking the first deployment:
- **Fixed in the deploy-safety pass (2026-09-19):** the swap now stops containers gracefully (SIGTERM, 30 s bound, SIGKILL only as a fallback), verifies the new API on a candidate port before the running release is touched, checks every `docker run` explicitly (a Docker-level failure now reaches rollback instead of aborting mid-swap), rejects lines Docker cannot parse in pre-flight, and rolls back only to a verified-good image. `DEPLOY_ENABLED` unset or a non-`main` dispatch is no longer a silent green run (§5). Covered by `infra/terraform/modules/ssm-deploy/tests/run-tests.sh` (see below).
- **Remaining deploy-safety concerns:** (1) a worker-only failure is found after the swap (brief downtime, then rollback); (2) the candidate runs the new code against the real database and Redis (no traffic, but it is not a sandbox); (3) problems that only appear on the real port are also found after the swap; (4) if containers exist with no verified-good record, a post-swap failure cannot be rolled back; (5) two manual runs dispatched within the same second can race past the gate (see Concurrency, Limits); (6) a rollback restarts old code against an already-migrated schema (§8). The earlier concern that a newer push could replace a pending rollback is fixed (see Concurrency).
- **Valkey — fixed (2026-09-20):** now started with `--appendonly yes` (AOF, `everysec`) plus RDB save points, a host-backed `/opt/woobe/valkey-data` bind mount (survives container recreation and an EC2 reboot), and `--maxmemory-policy noeviction` instead of `allkeys-lru`, so BullMQ queue keys are never silently evicted. See "Valkey persistence and reliability" above for the full design, what it does and does not protect against (an EC2/EBS loss still loses the local dataset), and the real Docker-based restart/persistence test.
- **Media orphans.** Removing a product image deletes only the `ProductImage` row (its `url` is a plain string with no link to `Media`); the S3 object and `Media` row remain unless `DELETE /media/:id` is called separately.
- The API binds to loopback only when `API_BIND_HOST=127.0.0.1` is set in `api.env` (recommended for production; §"Why the API binds to loopback"). It is a manual line: `deploy.sh` does not require it, so forgetting it leaves the API on every interface with only the security group in front. A `deploy.sh` pre-flight requirement is a possible follow-up. Nginx config changes need a host replacement or a manual edit + reload (see "Changing the nginx configuration").
- `api.env` is a hand-made file (temporary mechanism): fine for `terraform apply` and for a first, operator-run deploy; not reproducible for a replaced instance or fully unattended provisioning.
- No alarm on API health/uptime and no CloudWatch agent (disk); Terraform state is local; GitHub Actions pinned by tag; the digest-pinned base image needs deliberate bumps.

