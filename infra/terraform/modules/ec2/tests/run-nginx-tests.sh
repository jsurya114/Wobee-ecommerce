#!/usr/bin/env bash
# Variables such as CODE are read inside the eval'd assertion strings passed to expect().
# shellcheck disable=SC2034
# Local tests for the nginx HTTPS edge (modules/ec2/templates/nginx + the nginx
# block of user_data.sh.tpl). Real Docker, NO AWS, NO Cloudflare, NO real certificate.
#
#   infra/terraform/modules/ec2/tests/run-nginx-tests.sh
#   KEEP_IMAGES=1 ...run-nginx-tests.sh     # keep the ~850 MB API test image between runs
#
# What is exercised, exactly as production would run it:
#   * the nginx config is rendered by `terraform console` (offline, no providers)
#     from api.conf.tpl with the Terraform defaults (domain, Cloudflare ranges);
#   * the nginx block of the rendered user_data is EXECUTED (paths remapped into a
#     temp dir): it writes the config + docker-compose.yml and runs `docker compose
#     up -d` with the pinned nginx image, host networking, waiting for a certificate;
#   * a stub upstream (header/body echo) for proxy behavior, then the REAL API image,
#     a REAL worker and a REAL Valkey (with a password) behind nginx;
#   * a throwaway self-signed certificate created with the documented CSR commands.
# Needs Docker, terraform, python3. Uses ports 80 and 443 on the Docker host network
# (the Docker Desktop VM on macOS) plus API_PORT (default 14000) and 15432/16400.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EC2="${EC2_DIR:-$(cd "$HERE/.." && pwd)}"   # EC2_DIR: test a mutated copy of the module (mutation testing)
REPO="$(cd "$HERE/../../../../.." && pwd)"
ROOT_VARS="$REPO/infra/terraform/environments/production/variables.tf"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/woobe-nginxtest.XXXXXX")"
DOMAIN=api.woobe.in
API_PORT="${API_PORT:-14000}"   # override to run on the real port: API_PORT=4000 ...run-nginx-tests.sh
API_IMG=woobe-nginxtest-api
HARNESS_IMG=woobe-nginxtest-harness
OPT="$WORK/opt-woobe"
CERTS="$OPT/certs"
PASS=0; FAIL=0; FAILED_NAMES=()

log() { printf '\n== %s\n' "$*"; }
pass() { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); printf '  FAIL  %s\n' "$1"; }
expect() {
  local name="$1"; shift
  if eval "$*" >/dev/null 2>&1; then pass "$name"; else
    fail "$name"; printf '        (condition: %s)\n' "$*"
    printf '        (last response: HTTP %s, curl exit %s, body: %s)\n' "${CODE:-?}" "${CRC:-?}" "$(head -c 160 "$WORK/body" 2>/dev/null | tr -d '\n')"
  fi
}

# ---- safety --------------------------------------------------------------------
for n in woobe-nginx woobe-api woobe-worker; do
  if docker inspect "$n" >/dev/null 2>&1; then echo "Refusing to run: a container named '$n' exists and would be deleted." >&2; exit 2; fi
done
docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }
command -v terraform >/dev/null || { echo "terraform is required (only 'terraform console', offline)." >&2; exit 2; }

cleanup() {
  docker rm -f woobe-nginx nt-stub nt-api nt-worker nt-valkey nt-pg >/dev/null 2>&1
  if [ -z "${KEEP_IMAGES:-}" ]; then docker rmi -f "$API_IMG" "$HARNESS_IMG" >/dev/null 2>&1; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---- inputs taken from Terraform itself (single source of truth) -------------------
NGINX_IMAGE="$(sed -n '/variable "nginx_image"/,/^}/p' "$EC2/variables.tf" | sed -n 's/^ *default *= *"\(.*\)"/\1/p')"
CF_JSON="$(python3 - "$ROOT_VARS" <<'EOF'
import json,re,sys
v=open(sys.argv[1]).read().split('variable "cloudflare_ipv4_cidrs"')[1].split('variable "allow_http_80"')[0]
print(json.dumps(re.findall(r'"(\d+\.\d+\.\d+\.\d+/\d+)"', v)))
EOF
)"
[ -n "$NGINX_IMAGE" ] || { echo "could not read nginx_image default" >&2; exit 2; }

