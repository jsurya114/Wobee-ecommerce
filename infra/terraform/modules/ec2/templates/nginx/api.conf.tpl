# Woobe API edge — nginx on the single EC2, in front of the API container.
#
#   Browser -> Cloudflare (proxied) --HTTPS--> nginx :443 --HTTP--> API 127.0.0.1:${api_port}
#
# Rendered by Terraform (modules/ec2/templates/nginx/api.conf.tpl) into
# /opt/woobe/nginx/conf.d/api.conf at first boot. If you change it on the host,
# change the template too, or the next instance built from Terraform will not
# have your change. Lives in the http context (nginx's stock nginx.conf
# includes conf.d/*.conf there).
#
# This is the CURRENT single-instance architecture: one host, no load
# balancer. Nothing here makes it highly available or zero-downtime.

# ---- real client IP -----------------------------------------------------------
# Cloudflare puts the visitor's address in CF-Connecting-IP. It is honoured
# ONLY when the TCP peer is a Cloudflare edge range (the same list the EC2
# security group allows on 443), so nobody else can forge a client IP by
# sending that header. After this, $remote_addr is the visitor.
%{ for cidr in cloudflare_ipv4_cidrs ~}
set_real_ip_from ${cidr};
%{ endfor ~}
real_ip_header CF-Connecting-IP;
real_ip_recursive off;

server_tokens off;

upstream woobe_api {
    # The API container uses host networking, so it is reachable on loopback
    # only from this host. The security group has no rule for this port.
    server 127.0.0.1:${api_port};
    keepalive 16;
}

# ---- default: refuse anything not addressed to ${api_domain} --------------------
# Scans of the bare IP, wrong hostnames, wrong SNI. No certificate is needed:
# the TLS handshake itself is rejected.
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    ssl_reject_handshake on;
    return 444;
}

# ---- HTTP: redirect to HTTPS --------------------------------------------------------
# Cloudflare's "Always Use HTTPS" normally redirects at the edge and the
# security group keeps port 80 closed by default; this is the origin's own
# backstop if port 80 is ever reached. The target is fixed, not built from the
# Host header.
server {
    listen 80;
    server_name ${api_domain};
    return 301 https://${api_domain}$request_uri;
}

# ---- HTTPS: the API --------------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name ${api_domain};

    # Cloudflare Origin CA certificate, created on the instance (private key
    # never leaves it) and placed by hand — see docs/deployment.md. The
    # container waits for both files before starting nginx.
    ssl_certificate     /etc/nginx/certs/origin.pem;
    ssl_certificate_key /etc/nginx/certs/origin.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # The API accepts images up to 5 MB (MAX_UPLOAD_SIZE_BYTES); nginx's 1 MB
    # default would reject product/testimonial uploads with a 413 before they
    # reach the API. 6 MB leaves room for multipart overhead.
    client_max_body_size 6m;
    client_header_timeout 15s;
    client_body_timeout 30s;
    send_timeout 60s;
    keepalive_timeout 65s;

    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # What the API sees. Request path, query, method, body and every other
    # header (Content-Type, Authorization, the Razorpay X-Razorpay-* headers)
    # pass through untouched. The webhook's HMAC is computed over the exact
    # request bytes, so nothing here may buffer-transform, compress or
    # rewrite the request body.
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    # OVERWRITES any X-Forwarded-For the client sent instead of appending: the
    # API trusts exactly one proxy hop (this nginx), so the header must hold
    # only the address nginx itself established.
    proxy_set_header X-Forwarded-For   $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;

    # Cloudflare gives up on an origin after 100 s (HTTP 524); answering first
    # with a 504 keeps errors attributable. Never replay a request to another
    # upstream (checkout and webhooks are not safe to repeat).
    proxy_connect_timeout 5s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;
    proxy_next_upstream   off;

    # Liveness and readiness, reachable as https://${api_domain}/health and
    # /ready. Read-only methods; no access log noise from uptime checks.
    location = /health {
        limit_except GET HEAD { deny all; }
        access_log off;
        proxy_pass http://woobe_api;
    }
    location = /ready {
        limit_except GET HEAD { deny all; }
        access_log off;
        proxy_pass http://woobe_api;
    }

    # /metrics is Prometheus's scrape endpoint (host-internal Prometheus,
    # via modules/ec2's observability bootstrap — see docs/deployment.md,
    # "Observability"). Without this block, the catch-all `location /`
    # below would proxy it to the public internet exactly like any other
    # API route; Prometheus never goes through nginx at all — it scrapes
    # http://127.0.0.1:${api_port}/metrics directly on the same host. This
    # must stay ABOVE the catch-all: nginx uses the first matching
    # `location`, so an entry below `location /` would never be reached.
    location = /metrics {
        return 403;
    }

    location / {
        proxy_pass http://woobe_api;
    }
}
