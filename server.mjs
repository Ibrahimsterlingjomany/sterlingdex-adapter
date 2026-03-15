import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || "8788");

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function loadJson(relPath) {
  const fullPath = path.join(__dirname, relPath);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders);
  res.end(JSON.stringify(payload, null, 2));
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
      endpoints: ["/status", "/tokenlist", "/pools", "/pairs", "/quote", "/swap", "/openapi.json"],
      note: "Minimal public SterlingDEX protocol surface.",
    });
    return;
  }

  if (req.method === "GET" && pathname === "/status") {
    sendJson(res, 200, loadJson("public-api/status.json"));
    return;
  }

  if (req.method === "GET" && pathname === "/tokenlist") {
    sendJson(res, 200, loadJson("sterlingdex_tokenlist.json"));
    return;
  }

  if (req.method === "GET" && pathname === "/pools") {
    sendJson(res, 200, loadJson("public-api/pools.json"));
    return;
  }

  if (req.method === "GET" && pathname === "/pairs") {
    sendJson(res, 200, loadJson("public-api/pairs.json"));
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
    const upstream = process.env.STERLING_PUBLIC_QUOTE_UPSTREAM_URL || "";
    if (!upstream) {
      sendJson(res, 501, {
        ...notConfiguredPayload("quote"),
        request_schema: {
          mint: "string?",
          inputMint: "string",
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

  if (req.method === "POST" && pathname === "/swap") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw.trim() ? JSON.parse(raw) : {};
    const upstream = process.env.STERLING_PUBLIC_SWAP_UPSTREAM_URL || "";
    if (!upstream) {
      sendJson(res, 501, {
        ...notConfiguredPayload("swap"),
        request_schema: {
          mint: "string?",
          inputMint: "string",
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
      endpoints: ["/status", "/tokenlist", "/pools", "/pairs", "/quote", "/swap", "/openapi.json"],
    }),
  );
});