# render_edge <cidrs-json> -> $WORK/edge.sh : the nginx block of the rendered user_data,
# with /opt/woobe remapped into $WORK (the only change made to it).
render_edge() {
  mkdir -p "$WORK/tfc"
  python3 - "$EC2" "$1" "$NGINX_IMAGE" "$DOMAIN" "$API_PORT" >"$WORK/tfc/expr.txt" <<'EOF'
import sys
ec2,cidrs,img,dom,port=sys.argv[1:6]
print(f'templatefile("{ec2}/templates/user_data.sh.tpl", {{name_prefix="woobe-nginxtest", valkey_param_name="/x", valkey_maxmemory_mb=64, valkey_mem_limit_mb=96, valkey_image="valkey/valkey@sha256:0", compose_version="v0", aws_region="r", api_port={port}, nginx_image="{img}", '
      f'nginx_conf=templatefile("{ec2}/templates/nginx/api.conf.tpl", {{api_domain="{dom}", api_port={port}, cloudflare_ipv4_cidrs={cidrs}}})}})')
EOF
  (cd "$WORK/tfc" && terraform console <expr.txt >ud.raw 2>ud.err) || { cat "$WORK/tfc/ud.err"; return 1; }
  python3 - "$WORK" <<'EOF'
import sys,re
w=sys.argv[1]
raw=open(w+"/tfc/ud.raw").read()
body=raw[len("<<EOT\n"):raw.rstrip().rfind("EOT")]
open(w+"/user_data.sh","w").write(body)
blk=body.split("# >>> nginx-edge",1)[1].split("\n",1)[1].split("# <<< nginx-edge",1)[0]   # drop the rest of the marker line
open(w+"/edge.sh","w").write("set -euo pipefail\n"+blk.replace("/opt/woobe", w+"/opt-woobe"))
EOF
}

hc() { docker run --rm --network host -v "$WORK:$WORK" "$HARNESS_IMG" "$@"; }
hci() { docker run --rm -i --network host -v "$WORK:$WORK" "$HARNESS_IMG" "$@"; }   # -i: forwards stdin (needed for pipes)
listen_ports() { nginx_in nginx -T 2>/dev/null | sed -n -E 's/^ *listen ([0-9]+).*/\1/p' | sort -u | tr '\n' ','; }
run_edge() { # <cidrs-json>: (re)create nginx exactly as user_data does
  docker rm -f woobe-nginx >/dev/null 2>&1
  rm -rf "$OPT/nginx"
  render_edge "$1" || return 1
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" "$HARNESS_IMG" bash "$WORK/edge.sh" >"$WORK/edge.out" 2>&1
}
req() { # curl through nginx over HTTPS with the test certificate; sets CODE, CRC; body in $WORK/body
  CODE="$(hc curl -sS -m 20 -o "$WORK/body" -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" --cacert "$CERTS/origin.pem" "$@" 2>"$WORK/curl.err")"; CRC=$?
}
plain() { CODE="$(hc curl -sS -m 15 -o "$WORK/body" -w '%{http_code}' "$@" 2>"$WORK/curl.err")"; CRC=$?; }
jf() { python3 - "$WORK/body" "$1" <<'EOF'
import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d=d[k]
print(d)
EOF
}
wait_https() { for _ in $(seq 1 30); do req -m 3 "https://$DOMAIN/x" -H 'X: y' >/dev/null 2>&1; [ "$CRC" = 0 ] && return 0; sleep 1; done; return 1; }
nginx_in() { docker exec woobe-nginx "$@"; }

# ---- setup ----------------------------------------------------------------------------
log "Setup: harness image, API image (cached after first run), certificate, services"
mkdir -p "$WORK/harness" "$CERTS"
printf 'FROM docker:cli\nRUN apk add --no-cache bash curl openssl\n' >"$WORK/harness/Dockerfile"
docker build -q -t "$HARNESS_IMG" "$WORK/harness" >/dev/null || exit 2
docker build -q -f "$REPO/apps/api/Dockerfile" -t "$API_IMG" "$REPO" >/dev/null || { echo "API image build failed" >&2; exit 2; }

