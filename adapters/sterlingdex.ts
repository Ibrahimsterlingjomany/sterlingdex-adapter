// adapters/sterlingdex.ts
import { PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";

const DEFAULT_BASE_URL =
  process.env.STERLINGDEX_BASE_URL || "https://dex.sterlingchain.xyz";
const DEFAULT_POOL_SNAPSHOT_URL =
  process.env.STERLINGDEX_POOL_SNAPSHOT_URL ||
  `${DEFAULT_BASE_URL}/pools/all_pools_snapshot.json`;

export const SterlingDEX = {
  id: "sterlingdex",
  displayName: "SterlingDEX",
  description: "SterlingDEX - sovereign AMM by Sterling Ibrahim Jomany on Solana",

  // Program ID déployé
  programId: new PublicKey("7v9sLrk92NNLLUfXLJw3o7MycZNvwsTK6kLWfWb8vcVA"),

  // Endpoint backend exposant les pools
  poolSnapshotURL: DEFAULT_POOL_SNAPSHOT_URL,

  async getPools() {
    const res = await fetch(this.poolSnapshotURL);
    if (!res.ok) throw new Error("Erreur de chargement des pools SterlingDEX");
    const data = await res.json();
    return Array.isArray(data?.pools) ? data.pools : data;
  },

  async getSwapQuote({ inputMint, outputMint, amount }) {
    throw new Error(
      [
        "SterlingDEX quote adapter is not wired to a public routing endpoint yet.",
        `Requested route: ${inputMint} -> ${outputMint} for amount ${amount}.`,
        "Expose a public Sterling quote API before advertising router integration.",
      ].join(" "),
    );
  },
};
