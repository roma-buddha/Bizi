#!/usr/bin/env python3
"""Minimal client for the Bizi local AI bridge.

The bridge runs inside the desktop app on 127.0.0.1 (default port 1421) and
exposes the same commands as the UI. See `GET /schema` for the full catalog.

Usage:
    python scripts/bridge_client.py health
    python scripts/bridge_client.py schema
    python scripts/bridge_client.py task_counts '{}'
    python scripts/bridge_client.py task_create '{"input": {"title": "from the bridge"}}'

Configuration (environment variables):
    BIZI_BRIDGE_URL    Base URL, default http://127.0.0.1:1421
    BIZI_BRIDGE_TOKEN  Bearer token. If unset, the client tries to read it from
                       the app data dir (bridge.token), so it usually just works
                       on the machine where Bizi is running.

Exit codes: 0 success, 1 bridge/HTTP error, 2 usage error.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "http://127.0.0.1:1421"


def default_token() -> str | None:
    """Read the token Bizi generated, without requiring the user to copy it."""
    candidates = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.append(Path(appdata) / "app.bizi.desktop" / "bridge.token")
        candidates.append(Path(appdata) / "bizi" / "bridge.token")
        candidates.append(Path(appdata) / "Bizi" / "bridge.token")
    home = Path.home()
    candidates.append(home / ".local" / "share" / "bizi" / "bridge.token")
    candidates.append(
        home / "Library" / "Application Support" / "app.bizi.desktop" / "bridge.token"
    )
    for path in candidates:
        try:
            token = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if token:
            return token
    return None


def request(method: str, path: str, token: str | None, body: dict | None = None) -> dict:
    url = os.environ.get("BIZI_BRIDGE_URL", DEFAULT_URL).rstrip("/") + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        print(f"HTTP {e.code}: {detail}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Cannot reach Bizi bridge at {url}: {e.reason}", file=sys.stderr)
        print("Is the desktop app running (and the bridge enabled in Settings)?", file=sys.stderr)
        sys.exit(1)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, rest = argv[1], argv[2:]
    token = os.environ.get("BIZI_BRIDGE_TOKEN") or default_token()

    if cmd == "health":
        print(json.dumps(request("GET", "/health", None), indent=2))
        return 0
    if cmd == "schema":
        if not token:
            print("No token found; set BIZI_BRIDGE_TOKEN", file=sys.stderr)
            return 2
        print(json.dumps(request("GET", "/schema", token), indent=2))
        return 0
    if cmd in ("status", "help", "--help", "-h"):
        print(__doc__)
        return 0

    # Anything else is a bridge command: bridge_client.py <cmd> [args-json]
    raw = rest[0] if rest else "{}"
    try:
        args = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"args is not valid JSON: {e}", file=sys.stderr)
        return 2
    if not isinstance(args, dict):
        print("args must be a JSON object", file=sys.stderr)
        return 2
    if not token:
        print("No token found; set BIZI_BRIDGE_TOKEN", file=sys.stderr)
        return 2
    result = request("POST", "/invoke", token, {"cmd": cmd, "args": args})
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