# The DOCUMENTED certificate flow: key + CSR created on the host, "Cloudflare" (here: self-signed)
# returns the certificate, both files are placed in /opt/woobe/certs.
docker run --rm -v "$WORK:$WORK" "$HARNESS_IMG" sh -c "
  cd $WORK && openssl req -new -newkey rsa:2048 -nodes -keyout origin.key -out origin.csr -subj '/CN=$DOMAIN' 2>/dev/null &&
  printf 'subjectAltName=DNS:$DOMAIN\n' > san.ext &&
  openssl x509 -req -in origin.csr -signkey origin.key -days 2 -extfile san.ext -out origin.pem 2>/dev/null"
expect "documented CSR command yields a key, a CSR and a certificate for $DOMAIN" '[ -s "$WORK/origin.key" ] && [ -s "$WORK/origin.csr" ] && [ -s "$WORK/origin.pem" ] && grep -q "BEGIN CERTIFICATE" "$WORK/origin.pem"'
expect "documented key/certificate match check passes (same public key)" '[ "$(hc openssl x509 -in $WORK/origin.pem -noout -pubkey | openssl md5)" = "$(hc openssl pkey -in $WORK/origin.key -pubout | openssl md5)" ]'

docker rm -f nt-pg nt-valkey >/dev/null 2>&1
docker run -d --name nt-pg --network host -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t postgres:16-alpine -c port=15432 >/dev/null
docker run -d --name nt-valkey --network host valkey/valkey:8-alpine valkey-server --port 16400 --requirepass vk-secret --maxmemory 64mb --maxmemory-policy allkeys-lru --appendonly no >/dev/null
for _ in $(seq 1 30); do docker exec nt-pg pg_isready -p 15432 -U t >/dev/null 2>&1 && break; sleep 1; done

cat >"$WORK/stub.js" <<'EOF'
const http = require("http"), crypto = require("crypto");
http.createServer((req, res) => {
  if (req.url.startsWith("/slow")) { setTimeout(() => res.end("slow"), 5000); return; }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, bytes: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex") }));
  });
}).listen(Number(process.env.STUB_PORT), "127.0.0.1");
EOF

# ==============================================================================================
log "P1 nginx starts from the real user_data block and WAITS for the certificate"
run_edge "$CF_JSON"
expect "user_data nginx block ran and 'docker compose up -d' succeeded" '[ -s "$OPT/nginx/docker-compose.yml" ] && [ -s "$OPT/nginx/conf.d/api.conf" ]'
sleep 4
expect "container is running (waiting, not crash-looping)"          'docker ps --filter name=^woobe-nginx\$ --filter status=running -q | grep -q .'
expect "container log says it is waiting for the certificate"        'docker logs woobe-nginx 2>&1 | grep -q "nginx is waiting for .*origin.pem and origin.key"'
plain -m 3 -k https://127.0.0.1/
expect "nothing is listening on 443 yet (connection refused, curl exit 7)"  '[ "$CRC" = 7 ]'
expect "compose file publishes NO ports and uses host networking"    '! grep -q "^    ports:" "$OPT/nginx/docker-compose.yml" && grep -q "network_mode: host" "$OPT/nginx/docker-compose.yml"'
expect "compose uses the digest-pinned nginx image"                   'grep -q "image: nginx@sha256:" "$OPT/nginx/docker-compose.yml"'
expect "certificate directory is root-only (700)"                     '[ "$(stat -f %Lp "$CERTS" 2>/dev/null || stat -c %a "$CERTS")" = 700 ]'

