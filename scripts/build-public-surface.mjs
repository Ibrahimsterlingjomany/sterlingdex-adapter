import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const SOLANA_RPC_URL = process.env.STERLINGDEX_RPC_URL || "https://api.mainnet-beta.solana.com";
const publicBaseUrl = process.env.STERLINGDEX_PUBLIC_BASE_URL || null;
const hasQuoteUpstream = true;
const hasSwapUpstream = true;
const localIdlUrl = process.env.STERLINGDEX_IDL_SOURCE_URL || "http://127.0.0.1:8000/idl";
const HTOP_STM_RESERVE_ATA = "2CRon3SyMyvy2i7hourX99kiuoTKpLgQ3ebogrpfDorq";
const HTOP_SJBC_RESERVE_ATA = "HEy89xU9gkEi9FXGLvzT61i3pM2kTW5MzvqcCDsB7EmQ";
const TREASURY_USDC_ATA = "2NUyY9XfzZ6dHZwRtQMt5oBHhZLNdwTBKwVbjrPwEDGN";
const CANONICAL_USDC_COFFRE = "7vWLrATXnuGTCjmexa7b4roo9Em6VMKr3bdDemJNHNk1";
const CANONICAL_USDT_COFFRE = "GTAs9L3XFdhHEFoo6KWNbFFxMCFRnbVomsbx7deShkLb";
const NOMINAL_SOVEREIGN_RESERVE_UI = 1_000_000_000;

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(rootDir, relPath), "utf8"));
}

function readJsonIfExists(relPath, fallback = null) {
  try {
    return readJson(relPath);
  } catch {
    return fallback;
  }
}

