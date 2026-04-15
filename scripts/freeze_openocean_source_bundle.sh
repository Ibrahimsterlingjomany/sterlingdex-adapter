#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADAPTER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${ADAPTER_DIR}/.." && pwd)"
PROOF_DIR="${ROOT_DIR}/deploy/proofs/2026-03-28_openocean_source_adapter"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8796}"
BASE_URL="http://${HOST}:${PORT}"

mkdir -p "${PROOF_DIR}"

cd "${ADAPTER_DIR}"
node scripts/build-public-surface.mjs

HOST="${HOST}" PORT="${PORT}" node server.mjs > "${PROOF_DIR}/local_server.log" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

python3 - <<PY
import time, urllib.request, sys
url = "${BASE_URL}/health"
for _ in range(60):
    try:
        with urllib.request.urlopen(url, timeout=1.5) as r:
            if r.status == 200:
                sys.exit(0)
    except Exception:
        time.sleep(0.25)
print("health_wait_failed", file=sys.stderr)
sys.exit(1)
PY

curl -sS "${BASE_URL}/integrations/openocean/source/status" > "${PROOF_DIR}/status.json"
curl -sS "${BASE_URL}/integrations/openocean/source/market" > "${PROOF_DIR}/market.json"
curl -sS "${BASE_URL}/integrations/openocean/source/pairs" > "${PROOF_DIR}/pairs.json"
curl -sS "${BASE_URL}/integrations/openocean/source/tokenList" > "${PROOF_DIR}/tokenList.json"
curl -sS "${BASE_URL}/integrations/openocean/source/dexList" > "${PROOF_DIR}/dexList.json"
curl -sS "${BASE_URL}/integrations/openocean/source/quote?chain=solana&inTokenAddress=9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb&outTokenAddress=EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2&amount=1&gasPrice=1&slippage=1" > "${PROOF_DIR}/quote_stm_to_sjbc.json"
curl -sS "${BASE_URL}/integrations/openocean/source/swap_quote?chain=solana&inTokenAddress=9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb&outTokenAddress=EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2&amount=1&gasPrice=1&slippage=1&account=HYf3mtKT1ho6UTSu14p2hpAkwAD1R8qXiUA8EGXAxRP" > "${PROOF_DIR}/swap_quote_stm_to_sjbc.json"

python3 - <<PY
import json, pathlib
proof_dir = pathlib.Path("${PROOF_DIR}")
status = json.loads((proof_dir / "status.json").read_text())
market = json.loads((proof_dir / "market.json").read_text())
quote = json.loads((proof_dir / "quote_stm_to_sjbc.json").read_text())
swap_quote = json.loads((proof_dir / "swap_quote_stm_to_sjbc.json").read_text())
snapshot = {
    "schema": "sterling_openocean_source_handoff_snapshot_v1",
    "runtime_roles": {
        "1492": "SterlingChain brain",
        "8000": "SterlingDEX execution surface"
    },
    "status": status,
    "market": market,
    "quote_excerpt": {
        "code": quote.get("code"),
        "inAmount": quote.get("data", {}).get("inAmount"),
        "outAmount": quote.get("data", {}).get("outAmount"),
        "dexCode": (quote.get("data", {}).get("dexes") or [{}])[0].get("dexCode"),
        "dexIndex": (quote.get("data", {}).get("dexes") or [{}])[0].get("dexIndex")
    },
    "swap_quote_excerpt": {
        "txBuildSupported": swap_quote.get("data", {}).get("txBuildSupported"),
        "execution_mode": swap_quote.get("data", {}).get("execution_mode"),
        "execution_status": swap_quote.get("data", {}).get("execution_status")
    },
    "remaining_external_blocker": "OpenOcean source onboarding or whitelisting is still required upstream."
}
(proof_dir / "result_snapshot.json").write_text(json.dumps(snapshot, indent=2) + "\\n")
PY

echo "openocean_source_bundle_frozen"
