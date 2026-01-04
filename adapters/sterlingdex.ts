// adapters/sterlingdex.ts
import { PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";

export const SterlingDEX = {
  id: "sterlingdex",
  displayName: "SterlingDEX",
  description: "SterlingDEX - sovereign AMM by Sterling Ibrahim Jomany on Solana",

  // Program ID déployé
  programId: new PublicKey("7v9sLrk92NNLLUfXLJw3o7MycZNvwsTK6kLWfWb8vcVA"),

  // Endpoint backend exposant les pools
  poolSnapshotURL: "https://dex.sterlingchain.xyz/pools/all_pools_snapshot.json",

  async getPools() {
    const res = await fetch(this.poolSnapshotURL);
    if (!res.ok) throw new Error("Erreur de chargement des pools SterlingDEX");
    const data = await res.json();
    return data.pools;
  },

  async getSwapQuote({ inputMint, outputMint, amount }) {
    return {
      inAmount: amount,
      outAmount: Math.floor(amount * 0.997),
      fee: Math.floor(amount * 0.003),
      route: [
        {
          marketId: "BbvR4zUAwZF8LmVFLXNpDy3CxuYcDwd5isoh7CZFAF5G",
          inputMint,
          outputMint,
        },
      ],
    };
  },
};
