import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || "8788");
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC_URL, "confirmed");
const PROGRAM_ID = "7v9sLrk92NNLLUfXLJw3o7MycZNvwsTK6kLWfWb8vcVA";
const CONFIG_PDA = "Htopqis52g8nGvvkpnG7Z7XZhgBpqtN9huqUyk6LH9gB";
const AUTHORITY = "CMqD45Kq5oukPvaMDhzav5RxJqZb1xME1MmV71CzCeTw";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const POOL_STATE_CACHE_TTL_MS = Math.max(250, Number(process.env.POOL_STATE_CACHE_TTL_MS || "1000"));
const JUPITER_RFQ_API_KEY = String(process.env.JUPITER_RFQ_API_KEY || "").trim();
const JUPITER_RFQ_MAKER_KEYPAIR_PATH = String(
  process.env.JUPITER_RFQ_MAKER_KEYPAIR_PATH || path.resolve(process.env.HOME || "", ".config/solana/id.json"),
).trim();
const JUPITER_RFQ_SIMULATE_SWAP = ["1", "true", "yes", "on"].includes(
  String(process.env.JUPITER_RFQ_SIMULATE_SWAP || "true").toLowerCase(),
);
const JUPITER_RFQ_SEND_TRANSACTION = ["1", "true", "yes", "on"].includes(
  String(process.env.JUPITER_RFQ_SEND_TRANSACTION || "").toLowerCase(),
);
const JUPITER_RFQ_QUOTE_TTL_MS = Math.max(5_000, Number(process.env.JUPITER_RFQ_QUOTE_TTL_MS || "55000"));
const JUPITER_RFQ_SWAP_MODE = ["strict", "toolkit_compat"].includes(
  String(process.env.JUPITER_RFQ_SWAP_MODE || "toolkit_compat").trim().toLowerCase(),
)
  ? String(process.env.JUPITER_RFQ_SWAP_MODE || "toolkit_compat").trim().toLowerCase()
  : "toolkit_compat";
const CANONICAL_POOL = {
  poolId: "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G",
  pair: "STM/SJBC",
  pairId: "STM-SJBCUSD",
  baseMint: "9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb",
  baseSymbol: "STM",
  quoteMint: "EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2",
  quoteSymbol: "SJBC",
  settlementMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  settlementSymbol: "USDC",
  baseVault: "3mRYBWgBKnQuUyvVDcYFqSeNoQTujTsFGra3GWLof9av",
  quoteVault: "5z4brtXmcDBhPKLk9YoiZE7fqaourBk26jBuAUHqZDN9",
  feeVaultBase: "HgaLTe9cp398Y2svc8qmK4R7Xi2da46iWeTyM4jH3LFP",
  feeVaultQuote: "BjjVF8NhtRtCvmcdQEbFRY3ebkbLKyDa7KAmBTH2LBAp",
  protocolDebtLedger: "2Fr4WPEC51CUtDdqArStKMmTEuippeHMHFCH46mjgxQv",
  lpMint: "DnepvMafJZzDtDcevrqbMUCmDqdNhBLjCTUu1xhR4HeL",
  feeBps: 500,
  baseDecimals: 9,
  quoteDecimals: 9,
  quoteSchema: "sterling_canonical_pool_quote_v1",
};
const CANONICAL_STABLE_VALUE_MODEL = {
  stableValueSymbol: "USD",
  stableValueUsd: 1,
  settlementMint: CANONICAL_POOL.settlementMint,
  settlementSymbol: CANONICAL_POOL.settlementSymbol,
  supportedPayoutSymbols: ["USDC", "USDT", "SOL"],
  quoteAssetSymbol: CANONICAL_POOL.quoteSymbol,
  quoteAssetRole: "USD_VALUE_BRIDGE_ASSET",
  meaning:
    "La pool on-chain reste strictement STM/SJBC. Le USD ici designe la couche de valeur et de settlement bridge, avec USDC comme mint canonique de sortie, et non un troisieme mint stocke dans le compte pool.",
};
const HTOP_STM_RESERVE_ATA = "2CRon3SyMyvy2i7hourX99kiuoTKpLgQ3ebogrpfDorq";
const HTOP_SJBC_RESERVE_ATA = "HEy89xU9gkEi9FXGLvzT61i3pM2kTW5MzvqcCDsB7EmQ";
const CANONICAL_USDC_COFFRE = "7vWLrATXnuGTCjmexa7b4roo9Em6VMKr3bdDemJNHNk1";
const CANONICAL_USDT_COFFRE = "GTAs9L3XFdhHEFoo6KWNbFFxMCFRnbVomsbx7deShkLb";
const TREASURY_USDC_ATA = "2NUyY9XfzZ6dHZwRtQMt5oBHhZLNdwTBKwVbjrPwEDGN";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4K1B9SVskLFaPrqHh3VmN";
const NOMINAL_SOVEREIGN_RESERVE_UI = 1_000_000_000;
const REBUILT_PAYABLE_CLAIM_IDS = [
  "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_1c58070ffdbc799991372896",
  "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_34884160c99add9d412ee77e",
  "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_fa7b66f5339e18d5edf1c399",
];
const PROGRAM_SCHEMA = {
  schema: "sterling_program_schema_v1",
  program_id: PROGRAM_ID,
  config_pda: CONFIG_PDA,
  authority: AUTHORITY,
  note:
    "Schema public supplementaire pour aider les integrateurs a comprendre la pool canonique et le programme, car l'IDL expose par 8000 ne contient pas encore les comptes/types complets.",
  idl_status: {
    source: "8000:/idl",
    instructions_exposed: true,
    accounts_exposed: false,
    types_exposed: false,
  },
  canonical_pool_account: {
    name: "Pool",
    fields: [
      { name: "owner", type: "pubkey" },
      { name: "base_mint", type: "pubkey" },
      { name: "quote_mint", type: "pubkey" },
      { name: "base_vault", type: "pubkey" },
      { name: "quote_vault", type: "pubkey" },
      { name: "lp_mint", type: "pubkey" },
      { name: "fee_vault_base", type: "pubkey" },
      { name: "fee_vault_quote", type: "pubkey?" },
      { name: "base_value_usd_micros", type: "u64" },
      { name: "quote_value_usd_micros", type: "u64" },
      { name: "true_cash", type: "bool" },
      { name: "cash_backed", type: "bool" },
      { name: "real_peg", type: "bool" },
      { name: "sovereign", type: "bool" },
      { name: "fee_bps", type: "u16" },
      { name: "active", type: "bool" },
      { name: "swap_count", type: "u64" },
      { name: "bump", type: "u8" },
    ],
    canonical_instance: CANONICAL_POOL.poolId,
  },
  canonical_relationships: {
    pair_id: CANONICAL_POOL.pairId,
    base_mint: CANONICAL_POOL.baseMint,
    quote_mint: CANONICAL_POOL.quoteMint,
    settlement_mint: CANONICAL_POOL.settlementMint,
    settlement_symbol: CANONICAL_POOL.settlementSymbol,
    stable_value_symbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
    stable_value_usd: CANONICAL_STABLE_VALUE_MODEL.stableValueUsd,
    lp_mint: CANONICAL_POOL.lpMint,
    base_vault: CANONICAL_POOL.baseVault,
    quote_vault: CANONICAL_POOL.quoteVault,
    fee_vault_base: CANONICAL_POOL.feeVaultBase,
    fee_vault_quote: CANONICAL_POOL.feeVaultQuote,
    protocol_debt_ledger: CANONICAL_POOL.protocolDebtLedger,
  },
  settlement_model: CANONICAL_STABLE_VALUE_MODEL,
};
const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const LEGACY_POOL_SNAPSHOT = loadJson("all_pools_snapshot.json");
const BASE_VALUE_REGISTRY = PublicKey.findProgramAddressSync(
  [Buffer.from("value_registry"), new PublicKey(CANONICAL_POOL.baseMint).toBuffer()],
  PROGRAM_PUBKEY,
)[0].toBase58();
const QUOTE_VALUE_REGISTRY = PublicKey.findProgramAddressSync(
  [Buffer.from("value_registry"), new PublicKey(CANONICAL_POOL.quoteMint).toBuffer()],
  PROGRAM_PUBKEY,
)[0].toBase58();

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-API-KEY, x-request-start, x-request-timeout",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

let canonicalPoolStateCache = { expiresAt: 0, value: null };
let makerKeypairCache = null;
const jupiterRfqQuoteCache = new Map();
const RFQ_SIMULATE_REJECTION = "00000000-0000-0000-0000-000000000001";
const RFQ_SIMULATE_MALFORMED = "00000000-0000-0000-0000-000000000002";
const RFQ_SIMULATE_INSUFFICIENT_BALANCE = "00000000-0000-0000-0000-000000000003";
const RFQ_SIMULATE_SIGNATURE_VERIFICATION_FAILED = "00000000-0000-0000-0000-000000000004";
const DEXSCREENER_SAMPLE_ACTIVITY = [
  {
    txSignature: "3kXEYUoNh4CGfYAJG1aqhrNxWx9Wjfm3gqRvEkta6wDMdi7mRj2AWt5jLg1GaN3tne4y5zF7SAkyYcVESEaZk8c1",
    txUrl: "https://solscan.io/tx/3kXEYUoNh4CGfYAJG1aqhrNxWx9Wjfm3gqRvEkta6wDMdi7mRj2AWt5jLg1GaN3tne4y5zF7SAkyYcVESEaZk8c1",
    direction: "quote_to_base",
    inputMint: CANONICAL_POOL.quoteMint,
    outputMint: CANONICAL_POOL.baseMint,
    amountInRaw: "50000000000000",
    amountInUi: "50000.0",
    feeBps: 500,
    observedAt: "2026-01-05T17:57:56+00:00",
    source: "ledger_swap_log",
  },
  {
    txSignature: "HqFg5VqBhJQY7K7f8SbodiDh54yw2QUzQuY7FwzzdrbhgSLypLwBHTiAFh5dHCWuw6sJYEV9D3uTTSsfDXby7CG",
    txUrl: "https://solscan.io/tx/HqFg5VqBhJQY7K7f8SbodiDh54yw2QUzQuY7FwzzdrbhgSLypLwBHTiAFh5dHCWuw6sJYEV9D3uTTSsfDXby7CG",
    direction: "base_to_quote",
    inputMint: CANONICAL_POOL.baseMint,
    outputMint: CANONICAL_POOL.quoteMint,
    amountInRaw: "50000000000000",
    amountInUi: "50000.0",
    feeBps: 500,
    observedAt: "2026-01-05T17:57:51+00:00",
    source: "ledger_swap_log",
  },
  {
    txSignature: "3VATU63DQ5UGKDqQ77pev8GKrhfvbcC4BPT7oEvJEaPTsXsYLYQrFckAQhPXV3e3vTFd2JX7EZve2wC4yaquAR8h",
    txUrl: "https://solscan.io/tx/3VATU63DQ5UGKDqQ77pev8GKrhfvbcC4BPT7oEvJEaPTsXsYLYQrFckAQhPXV3e3vTFd2JX7EZve2wC4yaquAR8h",
    direction: "quote_to_base",
    inputMint: CANONICAL_POOL.quoteMint,
    outputMint: CANONICAL_POOL.baseMint,
    amountInRaw: "50000000000000",
    amountInUi: "50000.0",
    feeBps: 500,
    observedAt: "2026-01-05T17:57:44+00:00",
    source: "ledger_swap_log",
  },
  {
    txSignature: "WigjCAzbm8zZkjFoqHdgk6DpKcHj2TvKTyUkW35uQ5cHsCts41cAFQ7ZdSeLmDWApr9rjs2uRWSMTmJf6ikHvj7",
    txUrl: "https://solscan.io/tx/WigjCAzbm8zZkjFoqHdgk6DpKcHj2TvKTyUkW35uQ5cHsCts41cAFQ7ZdSeLmDWApr9rjs2uRWSMTmJf6ikHvj7",
    direction: "base_to_quote",
    inputMint: CANONICAL_POOL.baseMint,
    outputMint: CANONICAL_POOL.quoteMint,
    amountInRaw: "50000000000000",
    amountInUi: "50000.0",
    feeBps: 500,
    observedAt: "2026-01-05T17:57:38+00:00",
    source: "ledger_swap_log",
  },
];

function loadJson(relPath) {
  const fullPath = path.join(__dirname, relPath);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders);
  res.end(JSON.stringify(payload, null, 2));
}

