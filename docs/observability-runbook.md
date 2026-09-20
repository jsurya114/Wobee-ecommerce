# Observability runbook

What to do when something on the [Prometheus/Grafana stack](observability.md) fires or looks wrong. All access is over
**SSM Session Manager** — there is no SSH and none should be opened to debug. Alerts are *visible* in Prometheus
(Alerts tab) but **nothing notifies you**: someone has to look. A reasonable habit is to open the Woobe dashboards after
every deploy and once a day.

```bash
# Open a shell on the instance (profile/region as in docs/deployment.md)
aws ssm start-session --profile woobe --region ap-south-2 --target <instance-id>
# ...or tunnel Grafana / Prometheus to your laptop:
aws ssm start-session --profile woobe --region ap-south-2 --target <instance-id> \
  --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3000"],"localPortNumber":["3030"]}'   # then http://localhost:3030 (3000/3001 are the storefront/admin dev servers on your laptop). Prometheus: 9090
```

Containers on the host: `woobe-api`, `woobe-worker`, `woobe-nginx`, `woobe-valkey`, and the observability trio
`woobe-prometheus`, `woobe-grafana`, `woobe-node-exporter`. Quick state of everything:

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Status}}' ; free -m ; df -h /
```

Ports (all loopback): API `4000`, worker metrics `9102`, Node Exporter `9100`, Prometheus `9090`, Grafana `3000`, Valkey `6379`.

---

## API target down
*Alert `WoobeApiDown` — Prometheus cannot scrape `127.0.0.1:4000/metrics` (or the target is missing).*

1. Is the API up at all? `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/health` — `200` means the API is fine and the
   problem is scraping (go to step 4).
2. `sudo docker ps -a --filter name=woobe-api` and `sudo docker logs --tail 100 woobe-api`. A restart loop usually means a bad
   `api.env` or an unreachable database/Valkey; `/ready` (`curl http://127.0.0.1:4000/ready`) says which.
3. Was there a deploy in the last few minutes? A deploy briefly stops the API (single instance) — the alert has `for: 2m`, so a
   healthy deploy should not fire it; a deploy that rolled back is in `docs/deployment.md` §10.
4. Scraping-only problem: is the port right? `API_PORT` in `/opt/woobe/app/api.env` **must equal** the Terraform `api_port`
   (targets file `/opt/woobe/observability/prometheus/targets/api.yml`). `curl -s http://127.0.0.1:4000/metrics | head` must return
   metrics **without** any `X-Forwarded-*` header (the API refuses `/metrics` to proxied requests by design).
5. Prometheus's own view: `curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="woobe-api") | {health,lastError}'`.

## Worker target down
*Alert `WoobeWorkerDown` — no scrape of `127.0.0.1:9102`. Notification emails are probably not being sent.*

1. `sudo docker ps -a --filter name=woobe-worker` / `sudo docker logs --tail 100 woobe-worker`. Look for
   `[notifications-worker] metrics on http://127.0.0.1:9102/metrics`.
2. **The worker deliberately keeps running without a metrics server if the port was taken** (it logs
   `metrics server failed to start; continuing without it`) — so a container that is *up* but a target that is *down* is
   usually a port clash. Check `sudo ss -ltnp | grep 9102`; `WORKER_METRICS_PORT` in `api.env` must equal the Terraform
   `worker_metrics_port`.
3. If the container is up and the port is right, check Valkey (`sudo docker ps --filter name=woobe-valkey`); the worker cannot start
   consuming without it. Restarting the worker is a deploy-level action — prefer a redeploy (`docs/deployment.md` §11).

## Node Exporter down
*Alert `NodeExporterDown` (5 m) — host CPU/memory/disk metrics are not being collected.*

1. `sudo docker ps -a --filter name=woobe-node-exporter`; `sudo docker logs --tail 50 woobe-node-exporter`.
2. `curl -s http://127.0.0.1:9100/ | head -3`. If the container is unhealthy or gone, re-run the sync (see *Grafana datasource failure*
   → "re-converge the stack") — it recreates it.
3. Until this recovers, `HostMemoryPressure` and `HostFilesystemPressure` cannot fire — check `free -m` and `df -h /` by hand.

## Prometheus target down
*Panel "Prometheus" on the Infrastructure dashboard is DOWN, or every target shows no data.*

