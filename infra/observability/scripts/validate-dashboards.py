#!/usr/bin/env python3
"""Validate the Grafana dashboards in ../grafana/dashboards.

Static checks (always): valid JSON; unique uid/title/panel ids; every panel uses the
provisioned Prometheus datasource uid; every non-row panel has at least one non-empty
`expr`; no two panels overlap on the grid.

Live checks (--prometheus URL): every panel expression is executed against Prometheus
(Grafana variables substituted) and must return HTTP success. Expressions that return no
data are reported, not failed, because event-driven counters (orders, refunds, webhooks)
legitimately have no series until the first event; `--strict-empty` turns that into a failure.

usage: validate-dashboards.py [--prometheus http://localhost:9090] [--strict-empty]
"""
import argparse, glob, json, os, sys, urllib.parse, urllib.request

DS_UID = "woobe-prometheus"
HERE = os.path.dirname(os.path.abspath(__file__))
DASH_DIR = os.path.join(HERE, "..", "grafana", "dashboards")
SUBST = {"$__rate_interval": "1m", "$__range": "3h", "$__interval": "1m"}

def substitute(expr):
    for k, v in SUBST.items():
        expr = expr.replace(k, v)
    return expr

def overlaps(a, b):
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prometheus")
    ap.add_argument("--strict-empty", action="store_true")
    args = ap.parse_args()
    errors, empties, checked = [], [], 0
    uids, titles = set(), set()
    files = sorted(glob.glob(os.path.join(DASH_DIR, "*.json")))
    if not files:
        errors.append("no dashboards found")
    for path in files:
        name = os.path.basename(path)
        try:
            d = json.load(open(path))
        except Exception as e:
            errors.append(f"{name}: invalid JSON: {e}"); continue
        if d.get("uid") in uids: errors.append(f"{name}: duplicate uid {d.get('uid')}")
        if d.get("title") in titles: errors.append(f"{name}: duplicate title {d.get('title')}")
        uids.add(d.get("uid")); titles.add(d.get("title"))
        if not d.get("uid") or not d.get("title"): errors.append(f"{name}: missing uid/title")
        ids, boxes = set(), []
        for p in d.get("panels", []):
            if p["id"] in ids: errors.append(f"{name}: duplicate panel id {p['id']}")
            ids.add(p["id"])
            if p["type"] == "row": continue
            if p.get("datasource", {}).get("uid") != DS_UID:
                errors.append(f"{name}: panel '{p['title']}' does not use datasource uid {DS_UID}")
            exprs = [t.get("expr", "") for t in p.get("targets", [])]
            if not exprs or not all(e.strip() for e in exprs):
                errors.append(f"{name}: panel '{p['title']}' has an empty/missing query")
            for other in boxes:
                if overlaps(p["gridPos"], other["gridPos"]):
                    errors.append(f"{name}: panel '{p['title']}' overlaps '{other['title']}'")
            boxes.append(p)
            if args.prometheus:
                for e in exprs:
                    checked += 1
                    url = args.prometheus.rstrip("/") + "/api/v1/query?" + urllib.parse.urlencode({"query": substitute(e)})
                    try:
                        with urllib.request.urlopen(url, timeout=15) as r:
                            body = json.load(r)
                    except Exception as ex:
                        errors.append(f"{name}: panel '{p['title']}' query failed: {ex}\n      {e}"); continue
                    if body.get("status") != "success":
                        errors.append(f"{name}: panel '{p['title']}': {body.get('error')}\n      {e}")
                    elif not body["data"]["result"]:
                        empties.append(f"{name}: '{p['title']}'  <-  {e}")
    for e in errors: print("ERROR:", e)
    if args.prometheus:
        print(f"executed {checked} panel queries against {args.prometheus}; {len(empties)} returned no data")
        for e in empties: print("  no data:", e)
    print(f"{len(files)} dashboards, {len(errors)} error(s)")
    return 1 if errors or (args.strict_empty and empties) else 0

sys.exit(main())
