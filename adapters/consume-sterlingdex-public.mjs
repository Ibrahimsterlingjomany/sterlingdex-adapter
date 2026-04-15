const API = process.env.STERLINGDEX_PUBLIC_API || "https://api.sterlingchain.net";
const CANONICAL_POOL_ID = "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G";
const STM_MINT = "9kued2JXgVk5dzvtipsTdXfBMWihy1E55TwMiXchCoAb";
const SJBC_MINT = "EsNo61QodqHCRjkTGJDeqyK7N4Hunip5PaTYbpPZEsG2";

async function getJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const pairs = await getJson(`${API}/pairs`);
  const proof = await getJson(`${API}/proof/pools/${CANONICAL_POOL_ID}`);
  const quote = await getJson(`${API}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputMint: STM_MINT,
      outputMint: SJBC_MINT,
      amount: "1000000000",
      poolId: CANONICAL_POOL_ID,
      slippageBps: 50,
    }),
  });
  const swap = await getJson(`${API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputMint: STM_MINT,
      outputMint: SJBC_MINT,
      amount: "1000000000",
      poolId: CANONICAL_POOL_ID,
      slippageBps: 50,
    }),
  });

  const pair = Array.isArray(pairs.body?.pairs)
    ? pairs.body.pairs.find((row) => row.poolId === CANONICAL_POOL_ID)
    : null;

  const result = {
    ok: Boolean(pairs.ok && proof.ok && quote.ok && swap.ok && pair),
    api: API,
    consumed_at: new Date().toISOString(),
    pair: pair
      ? {
          pairId: pair.pairId,
          quoteEndpoint: pair.quoteEndpoint,
          proofEndpoint: pair.proofEndpoint,
          sourceOfTruth: pair.sourceOfTruth,
        }
      : null,
    proof: proof.body?.liquidity
      ? {
          status: proof.body.liquidity.status,
          baseVaultAmountUi: proof.body.liquidity.baseVaultAmountUi,
          quoteVaultAmountUi: proof.body.liquidity.quoteVaultAmountUi,
        }
      : null,
    quote: quote.body?.standard_quote
      ? {
          schema: quote.body.standard_quote.schema,
          amountInUi: quote.body.standard_quote.amount_in_ui,
          expectedOutUi: quote.body.standard_quote.expected_out_ui,
          liquidityStatus: quote.body.standard_quote.liquidity_status,
        }
      : null,
    swap: swap.body?.standard_swap
      ? {
          schema: swap.body.standard_swap.schema,
          executionMode: swap.body.execution_mode,
          executionStatus: swap.body.execution_status,
          intentMeaning: swap.body.standard_swap.intent_meaning,
        }
      : null,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message || error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