1. `sudo docker ps -a --filter name=woobe-prometheus`; `sudo docker logs --tail 100 woobe-prometheus`.
2. Config error after a change? `sudo docker logs woobe-prometheus 2>&1 | grep -iE 'error|invalid'`. The sync writes config atomically and
   SIGHUPs; a bad file leaves the previous config running and logs the error.
3. Disk full? `df -h /` and `sudo du -sh /opt/woobe/prometheus-data`. Retention is 7 d / 2 GB; if the TSDB hit the cap something is
   producing far too many series — check `prometheus_tsdb_head_series` (Infrastructure dashboard). **Do not delete `prometheus-data` to
   "fix" it without looking first;** history is the only copy.
4. OOM-killed? `sudo docker inspect -f '{{.State.OOMKilled}}' woobe-prometheus` → `true` means the 256 MiB limit was hit: reduce series or retention
   before raising the limit (the box has no spare RAM — see `observability.md` §10).

## Grafana datasource failure
*Dashboards show "No data" / "datasource not found" / the Prometheus datasource test fails.*

1. Is Prometheus healthy? `curl -s localhost:9090/-/healthy`. Grafana can only be as healthy as Prometheus.
2. The datasource is **provisioned from Git** (uid `woobe-prometheus`, URL from `PROMETHEUS_URL=http://127.0.0.1:9090`). Never edit it in the UI —
   edits are blocked/ephemeral. Grafana logs: `sudo docker logs --tail 100 woobe-grafana | grep -i provisioning`.
3. **Re-converge the whole stack** (safe, idempotent — recreates only what is missing/changed, never deletes data):
   ```bash
   aws ssm list-associations --profile woobe --region ap-south-2 \
     --association-filter-list key=AssociationName,value=woobe-production-observability-sync
   aws ssm start-associations-once --profile woobe --region ap-south-2 --association-ids <AssociationId>
   aws ssm list-association-executions --profile woobe --region ap-south-2 --association-id <AssociationId> --max-results 3
   ```
   The last command shows whether the run `Success`ed; the script's own log line ends with `converged: node-exporter, prometheus and grafana are healthy`.
4. Changed the datasource file in Git? Grafana needs a restart to load a datasource change — the sync does that automatically.

## Queue backlog
*Alert `WoobeNotificationQueueBacklog` — more than 50 notification jobs waiting for 10 minutes. Dashboard: Worker / Notifications.*

1. Is the worker up and consuming? `sudo docker ps --filter name=woobe-worker`; on the dashboard, "Jobs completed / sec" should be > 0 while "Waiting" is high.
2. **Many `failed attempts` and terminal failures?** Almost always SMTP/provider trouble: `sudo docker logs --tail 200 woobe-worker | grep -i -E 'smtp|delivery'`.
   Attempts back off exponentially (5 s, 10 s…), so a provider outage builds a backlog of *delayed* jobs first.
3. **Waiting high, completions zero, worker up** → Valkey: `sudo docker exec woobe-valkey sh -c 'valkey-cli -a "$REDISCLI_AUTH" --no-auth-warning ping'`
   and check memory (`ValkeyUsedMemoryBytes` in CloudWatch). Valkey is `noeviction`: at `maxmemory` further writes fail loudly rather than dropping queue keys.
4. Notification *state* is in PostgreSQL (`notifications` table); the queue is only the delivery mechanism. A stuck queue never loses order data.

## High 5xx rate
*Alert `WoobeApiHigh5xxRate` — over 5 % of API requests answered 5xx for 5 minutes (with real traffic).*

1. On **Woobe API Overview**: which routes? "Requests/sec by route" and the status-class panel. One route = one bug; all routes = a dependency (database, Valkey, disk).
2. Logs (structured, request-id correlated): `sudo docker logs --since 15m woobe-api 2>&1 | grep -E '"level":"error"' | tail -30`.
3. Dependencies: `curl -s http://127.0.0.1:4000/ready` (database + Valkey). RDS: CloudWatch (`CPUUtilization`, `DatabaseConnections`, `FreeStorageSpace`).
4. Client errors are **not** 5xx (malformed JSON → 400, oversized body → 413, unknown route → 404). A burst of 4xx from a scanner is not this alert.
5. Right after a deploy → consider a rollback (`docs/deployment.md` §10).

## High p95 latency
*Alert `WoobeApiHighP95Latency` — p95 > 1 s for 10 minutes (with real traffic).*