function normalizeMint(body, keys) {
  for (const key of keys) {
    const value = String(body?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function formatRawAmountToUiString(rawAmount, decimals) {
  const raw = String(rawAmount ?? "").trim();
  const n = Number(decimals);
  if (!raw || !/^\d+$/.test(raw)) return null;
  if (!Number.isFinite(n) || n < 0 || n > 18) return null;
  const padded = raw.padStart(n + 1, "0");
  const whole = padded.slice(0, padded.length - n) || "0";
  const frac = padded.slice(padded.length - n).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatCompactUsd(value) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(4)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return amount.toFixed(2);
}

function parseUiAmountToRawString(uiAmount, decimals) {
  const raw = String(uiAmount ?? "").trim();
  const n = Number(decimals);
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
  if (!Number.isFinite(n) || n < 0 || n > 18) return null;
  const [whole, frac = ""] = raw.split(".");
  const normalizedFrac = frac.padEnd(n, "0");
  if (normalizedFrac.length > n) {
    const overflow = normalizedFrac.slice(n);
    if (!/^0*$/.test(overflow)) return null;
  }
  const amountRaw = `${whole}${normalizedFrac.slice(0, n)}`.replace(/^0+(?=\d)/, "") || "0";
  if (!/^\d+$/.test(amountRaw)) return null;
  return amountRaw;
}

function divCeil(a, b) {
  if (b <= 0n) return 0n;
  return (a + b - 1n) / b;
}

function scaleRawAmount(raw, fromDecimals, toDecimals) {
  const value = BigInt(raw);
  if (fromDecimals === toDecimals) return value;
  if (fromDecimals > toDecimals) {
    return value / (10n ** BigInt(fromDecimals - toDecimals));
  }
  return value * (10n ** BigInt(toDecimals - fromDecimals));
}

function cpmmQuoteOutRaw({ xReserve, yReserve, dxIn, feeBps }) {
  const feeNumerator = 10_000n - BigInt(feeBps);
  const dxNet = (dxIn * feeNumerator) / 10_000n;
  const numerator = dxNet * yReserve;
  const denominator = xReserve + dxNet;
  if (denominator <= 0n) return 0n;
  return numerator / denominator;
}

function cpmmQuoteInRaw({ xReserve, yReserve, dyOut, feeBps }) {
  if (dyOut <= 0n || yReserve <= dyOut) return 0n;
  const dxNet = divCeil(xReserve * dyOut, yReserve - dyOut);
  const feeDenominator = 10_000n - BigInt(feeBps);
  if (feeDenominator <= 0n) return 0n;
  return divCeil(dxNet * 10_000n, feeDenominator);
}

function parseJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadCanonicalTokenlist() {
  const raw = loadJson("sterlingdex_tokenlist.json");
  return Array.isArray(raw?.tokens) ? raw.tokens : [];
}

function findCanonicalToken(mint) {
  const wanted = String(mint || "").trim();
  if (!wanted) return null;
  return loadCanonicalTokenlist().find((token) => String(token?.address || "").trim() === wanted) || null;
}

function buildFlagClaimRecord(token, registryPda) {
  if (!token) return null;
  const extensions = token?.extensions || {};
  const flags = extensions?.flags || null;
  return {
    mint: token.address || null,
    symbol: token.symbol || null,
    metadata_uri: extensions?.metadata_uri || null,
    registry_pda: registryPda || null,
    claimed_flags: flags,
    claim_source: {
      program_schema_endpoint: "/program/schema",
      tokenlist_endpoint: "/tokenlist",
      token_endpoint: `/tokens/${token.address}`,
      token_proof_endpoint: `/proof/tokens/${token.address}`,
      metadata_uri: extensions?.metadata_uri || null,
    },
    interpretation:
      "Ces flags viennent du programme, du registry et/ou des metadata token. Ils doivent etre lus comme des declarations du systeme Sterling, pas comme une preuve externe independante de reserves cash hors-chain.",
  };
}

function buildClaimsVsProofsContext(pool) {
  const baseToken = findCanonicalToken(pool.baseMint);
  const quoteToken = findCanonicalToken(pool.quoteMint);
  return {
    warning_level: "important",
    claim_status: "program_and_metadata_claims_not_external_cash_attestation",
    program_and_metadata_claims: {
      canonical_pool_runtime_fields: ["true_cash", "cash_backed", "real_peg", "sovereign"],
      base_asset: buildFlagClaimRecord(baseToken, BASE_VALUE_REGISTRY),
      quote_asset: buildFlagClaimRecord(quoteToken, QUOTE_VALUE_REGISTRY),
    },
    independently_proven_in_this_surface: [
      "program_id, config_pda et authority publics",
      "pool_id, pair_id, mints, vaults et lp_mint canoniques",
      "reserves visibles des vaults depuis live_solana_rpc",
      "quote et swap intent publics relies a 1492 cerveau SterlingChain et 8000 surface SterlingDEX",
    ],
    not_independently_proven_in_this_surface: [
      "existence de reserves cash bancaires hors-chain",
      "preuve d'un backing fiat externe par un custodien independant",
      "audit legal/comptable externe du claim cash_backed",
      "attestation externe que true_cash, cash_backed ou real_peg sont verifies hors du systeme Sterling",
    ],
    interpretation:
      "Le pack de reconnaissance et les preuves publiques distinguent volontairement les faits runtime/on-chain des claims business. Les flags true_cash/cash_backed/real_peg/sovereign ne doivent pas etre lus ici comme une preuve externe autonome de cash backing reel.",
  };
}

async function buildSovereignBackingSnapshot() {
  const [stmBalance, sjbcBalance] = await Promise.all([
    getTokenAccountBalance(HTOP_STM_RESERVE_ATA),
    getTokenAccountBalance(HTOP_SJBC_RESERVE_ATA),
  ]);
  const reserves = [
    {
      reserve_role: "HTOP_STM_RESERVE",
      account: HTOP_STM_RESERVE_ATA,
      mint: CANONICAL_POOL.baseMint,
      symbol: CANONICAL_POOL.baseSymbol,
      amount_raw: stmBalance.amount,
      amount_ui: stmBalance.uiAmountString,
      observed_amount_raw: stmBalance.amount,
      observed_amount_ui: stmBalance.uiAmountString,
      observed_stable_value_usd: Number(stmBalance.uiAmountString || "0"),
      guaranteed_amount_ui: String(NOMINAL_SOVEREIGN_RESERVE_UI),
      guaranteed_stable_value_usd: NOMINAL_SOVEREIGN_RESERVE_UI,
      stable_value_usd: NOMINAL_SOVEREIGN_RESERVE_UI,
    },
    {
      reserve_role: "HTOP_SJBC_RESERVE",
      account: HTOP_SJBC_RESERVE_ATA,
      mint: CANONICAL_POOL.quoteMint,
      symbol: CANONICAL_POOL.quoteSymbol,
      amount_raw: sjbcBalance.amount,
      amount_ui: sjbcBalance.uiAmountString,
      observed_amount_raw: sjbcBalance.amount,
      observed_amount_ui: sjbcBalance.uiAmountString,
      observed_stable_value_usd: Number(sjbcBalance.uiAmountString || "0"),
      guaranteed_amount_ui: String(NOMINAL_SOVEREIGN_RESERVE_UI),
      guaranteed_stable_value_usd: NOMINAL_SOVEREIGN_RESERVE_UI,
      stable_value_usd: NOMINAL_SOVEREIGN_RESERVE_UI,
    },
  ];
  const totalUsd = reserves.reduce((sum, row) => sum + Number(row.guaranteed_stable_value_usd || 0), 0);
  const observedLiveTotalUsd = reserves.reduce((sum, row) => sum + Number(row.observed_stable_value_usd || 0), 0);
  return {
    schema: "sterling_sovereign_backing_v1",
    model: "system_stable_value_usd",
    stable_value_symbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
    stable_value_usd: CANONICAL_STABLE_VALUE_MODEL.stableValueUsd,
    settlement_mint: CANONICAL_STABLE_VALUE_MODEL.settlementMint,
    settlement_symbol: CANONICAL_STABLE_VALUE_MODEL.settlementSymbol,
    reserve_count: reserves.length,
    reserves,
    total_usd: Number(totalUsd.toFixed(6)),
    total_usd_micros: String(Math.round(totalUsd * 1_000_000)),
    total_usd_compact: formatCompactUsd(totalUsd),
    declared_guarantee_usd: Number(totalUsd.toFixed(6)),
    declared_guarantee_usd_micros: String(Math.round(totalUsd * 1_000_000)),
    declared_guarantee_usd_compact: formatCompactUsd(totalUsd),
    observed_live_total_usd: Number(observedLiveTotalUsd.toFixed(6)),
    observed_live_total_usd_micros: String(Math.round(observedLiveTotalUsd * 1_000_000)),
    observed_live_total_usd_compact: formatCompactUsd(observedLiveTotalUsd),
    payout_vaults: {
      usdc: CANONICAL_USDC_COFFRE,
      usdt: CANONICAL_USDT_COFFRE,
      treasury_usdc_ata: TREASURY_USDC_ATA,
    },
    sources: ["live_solana_rpc", "treasury_transfer_proofs"],
    note:
      "La garantie publique declaree suit le modele Sterling USD=1 avec 1 milliard STM + 1 milliard SJBC. Les soldes observes en live restent visibles separement et peuvent varier sans changer la garantie nominale declaree.",
  };
}

function buildHistoricalFeeSnapshot() {
  const report = loadJson("../reports/december_2025_pool_fee_inventory.json");
  return {
    schema: "sterling_fee_snapshot_v1",
    period: "2025-12",
    pool_id: report.pool || CANONICAL_POOL.poolId,
    swap_count: Number(report.december_2025_swap_count || 0),
    volume_usd_estimate: Number(report.december_2025_volume_usd || 0),
    fees_usd_estimate: Number(report.december_2025_fees_usd_est || 0),
    source_swap_log: report.source_swap_log || null,
    note:
      "Ces fees viennent du journal de swaps de decembre 2025 pour la pool canonique BbvR. Elles representent le stock historique gagne, pas un payout deja execute.",
  };
}

function buildPayableTicketBatch() {
  const receiptsDir = path.join(rootDir, "output", "receipts");
  const deduped = new Map();
  for (const file of readdirSync(receiptsDir)) {
    if (!file.startsWith("settlement_receipt_BbvR4zUAwZF8LmVFLXNpDy3C_usdc_") || !file.endsWith(".json")) continue;
    const raw = parseJsonFile(path.join(receiptsDir, file));
    const claimId = String(raw?.claim_id || "").trim();
    if (!REBUILT_PAYABLE_CLAIM_IDS.includes(claimId)) continue;
    const ticketId = String(raw?.ticket_id || file.replace(/^settlement_receipt_/, "").replace(/\.json$/, ""));
    const ticketValueUsdMicros = Number(raw?.ticket_value_usd_micros || 0);
    const paidUsdEquivalentMicros = Number(raw?.paid_usd_equivalent_micros || 0);
    const remainingUsdEquivalentMicros = Number(
      raw?.remaining_usd_equivalent_micros ?? Math.max(ticketValueUsdMicros - paidUsdEquivalentMicros, 0),
    );
    deduped.set(ticketId, {
      claim_id: claimId,
      ticket_id: ticketId,
      status: String(raw?.status || "UNKNOWN"),
      ticket_value_usd_micros: ticketValueUsdMicros,
      paid_usd_equivalent_micros: paidUsdEquivalentMicros,
      remaining_usd_equivalent_micros: remainingUsdEquivalentMicros,
    });
  }
  const rows = Array.from(deduped.values());
  const claimFamilies = REBUILT_PAYABLE_CLAIM_IDS.map((claimId) => ({
    claim_id: claimId,
    tickets: rows.filter((row) => row.claim_id === claimId).length,
  }));
  const payableUsd = rows.reduce((sum, row) => sum + row.ticket_value_usd_micros, 0) / 1_000_000;
  const paidUsd = rows.reduce((sum, row) => sum + row.paid_usd_equivalent_micros, 0) / 1_000_000;
  const remainingUsd = rows.reduce((sum, row) => sum + row.remaining_usd_equivalent_micros, 0) / 1_000_000;
  return {
    schema: "sterling_payable_ticket_batch_v1",
    batch: "reconstructed_fee_claims",
    destination_ata: TREASURY_USDC_ATA,
    rebuilt_claim_families: claimFamilies,
    rebuilt_claim_family_count: claimFamilies.length,
    ticket_count: rows.length,
    status: "ROUTING",
    payable_usd: Number(payableUsd.toFixed(6)),
    paid_usd: Number(paidUsd.toFixed(6)),
    remaining_usd: Number(remainingUsd.toFixed(6)),
    payable_usd_micros: String(Math.round(payableUsd * 1_000_000)),
    remaining_usd_micros: String(Math.round(remainingUsd * 1_000_000)),
    note:
      "Ce lot correspond aux tickets fees reconstruits et rendus payables. Ils restent visibles en ROUTING tant que le payout final souverain n'est pas encore execute.",
  };
}

function buildClaimsAndDebtSnapshot() {
  const inventory = loadJson("../reports/sterling_mainnet_inventory_20260403T030339Z.json");
  const counts = inventory?.account_counts || {};
  const config = inventory?.config?.partial?.parsed || {};
  return {
    schema: "sterling_claims_and_debt_v1",
    pool_id: config.pool_id || CANONICAL_POOL.poolId,
    protocol_debt_ledger: CANONICAL_POOL.protocolDebtLedger,
    settlement_claim_accounts: Number(counts.SettlementClaim || 0),
    payout_ticket_accounts: Number(counts.PayoutTicket || 0),
    protocol_debt_ledgers_count: Array.isArray(inventory?.protocol_debt_ledgers) ? inventory.protocol_debt_ledgers.length : 0,
    treasury_value_usd_micros: String(config.treasury_value_usd_micros || "0"),
    treasury_usdc_ata: String(config.treasury_usdc_ata || TREASURY_USDC_ATA),
    usdc_coffre: String(config.usdc_coffre || CANONICAL_USDC_COFFRE),
    claim_family: "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_*",
    ticket_focus: "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_34884160c99add9d412ee77e_T4",
    note:
      "Ces chiffres rendent visible la couche claims, tickets et debt du programme. Ils ne signifient pas qu'un payout final a deja ete execute.",
  };
}

function loadMakerKeypair() {
  if (makerKeypairCache) return makerKeypairCache;
  const raw = parseJsonFile(JUPITER_RFQ_MAKER_KEYPAIR_PATH);
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  makerKeypairCache = kp;
  return makerKeypairCache;
}

function requireRfqApiKey(req) {
  if (!JUPITER_RFQ_API_KEY) return null;
  const headerValue = String(req.headers["x-api-key"] ?? "").trim();
  if (headerValue && headerValue === JUPITER_RFQ_API_KEY) return null;
  return {
    status: 401,
    payload: {
      error: "UNAUTHORIZED",
      note: "X-API-KEY manquant ou invalide pour le webhook Jupiter RFQ.",
    },
  };
}

function pruneRfqQuoteCache() {
  const now = Date.now();
  for (const [quoteId, snapshot] of jupiterRfqQuoteCache.entries()) {
    if (Number(snapshot?.expiresAt ?? 0) <= now) jupiterRfqQuoteCache.delete(quoteId);
  }
}

function cacheRfqQuote(snapshot) {
  pruneRfqQuoteCache();
  const quoteId = String(snapshot?.quoteId ?? "").trim();
  if (!quoteId) return;
  jupiterRfqQuoteCache.set(quoteId, {
    ...snapshot,
    expiresAt: Date.now() + JUPITER_RFQ_QUOTE_TTL_MS,
  });
}

function getCachedRfqQuote(quoteId) {
  pruneRfqQuoteCache();
  return jupiterRfqQuoteCache.get(String(quoteId ?? "").trim()) || null;
}

function findNonZeroSignature(signatures) {
  for (const sig of signatures || []) {
    if (sig && sig.length && sig.some((byte) => byte !== 0)) return sig;
  }
  return null;
}

function findEmptySignatureIndex(signatures) {
  if (!Array.isArray(signatures)) return -1;
  for (let i = 0; i < signatures.length; i += 1) {
    const sig = signatures[i];
    if (!sig || !sig.length) return i;
    if (sig.every((byte) => byte === 0)) return i;
  }
  return signatures.length ? 0 : -1;
}

function classifyRfqSimulationFailure(simulation) {
  const errText = JSON.stringify(simulation?.value?.err || {});
  const logs = Array.isArray(simulation?.value?.logs) ? simulation.value.logs.join("\n") : "";
  const combined = `${errText}\n${logs}`.toLowerCase();
  if (combined.includes("insufficient") || combined.includes("insuff")) {
    return "insufficientBalance";
  }
  if (combined.includes("signature")) {
    return "signatureVerificationFailed";
  }
  if (combined.includes("account not found") || combined.includes("invalid account")) {
    return "missingAssociatedTokenAccount";
  }
  return "simulationFailed";
}

function buildRfqSwapStatePayload(quoteId, state, rejectionReason = null, extra = {}) {
  return {
    quoteId: String(quoteId ?? ""),
    state,
    rejectionReason,
    ...extra,
  };
}

function buildSpecialRfqSwapResponse(body) {
  const requestId = String(body?.requestId ?? "").trim();
  const quoteId = String(body?.quoteId ?? "").trim();
  if (requestId === RFQ_SIMULATE_REJECTION) {
    return {
      status: 200,
      payload: buildRfqSwapStatePayload(quoteId, "rejected", "<rejection reason>"),
    };
  }
  if (requestId === RFQ_SIMULATE_INSUFFICIENT_BALANCE) {
    return {
      status: 200,
      payload: buildRfqSwapStatePayload(quoteId, { rejectedWithReason: "insufficientBalance" }, null),
    };
  }
  if (requestId === RFQ_SIMULATE_SIGNATURE_VERIFICATION_FAILED) {
    return {
      status: 200,
      payload: buildRfqSwapStatePayload(quoteId, { rejectedWithReason: "signatureVerificationFailed" }, null),
    };
  }
  if (requestId === RFQ_SIMULATE_MALFORMED) {
    return {
      status: 400,
      payload: {
        error: "BAD_REQUEST_SWAP",
        note: "Malformed request",
      },
    };
  }
  return null;
}

function injectMakerSignatureCompat(transaction, maker) {
  const signatureIndex = findEmptySignatureIndex(transaction.signatures);
  if (signatureIndex < 0) {
    throw new Error("Partial sign signature to replace not found");
  }
  const messageBytes = transaction.message.serialize();
  const detached = nacl.sign.detached(messageBytes, maker.secretKey);
  const signature = Uint8Array.from(detached);
  transaction.signatures[signatureIndex] = signature;
  return {
    signature,
    signatureBase58: bs58.encode(signature),
    signatureIndex,
  };
}

async function rpc(method, params = []) {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  if (json?.error) {
    throw new Error(`${method}:${JSON.stringify(json.error)}`);
  }
  return json?.result;
}

async function getTokenAccountBalance(address) {
  const result = await rpc("getTokenAccountBalance", [address, { commitment: "confirmed" }]);
  return {
    amount: String(result?.value?.amount ?? "0"),
    decimals: Number(result?.value?.decimals ?? 0),
    uiAmountString: String(result?.value?.uiAmountString ?? "0"),
  };
}

async function getCanonicalPoolState() {
  const now = Date.now();
  if (canonicalPoolStateCache.value && canonicalPoolStateCache.expiresAt > now) {
    return canonicalPoolStateCache.value;
  }
  const [baseBalance, quoteBalance] = await Promise.all([
    getTokenAccountBalance(CANONICAL_POOL.baseVault),
    getTokenAccountBalance(CANONICAL_POOL.quoteVault),
  ]);
  canonicalPoolStateCache = {
    expiresAt: now + POOL_STATE_CACHE_TTL_MS,
    value: {
      ...CANONICAL_POOL,
      liquidity: {
        status: "POOL_OK",
        baseVaultAmount: baseBalance.amount,
        baseVaultAmountUi: baseBalance.uiAmountString || formatRawAmountToUiString(baseBalance.amount, baseBalance.decimals),
        quoteVaultAmount: quoteBalance.amount,
        quoteVaultAmountUi: quoteBalance.uiAmountString || formatRawAmountToUiString(quoteBalance.amount, quoteBalance.decimals),
      },
      quotedAt: new Date().toISOString(),
    },
  };
  return canonicalPoolStateCache.value;
}

function buildCanonicalPairRecord(pool, row = {}) {
  return {
    ...row,
    pairId: CANONICAL_POOL.pairId,
    protocolId: "sterlingdex",
    protocolName: "SterlingDEX",
    surfaceType: "STERLING_COMPAT_PAIR",
    isDexPair: true,
    programId: PROGRAM_ID,
    poolId: CANONICAL_POOL.poolId,
    configPda: CONFIG_PDA,
    authority: AUTHORITY,
    baseMint: CANONICAL_POOL.baseMint,
    baseSymbol: CANONICAL_POOL.baseSymbol,
    quoteMint: CANONICAL_POOL.quoteMint,
    quoteSymbol: CANONICAL_POOL.quoteSymbol,
    settlementMint: CANONICAL_POOL.settlementMint,
    settlementSymbol: CANONICAL_POOL.settlementSymbol,
    target: CANONICAL_POOL.settlementSymbol,
    valueUsd: 1,
    stableValueSymbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueModel: CANONICAL_STABLE_VALUE_MODEL,
    sovereignBackingSummary: row.sovereignBackingSummary || null,
    payableTicketSummary: row.payableTicketSummary || null,
    lpMint: CANONICAL_POOL.lpMint,
    quoteSchema: CANONICAL_POOL.quoteSchema,
    quoteEndpoint: "/quote",
    swapEndpoint: "/swap",
    pairEndpoint: `/pairs/${CANONICAL_POOL.pairId}`,
    poolEndpoint: `/pools/${CANONICAL_POOL.poolId}`,
    proofEndpoint: `/proof/pools/${CANONICAL_POOL.poolId}`,
    pairProofEndpoint: `/proof/pairs/${CANONICAL_POOL.pairId}`,
    sourceOfTruth: "api.sterlingchain.net canonical pair + pool + proof surfaces",
    liquidity: pool.liquidity,
    feeModel: { feeBps: CANONICAL_POOL.feeBps },
    notes:
      "La pair on-chain est STM/SJBC. Le suffixe USD et le settlementSymbol=USDC expriment la couche de valeur/settlement bridge, pas un troisieme mint dans la pool.",
    quoteExample: {
      inputMint: CANONICAL_POOL.baseMint,
      outputMint: CANONICAL_POOL.quoteMint,
      amount: "1000000000",
      poolId: CANONICAL_POOL.poolId,
    },
    unitModel: {
      baseDecimals: CANONICAL_POOL.baseDecimals,
      quoteDecimals: CANONICAL_POOL.quoteDecimals,
      meaning:
        "Les reserves visibles de la pool et un quote de swap sont deux lectures differentes. quoteExample est seulement un test standard sur 1 STM.",
    },
  };
}

function buildCanonicalPoolRecord(pool, row = {}) {
  return {
    ...row,
    poolId: CANONICAL_POOL.poolId,
    programId: PROGRAM_ID,
    configPda: CONFIG_PDA,
    authority: AUTHORITY,
    surfaceType: "SETTLEMENT_BRIDGE",
    isPublicDexPool: true,
    listedMints: [CANONICAL_POOL.baseMint, CANONICAL_POOL.lpMint, CANONICAL_POOL.quoteMint],
    listedPairs: [CANONICAL_POOL.pairId],
    listedTargets: [
      {
        assetMint: CANONICAL_POOL.baseMint,
        assetSymbol: CANONICAL_POOL.baseSymbol,
        settlementMint: CANONICAL_POOL.settlementMint,
        settlementSymbol: CANONICAL_POOL.settlementSymbol,
        stableValueSymbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
        valueUsd: CANONICAL_STABLE_VALUE_MODEL.stableValueUsd,
        routeId: CANONICAL_POOL.pairId,
      },
    ],
    settlementMint: CANONICAL_POOL.settlementMint,
    settlementSymbol: CANONICAL_POOL.settlementSymbol,
    target: CANONICAL_POOL.settlementSymbol,
    valueUsd: 1,
    stableValueSymbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueModel: CANONICAL_STABLE_VALUE_MODEL,
    sovereignBacking: row.sovereignBacking || null,
    historicalFees: row.historicalFees || null,
    payableTickets: row.payableTickets || null,
    claimsAndDebt: row.claimsAndDebt || null,
    lpMint: CANONICAL_POOL.lpMint,
    quoteEndpoint: "/quote",
    swapEndpoint: "/swap",
    pairEndpoint: `/pairs/${CANONICAL_POOL.pairId}`,
    poolEndpoint: `/pools/${CANONICAL_POOL.poolId}`,
    proofEndpoint: `/proof/pools/${CANONICAL_POOL.poolId}`,
    pairProofEndpoint: `/proof/pairs/${CANONICAL_POOL.pairId}`,
    quoteSchema: CANONICAL_POOL.quoteSchema,
    sourceOfTruth: "api.sterlingchain.net canonical pair + pool + proof surfaces",
    liquidity: pool.liquidity,
    feeModel: { feeBps: CANONICAL_POOL.feeBps },
    notes:
      "La pool on-chain reste STM/SJBC. Le settlement bridge associe cette pool a une valeur stable USD=1 et a un mint canonique de payout USDC, avec sorties metier USDC/USDT/SOL.",
    quoteExample: {
      inputMint: CANONICAL_POOL.baseMint,
      outputMint: CANONICAL_POOL.quoteMint,
      amount: "1000000000",
      poolId: CANONICAL_POOL.poolId,
    },
    unitModel: {
      baseDecimals: CANONICAL_POOL.baseDecimals,
      quoteDecimals: CANONICAL_POOL.quoteDecimals,
      meaning:
        "baseVaultAmount/baseVaultAmountUi et quoteVaultAmount/quoteVaultAmountUi representent les reserves visibles, pas un quote de swap.",
    },
  };
}

function buildCanonicalPoolProof(pool) {
  return {
    ok: true,
    proof_schema: "sterling_canonical_pool_proof_v1",
    pool_id: pool.poolId,
    pair: pool.pair,
    pair_id: pool.pairId,
    program_id: PROGRAM_ID,
    config_pda: CONFIG_PDA,
    authority: AUTHORITY,
    base_mint: pool.baseMint,
    quote_mint: pool.quoteMint,
    lp_mint: pool.lpMint,
    base_vault: pool.baseVault,
    quote_vault: pool.quoteVault,
    fee_vault_base: pool.feeVaultBase,
    fee_vault_quote: pool.feeVaultQuote,
    protocol_debt_ledger: pool.protocolDebtLedger,
    liquidity: pool.liquidity,
    fee_model: {
      fee_bps: pool.feeBps,
    },
    settlement_model: CANONICAL_STABLE_VALUE_MODEL,
    unit_model: {
      base_decimals: pool.baseDecimals,
      quote_decimals: pool.quoteDecimals,
      meaning:
        "Les montants de liquidity sont les reserves visibles des vaults. Ils ne doivent pas etre confondus avec expected_out d'un quote.",
    },
    claims_vs_proofs: buildClaimsVsProofsContext(pool),
    source_of_truth: "live_solana_rpc",
    proven_at: pool.quotedAt,
  };
}

function buildCanonicalPairProof(pool) {
  return {
    ok: true,
    proof_schema: "sterling_canonical_pair_proof_v1",
    pair_id: pool.pairId,
    pair: pool.pair,
    pool_id: pool.poolId,
    program_id: PROGRAM_ID,
    config_pda: CONFIG_PDA,
    authority: AUTHORITY,
    base: {
      mint: pool.baseMint,
      symbol: pool.baseSymbol,
      vault: pool.baseVault,
      reserve_raw: pool.liquidity.baseVaultAmount,
      reserve_ui: pool.liquidity.baseVaultAmountUi,
      decimals: pool.baseDecimals,
    },
    quote: {
      mint: pool.quoteMint,
      symbol: pool.quoteSymbol,
      vault: pool.quoteVault,
      reserve_raw: pool.liquidity.quoteVaultAmount,
      reserve_ui: pool.liquidity.quoteVaultAmountUi,
      decimals: pool.quoteDecimals,
    },
    lp_mint: pool.lpMint,
    fee_model: {
      fee_bps: pool.feeBps,
    },
    settlement_model: CANONICAL_STABLE_VALUE_MODEL,
    source_of_truth: {
      pair_endpoint: `/pairs/${pool.pairId}`,
      pool_endpoint: `/pools/${pool.poolId}`,
      pool_proof_endpoint: `/proof/pools/${pool.poolId}`,
      quote_endpoint: "/quote",
      swap_endpoint: "/swap",
    },
    claims_vs_proofs: buildClaimsVsProofsContext(pool),
    proven_at: pool.quotedAt,
  };
}

function buildCanonicalTokenResource(token, pool) {
  const mint = String(token?.address || "").trim();
  const extensions = token?.extensions || {};
  const isBase = mint === pool.baseMint;
  const isQuote = mint === pool.quoteMint;
  const isLp = mint === pool.lpMint;
  const reserveRaw = isBase
    ? pool.liquidity.baseVaultAmount
    : isQuote
      ? pool.liquidity.quoteVaultAmount
      : null;
  const reserveUi = isBase
    ? pool.liquidity.baseVaultAmountUi
    : isQuote
      ? pool.liquidity.quoteVaultAmountUi
      : null;
  const reserveVault = isBase ? pool.baseVault : isQuote ? pool.quoteVault : null;
  return {
    mint,
    symbol: token?.symbol || null,
    name: token?.name || null,
    decimals: Number(token?.decimals ?? 0),
    logoURI: token?.logoURI || null,
    metadataURI: extensions.metadata_uri || null,
    role: isBase ? "BASE_ASSET" : isQuote ? "QUOTE_ASSET" : isLp ? "LP_TOKEN" : "PUBLIC_VISIBLE_TOKEN",
    programId: extensions.programId || PROGRAM_ID,
    configPda: extensions.configPda || CONFIG_PDA,
    authority: extensions.authority || AUTHORITY,
    sourceOfTruth: {
      tokenlist: "/tokenlist",
      token: `/tokens/${mint}`,
      proof: `/proof/tokens/${mint}`,
      discovery: "https://sterlingchain.net/.well-known/sterling-discovery.json",
      programSchema: "/program/schema",
      programIdl: "/program/idl",
    },
    related: {
      poolId: isBase || isQuote || isLp ? pool.poolId : extensions.poolId || null,
      pairId: isBase || isQuote ? pool.pairId : null,
      quoteEndpoint: isBase || isQuote ? "/quote" : null,
      swapEndpoint: isBase || isQuote ? "/swap" : null,
      poolEndpoint: isBase || isQuote || isLp ? `/pools/${pool.poolId}` : null,
      pairEndpoint: isBase || isQuote ? `/pairs/${pool.pairId}` : null,
      poolProofEndpoint: isBase || isQuote || isLp ? `/proof/pools/${pool.poolId}` : null,
      pairProofEndpoint: isBase || isQuote ? `/proof/pairs/${pool.pairId}` : null,
    },
    visibleReserve: reserveRaw
      ? {
          raw: reserveRaw,
          ui: reserveUi,
          decimals: Number(token?.decimals ?? 0),
          vault: reserveVault,
          meaning: "Reserve visible du vault pour le token dans la pool canonique. Ce n'est pas un quote de swap.",
        }
      : null,
    integrationHints: {
      canonicalPairToken: isBase || isQuote,
      canonicalLpToken: isLp,
      supportsDirectQuoteSurface: isBase || isQuote,
    },
  };
}

function buildCanonicalTokenProof(token, pool) {
  const resource = buildCanonicalTokenResource(token, pool);
  return {
    ok: true,
    proof_schema: "sterling_canonical_token_proof_v1",
    mint: resource.mint,
    symbol: resource.symbol,
    name: resource.name,
    decimals: resource.decimals,
    logo_uri: resource.logoURI,
    metadata_uri: resource.metadataURI,
    role: resource.role,
    visible_reserve: resource.visibleReserve,
    related: resource.related,
    source_of_truth: {
      tokenlist_endpoint: "/tokenlist",
      token_endpoint: `/tokens/${resource.mint}`,
      program_schema_endpoint: "/program/schema",
      program_idl_endpoint: "/program/idl",
      discovery_endpoint: "https://sterlingchain.net/.well-known/sterling-discovery.json",
    },
    proven_at: pool.quotedAt,
  };
}

async function buildPublicTokensPayload() {
  const pool = await getCanonicalPoolState();
  const tokens = loadCanonicalTokenlist().map((token) => buildCanonicalTokenResource(token, pool));
  return {
    ok: true,
    protocol: "sterlingdex",
    generatedAt: new Date().toISOString(),
    tokens,
  };
}

async function buildCanonicalRegistryBundle(pool) {
  const sovereignBacking = await buildSovereignBackingSnapshot();
  const historicalFees = buildHistoricalFeeSnapshot();
  const payableTickets = buildPayableTicketBatch();
  const claimsAndDebt = buildClaimsAndDebtSnapshot();
  const pair = buildCanonicalPairRecord(pool, {
    sovereignBackingSummary: {
      totalUsd: sovereignBacking.total_usd,
      totalUsdCompact: sovereignBacking.total_usd_compact,
      reserveCount: sovereignBacking.reserve_count,
    },
    payableTicketSummary: {
      ticketCount: payableTickets.ticket_count,
      remainingUsd: payableTickets.remaining_usd,
    },
  });
  const publicPool = buildCanonicalPoolRecord(pool, {
    sovereignBacking,
    historicalFees,
    payableTickets,
    claimsAndDebt,
  });
  const tokens = loadCanonicalTokenlist().map((token) => buildCanonicalTokenResource(token, pool));
  return {
    ok: true,
    schema: "sterling_canonical_registry_v1",
    protocol: "sterlingdex",
    ecosystem: "SterlingChain",
    generated_at: new Date().toISOString(),
    program: {
      program_id: PROGRAM_ID,
      config_pda: CONFIG_PDA,
      authority: AUTHORITY,
      schema_endpoint: "/program/schema",
      idl_endpoint: "/program/idl",
      note:
        "Les integrateurs natifs de type routeur/indexeur preferent en general un programme supporte directement, un SDK AMM/RFQ ou un parser dedie; cette surface aide a comprendre le programme avant support natif.",
    },
    canonical_pair: pair,
    canonical_pool: publicPool,
    stable_value_layer: CANONICAL_STABLE_VALUE_MODEL,
    sovereign_backing: sovereignBacking,
    historical_fees: historicalFees,
    payable_tickets: payableTickets,
    claims_and_debt: claimsAndDebt,
    tokens,
    proofs: {
      pool: `/proof/pools/${pool.poolId}`,
      pair: `/proof/pairs/${pool.pairId}`,
      tokens: "/proof/tokens/:mint",
    },
    execution: {
      quote_endpoint: "/quote",
      swap_endpoint: "/swap",
      quote_schema: pool.quoteSchema,
      swap_schema: "sterling_canonical_swap_intent_v1",
      unit_model: {
        raw_amounts_are_integer_base_units: true,
        ui_amounts_are_decimal_human_readable: true,
        meaning:
          "Les reserves visibles de la pool, les quotes de swap et les valeurs business sont trois lectures differentes. SterlingDEX les expose separement.",
      },
    },
    claims_vs_proofs: buildClaimsVsProofsContext(pool),
    integrations: {
      jupiter_metis: {
        status: "native_program_support_required",
        docs: "https://dev.jup.ag/docs/swap/routing/dex-integration",
        requirement:
          "Jupiter Metis demande un SDK AMM compatible avec son interface et une integration de programme native; une simple API quote/swap publique ne suffit pas.",
      },
      jupiter_rfq: {
        status: "public_webhook_ready_registration_pending",
        base_url: "/integrations/jupiter/rfq",
        tokens_endpoint: "/integrations/jupiter/rfq/tokens",
        quote_endpoint: "/integrations/jupiter/rfq/quote",
        swap_endpoint: "/integrations/jupiter/rfq/swap",
      },
      openocean: {
        status: "source_onboarding_required",
        docs: "https://docs.openocean.finance/products/dex-aggregator/dexs-integration",
        note:
          "La page publique OpenOcean liste les integrations DEX supportees par chaine. Pour Solana, elle liste Jupiter et Titan; un DEX custom doit etre onboarde comme source.",
      },
      dexscreener: {
        status: "program_indexer_support_required",
        docs: "https://docs.dexscreener.com/api/reference",
        note:
          "DexScreener expose des endpoints de lecture sur des paires deja indexees. Une API DEX custom propre n'entraine pas a elle seule une indexation de pair.",
      },
    },
  };
}

function isOpenOceanSolanaChain(chain) {
  const value = String(chain ?? "solana").trim().toLowerCase();
  return !value || value === "solana" || value === "101";
}

function buildOpenOceanDexList() {
  return {
    code: 200,
    data: [
      {
        index: 14928000,
        code: "SterlingDEX",
        name: "SterlingDEX",
        isVersioned: true,
        chain: "solana",
        note: "Custom Solana source adapter backed by SterlingChain 1492 brain and SterlingDEX 8000 execution surface.",
      },
    ],
  };
}

function buildOpenOceanTokenEntry(token, pool, index) {
  const mint = String(token?.address || "").trim();
  const extensions = token?.extensions || {};
  const isBase = mint === pool.baseMint;
  const isQuote = mint === pool.quoteMint;
  const isLp = mint === pool.lpMint;
  return {
    id: index + 1,
    code: String(token?.symbol || "").toLowerCase() || null,
    name: token?.name || null,
    address: mint,
    decimals: Number(token?.decimals ?? 0),
    symbol: token?.symbol || null,
    icon: token?.logoURI || null,
    chain: "solana",
    createtime: extensions.registryUpdatedAt || null,
    hot: isBase || isQuote ? "01" : null,
    sort: extensions.registryUpdatedAt || null,
    chainId: 101,
    customSymbol: null,
    customAddress: null,
    usd: extensions.valueUsd == null ? null : String(extensions.valueUsd),
    role: isBase ? "BASE_ASSET" : isQuote ? "QUOTE_ASSET" : isLp ? "LP_TOKEN" : "PUBLIC_VISIBLE_TOKEN",
  };
}

function buildOpenOceanTokenList(pool) {
  return {
    code: 200,
    data: loadCanonicalTokenlist().map((token, index) => buildOpenOceanTokenEntry(token, pool, index)),
  };
}

function buildOpenOceanSourceStatus(pool) {
  return {
    ok: true,
    schema: "sterling_openocean_source_status_v1",
    source: {
      name: "SterlingDEX OpenOcean Source Adapter",
      chain: "solana",
      adapter_base: "/integrations/openocean/source",
      dex_code: "SterlingDEX",
      dex_index: 14928000,
      onboarding_status: "source_onboarding_required",
      docs: "https://docs.openocean.finance/products/dex-aggregator/dexs-integration",
    },
    runtime_roles: {
      sterlingchain_1492: {
        role: "brain",
        meaning: "1492 porte le cerveau SterlingChain: orchestration, registry canonique et verite runtime.",
      },
      sterlingdex_8000: {
        role: "dex_execution_surface",
        meaning: "8000 porte SterlingDEX: quote, swap, execution Solana et lecture de la pool canonique.",
      },
      public_surface: {
        role: "adapter_surface",
        meaning: "La facade publique traduit la verite 1492/8000 en surfaces lisibles pour OpenOcean.",
      },
    },
    canonical_target: {
      program_id: PROGRAM_ID,
      config_pda: CONFIG_PDA,
      authority: AUTHORITY,
      pool_id: pool.poolId,
      pair_id: pool.pairId,
      pair: pool.pair,
      base_mint: pool.baseMint,
      quote_mint: pool.quoteMint,
      base_vault: pool.baseVault,
      quote_vault: pool.quoteVault,
      lp_mint: pool.lpMint,
      fee_bps: pool.feeBps,
    },
    source_of_truth: {
      registry: "/registry/canonical",
      pair: `/pairs/${pool.pairId}`,
      pool: `/pools/${pool.poolId}`,
      pool_proof: `/proof/pools/${pool.poolId}`,
      pair_proof: `/proof/pairs/${pool.pairId}`,
      tokenlist: "/tokenlist",
      quote: "/quote",
      swap: "/swap",
    },
    openocean_alignment: {
      chain_param_supported: ["solana", "101"],
      token_list_endpoint: "/integrations/openocean/source/tokenList",
      dex_list_endpoint: "/integrations/openocean/source/dexList",
      pairs_endpoint: "/integrations/openocean/source/pairs",
      market_endpoint: "/integrations/openocean/source/market",
      quote_endpoint: "/integrations/openocean/source/quote",
      swap_quote_endpoint: "/integrations/openocean/source/swap_quote",
      amount_model:
        "OpenOcean v3 attend un amount UI decimal string. L'adapter Sterling convertit ensuite vers le raw amount canonique de 8000.",
      gas_price_rule: "Sur Solana, la doc OpenOcean recommande gasPrice=1 par defaut.",
    },
    current_gap: {
      solved_on_our_side: [
        "Pool canonique publique et paire canonique publiques",
        "Quote publique standard et swap intent public",
        "Source adapter OpenOcean lisible et shape aligne sur tokenList/dexList/quote/swap_quote",
      ],
      remaining: [
        "OpenOcean doit onboarder/whitelister la source Solana custom dans son pipeline.",
        "La consommation native ne se declenchera pas automatiquement tant que SterlingDEX n'est pas reconnu comme source supportee chez eux.",
      ],
    },
  };
}

function buildOpenOceanSourcePairs(pool) {
  return {
    code: 200,
    data: [
      {
        dexCode: "SterlingDEX",
        dexIndex: 14928000,
        chain: "solana",
        pairId: pool.pairId,
        pair: pool.pair,
        poolId: pool.poolId,
        programId: PROGRAM_ID,
        configPda: CONFIG_PDA,
        authority: AUTHORITY,
        baseToken: buildOpenOceanTokenEntry(findCanonicalToken(pool.baseMint), pool, 0),
        quoteToken: buildOpenOceanTokenEntry(findCanonicalToken(pool.quoteMint), pool, 1),
        lpMint: pool.lpMint,
        reserves: {
          baseRaw: pool.liquidity.baseVaultAmount,
          baseUi: pool.liquidity.baseVaultAmountUi,
          quoteRaw: pool.liquidity.quoteVaultAmount,
          quoteUi: pool.liquidity.quoteVaultAmountUi,
        },
        feeRatio: Number((pool.feeBps / 10000).toFixed(6)),
        sourceOfTruth: `/proof/pools/${pool.poolId}`,
      },
    ],
  };
}

function buildOpenOceanSourceMarket(pool) {
  return {
    ok: true,
    schema: "sterling_openocean_source_market_v1",
    source: {
      dexCode: "SterlingDEX",
      dexIndex: 14928000,
      chain: "solana",
      adapterBase: "/integrations/openocean/source",
    },
    runtime_roles: {
      sterlingchain_1492: "brain",
      sterlingdex_8000: "dex_execution_surface",
    },
    canonical_pair: {
      pairId: pool.pairId,
      pair: pool.pair,
      poolId: pool.poolId,
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      baseVault: pool.baseVault,
      quoteVault: pool.quoteVault,
      lpMint: pool.lpMint,
      feeBps: pool.feeBps,
    },
    adapter_endpoints: {
      tokenList: "/integrations/openocean/source/tokenList",
      dexList: "/integrations/openocean/source/dexList",
      pairs: "/integrations/openocean/source/pairs",
      quote: "/integrations/openocean/source/quote",
      swapQuote: "/integrations/openocean/source/swap_quote",
      status: "/integrations/openocean/source/status",
    },
    source_of_truth: {
      canonical_registry: "/registry/canonical",
      pair: `/pairs/${pool.pairId}`,
      pool: `/pools/${pool.poolId}`,
      proof: `/proof/pools/${pool.poolId}`,
    },
  };
}

function buildOpenOceanPath(pool, inputMint, outputMint) {
  return {
    from: inputMint,
    to: outputMint,
    parts: 1,
    routes: [
      {
        parts: 1,
        percentage: 100,
        subRoutes: [
          {
            from: inputMint,
            to: outputMint,
            parts: 1,
            dexes: [
              {
                dex: "SterlingDEX",
                id: pool.poolId,
                parts: 1,
                percentage: 100,
                fee: Number((pool.feeBps / 10000).toFixed(6)),
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildOpenOceanDexRoute(pool, inputMint, outputMint, inAmountRaw, expectedOutRaw, minOutRaw) {
  return {
    dexCode: "SterlingDEX",
    dexIndex: 14928000,
    swapAmount: expectedOutRaw,
    minOutAmount: minOutRaw,
    route: [
      {
        swapInfo: {
          ammKey: pool.poolId,
          label: "SterlingDEX",
          inputMint,
          outputMint,
          inAmount: inAmountRaw,
          outAmount: expectedOutRaw,
          outAmountAfterSlippage: minOutRaw,
          updateContextSlot: null,
        },
        percent: 100,
        bps: null,
      },
    ],
    time: 0,
    feeRatio: Number((pool.feeBps / 10000).toFixed(6)),
  };
}

async function buildOpenOceanSourceQuotePayload(input) {
  const pool = await getCanonicalPoolState();
  const chain = String(input?.chain ?? input?.chainId ?? "solana").trim();
  if (!isOpenOceanSolanaChain(chain)) {
    return {
      status: 400,
      payload: {
        code: 400,
        message: "Unsupported chain for SterlingDEX OpenOcean source adapter. Use chain=solana.",
      },
    };
  }
  const inputMint = String(input?.inTokenAddress || "").trim();
  const outputMint = String(input?.outTokenAddress || "").trim();
  const slippagePercent = Number(input?.slippage ?? 1);
  const gasPrice = String(input?.gasPrice ?? "1").trim() || "1";
  if (
    !inputMint ||
    !outputMint ||
    !((inputMint === pool.baseMint && outputMint === pool.quoteMint) || (inputMint === pool.quoteMint && outputMint === pool.baseMint))
  ) {
    return {
      status: 404,
      payload: {
        code: 404,
        message: "Unsupported pair for SterlingDEX OpenOcean source adapter. Only STM/SJBC is supported.",
      },
    };
  }
  const inputToken = findCanonicalToken(inputMint);
  const outputToken = findCanonicalToken(outputMint);
  const inputDecimals = Number(inputToken?.decimals ?? (inputMint === pool.baseMint ? pool.baseDecimals : pool.quoteDecimals));
  const outputDecimals = Number(outputToken?.decimals ?? (outputMint === pool.quoteMint ? pool.quoteDecimals : pool.baseDecimals));
  const amountUi = String(input?.amount ?? "").trim();
  const amountRaw = parseUiAmountToRawString(amountUi, inputDecimals);
  if (!amountRaw || BigInt(amountRaw) <= 0n) {
    return {
      status: 400,
      payload: {
        code: 400,
        message: "Invalid amount. OpenOcean source adapter expects a UI decimal amount string such as 1 or 1.23.",
      },
    };
  }
  const canonical = await buildCanonicalQuoteResponse({
    inputMint,
    outputMint,
    amount: amountRaw,
    poolId: pool.poolId,
    slippageBps: Math.round(slippagePercent * 100),
    target: pool.settlementSymbol,
  });
  if (canonical.status !== 200 || !canonical.payload?.standard_quote) {
    return {
      status: 404,
      payload: {
        code: 404,
        message: "No positive quote available from the canonical SterlingDEX pool.",
      },
    };
  }
  const q = canonical.payload.standard_quote;
  const minOutRaw = ((BigInt(q.expected_out_raw) * BigInt(Math.max(0, 10_000 - Number(q.slippage_bps)))) / 10_000n).toString();
  return {
    status: 200,
    payload: {
      code: 200,
      data: {
        code: 0,
        dexes: [buildOpenOceanDexRoute(pool, inputMint, outputMint, q.amount_in_raw, q.expected_out_raw, minOutRaw)],
        inToken: buildOpenOceanTokenEntry(inputToken, pool, 0),
        outToken: buildOpenOceanTokenEntry(outputToken, pool, 1),
        inAmount: q.amount_in_raw,
        outAmount: q.expected_out_raw,
        minOutAmount: minOutRaw,
        dexId: 14928000,
        path: buildOpenOceanPath(pool, inputMint, outputMint),
        feeRatio: Number((pool.feeBps / 10000).toFixed(6)),
        price_impact: null,
        gasPrice,
        sourceAdapter: {
          schema: "sterling_openocean_source_quote_v1",
          runtime_roles: {
            sterlingchain_1492: "brain",
            sterlingdex_8000: "dex_execution_surface",
          },
          canonical_source: {
            registry: "/registry/canonical",
            pair: `/pairs/${pool.pairId}`,
            pool: `/pools/${pool.poolId}`,
            proof: `/proof/pools/${pool.poolId}`,
            quote: "/quote",
            swap: "/swap",
          },
          unit_model: {
            request_amount_ui: amountUi,
            request_amount_raw: q.amount_in_raw,
            input_decimals: q.input_decimals,
            output_decimals: q.output_decimals,
            meaning:
              "OpenOcean source adapter accepts amount in UI decimal string, then maps to the raw canonical quote on 8000.",
          },
          quote_meaning:
            "This is a source-adapter quote for the canonical BbvR pool. It is not proof that OpenOcean has onboarded the source upstream.",
          quotedAt: q.quoted_at,
        },
      },
    },
  };
}

async function buildOpenOceanSourceSwapQuotePayload(input) {
  const quote = await buildOpenOceanSourceQuotePayload(input);
  if (quote.status !== 200 || !quote.payload?.data) return quote;
  return {
    status: 200,
    payload: {
      ...quote.payload,
      data: {
        ...quote.payload.data,
        account: String(input?.account ?? "").trim() || null,
        sender: String(input?.sender ?? "").trim() || null,
        referrer: String(input?.referrer ?? "").trim() || null,
        txBuildSupported: false,
        transaction: null,
        execution_mode: "PUBLIC_INTENT_ONLY",
        execution_status: "READY_FOR_PRIVATE_EXECUTOR",
        note:
          "This swap_quote-shaped response is intended for onboarding/source review. Public transaction construction remains controlled by SterlingDEX 8000 or a partner rail.",
      },
    },
  };
}

function buildDexScreenerStatus(pool) {
  const snapshot = LEGACY_POOL_SNAPSHOT || {};
  return {
    ok: true,
    schema: "sterling_dexscreener_status_v1",
    integration: "DexScreener",
    runtime_roles: {
      sterlingchain_1492: {
        role: "brain",
        meaning: "1492 porte le cerveau SterlingChain: orchestration, registry canonique et verite runtime.",
      },
      sterlingdex_8000: {
        role: "dex_execution_surface",
        meaning: "8000 porte SterlingDEX: quote, swap, execution Solana et lecture de la pool canonique.",
      },
    },
    canonical_target: {
      program_id: PROGRAM_ID,
      config_pda: CONFIG_PDA,
      authority: AUTHORITY,
      pool_id: pool.poolId,
      pair_id: pool.pairId,
      pair: pool.pair,
      base_mint: pool.baseMint,
      quote_mint: pool.quoteMint,
      lp_mint: pool.lpMint,
    },
    public_support_surfaces: {
      registry: "/registry/canonical",
      pair: `/pairs/${pool.pairId}`,
      pool: `/pools/${pool.poolId}`,
      proof_pair: `/proof/pairs/${pool.pairId}`,
      proof_pool: `/proof/pools/${pool.poolId}`,
      status: "/integrations/dexscreener/status",
      pair_signal: "/integrations/dexscreener/pair",
      activity_signal: "/integrations/dexscreener/activity",
      indexing_pack: "/integrations/dexscreener/indexing-pack",
    },
    current_verdict: {
      token_endpoint_state: "pairs_null",
      search_endpoint_state: "pairs_empty",
      interpretation:
        "DexScreener ne reconnait pas encore BbvR comme paire indexee; le blocage principal reste l'indexer/parser du programme custom 7v9.",
    },
    docs: {
      faq: "https://docs.dexscreener.com/",
      token_listing: "https://docs.dexscreener.com/token-listing",
      dex_listing: "https://docs.dexscreener.com/dex-listing",
      api_reference: "https://docs.dexscreener.com/api/reference",
    },
    listing_factors: {
      on_chain_indexing_only: true,
      supported_chains_and_protocols_auto_tracked: true,
      low_liquidity_or_volume_can_block_listing: true,
      our_interpretation:
        "Comme DexScreener retourne pairs:null sur STM/SJBC, le probleme dominant n'est pas notre API publique mais l'absence de parsing/indexation native du programme custom.",
    },
    snapshot_signals: {
      last_updated: snapshot.last_updated || null,
      swaps_total: snapshot.swaps_total ?? null,
      volume_usd_est_total: snapshot.volume_usd_est_total ?? null,
      fees_usd_est_total: snapshot.fees_usd_est_total ?? null,
      negociants_est_total: snapshot.negociants_est_total ?? null,
    },
  };
}

function buildDexScreenerPairSignal(pool) {
  const snapshot = LEGACY_POOL_SNAPSHOT || {};
  return {
    schemaVersion: "1.0.0",
    pair: {
      chainId: "solana",
      dexId: "sterlingdex",
      url: `https://sterlingchain.net/dex/${pool.poolId}`,
      pairAddress: pool.poolId,
      labels: ["custom-program", "canonical-pool"],
      baseToken: {
        address: pool.baseMint,
        name: pool.baseSymbol === "STM" ? "Sterling Mint" : pool.baseSymbol,
        symbol: pool.baseSymbol,
      },
      quoteToken: {
        address: pool.quoteMint,
        name: pool.quoteSymbol === "SJBC" ? "SJBC USD" : pool.quoteSymbol,
        symbol: pool.quoteSymbol,
      },
      liquidity: {
        base: Number(pool.liquidity.baseVaultAmountUi),
        quote: Number(pool.liquidity.quoteVaultAmountUi),
      },
      txns: {
        h24: {
          buys: snapshot.swaps_total ?? null,
          sells: snapshot.swaps_total ?? null,
        },
      },
      volume: {
        h24: snapshot.volume_usd_est_total ?? null,
      },
      priceChange: {},
      info: {
        imageUrl: "https://sterlingchain.net/token-assets/stm.jpg",
        websites: [{ label: "SterlingChain", url: "https://sterlingchain.net" }],
        socials: [],
      },
      boosts: { active: 0 },
      sourceAdapter: {
        pair_id: pool.pairId,
        proof_pair: `/proof/pairs/${pool.pairId}`,
        proof_pool: `/proof/pools/${pool.poolId}`,
        quote: "/quote",
        swap: "/swap",
        runtime_roles: {
          sterlingchain_1492: "brain",
          sterlingdex_8000: "dex_execution_surface",
        },
        note:
          "Signal public pour revue d'indexation DexScreener. DexScreener n'indexe pas cette paire via notre API; l'indexer doit parser le programme custom.",
      },
    },
  };
}

function buildDexScreenerActivitySignal(pool) {
  const snapshot = LEGACY_POOL_SNAPSHOT || {};
  return {
    ok: true,
    schema: "sterling_dexscreener_activity_signal_v1",
    pair_id: pool.pairId,
    pool_id: pool.poolId,
    runtime_roles: {
      sterlingchain_1492: "brain",
      sterlingdex_8000: "dex_execution_surface",
    },
    metrics_snapshot: {
      source: "all_pools_snapshot.json",
      last_updated: snapshot.last_updated || null,
      swaps_total: snapshot.swaps_total ?? null,
      volume_tokens_total: snapshot.volume_tokens_total ?? null,
      volume_usd_est_total: snapshot.volume_usd_est_total ?? null,
      fees_tokens_est_total: snapshot.fees_tokens_est_total ?? null,
      fees_usd_est_total: snapshot.fees_usd_est_total ?? null,
      negociants_est_total: snapshot.negociants_est_total ?? null,
    },
    sample_activity: DEXSCREENER_SAMPLE_ACTIVITY,
    meaning:
      "These are public indexing signals showing that the canonical pair has observed swap-like activity and fee traces. They complement, but do not replace, DexScreener's own blockchain indexer.",
  };
}

function buildDexScreenerIndexingPack(pool) {
  return {
    ok: true,
    schema: "sterling_dexscreener_indexing_pack_v1",
    integration: "DexScreener",
    runtime_roles: {
      sterlingchain_1492: "brain",
      sterlingdex_8000: "dex_execution_surface",
    },
    canonical_target: {
      program_id: PROGRAM_ID,
      config_pda: CONFIG_PDA,
      authority: AUTHORITY,
      pool_id: pool.poolId,
      pair_id: pool.pairId,
      pair: pool.pair,
      base_mint: pool.baseMint,
      quote_mint: pool.quoteMint,
      base_vault: pool.baseVault,
      quote_vault: pool.quoteVault,
      lp_mint: pool.lpMint,
      fee_bps: pool.feeBps,
    },
    indexer_hints: {
      parser_target: "custom_program_7v9",
      chain: "solana",
      protocol_support_gap:
        "DexScreener docs say supported chains and protocols are auto-tracked. The remaining gap is native support for the custom SterlingDEX program in their indexer.",
      data_source_rule:
        "DexScreener data comes directly from the blockchain, without using external APIs or data sources.",
    },
    public_support_surfaces: {
      registry: "/registry/canonical",
      pair: `/pairs/${pool.pairId}`,
      pool: `/pools/${pool.poolId}`,
      proof_pair: `/proof/pairs/${pool.pairId}`,
      proof_pool: `/proof/pools/${pool.poolId}`,
      pair_signal: "/integrations/dexscreener/pair",
      activity_signal: "/integrations/dexscreener/activity",
      status: "/integrations/dexscreener/status",
    },
    reserves: {
      base_raw: pool.liquidity.baseVaultAmount,
      base_ui: pool.liquidity.baseVaultAmountUi,
      quote_raw: pool.liquidity.quoteVaultAmount,
      quote_ui: pool.liquidity.quoteVaultAmountUi,
    },
    activity: buildDexScreenerActivitySignal(pool),
    current_gap: {
      solved_on_our_side: [
        "Canonical pair/pool/proof surfaces are public",
        "DexScreener-oriented pair signal is public",
        "DexScreener-oriented activity signal is public",
      ],
      remaining: [
        "DexScreener still returns pairs:null for STM and SJBC.",
        "DexScreener still returns pairs:[] when searching BbvR or STM-SJBCUSD.",
        "The remaining blocker is DexScreener parser/indexer support or manual listing decision for the custom program.",
      ],
    },
  };
}

async function buildPublicRecognitionPack(pool) {
  const sovereignBacking = await buildSovereignBackingSnapshot();
  const historicalFees = buildHistoricalFeeSnapshot();
  const payableTickets = buildPayableTicketBatch();
  const claimsAndDebt = buildClaimsAndDebtSnapshot();
  return {
    ok: true,
    schema: "sterling_public_recognition_pack_v1",
    generated_at: new Date().toISOString(),
    runtime_roles: {
      sterlingchain_1492: {
        role: "brain",
        meaning: "1492 porte le cerveau SterlingChain: orchestration, registry canonique et verite runtime.",
      },
      sterlingdex_8000: {
        role: "dex_execution_surface",
        meaning: "8000 porte SterlingDEX: quote, swap, execution Solana et lecture de la pool canonique.",
      },
      sterlingquote_8789: {
        role: "quote_proxy",
        meaning: "8789 porte le proxy de quotes et d'adaptateurs externes.",
      },
    },
    canonical_target: {
      program_id: PROGRAM_ID,
      config_pda: CONFIG_PDA,
      authority: AUTHORITY,
      pool_id: pool.poolId,
      pair_id: pool.pairId,
      pair: pool.pair,
      base_mint: pool.baseMint,
      quote_mint: pool.quoteMint,
      base_vault: pool.baseVault,
      quote_vault: pool.quoteVault,
      lp_mint: pool.lpMint,
      fee_bps: pool.feeBps,
      settlement_mint: CANONICAL_POOL.settlementMint,
      settlement_symbol: CANONICAL_POOL.settlementSymbol,
      stable_value_symbol: CANONICAL_STABLE_VALUE_MODEL.stableValueSymbol,
      stable_value_usd: CANONICAL_STABLE_VALUE_MODEL.stableValueUsd,
      supported_payout_symbols: CANONICAL_STABLE_VALUE_MODEL.supportedPayoutSymbols,
      reserves: {
        base_raw: pool.liquidity.baseVaultAmount,
        base_ui: pool.liquidity.baseVaultAmountUi,
        quote_raw: pool.liquidity.quoteVaultAmount,
        quote_ui: pool.liquidity.quoteVaultAmountUi,
      },
    },
    settlement_model: CANONICAL_STABLE_VALUE_MODEL,
    sovereign_backing: sovereignBacking,
    historical_fees: historicalFees,
    payable_tickets: payableTickets,
    claims_and_debt: claimsAndDebt,
    public_urls: {
      site: "https://sterlingchain.net",
      api: "https://api.sterlingchain.net",
      discovery: "https://sterlingchain.net/.well-known/sterling-discovery.json",
      recognition_profile: "https://sterlingchain.net/.well-known/sterling-recognition.json",
      tokenlist: "https://api.sterlingchain.net/tokenlist",
      pair: `https://api.sterlingchain.net/pairs/${pool.pairId}`,
      pool: `https://api.sterlingchain.net/pools/${pool.poolId}`,
      proof_pair: `https://api.sterlingchain.net/proof/pairs/${pool.pairId}`,
      proof_pool: `https://api.sterlingchain.net/proof/pools/${pool.poolId}`,
      quote: "https://api.sterlingchain.net/quote",
      swap: "https://api.sterlingchain.net/swap",
      public_recognition_pack: "https://api.sterlingchain.net/recognition/public-pack",
    },
    claims_vs_proofs: buildClaimsVsProofsContext(pool),
    tokens: loadCanonicalTokenlist().map((token) => ({
      symbol: token.symbol,
      mint: token.address,
      name: token.name,
      logo_uri: token.logoURI || null,
      metadata_uri: token.extensions?.metadata_uri || null,
    })),
    fronts: {
      jupiter_native: {
        status: "ready_on_our_side",
        blocker: "jupiter_upstream_native_support",
      },
      openocean: {
        status: "ready_on_our_side",
        blocker: "openocean_upstream_source_onboarding",
        source_adapter_status: "/integrations/openocean/source/status",
      },
      dexscreener: {
        status: "ready_on_our_side",
        blocker: "dexscreener_upstream_indexer_or_listing",
        indexing_pack: "/integrations/dexscreener/indexing-pack",
      },
      coingecko: {
        status: "submission_pack_ready",
        blocker: "manual_authenticated_submission_and_review",
        official_form: "https://support.coingecko.com/hc/en-us/articles/33084534107289-Self-Serve-Request-Form",
      },
      solscan: {
        status: "submission_pack_ready",
        blocker: "manual_authenticated_submission_and_review",
        official_form: "https://solscan.io/token-update",
      },
    },
    note:
      "Ce pack sert de source publique unique de reconnaissance pour reviewers et indexeurs. Il ne pretend ni que le routage tiers est deja actif upstream, ni que des flags comme true_cash/cash_backed/real_peg constituent ici une preuve externe autonome de backing cash reel.",
  };
}

function buildJupiterMetisAccountsToUpdate(pool) {
  return [
    {
      pubkey: pool.poolId,
      role: "amm_key",
      reason: "Pool state account used as AMM key for from_keyed_account and active state.",
    },
    {
      pubkey: CONFIG_PDA,
      role: "config",
      reason: "Static config PDA referenced by swap instructions and AMM params.",
    },
    {
      pubkey: pool.baseVault,
      role: "base_vault",
      reason: "Base reserve source for update() and quote().",
    },
    {
      pubkey: pool.quoteVault,
      role: "quote_vault",
      reason: "Quote reserve source for update() and quote().",
    },
    {
      pubkey: pool.baseMint,
      role: "base_mint",
      reason: "Reserve mint metadata.",
    },
    {
      pubkey: pool.quoteMint,
      role: "quote_mint",
      reason: "Reserve mint metadata.",
    },
    {
      pubkey: pool.lpMint,
      role: "lp_mint",
      reason: "LP identity for pool linkage.",
    },
    {
      pubkey: BASE_VALUE_REGISTRY,
      role: "base_value_registry",
      reason: "Static canonical valuation registry for STM.",
    },
    {
      pubkey: QUOTE_VALUE_REGISTRY,
      role: "quote_value_registry",
      reason: "Static canonical valuation registry for SJBC.",
    },
  ];
}

function buildJupiterMetisMarket(pool) {
  return {
    pubkey: pool.poolId,
    owner: PROGRAM_ID,
    params: {
      label: "SterlingDEX",
      programId: PROGRAM_ID,
      configPda: CONFIG_PDA,
      authority: AUTHORITY,
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      baseVault: pool.baseVault,
      quoteVault: pool.quoteVault,
      lpMint: pool.lpMint,
      feeBps: pool.feeBps,
      pairId: pool.pairId,
      poolId: pool.poolId,
      baseValueRegistry: BASE_VALUE_REGISTRY,
      quoteValueRegistry: QUOTE_VALUE_REGISTRY,
      swapInstructionBaseForQuote: "swap_base_for_quote",
      swapInstructionQuoteForBase: "swap_quote_for_base",
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  };
}

function buildJupiterMetisAmmSpec(pool) {
  return {
    ok: true,
    schema: "sterling_jupiter_metis_amm_spec_v1",
    target: {
      integration: "Jupiter Metis native DEX integration",
      docs: "https://dev.jup.ag/docs/swap/routing/dex-integration",
      amm_interface_crate: "jupiter-amm-interface@0.6.1",
    },
    amm_trait_mapping: {
      label: "SterlingDEX",
      program_id: PROGRAM_ID,
      key: pool.poolId,
      reserve_mints: [pool.baseMint, pool.quoteMint],
      get_accounts_to_update: buildJupiterMetisAccountsToUpdate(pool),
      has_dynamic_accounts: false,
      requires_update_for_reserve_mints: false,
      supports_exact_out: false,
      unidirectional: false,
      is_active: true,
      get_accounts_len: 8,
      underlying_liquidities: [pool.poolId],
      program_dependencies: [
        {
          programId: PROGRAM_ID,
          role: "sterling_program",
        },
        {
          programId: TOKEN_PROGRAM_ID,
          role: "spl_token_program",
        },
      ],
    },
    market: buildJupiterMetisMarket(pool),
    quote_engine: {
      model: "cpmm",
      fee_bps: pool.feeBps,
      source_of_truth: `/proof/pools/${pool.poolId}`,
      note:
        "Le quote natif Metis doit etre calcule localement a partir des comptes mis a jour. Aucune requete reseau n'est attendue dans l'implementation Amm.",
    },
    swap_variants: [
      {
        direction: "base_to_quote",
        instruction_name: "swap_base_for_quote",
        accounts: ["config", "user", "pool", "userBaseAta", "userQuoteAta", "baseVault", "quoteVault", "tokenProgram"],
        args: [
          { name: "amountIn", type: "u64" },
          { name: "minOut", type: "u64" },
        ],
      },
      {
        direction: "quote_to_base",
        instruction_name: "swap_quote_for_base",
        accounts: ["config", "user", "pool", "userQuoteAta", "userBaseAta", "quoteVault", "baseVault", "tokenProgram"],
        args: [
          { name: "amountIn", type: "u64" },
          { name: "minOut", type: "u64" },
        ],
      },
    ],
    current_gap: {
      solved_on_our_side: [
        "Canonical pool/pair/proof/quote/swap public surfaces",
        "Public program schema and public IDL snapshot",
        "Jupiter-specific AMM spec, market params and accounts-to-update surface",
      ],
      remaining: [
        "Jupiter Metis attends an in-process Rust SDK implementing Amm, not an HTTP quote API.",
        "The current jupiter-amm-interface Swap enum has no SterlingDEX-specific variant on our side; native routing requires Jupiter-side fork/onboarding.",
        "8000 still exposes instructions but not full accounts/types in its native IDL, so our public schema complements the missing structure.",
      ],
    },
  };
}

function isCanonicalJupiterRfqRequest(body) {
  const tokenIn = normalizeMint(body, ["tokenIn", "inputMint", "mintIn", "mint_in"]);
  const tokenOut = normalizeMint(body, ["tokenOut", "outputMint", "mintOut", "mint_out"]);
  const quoteType = String(body?.quoteType ?? "").trim();
  const protocol = String(body?.protocol ?? "").trim();
  if (!tokenIn || !tokenOut) return false;
  const canonical =
    (tokenIn === CANONICAL_POOL.baseMint && tokenOut === CANONICAL_POOL.quoteMint) ||
    (tokenIn === CANONICAL_POOL.quoteMint && tokenOut === CANONICAL_POOL.baseMint);
  if (!canonical) return false;
  if (quoteType && quoteType !== "exactIn" && quoteType !== "exactOut") return false;
  if (protocol && protocol !== "v1") return false;
  return true;
}

function isSettlementRfqPair(body) {
  const tokenIn = normalizeMint(body, ["tokenIn", "inputMint", "mintIn", "mint_in"]);
  const tokenOut = normalizeMint(body, ["tokenOut", "outputMint", "mintOut", "mint_out"]);
  const quoteType = String(body?.quoteType ?? "").trim();
  const protocol = String(body?.protocol ?? "").trim();
  if (!tokenIn || !tokenOut) return false;
  if (quoteType && quoteType !== "exactIn" && quoteType !== "exactOut") return false;
  if (protocol && protocol !== "v1") return false;
  const inputIsFeeAsset = tokenIn === CANONICAL_POOL.baseMint || tokenIn === CANONICAL_POOL.quoteMint;
  const outputIsSettlement =
    tokenOut === CANONICAL_POOL.settlementMint ||
    tokenOut === USDT_MINT;
  return inputIsFeeAsset && outputIsSettlement;
}

function stableDecimalsForMint(mint) {
  if (mint === CANONICAL_POOL.settlementMint || mint === USDT_MINT) return 6;
  if (mint === CANONICAL_POOL.baseMint || mint === CANONICAL_POOL.quoteMint) return 9;
  return null;
}

async function buildJupiterRfqQuoteResponse(body) {
  if (!isCanonicalJupiterRfqRequest(body) && !isSettlementRfqPair(body)) {
    return {
      status: 404,
      payload: {
        error: "UNSUPPORTED_RFQ_PAIR",
        note: "SterlingDEX RFQ public surface supports STM/SJBC and fee-backed STM/SJBC -> USDC/USDT settlement pairs.",
      },
    };
  }
  const pool = await getCanonicalPoolState();
  const quoteType = String(body?.quoteType || "exactIn").trim();
  const tokenIn = normalizeMint(body, ["tokenIn", "inputMint", "mintIn", "mint_in"]) || "";
  const tokenOut = normalizeMint(body, ["tokenOut", "outputMint", "mintOut", "mint_out"]) || "";
  const requestedAmount = String(body?.amount ?? body?.amountIn ?? body?.amount_in ?? "").trim();
  if (!/^\d+$/.test(requestedAmount) || BigInt(requestedAmount) <= 0n) {
    return {
      status: 400,
      payload: {
        error: "BAD_REQUEST_AMOUNT",
        note: "amount doit etre un entier raw strictement positif.",
      },
    };
  }
  if (isSettlementRfqPair(body)) {
    const inputDecimals = stableDecimalsForMint(tokenIn);
    const outputDecimals = stableDecimalsForMint(tokenOut);
    if (inputDecimals == null || outputDecimals == null) {
      return {
        status: 404,
        payload: {
          error: "UNSUPPORTED_RFQ_PAIR",
          note: "Settlement RFQ requires STM/SJBC as input and USDC/USDT as output.",
        },
      };
    }
    let amountInRaw = requestedAmount;
    let amountOutRaw = requestedAmount;
    if (quoteType === "exactIn") {
      amountOutRaw = scaleRawAmount(requestedAmount, inputDecimals, outputDecimals).toString();
    } else if (quoteType === "exactOut") {
      amountInRaw = scaleRawAmount(requestedAmount, outputDecimals, inputDecimals).toString();
    } else {
      return {
        status: 404,
        payload: {
          error: "UNSUPPORTED_QUOTE_TYPE",
          note: "SterlingDEX RFQ supporte exactIn et exactOut.",
        },
      };
    }
    if (!/^\d+$/.test(amountInRaw) || !/^\d+$/.test(amountOutRaw) || BigInt(amountInRaw) <= 0n || BigInt(amountOutRaw) <= 0n) {
      return {
        status: 404,
        payload: {
          error: "NO_RFQ_QUOTE_AVAILABLE",
          note: "Aucun quote positif n'est disponible pour cette taille sur le settlement RFQ.",
        },
      };
    }
    cacheRfqQuote({
      requestId: String(body.requestId ?? ""),
      quoteId: String(body.quoteId ?? ""),
      tokenIn,
      tokenOut,
      amountIn: amountInRaw,
      amountOut: amountOutRaw,
      quoteType,
      taker: body?.taker ? String(body.taker) : null,
      receiver: body?.receiver ? String(body.receiver) : null,
      protocol: String(body?.protocol || "v1"),
      routeType: "fee_backed_settlement",
    });
    return {
      status: 200,
      payload: {
        requestId: String(body.requestId ?? ""),
        quoteId: String(body.quoteId ?? ""),
        tokenIn,
        amountIn: amountInRaw,
        tokenOut,
        quoteType,
        protocol: String(body?.protocol || "v1"),
        amountOut: amountOutRaw,
        maker: AUTHORITY,
        taker: body.taker ? String(body.taker) : null,
        receiver: body.receiver ? String(body.receiver) : null,
        routeType: "fee_backed_settlement",
        pricingModel: "usd_nominal_1_to_1",
        prioritizationFeeToUse:
          body.suggestedPrioritizationFees == null ? null : Number(body.suggestedPrioritizationFees),
      },
    };
  }
  const xReserve = BigInt(tokenIn === pool.baseMint ? pool.liquidity.baseVaultAmount : pool.liquidity.quoteVaultAmount);
  const yReserve = BigInt(tokenOut === pool.quoteMint ? pool.liquidity.quoteVaultAmount : pool.liquidity.baseVaultAmount);
  const feeBps = pool.feeBps;
  let amountInRaw = requestedAmount;
  let amountOutRaw = requestedAmount;
  if (quoteType === "exactIn") {
    amountOutRaw = cpmmQuoteOutRaw({
      xReserve,
      yReserve,
      dxIn: BigInt(requestedAmount),
      feeBps,
    }).toString();
  } else if (quoteType === "exactOut") {
    amountInRaw = cpmmQuoteInRaw({
      xReserve,
      yReserve,
      dyOut: BigInt(requestedAmount),
      feeBps,
    }).toString();
  } else {
    return {
      status: 404,
      payload: {
        error: "UNSUPPORTED_QUOTE_TYPE",
        note: "SterlingDEX RFQ supporte exactIn et exactOut pour STM/SJBC.",
      },
    };
  }
  if (!/^\d+$/.test(amountInRaw) || !/^\d+$/.test(amountOutRaw) || BigInt(amountInRaw) <= 0n || BigInt(amountOutRaw) <= 0n) {
    return {
      status: 404,
      payload: {
        error: "NO_RFQ_QUOTE_AVAILABLE",
        note: "La paire canonique existe, mais aucun quote RFQ positif n'est disponible pour cette taille.",
      },
    };
  }
  cacheRfqQuote({
    requestId: String(body.requestId ?? ""),
    quoteId: String(body.quoteId ?? ""),
    tokenIn,
    tokenOut,
    amountIn: amountInRaw,
    amountOut: amountOutRaw,
    quoteType,
    taker: body?.taker ? String(body.taker) : null,
    receiver: body?.receiver ? String(body.receiver) : null,
    protocol: String(body?.protocol || "v1"),
  });
  return {
    status: 200,
    payload: {
      requestId: String(body.requestId ?? ""),
      quoteId: String(body.quoteId ?? ""),
      tokenIn,
      amountIn: amountInRaw,
      tokenOut,
      quoteType,
      protocol: String(body?.protocol || "v1"),
      amountOut: amountOutRaw,
      maker: AUTHORITY,
      taker: body.taker ? String(body.taker) : null,
      receiver: body.receiver ? String(body.receiver) : null,
      prioritizationFeeToUse:
        body.suggestedPrioritizationFees == null ? null : Number(body.suggestedPrioritizationFees),
    },
  };
}

function isCanonicalQuoteRequest(body) {
  const poolId = String(body?.poolId ?? body?.pool_id ?? "").trim();
  if (poolId && poolId !== CANONICAL_POOL.poolId) return false;
  const inputMint = normalizeMint(body, ["inputMint", "mint_in", "mintIn", "mint"]);
  if (!inputMint) return false;
  if (inputMint !== CANONICAL_POOL.baseMint && inputMint !== CANONICAL_POOL.quoteMint) return false;
  const outputMint = normalizeMint(body, ["outputMint", "output_mint"]);
  if (outputMint && outputMint !== CANONICAL_POOL.baseMint && outputMint !== CANONICAL_POOL.quoteMint) return false;
  return true;
}

async function buildCanonicalQuoteResponse(body) {
  const pool = await getCanonicalPoolState();
  const inputMint = normalizeMint(body, ["inputMint", "mint_in", "mintIn", "mint"]);
  const outputMintRaw = normalizeMint(body, ["outputMint", "output_mint"]);
  const targetStable = String(body?.target ?? body?.targetStable ?? CANONICAL_POOL.settlementSymbol).trim().toUpperCase() || CANONICAL_POOL.settlementSymbol;
  const amountIn = String(body?.amount ?? body?.amountIn ?? body?.amount_in ?? "").trim();
  if (!/^\d+$/.test(amountIn) || BigInt(amountIn) <= 0n) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "BAD_REQUEST_AMOUNT",
        request_schema: {
          inputMint: "string",
          outputMint: "string?",
          target: "USDC|USDT?",
          amount: "string",
          poolId: "string?",
          slippageBps: "number?",
        },
      },
    };
  }

  const outputMint =
    outputMintRaw ||
    (inputMint === pool.baseMint ? pool.quoteMint : inputMint === pool.quoteMint ? pool.baseMint : "");
  if (!outputMint) {
    return {
      status: 400,
      payload: { ok: false, error: "UNSUPPORTED_INPUT_MINT", inputMint },
    };
  }

  const xReserve = BigInt(inputMint === pool.baseMint ? pool.liquidity.baseVaultAmount : pool.liquidity.quoteVaultAmount);
  const yReserve = BigInt(outputMint === pool.quoteMint ? pool.liquidity.quoteVaultAmount : pool.liquidity.baseVaultAmount);
  const expectedOut = cpmmQuoteOutRaw({
    xReserve,
    yReserve,
    dxIn: BigInt(amountIn),
    feeBps: pool.feeBps,
  }).toString();
  const outputSymbol = outputMint === pool.quoteMint ? pool.quoteSymbol : pool.baseSymbol;
  const outputDecimals = outputMint === pool.quoteMint ? pool.quoteDecimals : pool.baseDecimals;
  const inputDecimals = inputMint === pool.baseMint ? pool.baseDecimals : pool.quoteDecimals;

  return {
    status: 200,
    payload: {
      ok: true,
      protocol: "sterlingdex",
      endpoint: "/quote",
      quote_schema: pool.quoteSchema,
      unit_model: {
        raw_amounts_are_integer_base_units: true,
        ui_amounts_are_decimal_human_readable: true,
        input_decimals: inputDecimals,
        output_decimals: outputDecimals,
        meaning:
          "amount_in_raw et expected_out_raw sont un test de swap sur la paire canonique. Ils ne representent ni la reserve totale de la pool, ni une valeur business systeme.",
      },
      standard_quote: {
        schema: pool.quoteSchema,
        dex: "SterlingDEX",
        pair: pool.pair,
        pair_id: pool.pairId,
        pool_id: pool.poolId,
        program_id: PROGRAM_ID,
        config_pda: CONFIG_PDA,
        authority: AUTHORITY,
        route_type: "CANONICAL_POOL",
        liquidity_status: "REAL_LIQUIDITY_CONFIRMED",
        canonical_source: "api.sterlingchain.net:/quote",
        source_of_truth: {
          quote_endpoint: "/quote",
          pair_endpoint: "/pairs",
          pool_endpoint: "/pools",
          proof_endpoint: `/proof/pools/${pool.poolId}`,
        },
        input_mint: inputMint,
        input_symbol: inputMint === pool.baseMint ? pool.baseSymbol : pool.quoteSymbol,
        output_mint: outputMint,
        output_symbol: outputSymbol,
        amount_in: amountIn,
        amount_in_raw: amountIn,
        amount_in_ui: formatRawAmountToUiString(amountIn, inputDecimals),
        input_decimals: inputDecimals,
        expected_out: expectedOut,
        expected_out_raw: expectedOut,
        expected_out_ui: formatRawAmountToUiString(expectedOut, outputDecimals),
        output_decimals: outputDecimals,
        fee_bps: pool.feeBps,
        slippage_bps: Number(body?.slippageBps ?? body?.slippage_bps ?? 50),
        target_stable: targetStable,
        quote_meaning:
          "Quote de swap testee sur la paire canonique. expected_out_raw n'est pas la liquidite totale de la pool.",
        quoted_at: pool.quotedAt,
      },
      pair_context: {
        pairId: pool.pairId,
        poolId: pool.poolId,
        baseMint: pool.baseMint,
        quoteMint: pool.quoteMint,
        baseVault: pool.baseVault,
        quoteVault: pool.quoteVault,
        lpMint: pool.lpMint,
        proofEndpoint: `/proof/pools/${pool.poolId}`,
      },
    },
  };
}

async function buildCanonicalSwapIntentResponse(body) {
  const quote = await buildCanonicalQuoteResponse(body);
  if (quote.status !== 200 || !quote.payload?.standard_quote) {
    return quote;
  }
  const q = quote.payload.standard_quote;
  return {
    status: 200,
    payload: {
      ok: true,
      protocol: "sterlingdex",
      endpoint: "/swap",
      swap_schema: "sterling_canonical_swap_intent_v1",
      execution_mode: "PUBLIC_INTENT_ONLY",
      execution_status: "READY_FOR_PRIVATE_EXECUTOR",
      executable_publicly: false,
      reason:
        "La surface publique expose un intent et une route canoniques. L'execution on-chain reste controlee par le runtime Sterling ou un partenaire.",
      unit_model: quote.payload.unit_model,
      standard_swap: {
        schema: "sterling_canonical_swap_intent_v1",
        dex: "SterlingDEX",
        pair: q.pair,
        pair_id: q.pair_id,
        pool_id: q.pool_id,
        program_id: q.program_id,
        config_pda: q.config_pda,
        authority: q.authority,
        route_type: q.route_type,
        input_mint: q.input_mint,
        input_symbol: q.input_symbol,
        output_mint: q.output_mint,
        output_symbol: q.output_symbol,
        input_decimals: q.input_decimals,
        output_decimals: q.output_decimals,
        amount_in_raw: q.amount_in_raw,
        amount_in_ui: q.amount_in_ui,
        expected_out_raw: q.expected_out_raw,
        expected_out_ui: q.expected_out_ui,
        fee_bps: q.fee_bps,
        slippage_bps: q.slippage_bps,
        target_stable: q.target_stable,
        quote_endpoint: "/quote",
        proof_endpoint: `/proof/pools/${q.pool_id}`,
        settlement_mode: "bridge_target",
        signed_execution_required: true,
        intent_meaning:
          "Intent de swap public. Il decrit la route canonique et la quote associee, sans pretendre executer publiquement la transaction.",
        created_at: new Date().toISOString(),
      },
      quote_snapshot: q,
    },
  };
}

async function buildPublicPairsPayload() {
  const raw = loadJson("public-api/pairs.json");
  const pool = await getCanonicalPoolState();
  const pairs = Array.isArray(raw?.pairs) ? raw.pairs : [];
  const canonicalPairs = pairs
    .filter((row) => String(row?.poolId || "").trim() === CANONICAL_POOL.poolId)
    .map((row) => buildCanonicalPairRecord(pool, row));
  return {
    ...raw,
    generatedAt: new Date().toISOString(),
    pairs: canonicalPairs,
  };
}

async function buildPublicPoolsPayload() {
  const raw = loadJson("public-api/pools.json");
  const pool = await getCanonicalPoolState();
  const pools = Array.isArray(raw?.pools) ? raw.pools : [];
  const canonicalPools = pools
    .filter((row) => String(row?.poolId || "").trim() === CANONICAL_POOL.poolId && Boolean(row?.isPublicDexPool))
    .map((row) => buildCanonicalPoolRecord(pool, row));
  return {
    ok: true,
    protocolId: "sterlingdex",
    generatedAt: new Date().toISOString(),
    pools: canonicalPools,
  };
}

async function buildPublicStatusPayload() {
  const raw = loadJson("public-api/status.json");
  return {
    ...raw,
    generatedAt: new Date().toISOString(),
    sovereignBacking: await buildSovereignBackingSnapshot(),
    historicalFees: buildHistoricalFeeSnapshot(),
    payableTickets: buildPayableTicketBatch(),
    claimsAndDebt: buildClaimsAndDebtSnapshot(),
  };
}

async function proxyJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { ok: false, raw: text } };
  }
}

async function simulateAndMaybeBroadcastRfqTransaction(body) {
  const special = buildSpecialRfqSwapResponse(body);
  if (special) return special;
  const maker = loadMakerKeypair();
  const transaction = VersionedTransaction.deserialize(Buffer.from(String(body.transaction || ""), "base64"));
  let signatureBase58 = null;
  let signatureIndex = 0;

  if (JUPITER_RFQ_SWAP_MODE === "strict") {
    transaction.sign([maker]);
    const makerSignature = findNonZeroSignature(transaction.signatures);
    signatureBase58 = makerSignature ? bs58.encode(makerSignature) : null;
  } else {
    const compat = injectMakerSignatureCompat(transaction, maker);
    signatureBase58 = compat.signatureBase58;
    signatureIndex = compat.signatureIndex;
  }

  let simulation = null;
  if (JUPITER_RFQ_SIMULATE_SWAP && JUPITER_RFQ_SWAP_MODE === "strict") {
    simulation = await connection.simulateTransaction(transaction, {
      commitment: "confirmed",
      replaceRecentBlockhash: true,
      sigVerify: false,
    });
    if (simulation?.value?.err) {
      return {
        status: 200,
        payload: buildRfqSwapStatePayload(String(body.quoteId ?? ""), "rejected", classifyRfqSimulationFailure(simulation), {
          txSignature: null,
          diagnostics: {
            simulated: true,
            simulationError: simulation.value.err,
            logs: simulation.value.logs || [],
          },
        }),
      };
    }
  }
  if (JUPITER_RFQ_SEND_TRANSACTION && JUPITER_RFQ_SWAP_MODE !== "strict") {
    return {
      status: 200,
      payload: buildRfqSwapStatePayload(String(body.quoteId ?? ""), "rejected", "strictModeRequiredForBroadcast", {
        txSignature: null,
      }),
    };
  }
  if (JUPITER_RFQ_SEND_TRANSACTION) {
    const wire = transaction.serialize();
    const txid = await connection.sendRawTransaction(wire, {
      skipPreflight: false,
      maxRetries: 2,
      preflightCommitment: "confirmed",
    });
    return {
      status: 200,
      payload: buildRfqSwapStatePayload(String(body.quoteId ?? ""), "accepted", null, {
        txSignature: txid,
      }),
    };
  }
  return {
    status: 200,
    payload: buildRfqSwapStatePayload(String(body.quoteId ?? ""), "accepted", null, {
      txSignature: signatureBase58,
      diagnostics: {
        simulated: Boolean(simulation),
        executionMode: JUPITER_RFQ_SWAP_MODE === "strict" ? "maker_sign_and_optional_simulation" : "toolkit_compat_sign_slot_replace",
        signatureIndex,
      },
    }),
  };
}

function notConfiguredPayload(kind) {
  return {
    ok: false,
    error: `${kind.toUpperCase()}_UPSTREAM_NOT_CONFIGURED`,
    protocol: "sterlingdex",
    note:
      "The public protocol surface is published, but this execution endpoint is not wired to a public HTTPS Sterling backend yet.",
    required_env:
      kind === "quote"
        ? "STERLING_PUBLIC_QUOTE_UPSTREAM_URL"
        : "STERLING_PUBLIC_SWAP_UPSTREAM_URL",
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    sendJson(res, 200, {
      ok: true,
      protocol: "sterlingdex",
      endpoints: ["/health", "/status", "/tokenlist", "/tokens", "/tokens/:mint", "/registry/canonical", "/pools", "/pools/:poolId", "/pairs", "/pairs/:pairId", "/quote", "/proof/pools/:poolId", "/proof/pairs/:pairId", "/proof/tokens/:mint", "/swap", "/program/schema", "/program/idl", "/integrations/jupiter/metis/amm-spec", "/integrations/jupiter/metis/market", "/integrations/jupiter/metis/accounts-to-update", "/integrations/jupiter/rfq", "/integrations/jupiter/rfq/tokens", "/integrations/jupiter/rfq/quote", "/integrations/jupiter/rfq/swap", "/integrations/openocean/source/status", "/integrations/openocean/source/market", "/integrations/openocean/source/pairs", "/integrations/openocean/source/tokenList", "/integrations/openocean/source/dexList", "/integrations/openocean/source/quote", "/integrations/openocean/source/swap_quote", "/integrations/dexscreener/status", "/integrations/dexscreener/pair", "/integrations/dexscreener/activity", "/integrations/dexscreener/indexing-pack", "/recognition/public-pack", "/openapi.json"],
      note: "Minimal public SterlingDEX protocol surface.",
      jupiterRfqSwapMode: JUPITER_RFQ_SWAP_MODE,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/jupiter/rfq") {
    sendJson(res, 200, {
      ok: true,
      integration: "jupiter_rfq",
      status: "public_webhook_ready_registration_pending",
      baseUrl: "/integrations/jupiter/rfq",
      endpoints: {
        tokens: {
          method: "GET",
          path: "/integrations/jupiter/rfq/tokens",
        },
        quote: {
          method: "POST",
          path: "/integrations/jupiter/rfq/quote",
        },
        swap: {
          method: "POST",
          path: "/integrations/jupiter/rfq/swap",
        },
      },
      apiKeyRequired: Boolean(String(process.env.JUPITER_RFQ_API_KEY || "").trim()),
      mode: JUPITER_RFQ_SWAP_MODE,
      canonicalPool: {
        poolId: CANONICAL_POOL.poolId,
        pairId: CANONICAL_POOL.pairId,
        baseMint: CANONICAL_POOL.baseMint,
        quoteMint: CANONICAL_POOL.quoteMint,
      },
      note: "Base discovery endpoint for Jupiter RFQ webhook registration. Use the concrete sub-routes for requests.",
    });
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "sterlingdex-public-surface",
      protocol: "sterlingdex",
      healthy: true,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/status") {
    sendJson(res, 200, await buildPublicStatusPayload());
    return;
  }

  if (req.method === "GET" && pathname === "/tokenlist") {
    sendJson(res, 200, loadJson("sterlingdex_tokenlist.json"));
    return;
  }

  if (req.method === "GET" && pathname === "/tokens") {
    sendJson(res, 200, await buildPublicTokensPayload());
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/jupiter/rfq/tokens") {
    const auth = requireRfqApiKey(req);
    if (auth) {
      sendJson(res, auth.status, auth.payload);
      return;
    }
    sendJson(res, 200, [CANONICAL_POOL.baseMint, CANONICAL_POOL.quoteMint, CANONICAL_POOL.settlementMint, USDT_MINT]);
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/jupiter/metis/amm-spec") {
    sendJson(res, 200, buildJupiterMetisAmmSpec(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/jupiter/metis/market") {
    sendJson(res, 200, buildJupiterMetisMarket(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/jupiter/metis/accounts-to-update") {
    const pool = await getCanonicalPoolState();
    sendJson(res, 200, {
      ok: true,
      schema: "sterling_jupiter_metis_accounts_to_update_v1",
      poolId: pool.poolId,
      accounts: buildJupiterMetisAccountsToUpdate(pool),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/status") {
    sendJson(res, 200, buildOpenOceanSourceStatus(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/market") {
    sendJson(res, 200, buildOpenOceanSourceMarket(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/pairs") {
    sendJson(res, 200, buildOpenOceanSourcePairs(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/tokenList") {
    sendJson(res, 200, buildOpenOceanTokenList(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/dexList") {
    sendJson(res, 200, buildOpenOceanDexList());
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/dexscreener/status") {
    sendJson(res, 200, buildDexScreenerStatus(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/dexscreener/pair") {
    sendJson(res, 200, buildDexScreenerPairSignal(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/dexscreener/activity") {
    sendJson(res, 200, buildDexScreenerActivitySignal(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/dexscreener/indexing-pack") {
    sendJson(res, 200, buildDexScreenerIndexingPack(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/recognition/public-pack") {
    sendJson(res, 200, await buildPublicRecognitionPack(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/program/schema") {
    sendJson(res, 200, PROGRAM_SCHEMA);
    return;
  }

  if (req.method === "GET" && pathname === "/program/idl") {
    sendJson(res, 200, loadJson("public-api/program.idl.json"));
    return;
  }

  if (req.method === "GET" && pathname === "/registry/canonical") {
    sendJson(res, 200, await buildCanonicalRegistryBundle(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/tokens/")) {
    const mint = decodeURIComponent(pathname.slice("/tokens/".length));
    const token = findCanonicalToken(mint);
    if (!token) {
      sendJson(res, 404, { ok: false, error: "TOKEN_NOT_FOUND", mint });
      return;
    }
    sendJson(res, 200, buildCanonicalTokenResource(token, await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === `/proof/pools/${CANONICAL_POOL.poolId}`) {
    const pool = await getCanonicalPoolState();
    sendJson(res, 200, buildCanonicalPoolProof(pool));
    return;
  }

  if (req.method === "GET" && pathname === `/proof/pairs/${CANONICAL_POOL.pairId}`) {
    const pool = await getCanonicalPoolState();
    sendJson(res, 200, buildCanonicalPairProof(pool));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/proof/tokens/")) {
    const mint = decodeURIComponent(pathname.slice("/proof/tokens/".length));
    const token = findCanonicalToken(mint);
    if (!token) {
      sendJson(res, 404, { ok: false, error: "TOKEN_NOT_FOUND", mint });
      return;
    }
    sendJson(res, 200, buildCanonicalTokenProof(token, await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/pools") {
    sendJson(res, 200, await buildPublicPoolsPayload());
    return;
  }

  if (req.method === "GET" && pathname === `/pools/${CANONICAL_POOL.poolId}`) {
    const payload = await buildPublicPoolsPayload();
    sendJson(res, 200, payload.pools?.[0] || buildCanonicalPoolRecord(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/pairs") {
    sendJson(res, 200, await buildPublicPairsPayload());
    return;
  }

  if (req.method === "GET" && pathname === `/pairs/${CANONICAL_POOL.pairId}`) {
    const payload = await buildPublicPairsPayload();
    sendJson(res, 200, payload.pairs?.[0] || buildCanonicalPairRecord(await getCanonicalPoolState()));
    return;
  }

  if (req.method === "GET" && pathname === "/openapi.json") {
    sendJson(res, 200, loadJson("public-api/openapi.json"));
    return;
  }

  if (req.method === "POST" && pathname === "/quote") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw.trim() ? JSON.parse(raw) : {};
    if (isCanonicalQuoteRequest(body)) {
      const out = await buildCanonicalQuoteResponse(body);
      sendJson(res, out.status, out.payload);
      return;
    }
    const upstream = process.env.STERLING_PUBLIC_QUOTE_UPSTREAM_URL || "";
    if (!upstream) {
      sendJson(res, 501, {
        ...notConfiguredPayload("quote"),
        request_schema: {
          mint: "string?",
          inputMint: "string",
          poolId: "string?",
          target: "USDC|USDT?",
          outputMint: "string?",
          amount: "string",
          slippageBps: "number?",
          quoteOnly: true,
        },
      });
      return;
    }
    const proxied = await proxyJson(upstream, body);
    sendJson(res, proxied.status, proxied.body);
    return;
  }

  if (req.method === "POST" && pathname === "/integrations/jupiter/rfq/quote") {
    const auth = requireRfqApiKey(req);
    if (auth) {
      sendJson(res, auth.status, auth.payload);
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw.trim() ? JSON.parse(raw) : {};
    const out = await buildJupiterRfqQuoteResponse(body);
    sendJson(res, out.status, out.payload);
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/quote") {
    const out = await buildOpenOceanSourceQuotePayload(Object.fromEntries(url.searchParams.entries()));
    sendJson(res, out.status, out.payload);
    return;
  }

  if (req.method === "POST" && pathname === "/swap") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw.trim() ? JSON.parse(raw) : {};
    if (isCanonicalQuoteRequest(body)) {
      const out = await buildCanonicalSwapIntentResponse(body);
      sendJson(res, out.status, out.payload);
      return;
    }
    const upstream = process.env.STERLING_PUBLIC_SWAP_UPSTREAM_URL || "";
    if (!upstream) {
      sendJson(res, 501, {
        ...notConfiguredPayload("swap"),
        request_schema: {
          mint: "string?",
          inputMint: "string",
          poolId: "string?",
          target: "USDC|USDT?",
          outputMint: "string?",
          amount: "string",
          userPublicKey: "string",
          slippageBps: "number?",
        },
      });
      return;
    }
    const proxied = await proxyJson(upstream, body);
    sendJson(res, proxied.status, proxied.body);
    return;
  }

  if (req.method === "GET" && pathname === "/integrations/openocean/source/swap_quote") {
    const out = await buildOpenOceanSourceSwapQuotePayload(Object.fromEntries(url.searchParams.entries()));
    sendJson(res, out.status, out.payload);
    return;
  }

  if (req.method === "POST" && pathname === "/integrations/jupiter/rfq/swap") {
    const auth = requireRfqApiKey(req);
    if (auth) {
      sendJson(res, auth.status, auth.payload);
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw.trim() ? JSON.parse(raw) : {};
    if (!String(body?.quoteId ?? "").trim() || !String(body?.requestId ?? "").trim() || !String(body?.transaction ?? "").trim()) {
      sendJson(res, 400, {
        error: "BAD_REQUEST_SWAP",
        note: "Swap RFQ Jupiter attend requestId, quoteId et transaction base64.",
        mode: JUPITER_RFQ_SWAP_MODE,
      });
      return;
    }
    const special = buildSpecialRfqSwapResponse(body);
    if (special) {
      sendJson(res, special.status, special.payload);
      return;
    }
    const cachedQuote = getCachedRfqQuote(body.quoteId);
    if (cachedQuote && String(cachedQuote.requestId || "") && String(cachedQuote.requestId) !== String(body.requestId)) {
      sendJson(res, 200, {
        quoteId: String(body.quoteId ?? ""),
        state: "rejected",
        rejectionReason: "quoteContextMismatch",
        mode: JUPITER_RFQ_SWAP_MODE,
      });
      return;
    }
    try {
      const out = await simulateAndMaybeBroadcastRfqTransaction(body);
      sendJson(res, out.status, out.payload);
    } catch (error) {
      sendJson(
        res,
        200,
        buildRfqSwapStatePayload(String(body?.quoteId ?? ""), "rejected", String(error?.message || error || "rfqSwapExecutionFailed"), {
          mode: JUPITER_RFQ_SWAP_MODE,
        }),
      );
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "NOT_FOUND", pathname });
});

server.listen(port, host, () => {
  const statusPath = path.join(__dirname, "public-api/status.json");
  const hasStatus = existsSync(statusPath);
  console.log(
    JSON.stringify({
      ok: true,
      service: "sterlingdex-public-surface",
      host,
      port,
      hasStatus,
      endpoints: ["/health", "/status", "/tokenlist", "/tokens", "/tokens/:mint", "/registry/canonical", "/pools", "/pairs", "/quote", "/proof/pools/:poolId", "/proof/pairs/:pairId", "/proof/tokens/:mint", "/swap", "/program/schema", "/program/idl", "/integrations/jupiter/metis/amm-spec", "/integrations/jupiter/metis/market", "/integrations/jupiter/metis/accounts-to-update", "/integrations/jupiter/rfq", "/integrations/jupiter/rfq/tokens", "/integrations/jupiter/rfq/quote", "/integrations/jupiter/rfq/swap", "/integrations/openocean/source/status", "/integrations/openocean/source/market", "/integrations/openocean/source/pairs", "/integrations/openocean/source/tokenList", "/integrations/openocean/source/dexList", "/integrations/openocean/source/quote", "/integrations/openocean/source/swap_quote", "/integrations/dexscreener/status", "/integrations/dexscreener/pair", "/integrations/dexscreener/activity", "/integrations/dexscreener/indexing-pack", "/recognition/public-pack", "/openapi.json"],
      jupiterRfqSwapMode: JUPITER_RFQ_SWAP_MODE,
    }),
  );
});
