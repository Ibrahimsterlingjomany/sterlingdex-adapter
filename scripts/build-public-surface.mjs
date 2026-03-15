import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(repoDir, "..");
const publicDir = path.join(repoDir, "public-api");

const PROGRAM_ID = "7v9sLrk92NNLLUfXLJw3o7MycZNvwsTK6kLWfWb8vcVA";
const CONFIG_PDA = "Htopqis52g8nGvvkpnG7Z7XZhgBpqtN9huqUyk6LH9gB";
const AUTHORITY = "CMqD45Kq5oukPvaMDhzav5RxJqZb1xME1MmV71CzCeTw";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(rootDir, relPath), "utf8"));
}

function writeJson(relPath, payload) {
  const fullPath = path.join(repoDir, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function targetMintFromSymbol(target) {
  if (String(target || "").toUpperCase() === "USDT") return USDT_MINT;
  return USDC_MINT;
}

const canonicalTokenlist = readJson("tokenlist/tokenlist.json");
const valueRegistry = readJson("chain/value_registry.json");
const hardPools = readJson("chain/hard_liquidity_pools.json");
const legacySnapshot = JSON.parse(readFileSync(path.join(repoDir, "all_pools_snapshot.json"), "utf8"));

const tokenMap = new Map(
  (canonicalTokenlist.tokens || []).map((token) => [token.address, token]),
);
const registryMints = valueRegistry.mints || {};
const hardPoolRows = hardPools.pools || [];

const pairs = Object.entries(registryMints).map(([mint, row]) => {
  const token = tokenMap.get(mint) || {};
  const target = String(row.target || "USDC").toUpperCase();
  return {
    pairId: `${String(row.symbol || token.symbol || mint.slice(0, 6)).toUpperCase()}-${target}`,
    protocolId: "sterlingdex",
    protocolName: "SterlingDEX",
    programId: PROGRAM_ID,
    poolId: row.pool_id,
    configPda: row.pda || CONFIG_PDA,
    authority: row.authority || AUTHORITY,
    baseMint: mint,
    baseSymbol: row.symbol || token.symbol || mint.slice(0, 6),
    baseName: row.name || token.name || mint,
    baseLogoURI: row.logo_uri || token.logoURI || null,
    metadataURI: row.metadata_uri || token.extensions?.metadata_uri || null,
    quoteMint: targetMintFromSymbol(target),
    quoteSymbol: target,
    target,
    strategy: row.strategy || null,
    valueUsd: row.value_usd ?? null,
    lpMint: token.extensions?.lp_mint || null,
    externalUrl: token.extensions?.external_url || null,
    routing: {
      quotePath: "/quote",
      swapPath: "/swap",
      statusPath: "/status",
    },
  };
});

const pairMapByPool = new Map();
for (const pair of pairs) {
  const current = pairMapByPool.get(pair.poolId) || [];
  current.push(pair);
  pairMapByPool.set(pair.poolId, current);
}

const pools = hardPoolRows.map((pool) => {
  const relatedPairs = pairMapByPool.get(pool.pool_id) || [];
  const matchingLegacy = legacySnapshot.pool === pool.pool_id ? legacySnapshot : null;
  return {
    poolId: pool.pool_id,
    programId: pool.program_id || PROGRAM_ID,
    configPda: pool.config_pda || CONFIG_PDA,
    authority: pool.authority || AUTHORITY,
    sources: pool.sources || [],
    listedMints: pool.mints || [],
    listedPairs: relatedPairs.map((pair) => pair.pairId),
    lpMint: relatedPairs.find((pair) => pair.lpMint)?.lpMint || matchingLegacy?.lp_token_mint || null,
    metrics: matchingLegacy
      ? {
          lastUpdated: matchingLegacy.last_updated || matchingLegacy.time || null,
          swapsTotal: matchingLegacy.swaps_total ?? null,
          volumeUsdEstimateTotal: matchingLegacy.volume_usd_est_total ?? null,
          feesUsdEstimateTotal: matchingLegacy.fees_usd_est_total ?? null,
          totalBase: matchingLegacy.TOTAL_BASE ?? null,
          totalQuote: matchingLegacy.TOTAL_QUOTE ?? null,
        }
      : null,
    notes:
      relatedPairs.length > 1
        ? "Sterling private pool can back multiple settlement assets under one pool id."
        : (relatedPairs.length === 1 ? "Pool resolved from Sterling value registry." : "Pool discovered from snapshots only; pair mapping incomplete."),
  };
});

const status = {
  ok: true,
  protocolId: "sterlingdex",
  protocolName: "SterlingDEX",
  ecosystem: "SterlingChain",
  generatedAt: new Date().toISOString(),
  publicBaseUrl: process.env.STERLINGDEX_PUBLIC_BASE_URL || null,
  programId: PROGRAM_ID,
  configPda: CONFIG_PDA,
  authority: AUTHORITY,
  capabilities: {
    tokenlist: true,
    pools: true,
    pairs: true,
    quote: false,
    swap: false,
  },
  endpoints: {
    status: "/status",
    tokenlist: "/tokenlist",
    pools: "/pools",
    pairs: "/pairs",
    quote: "/quote",
    swap: "/swap",
  },
  publishableNow: [
    "Canonical token metadata for SJBC and STM",
    "Protocol identity, program id and config pda",
    "Pool registry surface",
    "Pair registry surface",
  ],
  remainingBlockers: [
    "No public HTTPS quote endpoint wired yet",
    "No public HTTPS swap endpoint wired yet",
    "No external indexer-specific adapter published yet",
    "DexScreener/Jupiter still need public tradable routing and indexable liquidity",
  ],
};

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "SterlingDEX Public Surface",
    version: "0.1.0",
    description: "Minimal public protocol surface for SterlingDEX on Solana.",
  },
  servers: [
    {
      url: process.env.STERLINGDEX_PUBLIC_BASE_URL || "https://your-public-sterlingdex-domain.example",
    },
  ],
  paths: {
    "/status": {
      get: {
        summary: "Protocol status",
        responses: {
          "200": { description: "Current public SterlingDEX status" },
        },
      },
    },
    "/tokenlist": {
      get: {
        summary: "Canonical SterlingDEX token list",
        responses: {
          "200": { description: "Token list JSON" },
        },
      },
    },
    "/pools": {
      get: {
        summary: "Pool registry",
        responses: {
          "200": { description: "Pool registry JSON" },
        },
      },
    },
    "/pairs": {
      get: {
        summary: "Pair registry",
        responses: {
          "200": { description: "Pair registry JSON" },
        },
      },
    },
    "/quote": {
      post: {
        summary: "Request a protocol quote",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["inputMint", "outputMint", "amount"],
                properties: {
                  inputMint: { type: "string" },
                  outputMint: { type: "string" },
                  amount: { type: "string" },
                  slippageBps: { type: "number" },
                  quoteOnly: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Quote response" },
          "501": { description: "Public quote upstream not configured yet" },
        },
      },
    },
    "/swap": {
      post: {
        summary: "Request a protocol swap route",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["inputMint", "outputMint", "amount", "userPublicKey"],
                properties: {
                  inputMint: { type: "string" },
                  outputMint: { type: "string" },
                  amount: { type: "string" },
                  userPublicKey: { type: "string" },
                  slippageBps: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Swap route response" },
          "501": { description: "Public swap upstream not configured yet" },
        },
      },
    },
  },
};

writeJson("public-api/status.json", status);
writeJson("public-api/pools.json", {
  ok: true,
  protocolId: "sterlingdex",
  generatedAt: status.generatedAt,
  pools,
});
writeJson("public-api/pairs.json", {
  ok: true,
  protocolId: "sterlingdex",
  generatedAt: status.generatedAt,
  pairs,
});
writeJson("public-api/openapi.json", openapi);

console.log(
  JSON.stringify({
    ok: true,
    generatedAt: status.generatedAt,
    files: ["public-api/status.json", "public-api/pools.json", "public-api/pairs.json", "public-api/openapi.json"],
    pairs: pairs.length,
    pools: pools.length,
  }),
);
