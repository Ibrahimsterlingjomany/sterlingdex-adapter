# SterlingDEX Public Surface

Minimal public protocol surface for `SterlingDEX` on Solana.

This repo is for the public protocol layer:

- canonical token visibility
- settlement bridge registry visibility
- bridge target registry visibility
- public protocol adapter
- public API contract for future router integration

It does **not** pretend that routing is already public if it is not wired yet.

## Endpoints

- `GET /status`
- `GET /health`
- `GET /tokenlist`
- `GET /pools`
- `GET /pairs`
- `POST /quote`
- `POST /swap`
- `GET /openapi.json`

`/pairs` is kept as a compatibility route, but it describes bridge-backed
settlement targets, not public AMM pairs.

## Local build

```bash
cd sterlingdex-adapter
export STERLINGDEX_PUBLIC_BASE_URL=http://127.0.0.1:8788
export STERLING_PUBLIC_QUOTE_UPSTREAM_URL=http://127.0.0.1:8000/dex/quote
npm run build:surface
npm start
```

Default local URL:

- `http://127.0.0.1:8788`

## Public deployment variables

- `STERLINGDEX_PUBLIC_BASE_URL`
- `STERLING_PUBLIC_QUOTE_UPSTREAM_URL`
- `STERLING_PUBLIC_SWAP_UPSTREAM_URL`

If the two upstream variables are not configured, `POST /quote` and `POST /swap`
return a clear `501` response instead of a fake quote.

Build order matters: the generated `public-api/status.json` and `openapi.json`
read the public env at build time. In production, the bundled `systemd`
service runs `npm run build:surface` before `node server.mjs` so the published
surface stays aligned with the configured public URL and quote wiring.

## Source of truth

The public surface is generated from the main Sterling workspace:

- canonical tokenlist
- value registry
- hard liquidity pools

`SJBC` and `STM` use the canonical on-chain Metaplex metadata already paid and
recorded on Solana.