log "P2 certificate appears -> nginx starts on its own"
cp "$WORK/origin.key" "$WORK/origin.pem" "$CERTS/"; chmod 600 "$CERTS/origin.key"
expect "HTTPS answers within 30s of placing the certificate"          'wait_https'
expect "config passes nginx -t inside the container"                  'nginx_in nginx -t'
expect "nginx listens only on 80 and 443 (never the API port)"       '[ "$(listen_ports)" = "443,80," ]'
expect "timeouts + no-retry + body limit are in the running config"   'T="$(nginx_in nginx -T 2>/dev/null)"; echo "$T" | grep -q "proxy_read_timeout    60s" && echo "$T" | grep -q "proxy_connect_timeout 5s" && echo "$T" | grep -q "proxy_next_upstream   off" && echo "$T" | grep -q "client_max_body_size 6m"'
expect "every Cloudflare range from Terraform is a set_real_ip_from"  '[ "$(nginx_in nginx -T 2>/dev/null | grep -c "set_real_ip_from")" = "$(python3 -c "import json;print(len(json.loads(\"\"\"$CF_JSON\"\"\")))")" ]'
expect "server version is not advertised (Server: nginx, no version)" 'hc curl -sI --resolve "$DOMAIN:443:127.0.0.1" --cacert "$CERTS/origin.pem" "https://$DOMAIN/x" | grep -i "^server:" | grep -qiv "nginx/"'

# ==============================================================================================
log "P3 proxy behavior against a stub upstream that echoes what it receives"
docker rm -f nt-stub >/dev/null 2>&1; docker run -d --name nt-stub --network host -e "STUB_PORT=$API_PORT" -v "$WORK/stub.js:/stub.js:ro" --entrypoint node "$API_IMG" /stub.js >/dev/null
for _ in $(seq 1 20); do plain -m 2 "http://127.0.0.1:$API_PORT/" && [ "$CRC" = 0 ] && break; sleep 1; done

req "https://$DOMAIN/a/b?x=1&y=two" -H "Authorization: Bearer tok123"
expect "GET reaches the upstream with path and query intact"         '[ "$CODE" = 200 ] && [ "$(jf method)" = GET ] && [ "$(jf url)" = "/a/b?x=1&y=two" ]'
expect "Host header is preserved (api.woobe.in)"                      '[ "$(jf headers.host)" = "$DOMAIN" ]'
expect "X-Forwarded-Proto is https, X-Forwarded-Host is the domain"   '[ "$(jf headers.x-forwarded-proto)" = https ] && [ "$(jf headers.x-forwarded-host)" = "$DOMAIN" ]'
expect "X-Real-IP and X-Forwarded-For carry the client address"       '[ "$(jf headers.x-real-ip)" = 127.0.0.1 ] && [ "$(jf headers.x-forwarded-for)" = 127.0.0.1 ]'
expect "Authorization header passes through"                          '[ "$(jf headers.authorization)" = "Bearer tok123" ]'

req "https://$DOMAIN/spoof" -H "X-Forwarded-For: 6.6.6.6" -H "X-Real-IP: 7.7.7.7"
expect "a client-supplied X-Forwarded-For / X-Real-IP is overwritten, not appended" '[ "$(jf headers.x-forwarded-for)" = 127.0.0.1 ] && [ "$(jf headers.x-real-ip)" = 127.0.0.1 ]'
req "https://$DOMAIN/spoof" -H "CF-Connecting-IP: 203.0.113.9"
expect "CF-Connecting-IP from a NON-Cloudflare peer is NOT believed"   '[ "$(jf headers.x-real-ip)" = 127.0.0.1 ] && [ "$(jf headers.x-forwarded-for)" = 127.0.0.1 ]'

# ---- /metrics must NEVER be reachable through nginx ------------------------------------------------
# Prometheus scrapes the API on loopback and never goes through nginx. The stub upstream answers 200
# (with a JSON echo) to ANY path, so anything other than 403 here means the request was proxied through.
# Express serves /metrics case-insensitively and with a trailing slash, so every spelling is tested —
# an exact-match `location = /metrics` (the first version of this rule) let /Metrics and /metrics/ through.
for mpath in /metrics /metrics/ /Metrics /METRICS/ '/metrics?x=1' '/metrics?' //metrics '/%6Detrics' /metrics/anything /METRICS/a/b; do
  req --path-as-is "https://$DOMAIN$mpath"
  expect "GET $mpath is denied by nginx (403) and never reaches the upstream" '[ "$CODE" = 403 ] && ! grep -q "\"headers\"" "$WORK/body"'
