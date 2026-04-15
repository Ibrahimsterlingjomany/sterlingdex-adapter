#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADAPTER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${ADAPTER_DIR}/.." && pwd)"
PROOF_DIR="${ROOT_DIR}/deploy/proofs/2026-03-28_dexscreener_indexing"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8797}"
BASE_URL="http://${HOST}:${PORT}"
STM_MINT="9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb"
SJBC_MINT="EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2"
POOL_ID="BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G"
PAIR_ID="STM-SJBCUSD"

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

curl -sS "${BASE_URL}/integrations/dexscreener/status" > "${PROOF_DIR}/status.json"
curl -sS "${BASE_URL}/integrations/dexscreener/pair" > "${PROOF_DIR}/pair.json"
curl -sS "${BASE_URL}/integrations/dexscreener/activity" > "${PROOF_DIR}/activity.json"
curl -sS "${BASE_URL}/integrations/dexscreener/indexing-pack" > "${PROOF_DIR}/indexing_pack.json"

PROOF_DIR="${PROOF_DIR}" STM_MINT="${STM_MINT}" SJBC_MINT="${SJBC_MINT}" POOL_ID="${POOL_ID}" PAIR_ID="${PAIR_ID}" python3 - <<'PY'
import json, os, pathlib, subprocess

proof_dir = pathlib.Path(os.environ["PROOF_DIR"])
targets = {
    "stm_token": f"https://api.dexscreener.com/latest/dex/tokens/{os.environ['STM_MINT']}",
    "sjbc_token": f"https://api.dexscreener.com/latest/dex/tokens/{os.environ['SJBC_MINT']}",
    "pool_search": f"https://api.dexscreener.com/latest/dex/search/?q={os.environ['POOL_ID']}",
    "pair_search": f"https://api.dexscreener.com/latest/dex/search/?q={os.environ['PAIR_ID']}",
}

def fetch_json(url):
    try:
        result = subprocess.run(
            ["curl", "-sS", url],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return json.loads(result.stdout)
    except Exception as exc:
        return {"fetch_error": str(exc), "url": url}

verdict = {name: fetch_json(url) for name, url in targets.items()}
(proof_dir / "public_verdict.json").write_text(json.dumps(verdict, indent=2) + "\n")

status = json.loads((proof_dir / "status.json").read_text())
pair = json.loads((proof_dir / "pair.json").read_text())
activity = json.loads((proof_dir / "activity.json").read_text())
indexing_pack = json.loads((proof_dir / "indexing_pack.json").read_text())

snapshot = {
    "schema": "sterling_dexscreener_indexing_snapshot_v1",
    "runtime_roles": {
        "1492": "SterlingChain brain",
        "8000": "SterlingDEX execution surface"
    },
    "status": status,
    "pair_excerpt": {
        "pairAddress": pair.get("pair", {}).get("pairAddress"),
        "dexId": pair.get("pair", {}).get("dexId"),
        "baseToken": pair.get("pair", {}).get("baseToken"),
        "quoteToken": pair.get("pair", {}).get("quoteToken"),
        "liquidity": pair.get("pair", {}).get("liquidity"),
    },
    "activity_excerpt": {
        "swaps_total": activity.get("metrics_snapshot", {}).get("swaps_total"),
        "volume_usd_est_total": activity.get("metrics_snapshot", {}).get("volume_usd_est_total"),
        "sample_activity_count": len(activity.get("sample_activity", [])),
    },
    "public_verdict_excerpt": {
        "stm_pairs": verdict.get("stm_token", {}).get("pairs"),
        "sjbc_pairs": verdict.get("sjbc_token", {}).get("pairs"),
        "pool_search_pairs": verdict.get("pool_search", {}).get("pairs"),
        "pair_search_pairs": verdict.get("pair_search", {}).get("pairs"),
    },
    "remaining_external_blocker": "DexScreener still needs native parser/indexer support or listing acceptance for the custom SterlingDEX program and pool.",
}
(proof_dir / "result_snapshot.json").write_text(json.dumps(snapshot, indent=2) + "\n")

index_md = """# DexScreener Indexing Handoff Bundle Index

Date: `2026-03-28`

Runtime roles:
- `1492` = cerveau SterlingChain
- `8000` = surface SterlingDEX / quote / swap / execution

Files:
- `status.json`
- `pair.json`
- `activity.json`
- `indexing_pack.json`
- `public_verdict.json`
- `result_snapshot.json`

Remaining external blocker:
- DexScreener parser/indexer support or listing acceptance is still required upstream.
"""
(proof_dir / "handoff_bundle_index.md").write_text(index_md)
PY

echo "dexscreener_indexing_bundle_frozen"
