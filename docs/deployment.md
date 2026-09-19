# Deployment — GitHub Actions → AWS (OIDC, ECR, SSM)

**Status: implemented and tested locally; not yet applied to AWS** (account `185658217213`, region `ap-south-2`). Nothing in this document runs until you complete [First-time setup](#first-time-setup).

**What this is:** a *safe single-instance in-place deployment with health verification and automatic rollback*. It is **not** zero-downtime, **not** highly available, and **not** a rolling deploy: there is one EC2 instance and no load balancer, so the API is briefly unavailable each time containers are swapped.

**Initial architecture:** one EC2 (Graviton `t4g.small`, arm64) · no ALB · self-hosted Valkey on that EC2 · RDS PostgreSQL (private) · private ECR · SSM for deployment · media in a private S3 bucket delivered through CloudFront · Cloudflare in front of the API (planned) · web/admin on Vercel (deployed by Vercel's own Git integration, not by this pipeline).

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

## 7. Environment and secrets model

The image contains **no** env file and no secrets. On the instance everything is in `/opt/woobe/app/api.env` (`root:root`, mode `600`, created once by hand over Session Manager; Docker `--env-file` format: `KEY=value`, **no quotes**, unlike `.env.example`).

| Class | Variables |
|---|---|
| Public / non-secret config | `MEDIA_STORAGE_DRIVER` (must be `s3`), `AWS_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_PUBLIC_BASE_URL` (see §7), `API_PORT`, `WEB_ORIGIN`, `ADMIN_ORIGIN`, `COOKIE_DOMAIN`, `API_PUBLIC_URL`, `MEDIA_UPLOAD_DIR`, `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`, `BCRYPT_SALT_ROUNDS`, `SMTP_HOST/PORT/SECURE/FROM`, `SUPPORT_EMAIL`, `STAFF_INVITATION_TTL_HOURS`, `GOOGLE_CLIENT_ID` (required in production), `RAZORPAY_KEY_ID`; `NODE_ENV=production` is set in the image |
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

# 2a. Everything (69 resources; EC2, RDS, Elastic IP start billing; the CloudFront distribution takes several minutes) …
terraform apply -var aws_profile=woobe
# 2b. … OR only the OIDC/ECR/SSM foundation first (no EC2/RDS billing)
terraform apply -var aws_profile=woobe -target=module.github_oidc -target=module.ssm_deploy

# 3. After the EC2 exists: create /opt/woobe/app/api.env over Session Manager (see §7).
#    Media values: terraform output s3_media_bucket_name / media_public_base_url
aws ssm start-session --profile woobe --region ap-south-2 --target "$(terraform output -raw ec2_instance_id)"

# 4. GitHub: Settings → Environments → New "production" → deployment branches: main only
#    (optionally required reviewers). Then turn the pipeline on:
gh variable set DEPLOY_ENABLED --body true
```
Run a full `terraform apply` before the first deploy — the EC2 role's ECR pull policy is part of it.

## 14. Revoking access

No long-lived AWS credentials exist to rotate. Stop deploys immediately: unset `DEPLOY_ENABLED`, and/or edit the role's trust policy or delete its inline policy (`terraform apply` restores it). Issued sessions last at most one hour; IAM "Revoke active sessions" ends them sooner. Application secrets: edit `api.env`, redeploy (rotating JWT secrets signs everyone out).

## 15. Future: ALB + multiple EC2 instances

The pipeline is already built on immutable images, digests, and external orchestration (SSM), so scaling out is additive: put Cloudflare → ALB → instances (ASG launch template pulling the same digest), replace the single-instance `deploy.sh` swap with instance-refresh / rolling replacement behind health-checked target groups (true rolling deploy and connection draining become possible then), move Valkey to ElastiCache by changing `REDIS_URL`, and keep migrations as a separate one-off step before the roll. The app already meets the prerequisites: media is off local disk (S3 + CloudFront) and nothing else in the API holds process-local state (JWT + DB sessions, Postgres row locks, no sticky sessions).

## 16. Known limitations and open items

- Media: see §7 "Behaviors to know" — deleted images can linger in the CDN cache, and custom media domains are a later step. The S3/CloudFront path has been unit-tested with a fake S3 client; it has **not** been exercised against real AWS (OAC read path, IAM, the 403→404 mapping) and needs a first-deploy check: upload an image through the admin and load its CloudFront URL.
- **No reverse proxy or TLS exists — no Nginx, no Caddy, no certificate, no Cloudflare origin config — anywhere in the repo or Terraform.** The EC2 security group admits 443 from Cloudflare, but nothing on the instance listens there, so the API is not reachable from the internet after a deploy (with host networking it listens on :4000 on the host; only the security group keeps that private). TLS terminates nowhere, HTTP→HTTPS redirection and Cloudflare→origin certificate validation (Full (strict) + Origin CA) are undesigned, and Razorpay's webhook cannot reach the API. This is the main remaining blocker for a usable production API (not for `terraform apply`).
- Availability: single instance, brief downtime per deploy, no automatic recovery of a dead host, no alarm on API health.
- **Image size (measured):** the API image is 856 MB unpacked / 181 MiB compressed in ECR (was 1.74 GB / 366 MiB — 50.7% smaller). The old size was ~735 MB of pnpm store/caches left in the layer plus devDependencies; the multi-stage build now keeps caches on BuildKit cache mounts and installs production dependencies only. What remains is required: the Node base (~247 MB) and Prisma (client + CLI + engines, ~208 MB). `node dist/server.js` still cannot run: all four workspace packages export raw TypeScript (`main: ./src/index.ts`, no build script), which Node loads as ESM and rejects (`ERR_UNSUPPORTED_DIR_IMPORT` on `../generated/client`); the Next apps consume those packages as source, so pre-compiling them is a repo-wide change. `tsx` and the `prisma` CLI are therefore runtime dependencies (moved from devDependencies in `apps/api` and `packages/database`; same versions).
- Cross-builds arm64 under QEMU (slow); a native `ubuntu-24.04-arm` runner is faster if your plan allows.
- GitHub Actions are pinned to major-version tags, not commit SHAs. The base image is pinned by digest and needs deliberate bumps for security patches.
- Terraform state is local (inherited from Phase 1); use a remote backend before a second operator applies.
- **Tested locally (real Docker, no AWS):** `infra/terraform/modules/ssm-deploy/tests/run-tests.sh` runs `deploy.sh` end to end against a local registry, Postgres 16, Redis and the real image, with stub images that fail in specific ways and a `docker` shim that injects failures: first deploy, redeploy, graceful and forced shutdown, API-startup / health / readiness / crash-window failures (old release untouched), worker-startup failure and post-swap crash loop and `docker run` failure (rollback), migration failure, pull failure, malformed `api.env`, Docker rejecting the env file, failed first-ever deploys (no false success, nothing left behind, no rollback claimed), a leftover container never used as a rollback target, and no secrets or shell tracing in any output. `.github/scripts/test-deploy-status.sh` covers the workflow's skipped/success/failure reporting (also run in CI). Run it with Docker running; it refuses to start if `woobe-api`, `woobe-worker` or `woobe-api-candidate` containers exist. Also tested: the optimized image (API, worker, Prisma migrate + client queries), Amazon Linux 2023 package resolution for `user_data`, RDS 16.15 orderability on `db.t4g.micro` in ap-south-2, and Cloudflare CIDRs vs the live list. **Not tested against real AWS:** SSM tag-targeting, ECR pull via the instance role, the real RDS TLS handshake, CloudFront OAC reads, a real upload, CloudWatch output config. Expect to verify the first deploy by hand.

### Review findings (2026-09-19); the deploy.sh and DEPLOY_ENABLED items are now fixed, see the first two bullets

Important, not blocking the first deployment:
- **Fixed in the deploy-safety pass (2026-09-19):** the swap now stops containers gracefully (SIGTERM, 30 s bound, SIGKILL only as a fallback), verifies the new API on a candidate port before the running release is touched, checks every `docker run` explicitly (a Docker-level failure now reaches rollback instead of aborting mid-swap), rejects lines Docker cannot parse in pre-flight, and rolls back only to a verified-good image. `DEPLOY_ENABLED` unset or a non-`main` dispatch is no longer a silent green run (§5). Covered by `infra/terraform/modules/ssm-deploy/tests/run-tests.sh` (see below).
- **Remaining deploy-safety concerns:** (1) a worker-only failure is found after the swap (brief downtime, then rollback); (2) the candidate runs the new code against the real database and Redis (no traffic, but it is not a sandbox); (3) problems that only appear on the real port are also found after the swap; (4) if containers exist with no verified-good record, a post-swap failure cannot be rolled back; (5) two manual runs dispatched within the same second can race past the gate (see Concurrency, Limits); (6) a rollback restarts old code against an already-migrated schema (§8). The earlier concern that a newer push could replace a pending rollback is fixed (see Concurrency).
- **Valkey.** Started with `--appendonly no`, no volume, and `--maxmemory-policy allkeys-lru`. BullMQ expects `noeviction` (it warns otherwise): under memory pressure `allkeys-lru` can evict queue keys, and any Valkey restart loses queued notification jobs (their Postgres rows stay `PENDING`). `volatile-lru` would evict only TTL'd cache keys and never the queue.
- **Media orphans.** Removing a product image deletes only the `ProductImage` row (its `url` is a plain string with no link to `Media`); the S3 object and `Media` row remain unless `DELETE /media/:id` is called separately.
- API binds `0.0.0.0:4000` under host networking; protected solely by the security group. Bind it to loopback when the reverse proxy is added.
- `api.env` is a hand-made file (temporary mechanism): fine for `terraform apply` and for a first, operator-run deploy; not reproducible for a replaced instance or fully unattended provisioning.
- No alarm on API health/uptime and no CloudWatch agent (disk); Terraform state is local; GitHub Actions pinned by tag; the digest-pinned base image needs deliberate bumps.