done
req -X POST "https://$DOMAIN/metrics" -H "Content-Type: application/json" --data '{}'
expect "POST /metrics is denied (403), not just GET"                   '[ "$CODE" = 403 ]'
req "https://$DOMAIN/metrics" -H "X-Forwarded-For: 127.0.0.1" -H "X-Real-IP: 127.0.0.1" -H "Authorization: Bearer anything"
expect "client-supplied X-Forwarded-For / X-Real-IP / Authorization cannot unlock /metrics" '[ "$CODE" = 403 ]'
req "https://$DOMAIN/metricsfoo"
expect "an unrelated path that merely starts with 'metrics' is still proxied (the rule is not over-broad)" '[ "$CODE" = 200 ] && [ "$(jf url)" = "/metricsfoo" ]'
req "https://$DOMAIN/api/v1/metrics-export"
expect "an API path containing 'metrics' deeper in the path is still proxied" '[ "$CODE" = 200 ]'
req "https://$DOMAIN/health"
expect "/health still reaches the upstream"                            '[ "$CODE" = 200 ] && [ "$(jf url)" = "/health" ]'
req "https://$DOMAIN/ready"
expect "/ready still reaches the upstream"                             '[ "$CODE" = 200 ] && [ "$(jf url)" = "/ready" ]'
expect "the rendered config denies /metrics before the catch-all in the running nginx" 'nginx_in nginx -T 2>/dev/null | grep -n "location ~\* \^/metrics" | grep -q .'
expect "nginx never proxies Prometheus (9090), Node Exporter (9100) or Grafana (3000): no proxy_pass to them" '! nginx_in nginx -T 2>/dev/null | grep -E "proxy_pass.*:(9090|9100|3000|9102)"'

# Razorpay-shaped POST: exact bytes (odd spacing, key order, non-ASCII), content type, custom headers.
printf '{ "event":"payment.captured",  "z":1, "a" : "caf\xc3\xa9 \xe2\x82\xb9", "payload":{"n":[3,2,1]} }\n' >"$WORK/hook.json"
WANT_SHA="$(python3 -c "import hashlib;print(hashlib.sha256(open('$WORK/hook.json','rb').read()).hexdigest())")"
req -X POST "https://$DOMAIN/api/v1/payments/razorpay/webhook?src=rzp" -H "Content-Type: application/json" -H "X-Razorpay-Signature: abc123sig" -H "X-Razorpay-Event-Id: evt_test_1" --data-binary @"$WORK/hook.json"
expect "webhook: POST method, path and query preserved"               '[ "$(jf method)" = POST ] && [ "$(jf url)" = "/api/v1/payments/razorpay/webhook?src=rzp" ]'
expect "webhook: request body is byte-for-byte identical (sha256)"    '[ "$(jf sha256)" = "$WANT_SHA" ]'
expect "webhook: Content-Type preserved"                              '[ "$(jf headers.content-type)" = application/json ]'
expect "webhook: X-Razorpay-Signature and X-Razorpay-Event-Id preserved" '[ "$(jf headers.x-razorpay-signature)" = abc123sig ] && [ "$(jf headers.x-razorpay-event-id)" = evt_test_1 ]'

head -c 5000000 /dev/urandom >"$WORK/five.bin"; head -c 7000000 /dev/urandom >"$WORK/seven.bin"
req -X POST "https://$DOMAIN/upload" -H "Content-Type: application/octet-stream" --data-binary @"$WORK/five.bin"
expect "a 5 MB upload (the API's cap) is accepted"                    '[ "$CODE" = 200 ] && [ "$(jf bytes)" = 5000000 ]'
req -X POST "https://$DOMAIN/upload" -H "Content-Type: application/octet-stream" --data-binary @"$WORK/seven.bin"
expect "a 7 MB upload is refused by nginx with 413 (before the API)"  '[ "$CODE" = 413 ]'

req "https://$DOMAIN/health"; expect "GET /health reaches the upstream"   '[ "$CODE" = 200 ] && [ "$(jf url)" = /health ]'
req -I "https://$DOMAIN/ready"; expect "HEAD /ready is allowed"           '[ "$CODE" = 200 ]'
req -X POST "https://$DOMAIN/health" -d x; expect "POST /health is refused (403) and never forwarded" '[ "$CODE" = 403 ]'

