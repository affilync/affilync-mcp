#!/usr/bin/env node

/**
 * Affilync REMOTE MCP server (OAuth Protected Resource).
 *
 * Unlike the stdio server (src/index.ts, one local user via AFFILYNC_TOKEN),
 * this is an HTTP service that Claude / any MCP client adds by URL and connects
 * to with an OAuth access token. Per the MCP authorization spec it is an OAuth
 * 2.0 Protected Resource:
 *
 *   - GET /.well-known/oauth-protected-resource  (RFC 9728) points clients at
 *     the Affilync Authorization Server (api.affilync.com).
 *   - Unauthenticated MCP calls get 401 + WWW-Authenticate so the client knows
 *     where to start the OAuth flow.
 *   - Each request's bearer token is verified OFFLINE against the AS JWKS and
 *     MUST be audience-bound to THIS server (confused-deputy defense). The same
 *     token is then forwarded to /api/gpt/v1 — the backend re-enforces auth,
 *     user-type and write-scope.
 *
 * Tools are the SAME ones the stdio server exposes (src/tools/*), registered
 * per-request based on the token's user_type and scopes.
 *
 * Env: AFFILYNC_API_URL (default https://api.affilync.com),
 *      MCP_RESOURCE_URL  (this server's public URL, default https://mcp.affilync.com),
 *      PORT (Render provides).
 */

import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AffilyncAPI } from "./api.js";
import { getVersion } from "./util.js";
import { registerSharedTools } from "./tools/shared.js";
import { registerAffiliateTools } from "./tools/affiliate.js";
import { registerBrandTools } from "./tools/brand.js";
import { bearerFromHeader, UnauthorizedError, verifyAccessToken } from "./auth.js";

const API_URL = (process.env.AFFILYNC_API_URL || "https://api.affilync.com").replace(/\/$/, "");
const RESOURCE = (process.env.MCP_RESOURCE_URL || "https://mcp.affilync.com").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 8080);
const SUPPORTED_SCOPES = ["user:profile", "api:read", "api:write", "offline_access"];

const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Minimal CORS so browser-based MCP clients (and the MCP Inspector) can read
// the WWW-Authenticate challenge and negotiate. Server-to-server clients ignore
// this. No credentials are used (auth is a Bearer token, not cookies).
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version"
  );
  res.header("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// RFC 9728 Protected Resource Metadata — tells the client which Authorization
// Server to use for this resource.
app.get(PROTECTED_RESOURCE_METADATA_PATH, (_req: Request, res: Response) => {
  res.json({
    resource: RESOURCE,
    authorization_servers: [API_URL],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${API_URL}/docs`,
  });
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: getVersion() });
});

function challenge(res: Response, description: string): void {
  res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${RESOURCE}${PROTECTED_RESOURCE_METADATA_PATH}"`
    )
    .json({ error: "unauthorized", error_description: description });
}

app.post("/mcp", async (req: Request, res: Response) => {
  const token = bearerFromHeader(req.headers.authorization);
  if (!token) {
    challenge(res, "Missing bearer token");
    return;
  }

  let auth;
  try {
    auth = await verifyAccessToken(token, { issuerOrigin: API_URL, resource: RESOURCE });
  } catch (e) {
    challenge(res, e instanceof UnauthorizedError ? e.message : "Token verification failed");
    return;
  }

  const api = new AffilyncAPI(auth.raw, API_URL);
  // No api:write scope → read-only connection: mutating tools are not registered
  // at all (defense-in-depth; the backend also rejects writes for such a token).
  const readOnly = !auth.scopes.includes("api:write");

  const server = new McpServer({ name: "affilync", version: getVersion() });
  registerSharedTools(server, api);
  const userType = auth.userType.toLowerCase();
  if (userType === "brand") {
    registerBrandTools(server, api, { readOnly });
  } else if (userType === "affiliate" || userType === "creator") {
    registerAffiliateTools(server, api, { readOnly });
  }
  // Other account types (e.g. admin) get shared tools only.

  // Stateless: a fresh server + transport per request (no server-held session).
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request error:", e instanceof Error ? e.message : e);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

// Stateless mode has no server-initiated stream / session to resume or delete.
app.get("/mcp", (_req: Request, res: Response) =>
  res.status(405).json({ error: "method_not_allowed" })
);
app.delete("/mcp", (_req: Request, res: Response) =>
  res.status(405).json({ error: "method_not_allowed" })
);

app.listen(PORT, () => {
  // stderr — keep stdout clean.
  console.error(
    `affilync-mcp remote v${getVersion()} listening on :${PORT} ` +
      `(resource=${RESOURCE}, authorization_server=${API_URL})`
  );
});