1. "Latency percentiles" and "p95 by route": is it one slow endpoint (admin report, image upload) or everything?
2. Everything slow → the host: CPU (a `t4g.small` is burstable — sustained load can exhaust credits; CloudWatch `CPUCreditBalance`), memory
   pressure/swapless thrash (`free -m`), event-loop lag panel (API blocked on CPU-bound work or GC).
3. Database slow → RDS metrics in CloudWatch (single small instance; connections and CPU).
4. Note the histogram resolution: values between bucket edges (1 s → 2.5 s) are interpolated, so "p95 = 2.4 s" means "somewhere in the 1–2.5 s bucket".

## Filesystem pressure
*Alert `HostFilesystemPressure` — root volume < 15 % free for 10 minutes.*

```bash
df -h / ; sudo du -xh --max-depth=2 /opt/woobe /var/lib/docker 2>/dev/null | sort -h | tail -15
sudo docker system df
```
Usual suspects, in order: Docker images (`deploy.sh` prunes unused images older than 7 days on each deploy), container logs (json-file rotation is set to 3×10 MB per
container), the Valkey AOF (`/opt/woobe/valkey-data`), Prometheus (`prometheus-data`, hard-capped at 2 GB), Grafana. **Never** `docker system prune -a --volumes` here — it can delete
the images/volumes the running stack depends on; remove specific things after looking.

## Memory pressure
*Alert `HostMemoryPressure` — < 10 % of RAM available for 10 minutes. There is no swap: the next step is the kernel OOM killer.*

```bash
free -m ; sudo docker stats --no-stream
sudo dmesg -T | grep -i -E 'killed process|out of memory' | tail
sudo docker inspect -f '{{.Name}} oom={{.State.OOMKilled}}' $(sudo docker ps -aq)
```
Compare with the budget in `observability.md` §10. If the API/worker RSS keeps climbing after each deploy, suspect a leak (heap-used panel). If the cause is the monitoring stack itself,
shed load in this order: shorter Prometheus retention → 30 s scrape interval → fewer series → lower Grafana limit. **Do not** stop the API or worker to make room.

## Grafana login issue
*Cannot log in / forgot the password / locked out.*

- The admin user is `admin`; the password is the SSM SecureString (only reachable with your own IAM permissions):
  `aws ssm get-parameter --profile woobe --region ap-south-2 --with-decryption --name /woobe-production/grafana/admin-password --query Parameter.Value --output text | pbcopy`
- The tunnel must be up and you browse **`http://localhost:3030`** (the local end of the tunnel; any free port works) (plain HTTP over the port-forward; the cookie is not `Secure` for this reason).
- "Access denied" from the CLI → your IAM user lacks `ssm:GetParameter` on that parameter (the *instance* role has it; yours may not).
- **Rotating / resetting the password.** `GF_SECURITY_ADMIN_PASSWORD__FILE` only *seeds* the admin password when Grafana first creates its database — changing the
  parameter or the file later does **not** change the login (verified). To rotate: (1) write a new value into the parameter from your own shell
  (`umask 077; f=$(mktemp); openssl rand -hex 24 >"$f"; aws ssm put-parameter --profile woobe --region ap-south-2 --overwrite --type SecureString --name /woobe-production/grafana/admin-password --value "file://$f"; rm -f "$f"`;
  the sync script itself only ever *creates* the parameter, never overwrites it), (2) re-run the sync (§ *re-converge*) so the mode-400 file on the host is rewritten,
  then (3) apply it inside Grafana:
  ```bash
  sudo docker exec woobe-grafana sh -c 'grafana cli admin reset-admin-password "$(cat /run/secrets/grafana_admin_password)"'
  ```
  Dashboards, users and history in `grafana-data` are untouched. Never paste the value into chat, tickets or scripts.
- Anonymous access and self-signup are disabled by design; a 401 on `/api/...` without credentials is correct.

## The sync itself failed
`aws ssm list-association-executions` shows `Failed`. Read the output of the failed execution in the SSM console (Run Command → the association run). The script logs one line per
change and dies with a specific message: Docker not ready (first boot still installing → it retries for 20 minutes), the Grafana parameter unreadable (IAM), `docker compose up`
failed (usually outbound access to Docker Hub), or a container not healthy after 4 minutes (it prints the last 20 log lines). It is safe to re-run at any time.