plain -H "Host: $DOMAIN" "http://127.0.0.1/a/b?c=d"; PLAIN_HDR="$(hc curl -s -o /dev/null -D - -H "Host: $DOMAIN" "http://127.0.0.1/a/b?c=d")"
expect "HTTP redirects to HTTPS on the fixed domain with path+query"  '[ "$CODE" = 301 ] && echo "$PLAIN_HDR" | grep -qi "^location: https://$DOMAIN/a/b?c=d"'
plain -H "Host: evil.example" "http://127.0.0.1/"
expect "HTTP for any other Host: connection closed without a response (444, curl exit 52)" '[ "$CRC" = 52 ]'
plain -k --resolve "other.example:443:127.0.0.1" "https://other.example/"
expect "TLS for any other server name is rejected at the handshake (curl exit 35)" '[ "$CRC" = 35 ]'
plain -k "https://127.0.0.1/"
expect "TLS to the bare IP (no SNI) is rejected at the handshake (curl exit 35)" '[ "$CRC" = 35 ]
'
req "https://$DOMAIN/x"
expect "control: the real hostname still works over TLS right after those rejections" '[ "$CRC" = 0 ] && [ "$CODE" = 200 ]'

# Timeout mechanism + reload path (the same reload the certificate-renewal steps use).
sed -i.bak 's/proxy_read_timeout    60s/proxy_read_timeout    2s/' "$OPT/nginx/conf.d/api.conf" && rm -f "$OPT/nginx/conf.d/api.conf.bak"
nginx_in nginx -s reload; sleep 1
req -m 15 "https://$DOMAIN/slow"
expect "an upstream slower than proxy_read_timeout gets 504 from nginx" '[ "$CODE" = 504 ]'
sed -i.bak 's/proxy_read_timeout    2s/proxy_read_timeout    60s/' "$OPT/nginx/conf.d/api.conf" && rm -f "$OPT/nginx/conf.d/api.conf.bak"
nginx_in nginx -s reload; sleep 1
expect "restoring the config and reloading works (60s timeout back in effect)" 'nginx_in nginx -T 2>/dev/null | grep -q "proxy_read_timeout    60s"'

# Certificate renewal procedure from the docs: replace the files, reload.
OLD_SERIAL="$(hc sh -c "openssl s_client -connect 127.0.0.1:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -serial")"
docker run --rm -v "$WORK:$WORK" "$HARNESS_IMG" sh -c "cd $WORK && openssl req -x509 -newkey rsa:2048 -nodes -keyout new.key -out new.pem -subj '/CN=$DOMAIN' -addext 'subjectAltName=DNS:$DOMAIN' -days 2 2>/dev/null && cp new.key $CERTS/origin.key && cp new.pem $CERTS/origin.pem"
nginx_in nginx -t >/dev/null 2>&1 && nginx_in nginx -s reload; sleep 1
NEW_SERIAL="$(hc sh -c "openssl s_client -connect 127.0.0.1:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -serial")"
expect "certificate renewal: replace files + 'nginx -s reload' serves the NEW certificate" '[ -n "$OLD_SERIAL" ] && [ -n "$NEW_SERIAL" ] && [ "$OLD_SERIAL" != "$NEW_SERIAL" ]'
expect "traffic still works after the reload"                         'req "https://$DOMAIN/x"; [ "$CODE" = 200 ]'

# ==============================================================================================
log "P4 trusted Cloudflare peer: the real client IP is honoured (test list adds 127.0.0.1/32)"
TRUSTED_JSON="$(python3 -c "import json;print(json.dumps(json.loads('''$CF_JSON''')+['127.0.0.1/32']))")"
run_edge "$TRUSTED_JSON"; wait_https
req "https://$DOMAIN/who" -H "CF-Connecting-IP: 203.0.113.9" -H "X-Forwarded-For: 6.6.6.6"
expect "with a trusted peer, X-Real-IP is CF-Connecting-IP"            '[ "$(jf headers.x-real-ip)" = 203.0.113.9 ]'
expect "with a trusted peer, X-Forwarded-For is exactly that address (client-sent chain dropped)" '[ "$(jf headers.x-forwarded-for)" = 203.0.113.9 ]'