function writeJson(relPath, payload) {
  const fullPath = path.join(repoDir, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}:${url}`);
  }
  return response.json();
}

function readJsonFromRepo(relPath) {
  return JSON.parse(readFileSync(path.join(repoDir, relPath), "utf8"));
}

function targetMintFromSymbol(target) {
  if (String(target || "").toUpperCase() === "USDT") return USDT_MINT;
  return USDC_MINT;
}

const canonicalTokenlist = readJson("tokenlist/tokenlist.json");
const valueRegistry = readJson("chain/value_registry.json");
const hardPools = readJson("chain/hard_liquidity_pools.json");
const legacySnapshot = JSON.parse(readFileSync(path.join(repoDir, "all_pools_snapshot.json"), "utf8"));
const decemberFeeInventory = readJsonIfExists("reports/december_2025_pool_fee_inventory.json", {});
const rebuiltTicketReport = readJsonIfExists("reports/fee_claim_ticket_route_rebuild_2026-04-13.json", {});
const mainnetInventory = readJsonIfExists("reports/sterling_mainnet_inventory_20260403T030339Z.json", {});

const tokenMap = new Map(
  (canonicalTokenlist.tokens || []).map((token) => [token.address, token]),
);
const registryMints = valueRegistry.mints || {};
const hardPoolRows = hardPools.pools || [];

const sjbcMint = "EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2";
const stmMint = "9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb";
const sjbcRow = registryMints[sjbcMint] || null;
const stmRow = registryMints[stmMint] || null;
const sjbcToken = tokenMap.get(sjbcMint) || {};
const stmToken = tokenMap.get(stmMint) || {};
const STABLE_VALUE_MODEL = {
  stableValueSymbol: "USD",
  stableValueUsd: 1,
  settlementMint: USDC_MINT,
  settlementSymbol: "USDC",
  supportedPayoutSymbols: ["USDC", "USDT", "SOL"],
  quoteAssetSymbol: "SJBC",
  quoteAssetRole: "USD_VALUE_BRIDGE_ASSET",
  meaning:
    "La pool on-chain reste STM/SJBC. Le USD ici designe la couche de valeur/stable settlement exposee publiquement, avec USDC comme mint canonique de sortie.",
};

function roundUsd(value) {
  return Number(Number(value || 0).toFixed(6));
}

function formatUsdCompact(value) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(4)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return amount.toFixed(2);
}

async function getTokenAccountBalance(account) {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountBalance",
      params: [account],
    }),
  });
  if (!response.ok) throw new Error(`rpc_failed:${response.status}`);
  const data = await response.json();
  const value = data?.result?.value || {};
  return {
    amount: String(value.amount || "0"),
    decimals: Number(value.decimals || 0),
    uiAmountString: String(value.uiAmountString || "0"),
  };
}

async function buildSovereignBackingMetrics() {
  const reserveRows = await Promise.all([
    getTokenAccountBalance(HTOP_STM_RESERVE_ATA).then((balance) => ({
      reserveRole: "HTOP_STM_RESERVE",
      account: HTOP_STM_RESERVE_ATA,
      mint: stmMint,
      symbol: "STM",
      amountRaw: balance.amount,
      amountUi: balance.uiAmountString,
      observedAmountRaw: balance.amount,
      observedAmountUi: balance.uiAmountString,
      observedStableValueUsd: Number(balance.uiAmountString || "0"),
      guaranteedAmountUi: String(NOMINAL_SOVEREIGN_RESERVE_UI),
      guaranteedStableValueUsd: NOMINAL_SOVEREIGN_RESERVE_UI,
      stableValueUsd: NOMINAL_SOVEREIGN_RESERVE_UI,
    })),
    getTokenAccountBalance(HTOP_SJBC_RESERVE_ATA).then((balance) => ({
      reserveRole: "HTOP_SJBC_RESERVE",
      account: HTOP_SJBC_RESERVE_ATA,
      mint: sjbcMint,
      symbol: "SJBC",
      amountRaw: balance.amount,
      amountUi: balance.uiAmountString,
      observedAmountRaw: balance.amount,
      observedAmountUi: balance.uiAmountString,
      observedStableValueUsd: Number(balance.uiAmountString || "0"),
      guaranteedAmountUi: String(NOMINAL_SOVEREIGN_RESERVE_UI),
      guaranteedStableValueUsd: NOMINAL_SOVEREIGN_RESERVE_UI,
      stableValueUsd: NOMINAL_SOVEREIGN_RESERVE_UI,
    })),
  ]);
  const totalUsd = reserveRows.reduce((sum, row) => sum + Number(row.guaranteedStableValueUsd || 0), 0);
  const observedLiveTotalUsd = reserveRows.reduce((sum, row) => sum + Number(row.observedStableValueUsd || 0), 0);
  return {
    schema: "sterling_sovereign_backing_v1",
    poolId: "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G",
    model: "system_stable_value_usd",
    stableValueSymbol: STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueUsd: STABLE_VALUE_MODEL.stableValueUsd,
    settlementMint: STABLE_VALUE_MODEL.settlementMint,
    settlementSymbol: STABLE_VALUE_MODEL.settlementSymbol,
    reserveCount: reserveRows.length,
    reserves: reserveRows,
    totalUsd,
    totalUsdMicros: String(Math.round(totalUsd * 1_000_000)),
    totalUsdCompact: formatUsdCompact(totalUsd),
    declaredGuaranteeUsd: totalUsd,
    declaredGuaranteeUsdMicros: String(Math.round(totalUsd * 1_000_000)),
    declaredGuaranteeUsdCompact: formatUsdCompact(totalUsd),
    observedLiveTotalUsd,
    observedLiveTotalUsdMicros: String(Math.round(observedLiveTotalUsd * 1_000_000)),
    observedLiveTotalUsdCompact: formatUsdCompact(observedLiveTotalUsd),
    payoutVaults: {
      usdc: CANONICAL_USDC_COFFRE,
      usdt: CANONICAL_USDT_COFFRE,
      treasuryUsdcAta: TREASURY_USDC_ATA,
    },
    sources: ["live_solana_rpc", "treasury_transfer_proofs"],
    note:
      "La garantie publique declaree suit le modele Sterling USD=1 avec 1 milliard STM + 1 milliard SJBC. Les soldes live observes restent exposes a part et peuvent varier sans changer la garantie nominale du systeme.",
  };
}

function buildDecemberFeeMetrics() {
  return {
    schema: "sterling_fee_snapshot_v1",
    period: "2025-12",
    poolId: decemberFeeInventory.pool || "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G",
    swapCount: Number(decemberFeeInventory.december_2025_swap_count || 0),
    volumeUsdEstimate: Number(decemberFeeInventory.december_2025_volume_usd || 0),
    feesUsdEstimate: Number(decemberFeeInventory.december_2025_fees_usd_est || 0),
    sourceSwapLog: decemberFeeInventory.source_swap_log || null,
    note:
      "Ces fees viennent du journal de swaps de decembre 2025 pour la pool canonique BbvR. Elles representent le stock historique gagne, pas un payout deja execute.",
  };
}

function buildPayableTicketMetrics() {
  const rebuiltFamilies = Array.from(
    new Set((rebuiltTicketReport.results || []).map((row) => String(row.claim_id || "").trim()).filter(Boolean)),
  );
  const receiptsDir = path.join(rootDir, "output", "receipts");
  const rows = [];
  for (const file of readdirSync(receiptsDir)) {
    if (!file.startsWith("settlement_receipt_BbvR4zUAwZF8LmVFLXNpDy3C_usdc_") || !file.endsWith(".json")) continue;
    const raw = JSON.parse(readFileSync(path.join(receiptsDir, file), "utf8"));
    const claimId = String(raw.claim_id || "").trim();
    if (!rebuiltFamilies.includes(claimId)) continue;
    const ticketId = String(raw.ticket_id || file.replace(/^settlement_receipt_/, "").replace(/\.json$/, ""));
    const ticketValueUsdMicros = Number(raw.ticket_value_usd_micros || 0);
    const paidUsdEquivalentMicros = Number(raw.paid_usd_equivalent_micros || 0);
    const remainingUsdEquivalentMicros = Number(
      raw.remaining_usd_equivalent_micros ?? Math.max(ticketValueUsdMicros - paidUsdEquivalentMicros, 0),
    );
    rows.push({
      claimId,
      ticketId,
      status: String(raw.status || "UNKNOWN"),
      ticketValueUsdMicros,
      paidUsdEquivalentMicros,
      remainingUsdEquivalentMicros,
    });
  }
  const deduped = new Map();
  for (const row of rows.sort((a, b) => a.ticketId.localeCompare(b.ticketId))) {
    deduped.set(row.ticketId, row);
  }
  const values = Array.from(deduped.values());
  const claimFamilies = rebuiltFamilies.map((claimId) => ({
    claimId,
    tickets: values.filter((row) => row.claimId === claimId).length,
  }));
  const ticketCount = values.length;
  const payableUsd = values.reduce((sum, row) => sum + row.ticketValueUsdMicros, 0) / 1_000_000;
  const paidUsd = values.reduce((sum, row) => sum + row.paidUsdEquivalentMicros, 0) / 1_000_000;
  const remainingUsd = values.reduce((sum, row) => sum + row.remainingUsdEquivalentMicros, 0) / 1_000_000;
  return {
    schema: "sterling_payable_ticket_batch_v1",
    batch: "reconstructed_fee_claims",
    destinationAta: rebuiltTicketReport.destination || TREASURY_USDC_ATA,
    rebuiltClaimFamilies: claimFamilies,
    rebuiltClaimFamilyCount: claimFamilies.length,
    ticketCount,
    status: "ROUTING",
    payableUsd,
    paidUsd,
    remainingUsd,
    payableUsdMicros: String(Math.round(payableUsd * 1_000_000)),
    remainingUsdMicros: String(Math.round(remainingUsd * 1_000_000)),
    note:
      "Ce lot correspond aux tickets fees reconstruits et rendus payables. Ils sont visibles en ROUTING tant que le payout final souverain n'est pas encore execute.",
  };
}

function buildClaimsAndDebtMetrics() {
  const counts = mainnetInventory.account_counts || {};
  const configParsed = mainnetInventory.config?.partial?.parsed || {};
  return {
    schema: "sterling_claims_and_debt_v1",
    poolId: configParsed.pool_id || "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G",
    protocolDebtLedger: "2Fr4WPEC51CUtDdqArStKMmTEuippeHMHFCH46mjgxQv",
    settlementClaimAccounts: Number(counts.SettlementClaim || 0),
    payoutTicketAccounts: Number(counts.PayoutTicket || 0),
    protocolDebtLedgersCount: Array.isArray(mainnetInventory.protocol_debt_ledgers)
      ? mainnetInventory.protocol_debt_ledgers.length
      : 0,
    treasuryValueUsdMicros: String(configParsed.treasury_value_usd_micros || "0"),
    treasuryUsdcAta: String(configParsed.treasury_usdc_ata || TREASURY_USDC_ATA),
    usdcCoffre: String(configParsed.usdc_coffre || CANONICAL_USDC_COFFRE),
    claimFamily: "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_*",
    ticketFocus: "BbvR4zUAwZF8LmVFLXNpDy3C_usdc_34884160c99add9d412ee77e_T4",
    note:
      "Ces chiffres rendent visibles la couche claims/tickets/debt du programme sans pretendre qu'un payout final a deja ete execute.",
  };
}

const sovereignBacking = await buildSovereignBackingMetrics();
const decemberFeeMetrics = buildDecemberFeeMetrics();
const payableTicketMetrics = buildPayableTicketMetrics();
const claimsAndDebtMetrics = buildClaimsAndDebtMetrics();

const pairs = [];

if (sjbcRow && stmRow && sjbcRow.pool_id && sjbcRow.pool_id === stmRow.pool_id) {
  const target = String(stmRow.target || sjbcRow.target || "USDC").toUpperCase();
  pairs.push({
    pairId: "STM-SJBCUSD",
    protocolId: "sterlingdex",
    protocolName: "SterlingDEX",
    surfaceType: "STERLING_COMPAT_PAIR",
    isDexPair: true,
    programId: PROGRAM_ID,
    poolId: stmRow.pool_id,
    configPda: stmRow.pda || sjbcRow.pda || CONFIG_PDA,
    authority: stmRow.authority || sjbcRow.authority || AUTHORITY,
    baseMint: stmMint,
    baseSymbol: stmRow.symbol || stmToken.symbol || "STM",
    baseName: stmRow.name || stmToken.name || "Sterling Mint",
    baseLogoURI: stmRow.logo_uri || stmToken.logoURI || null,
    quoteMint: sjbcMint,
    quoteSymbol: sjbcRow.symbol || sjbcToken.symbol || "SJBC",
    quoteName: sjbcRow.name || sjbcToken.name || "SJBC USD",
    quoteLogoURI: sjbcRow.logo_uri || sjbcToken.logoURI || null,
    settlementMint: targetMintFromSymbol(target),
    settlementSymbol: target,
    target,
    strategy: stmRow.strategy || sjbcRow.strategy || null,
    valueUsd: stmRow.value_usd ?? sjbcRow.value_usd ?? null,
    stableValueSymbol: STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueUsd: STABLE_VALUE_MODEL.stableValueUsd,
    stableValueModel: {
      ...STABLE_VALUE_MODEL,
      settlementMint: targetMintFromSymbol(target),
      settlementSymbol: target,
    },
    sovereignBackingSummary: {
      totalUsd: sovereignBacking.totalUsd,
      totalUsdCompact: sovereignBacking.totalUsdCompact,
      reserveCount: sovereignBacking.reserveCount,
    },
    payableTicketSummary: {
      ticketCount: payableTicketMetrics.ticketCount,
      remainingUsd: payableTicketMetrics.remainingUsd,
    },
    lpMint: stmToken.extensions?.lp_mint || sjbcToken.extensions?.lp_mint || null,
    metadataURI: stmRow.metadata_uri || stmToken.extensions?.metadata_uri || null,
    routing: {
      mode: "bridge_target",
      quotePath: "/quote",
      swapPath: "/swap",
      statusPath: "/status",
    },
    notes:
      "Compatibility pair declared by Sterling as STM / SJBC USD. Settlement target remains bridge-backed and USDC-oriented.",
  });
}

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
    surfaceType: "SETTLEMENT_BRIDGE",
    isPublicDexPool: relatedPairs.length > 0,
    sources: pool.sources || [],
    listedMints: pool.mints || [],
    listedPairs: relatedPairs.map((pair) => pair.pairId),
    listedTargets: relatedPairs.map((pair) => ({
      assetMint: pair.baseMint,
      assetSymbol: pair.baseSymbol,
      settlementMint: pair.settlementMint,
      settlementSymbol: pair.settlementSymbol,
      stableValueSymbol: pair.stableValueSymbol || STABLE_VALUE_MODEL.stableValueSymbol,
      valueUsd: pair.stableValueUsd ?? pair.valueUsd ?? STABLE_VALUE_MODEL.stableValueUsd,
      routeId: pair.pairId,
    })),
    settlementMint: relatedPairs[0]?.settlementMint || USDC_MINT,
    settlementSymbol: relatedPairs[0]?.settlementSymbol || "USDC",
    stableValueSymbol: STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueUsd: STABLE_VALUE_MODEL.stableValueUsd,
    stableValueModel: {
      ...STABLE_VALUE_MODEL,
      settlementMint: relatedPairs[0]?.settlementMint || USDC_MINT,
      settlementSymbol: relatedPairs[0]?.settlementSymbol || "USDC",
    },
    sovereignBacking,
    historicalFees: decemberFeeMetrics,
    payableTickets: payableTicketMetrics,
    claimsAndDebt: claimsAndDebtMetrics,
    lpMint: relatedPairs.find((pair) => pair.lpMint)?.lpMint || matchingLegacy?.lp_token_mint || null,
    metrics: matchingLegacy
      ? {
          lastUpdated: matchingLegacy.last_updated || matchingLegacy.time || null,
          swapsTotal: matchingLegacy.swaps_total ?? null,
          volumeUsdEstimateTotal: matchingLegacy.volume_usd_est_total ?? null,
          feesUsdEstimateTotal: matchingLegacy.fees_usd_est_total ?? null,
          totalBase: matchingLegacy.TOTAL_BASE ?? null,
          totalQuote: matchingLegacy.TOTAL_QUOTE ?? null,
          sovereignBackingUsd: roundUsd(sovereignBacking.totalUsd),
          payableTicketCount: payableTicketMetrics.ticketCount,
          payableRemainingUsd: roundUsd(payableTicketMetrics.remainingUsd),
        }
      : null,
    notes:
      relatedPairs.length > 1
        ? "Sterling bridge inventory can back multiple settlement assets under one internal pool id."
        : (relatedPairs.length === 1 ? "Internal Sterling bridge route resolved from the value registry." : "Bridge inventory discovered from snapshots only; target mapping incomplete."),
  };
});

const status = {
  ok: true,
  protocolId: "sterlingdex",
  protocolName: "SterlingDEX",
  ecosystem: "SterlingChain",
  generatedAt: new Date().toISOString(),
  publicBaseUrl,
  programId: PROGRAM_ID,
  configPda: CONFIG_PDA,
  authority: AUTHORITY,
  canonicalSettlement: {
    stableValueSymbol: STABLE_VALUE_MODEL.stableValueSymbol,
    stableValueUsd: STABLE_VALUE_MODEL.stableValueUsd,
    settlementMint: STABLE_VALUE_MODEL.settlementMint,
    settlementSymbol: STABLE_VALUE_MODEL.settlementSymbol,
    supportedPayoutSymbols: STABLE_VALUE_MODEL.supportedPayoutSymbols,
    meaning: STABLE_VALUE_MODEL.meaning,
  },
  sovereignBacking,
  historicalFees: decemberFeeMetrics,
  payableTickets: payableTicketMetrics,
  claimsAndDebt: claimsAndDebtMetrics,
  capabilities: {
    tokenlist: true,
    tokens: true,
    token: true,
    pools: true,
    pool: true,
    pairs: true,
    pair: true,
    canonicalRegistry: true,
    quote: hasQuoteUpstream,
    swap: hasSwapUpstream,
    programIdl: true,
    jupiterMetisAmmSpec: true,
    jupiterMetisMarket: true,
    jupiterMetisAccountsToUpdate: true,
    jupiterRfqQuote: true,
    jupiterRfqTokens: true,
    jupiterRfqSwap: true,
    openoceanSourceStatus: true,
    openoceanSourceMarket: true,
    openoceanSourcePairs: true,
    openoceanSourceTokenList: true,
    openoceanSourceDexList: true,
    openoceanSourceQuote: true,
    openoceanSourceSwapQuote: true,
    dexscreenerStatus: true,
    dexscreenerPair: true,
    dexscreenerActivity: true,
    dexscreenerIndexingPack: true,
    publicRecognitionPack: true,
  },
  endpoints: {
    health: "/health",
    status: "/status",
    tokenlist: "/tokenlist",
    tokens: "/tokens",
    token: "/tokens/:mint",
    programSchema: "/program/schema",
    programIdl: "/program/idl",
    canonicalRegistry: "/registry/canonical",
    pools: "/pools",
    pool: "/pools/:poolId",
    pairs: "/pairs",
    pair: "/pairs/:pairId",
    quote: "/quote",
    proofToken: "/proof/tokens/:mint",
    proofPool: "/proof/pools/:poolId",
    proofPair: "/proof/pairs/:pairId",
    swap: "/swap",
    jupiterMetisAmmSpec: "/integrations/jupiter/metis/amm-spec",
    jupiterMetisMarket: "/integrations/jupiter/metis/market",
    jupiterMetisAccountsToUpdate: "/integrations/jupiter/metis/accounts-to-update",
    jupiterRfq: "/integrations/jupiter/rfq",
    jupiterRfqTokens: "/integrations/jupiter/rfq/tokens",
    jupiterRfqQuote: "/integrations/jupiter/rfq/quote",
    jupiterRfqSwap: "/integrations/jupiter/rfq/swap",
    openoceanSourceStatus: "/integrations/openocean/source/status",
    openoceanSourceMarket: "/integrations/openocean/source/market",
    openoceanSourcePairs: "/integrations/openocean/source/pairs",
    openoceanSourceTokenList: "/integrations/openocean/source/tokenList",
    openoceanSourceDexList: "/integrations/openocean/source/dexList",
    openoceanSourceQuote: "/integrations/openocean/source/quote",
    openoceanSourceSwapQuote: "/integrations/openocean/source/swap_quote",
    dexscreenerStatus: "/integrations/dexscreener/status",
    dexscreenerPair: "/integrations/dexscreener/pair",
    dexscreenerActivity: "/integrations/dexscreener/activity",
    dexscreenerIndexingPack: "/integrations/dexscreener/indexing-pack",
    publicRecognitionPack: "/recognition/public-pack",
  },
  publishableNow: [
    "Canonical token metadata for SJBC and STM",
    "Protocol identity, program id and config pda",
    "Explicit USD stable-value layer and canonical USDC settlement mapping wired",
    "Live sovereign backing visible in USD on public surfaces",
    "Historical fee metrics and payable ticket batch visible on public surfaces",
    "Claims and debt layer visible on public surfaces",
    "Settlement bridge registry surface",
    "Bridge target registry surface",
    "Dedicated canonical pool endpoint wired",
    "Dedicated canonical pair endpoint wired",
    "Dedicated canonical token endpoint wired",
    "Dedicated canonical registry endpoint wired",
    "Public program IDL snapshot wired",
    "Jupiter Metis AMM spec endpoint wired",
    "Jupiter Metis market params endpoint wired",
    "Jupiter Metis accounts-to-update endpoint wired",
    "Public canonical quote endpoint wired",
    "Public canonical swap intent endpoint wired",
    "Public canonical token proof endpoint wired",
    "Public canonical pool proof endpoint wired",
    "Public canonical pair proof endpoint wired",
    "Jupiter RFQ-compatible tokens endpoint wired",
    "Jupiter RFQ-compatible quote endpoint wired",
    "Jupiter RFQ-compatible swap execution surface wired",
    "OpenOcean source adapter status endpoint wired",
    "OpenOcean source adapter market endpoint wired",
    "OpenOcean source adapter pairs endpoint wired",
    "OpenOcean source adapter tokenList endpoint wired",
    "OpenOcean source adapter dexList endpoint wired",
    "OpenOcean source adapter quote endpoint wired",
    "OpenOcean source adapter swap_quote endpoint wired",
    "DexScreener status endpoint wired",
    "DexScreener pair signal endpoint wired",
    "DexScreener activity signal endpoint wired",
    "DexScreener indexing pack endpoint wired",
    "Public recognition pack endpoint wired",
  ],
  remainingBlockers: [
    "Jupiter onboarding/registration is still required on their side",
    "OpenOcean still needs source onboarding/whitelisting for a custom Solana source",
    "DexScreener and other indexers still need dedicated ingestion of the custom program/pool",
    "CoinGecko and Solscan still need authenticated manual submission and review",
  ],
};

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "SterlingDEX Public Surface",
    version: "0.1.0",
    description: "Surface publique canonique de SterlingDEX pour la paire BbvR / STM / SJBC, avec preuve de pool, quote standard et swap intent public.",
  },
  servers: [
    {
      url: publicBaseUrl || "https://your-public-sterlingdex-domain.example",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Public surface health",
        responses: {
          "200": { description: "Health payload" },
        },
      },
    },
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
    "/tokens": {
      get: {
        summary: "Canonical SterlingDEX token resources",
        description: "Expose les tokens publics avec leurs roles, relations pool/pair et sources de verite publiques.",
        responses: {
          "200": { description: "Token resources JSON" },
        },
      },
    },
    "/tokens/{mint}": {
      get: {
        summary: "Canonical SterlingDEX token resource",
        description: "Expose un token public unique, avec son role, ses relations canoniques et ses endpoints de preuve.",
        parameters: [
          {
            name: "mint",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Detailed token resource" },
          "404": { description: "Unknown token mint" },
        },
      },
    },
    "/program/schema": {
      get: {
        summary: "Public SterlingDEX program schema",
        description: "Expose un schema public du programme et de la pool canonique pour les integrateurs, en supplement de l'IDL prive qui n'expose pas encore les comptes/types complets.",
        responses: {
          "200": { description: "Program schema JSON" },
        },
      },
    },
    "/program/idl": {
      get: {
        summary: "Public SterlingDEX IDL snapshot",
        description: "Expose le snapshot public actuel de l'IDL servi par 8000, utile pour les parseurs et integrateurs.",
        responses: {
          "200": { description: "IDL snapshot JSON" },
        },
      },
    },
    "/integrations/jupiter/metis/amm-spec": {
      get: {
        summary: "Jupiter Metis AMM integration spec for SterlingDEX",
        description: "Expose le mapping explicite entre la pool canonique SterlingDEX et le trait Amm attendu par Jupiter Metis.",
        responses: {
          "200": { description: "Jupiter Metis AMM spec JSON" },
        },
      },
    },
    "/integrations/jupiter/metis/market": {
      get: {
        summary: "Jupiter Metis market params",
        description: "Expose un objet de type market/params pour aider une implementation Amm Jupiter a reconstruire le contexte du marche SterlingDEX.",
        responses: {
          "200": { description: "Jupiter Metis market JSON" },
        },
      },
    },
    "/integrations/jupiter/metis/accounts-to-update": {
      get: {
        summary: "Jupiter Metis accounts to update",
        description: "Expose la liste canonique des comptes a mettre en cache et a rafraichir pour quote/update dans une implementation Amm Jupiter.",
        responses: {
          "200": { description: "Accounts to update JSON" },
        },
      },
    },
    "/registry/canonical": {
      get: {
        summary: "Canonical machine-readable SterlingDEX registry bundle",
        description: "Bundle machine-readable unique reliant programme, tokens, pair, pool, preuves, quote, swap et integrations publiques.",
        responses: {
          "200": { description: "Canonical registry bundle JSON" },
        },
      },
    },
    "/pools": {
      get: {
        summary: "Canonical public pool surface",
        responses: {
          "200": { description: "Pool registry JSON" },
        },
      },
    },
    "/pools/{poolId}": {
      get: {
        summary: "Canonical public pool resource",
        description: "Expose la pool canonique comme entite DEX publique unique, avec LP, vaults, reserves, fee model et endpoints associes.",
        parameters: [
          {
            name: "poolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Detailed pool resource" },
        },
      },
    },
    "/pairs": {
      get: {
        summary: "Canonical public pair surface",
        responses: {
          "200": { description: "Pair registry JSON" },
        },
      },
    },
    "/pairs/{pairId}": {
      get: {
        summary: "Canonical public pair resource",
        description: "Expose la paire canonique comme ressource DEX publique, avec mints, reserves, LP, fee model, endpoints quote/swap et source de verite.",
        parameters: [
          {
            name: "pairId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Detailed pair resource" },
        },
      },
    },
    "/quote": {
      post: {
        summary: "Request a canonical SterlingDEX pool quote",
        description: "amount et expected_out sont exposes en raw et en UI. Le quote est un test de swap, pas la liquidite totale de la pool.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["inputMint", "amount"],
                properties: {
                  mint: { type: "string" },
                  inputMint: { type: "string" },
                  poolId: { type: "string" },
                  target: { type: "string", enum: ["USDC", "USDT"] },
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
          "200": { description: "Standard quote response with standard_quote schema" },
          "501": { description: "Public quote upstream not configured yet" },
        },
      },
    },
    "/integrations/jupiter/rfq": {
      get: {
        summary: "Jupiter RFQ base discovery endpoint",
        description: "Expose le point d'entree de decouverte de la surface RFQ publique SterlingDEX et liste les sous-routes utilisables par Jupiter.",
        responses: {
          "200": { description: "Jupiter RFQ discovery payload" },
          "401": { description: "Missing or invalid X-API-KEY when protection is enabled" },
        },
      },
    },
    "/integrations/jupiter/rfq/tokens": {
      get: {
        summary: "Jupiter RFQ compatible token list",
        description: "Expose la liste minimale des mints supportes par la surface RFQ publique SterlingDEX. Supporte X-API-KEY si configure.",
        responses: {
          "200": { description: "Array of token mint strings" },
          "401": { description: "Missing or invalid X-API-KEY" },
        },
      },
    },
    "/integrations/jupiter/rfq/quote": {
      post: {
        summary: "Jupiter RFQ compatible quote",
        description: "Expose un quote compatible avec le schema RFQ Jupiter pour la paire canonique STM/SJBC en exactIn et exactOut.",
        responses: {
          "200": { description: "Jupiter RFQ QuoteResponse compatible payload" },
          "400": { description: "Malformed quote request" },
          "401": { description: "Missing or invalid X-API-KEY" },
          "404": { description: "Unsupported pair, unsupported quote mode or no positive quote for this size" },
        },
      },
    },
    "/integrations/openocean/source/status": {
      get: {
        summary: "OpenOcean source adapter status",
        description: "Expose l'etat du front OpenOcean avec la separation explicite entre 1492 cerveau SterlingChain et 8000 surface SterlingDEX.",
        responses: {
          "200": { description: "OpenOcean source adapter status JSON" },
        },
      },
    },
    "/integrations/openocean/source/market": {
      get: {
        summary: "OpenOcean source adapter market bundle",
        description: "Expose la paire, la pool, la fee model et les endpoints source adapter pour aider OpenOcean a onboarder SterlingDEX comme source Solana custom.",
        responses: {
          "200": { description: "OpenOcean source market JSON" },
        },
      },
    },
    "/integrations/openocean/source/pairs": {
      get: {
        summary: "OpenOcean source adapter pairs",
        description: "Expose la paire canonique STM/SJBC dans un shape lisible par un front d'integration source.",
        responses: {
          "200": { description: "OpenOcean source pairs JSON" },
        },
      },
    },
    "/integrations/openocean/source/tokenList": {
      get: {
        summary: "OpenOcean-style token list for SterlingDEX",
        description: "Expose un tokenList aligne sur le shape OpenOcean v3 pour faciliter la revue d'ingestion de la source.",
        responses: {
          "200": { description: "OpenOcean-style tokenList JSON" },
        },
      },
    },
    "/integrations/openocean/source/dexList": {
      get: {
        summary: "OpenOcean-style dex list for SterlingDEX source",
        description: "Expose un dexList minimal pointant vers SterlingDEX comme source custom Solana.",
        responses: {
          "200": { description: "OpenOcean-style dexList JSON" },
        },
      },
    },
    "/integrations/openocean/source/quote": {
      get: {
        summary: "OpenOcean-style source quote",
        description: "Expose un quote aligne sur le shape OpenOcean v3, tout en restant strictement adosse a la verite canonique 1492 plus 8000.",
        parameters: [
          { name: "chain", in: "query", required: false, schema: { type: "string" } },
          { name: "inTokenAddress", in: "query", required: true, schema: { type: "string" } },
          { name: "outTokenAddress", in: "query", required: true, schema: { type: "string" } },
          { name: "amount", in: "query", required: true, schema: { type: "string" } },
          { name: "gasPrice", in: "query", required: false, schema: { type: "string" } },
          { name: "slippage", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OpenOcean-style quote JSON" },
          "400": { description: "Malformed quote request" },
          "404": { description: "Unsupported pair or no positive quote" },
        },
      },
    },
    "/proof/pools/{poolId}": {
      get: {
        summary: "Proof surface for the canonical public pool",
        description: "Expose la preuve live des vaults, des reserves visibles et des references canoniques de la pool BbvR.",
        parameters: [
          {
            name: "poolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Canonical pool proof payload" },
        },
      },
    },
    "/proof/pairs/{pairId}": {
      get: {
        summary: "Proof surface for the canonical public pair",
        description: "Expose la preuve live de la paire STM/SJBC: mints, vaults, reserves, LP, fee model et endpoints canoniques.",
        parameters: [
          {
            name: "pairId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Canonical pair proof payload" },
        },
      },
    },
    "/proof/tokens/{mint}": {
      get: {
        summary: "Proof surface for a public Sterling token",
        description: "Expose la preuve publique d'un token Sterling: metadata, logo, role canonique et relation vers la pair/pool si applicable.",
        parameters: [
          {
            name: "mint",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Canonical token proof payload" },
          "404": { description: "Unknown token mint" },
        },
      },
    },
    "/swap": {
      post: {
        summary: "Request a canonical SterlingDEX swap intent",
        description: "Expose un intent de swap public et sa route canonique. La surface publique documente le swap, mais l'execution on-chain reste controlee.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["inputMint", "amount", "poolId"],
                properties: {
                  mint: { type: "string" },
                  inputMint: { type: "string" },
                  poolId: { type: "string" },
                  target: { type: "string", enum: ["USDC", "USDT"] },
                  outputMint: { type: "string" },
                  amount: { type: "string" },
                  slippageBps: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Public swap intent response with standard_swap schema" },
          "501": { description: "Public swap upstream not configured yet" },
        },
      },
    },
    "/integrations/jupiter/rfq/swap": {
      post: {
        summary: "Jupiter RFQ compatible swap response",
        description: "Expose une reponse RFQ Jupiter compatible. SterlingDEX signe la transaction maker, la simule, puis repond accepted ou rejected. Le broadcast on-chain reste optionnel via configuration.",
        responses: {
          "200": { description: "Jupiter RFQ SwapResponse compatible payload" },
          "400": { description: "Malformed swap request" },
          "401": { description: "Missing or invalid X-API-KEY" },
        },
      },
    },
    "/integrations/openocean/source/swap_quote": {
      get: {
        summary: "OpenOcean-style source swap quote",
        description: "Expose un swap_quote aligne sur le shape OpenOcean v3, mais sans pretendre construire publiquement la transaction. L'execution reste controlee par 8000 ou un partenaire.",
        parameters: [
          { name: "chain", in: "query", required: false, schema: { type: "string" } },
          { name: "inTokenAddress", in: "query", required: true, schema: { type: "string" } },
          { name: "outTokenAddress", in: "query", required: true, schema: { type: "string" } },
          { name: "amount", in: "query", required: true, schema: { type: "string" } },
          { name: "account", in: "query", required: false, schema: { type: "string" } },
          { name: "sender", in: "query", required: false, schema: { type: "string" } },
          { name: "referrer", in: "query", required: false, schema: { type: "string" } },
          { name: "gasPrice", in: "query", required: false, schema: { type: "string" } },
          { name: "slippage", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OpenOcean-style swap_quote JSON" },
          "400": { description: "Malformed request" },
          "404": { description: "Unsupported pair or no positive quote" },
        },
      },
    },
    "/integrations/dexscreener/status": {
      get: {
        summary: "DexScreener indexing status for SterlingDEX",
        description: "Expose l'etat exact du front DexScreener avec la separation explicite entre 1492 cerveau SterlingChain, 8000 surface SterlingDEX et le verrou restant cote indexer DexScreener.",
        responses: {
          "200": { description: "DexScreener status JSON" },
        },
      },
    },
    "/integrations/dexscreener/pair": {
      get: {
        summary: "DexScreener-style pair signal for BbvR",
        description: "Expose un signal de paire lisible par des tiers pour la pool canonique BbvR et la paire STM/SJBC, sans pretendre remplacer l'indexer blockchain DexScreener.",
        responses: {
          "200": { description: "DexScreener-style pair signal JSON" },
        },
      },
    },
    "/integrations/dexscreener/activity": {
      get: {
        summary: "DexScreener-style activity signal for BbvR",
        description: "Expose des signaux publics d'activite et de volume relies a BbvR pour aider une revue d'indexation tierce.",
        responses: {
          "200": { description: "DexScreener-style activity signal JSON" },
        },
      },
    },
    "/integrations/dexscreener/indexing-pack": {
      get: {
        summary: "DexScreener indexing handoff pack",
        description: "Expose un pack unique reliant programme, pair, pool, reserves, activity et preuves publiques pour accelerer une revue d'indexation DexScreener.",
        responses: {
          "200": { description: "DexScreener indexing pack JSON" },
        },
      },
    },
    "/recognition/public-pack": {
      get: {
        summary: "Public recognition pack",
        description: "Expose un pack public unique pour reviewers et indexeurs, reliant 1492, 8000, BbvR, STM/SJBC, les preuves publiques et l'etat des fronts externes.",
        responses: {
          "200": { description: "Public recognition pack JSON" },
        },
      },
    },
  },
};

let idlSnapshot;
try {
  idlSnapshot = await fetchJson(localIdlUrl);
} catch {
  idlSnapshot = readJsonFromRepo("public-api/program.idl.json")?.idl || {
    ok: false,
    note: "IDL snapshot unavailable from live source and no prior cached snapshot found.",
    programId: PROGRAM_ID,
    instructions: [],
  };
}

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
writeJson("public-api/program.idl.json", {
  schema: "sterling_program_idl_snapshot_v1",
  source: localIdlUrl,
  generatedAt: status.generatedAt,
  idl: idlSnapshot,
});
writeJson("public-api/openapi.json", openapi);

console.log(
  JSON.stringify({
    ok: true,
    generatedAt: status.generatedAt,
    files: [
      "public-api/status.json",
      "public-api/pools.json",
      "public-api/pairs.json",
      "public-api/program.idl.json",
      "public-api/openapi.json",
    ],
    pairs: pairs.length,
    pools: pools.length,
  }),
);
