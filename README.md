# SterlingDEX Public Surface

Minimal public protocol surface for `SterlingDEX` on Solana.

This repo is for the public protocol layer:

- canonical token visibility
- settlement bridge registry visibility
- bridge target registry visibility
- public protocol adapter
- public API contract for future router integration

It does **not** pretend that routing is already public if it is not wired yet.

## Public indexing pack (GitHub-visible)

The repository now publishes a full public indexing bundle:

- `public-api/status.json`
- `public-api/pools.json`
- `public-api/pairs.json`
- `public-api/token_catalog.json`
- `public-api/sterling_index_pack.json`
- `public-api/openapi.json`

These files are generated with `npm run build:surface` and are intended for
Jupiter / DEX Screener / review teams.

### Snapshot separation (important)

To avoid metric confusion, three snapshots are published separately:

- Headline historical snapshot: `21B` volume (`historicalSnapshots.headlineSnapshot`)
- Fee window snapshot (December 2025): `1,812` swaps, `90.6M` volume, `4.53M` fees (`historicalSnapshots.feeWindowSnapshot`)
- Long activity snapshot: `13,839` estimated swaps from long-period log rows (`historicalSnapshots.longActivitySnapshot`)

### Tokens, metadata, logos

`public-api/token_catalog.json` and `public-api/status.json` expose:

- token symbol and name
- token mint
- token logo URI
- token metadata URI
- canonical program/config/authority mapping

### SterlingChain surfaces

Published in `status.surfaces` and included in `sterling_index_pack.json`:

- site: `https://sterlingchain.net`
- API: `https://api.sterlingchain.net`
- dex, pair, pool, status, tokenlist, tokens, discovery, ecosystem

All API route contracts are listed under `status.endpoints` and in
`public-api/openapi.json`.

## Endpoints

- `GET /status`
- `GET /health`
- `GET /tokenlist`
- `GET /pools`
- `GET /pairs`
- `POST /quote`
- `POST /swap`
- `GET /program/schema`
- `GET /integrations/jupiter/rfq/tokens`
- `POST /integrations/jupiter/rfq/quote`
- `POST /integrations/jupiter/rfq/swap`
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
- `JUPITER_RFQ_MAKER_KEYPAIR_PATH`
- `JUPITER_RFQ_API_KEY`
- `JUPITER_RFQ_SIMULATE_SWAP`
- `JUPITER_RFQ_SEND_TRANSACTION`
- `JUPITER_RFQ_SWAP_MODE`

If the two upstream variables are not configured, `POST /quote` and `POST /swap`
return a clear `501` response instead of a fake quote.

## Jupiter RFQ

SterlingDEX now exposes a Jupiter RFQ compatible webhook surface:

- `GET /integrations/jupiter/rfq/tokens`
- `POST /integrations/jupiter/rfq/quote`
- `POST /integrations/jupiter/rfq/swap`

`JUPITER_RFQ_SWAP_MODE`:
- `toolkit_compat`: remplace un slot de signature comme le sample server officiel Jupiter, utile pour acceptance tests et onboarding RFQ
- `strict`: exige une transaction reelle signable/simulable par le maker avant acceptation

Important:
- en mode `toolkit_compat`, la valeur `txSignature` renvoyee par `/integrations/jupiter/rfq/swap` ne doit pas etre interpretee comme une transaction Solana confirmee de settlement.
- elle sert a prouver la compatibilite du webhook RFQ avec Jupiter et la capacite du maker a signer selon le flux attendu.

The quote and swap routes follow the Jupiter RFQ webhook contract:

- quote supports `exactIn` and `exactOut` on the canonical `STM/SJBC` pair
- swap accepts a base64 Jupiter RFQ transaction
- the maker keypair signs the transaction
- the adapter can simulate the signed transaction before answering
- optional webhook auth is supported via `X-API-KEY`

By default, swap runs in `maker_sign_only` mode:

- the transaction is signed by the maker
- the transaction is simulated
- the response is `accepted` if signing/simulation succeeds
- on-chain broadcast is only enabled if `JUPITER_RFQ_SEND_TRANSACTION=true`

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