# ==============================================================================================
log "P5 the REAL API + worker + Valkey behind nginx"
docker rm -f nt-stub >/dev/null 2>&1
cat >"$WORK/api.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://t:t@127.0.0.1:15432/t?schema=public
REDIS_URL=redis://:vk-secret@127.0.0.1:16400
JWT_ACCESS_SECRET=nt-secret-a
JWT_REFRESH_SECRET=nt-secret-b
COOKIE_SECRET=nt-secret-c
GOOGLE_CLIENT_ID=nt.apps.googleusercontent.com
MEDIA_STORAGE_DRIVER=s3
AWS_REGION=ap-south-2
MEDIA_S3_BUCKET=nt-bucket
MEDIA_PUBLIC_BASE_URL=https://nt.cloudfront.net
RAZORPAY_WEBHOOK_SECRET=whsec_nginx_test
API_PORT=$API_PORT
API_BIND_HOST=127.0.0.1
${API_EXTRA_ENV:-}
EOF
docker run --rm --network host --env-file "$WORK/api.env" "$API_IMG" sh -c 'cd /app/packages/database && node_modules/.bin/prisma migrate deploy' >/dev/null 2>&1
docker run -d --name nt-api --network host --env-file "$WORK/api.env" "$API_IMG" >/dev/null
docker run -d --name nt-worker --network host --env-file "$WORK/api.env" --no-healthcheck "$API_IMG" node_modules/.bin/tsx src/worker.ts >/dev/null
for _ in $(seq 1 40); do plain -m 2 "http://127.0.0.1:$API_PORT/health" && [ "$CODE" = 200 ] && break; sleep 1; done

req "https://$DOMAIN/health"
expect "https://api.woobe.in/health reaches the API through nginx (200)" '[ "$CODE" = 200 ] && [ "$(jf status)" = ok ]'
req "https://$DOMAIN/ready"
expect "https://api.woobe.in/ready reaches the API through nginx (200: Postgres + Valkey)" '[ "$CODE" = 200 ] && [ "$(jf status)" = ready ] && [ "$(jf database)" = True ] && [ "$(jf redis)" = True ]'
expect "Valkey answers with its password"                             '[ "$(docker exec nt-valkey valkey-cli -p 16400 -a vk-secret --no-auth-warning ping)" = PONG ]'
expect "worker started against Valkey and is listening on its queue"  'sleep 2; docker logs nt-worker 2>&1 | grep -q "listening on queue"'
expect "worker is still running"                                      'docker ps --filter name=^nt-worker\$ --filter status=running -q | grep -q .'
expect "API container is still healthy"                               'docker ps --filter name=^nt-api\$ --filter health=healthy -q | grep -q . || sleep 15; docker ps --filter name=^nt-api\$ --filter health=healthy -q | grep -q .'

# The API must be loopback-only (API_BIND_HOST=127.0.0.1 above) while everything else here works.
LISTEN_LINE="$(hc netstat -ltn | grep -E "[:.]${API_PORT}[[:space:]]" | awk '{print $4}' | tr '\n' ' ')"
expect "API socket is bound to 127.0.0.1:$API_PORT only (got: $LISTEN_LINE)" '[ "$(echo $LISTEN_LINE)" = "127.0.0.1:$API_PORT" ]'
for IPV4 in $(hc sh -c "ip -4 -o addr show | awk '{print \$4}' | cut -d/ -f1 | grep -v '^127\.'"); do
  plain -m 3 "http://$IPV4:$API_PORT/health"
  expect "API refuses connections on $IPV4:$API_PORT from the host namespace (curl exit 7)" '[ "$CRC" = 7 ]'
done
BRIDGE_GW="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
BR_CODE="$(docker run --rm "$HARNESS_IMG" curl -s -m 3 -o /dev/null -w '%{http_code}' "http://$BRIDGE_GW:$API_PORT/health"; echo "/$?")"
expect "a container in a separate network namespace cannot reach the API ($BRIDGE_GW:$API_PORT -> $BR_CODE)" '[ "${BR_CODE#*/}" = 7 ]'
expect "control: the same API IS reachable on 127.0.0.1 (what nginx uses)" 'plain -m 3 "http://127.0.0.1:$API_PORT/health"; [ "$CODE" = 200 ]'

