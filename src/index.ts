#!/usr/bin/env node

/**
 * Affilync MCP Server
 *
 * Exposes affiliate-marketing tools to Claude via the Model Context Protocol.
 * Every call is authenticated as the user (Bearer AFFILYNC_TOKEN) and proxies
 * to the /api/gpt/v1/* endpoints, which enforce auth, revocation, user-type and
 * write-scope on the server side.
 *
 * Usage:
 *   AFFILYNC_TOKEN=<jwt> npx @affilync/mcp-server
 *   AFFILYNC_TOKEN=<jwt> AFFILYNC_API_URL=http://localhost:8000 npx @affilync/mcp-server
 *   AFFILYNC_TOKEN=<jwt> AFFILYNC_READONLY=1 npx @affilync/mcp-server   # no mutations
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AffilyncAPI } from "./api.js";
import { getVersion } from "./util.js";
import { registerSharedTools } from "./tools/shared.js";
import { registerAffiliateTools } from "./tools/affiliate.js";
import { registerBrandTools } from "./tools/brand.js";

const token = process.env.AFFILYNC_TOKEN;
if (!token) {
  // stderr — stdout is the MCP protocol channel.
  console.error("Error: AFFILYNC_TOKEN environment variable is required.");
  console.error(
    "Log in at https://app.affilync.com (or complete the OAuth flow) and use your JWT access token."
  );
  console.error("For a read-only server, also set AFFILYNC_READONLY=1.");
  process.exit(1);
}

const readOnly = process.env.AFFILYNC_READONLY === "1" || process.env.AFFILYNC_READONLY === "true";

const api = new AffilyncAPI(token, process.env.AFFILYNC_API_URL);
const server = new McpServer({ name: "affilync", version: getVersion() });

registerSharedTools(server, api);
registerAffiliateTools(server, api, { readOnly });
registerBrandTools(server, api, { readOnly });

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (readOnly) {
    console.error("affilync-mcp: running in READ-ONLY mode — mutating tools are disabled.");
  }

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