# Razorpay webhook through nginx to the REAL handler: the HMAC only verifies if the bytes survive.
BODY='{"entity":"event","event":"test.ping","payload":{}}'
SIG="$(printf '%s' "$BODY" | hci openssl dgst -sha256 -hmac whsec_nginx_test | sed 's/.*= //')"
expect "control: the test HMAC is a real 64-hex digest (not the digest of empty stdin)" '[ "${#SIG}" = 64 ] && [ "$SIG" != "$(printf "" | hci openssl dgst -sha256 -hmac whsec_nginx_test | sed "s/.*= //")" ]'
req -X POST "https://$DOMAIN/api/v1/payments/razorpay/webhook" -H "Content-Type: application/json" -H "X-Razorpay-Signature: $SIG" -H "X-Razorpay-Event-Id: evt_nginx_$$" -d "$BODY"
expect "Razorpay webhook with a VALID signature is accepted end to end (200, ignored event)" '[ "$CODE" = 200 ] && [ "$(jf result)" = ignored ]'
req -X POST "https://$DOMAIN/api/v1/payments/razorpay/webhook" -H "Content-Type: application/json" -H "X-Razorpay-Signature: $SIG" -H "X-Razorpay-Event-Id: evt_nginx_tamper_$$" -d '{"entity":"event","event":"test.ping","payload":{"x":1}}'
expect "same signature over a TAMPERED body is rejected (401) — proves raw bytes reach the API" '[ "$CODE" = 401 ]'
req -X POST "https://$DOMAIN/api/v1/payments/razorpay/webhook" -H "Content-Type: application/json" -d "$BODY"
expect "webhook without signature headers is a 400 from the API, not swallowed by nginx" '[ "$CODE" = 400 ]'
req -X POST "https://$DOMAIN/api/v1/auth/login" -H "Content-Type: application/json" -d '{}'
expect "an ordinary JSON POST reaches an API route (validation error, not a proxy error)" '[ "$CODE" = 400 ] || [ "$CODE" = 422 ]'
req -X POST "https://$DOMAIN/api/v1/media" -F "file=@$WORK/five.bin;type=image/png"
expect "a 5 MB multipart upload passes nginx (API answers 401 unauthenticated, never 413)" '[ "$CODE" = 401 ]'

# Rate limits must key on the REAL client IP (trust proxy = 1 by default in production).
docker exec nt-valkey valkey-cli -p 16400 -a vk-secret --no-auth-warning flushall >/dev/null
req -X POST "https://$DOMAIN/api/v1/auth/login" -H "Content-Type: application/json" -H "CF-Connecting-IP: 203.0.113.9" -d '{}'
req -X POST "https://$DOMAIN/api/v1/auth/login" -H "Content-Type: application/json" -H "CF-Connecting-IP: 203.0.113.10" -H "X-Forwarded-For: 6.6.6.6" -d '{}'
KEYS="$(docker exec nt-valkey valkey-cli -p 16400 -a vk-secret --no-auth-warning --scan --pattern 'ratelimit:auth:login:*')"
expect "rate-limit buckets are per REAL client IP (203.0.113.9 and .10), not the proxy's 127.0.0.1" 'echo "$KEYS" | grep -q "203.0.113.9" && echo "$KEYS" | grep -q "203.0.113.10" && ! echo "$KEYS" | grep -q "127.0.0.1"'
expect "a forged X-Forwarded-For never became a rate-limit identity"  '! echo "$KEYS" | grep -q "6.6.6.6"'

log "P6 untrusted peer + real API: a forged CF-Connecting-IP cannot choose the rate-limit identity"
run_edge "$CF_JSON"; wait_https
docker exec nt-valkey valkey-cli -p 16400 -a vk-secret --no-auth-warning flushall >/dev/null
req -X POST "https://$DOMAIN/api/v1/auth/login" -H "Content-Type: application/json" -H "CF-Connecting-IP: 198.51.100.7" -d '{}'
KEYS2="$(docker exec nt-valkey valkey-cli -p 16400 -a vk-secret --no-auth-warning --scan --pattern 'ratelimit:auth:login:*')"
expect "identity is the actual peer (127.0.0.1); the forged header is ignored" 'echo "$KEYS2" | grep -q "127.0.0.1" && ! echo "$KEYS2" | grep -q "198.51.100.7"'

echo
echo "=========================================="
echo "passed: $PASS   failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then printf 'FAILED: %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
