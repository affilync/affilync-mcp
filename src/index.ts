#!/usr/bin/env node

/**
 * Affilync MCP Server
 *
 * Exposes 20 affiliate marketing tools to Claude via the
 * Model Context Protocol. Calls the /api/gpt/v1/* endpoints.
 *
 * Usage:
 *   AFFILYNC_TOKEN=<jwt> npx @affilync/mcp-server
 *   AFFILYNC_TOKEN=<jwt> AFFILYNC_API_URL=http://localhost:8000 npx @affilync/mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AffilyncAPI } from "./api.js";

const token = process.env.AFFILYNC_TOKEN;
if (!token) {
  console.error("Error: AFFILYNC_TOKEN environment variable is required");
  console.error("Get your token at https://app.affilync.com/settings/api-keys");
  process.exit(1);
}

const api = new AffilyncAPI(token, process.env.AFFILYNC_API_URL);

const server = new McpServer({
  name: "affilync",
  version: "1.0.0",
});

// ---------- Helper ----------

function json(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

async function call<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

// ---------- Pagination schema ----------

const pageParams = {
  page: z.number().optional().describe("Page number (default 1)"),
  page_size: z.number().optional().describe("Items per page (default 20, max 50)"),
};

// =====================================================================
//  SHARED TOOLS
// =====================================================================

server.tool("getUserProfile", "Get your Affilync profile. Call this first to check if you are an affiliate or brand.", {}, async () => {
  return call(() => api.getUserProfile());
});

server.tool(
  "searchCampaigns",
  "Search for campaigns by name, description, or category",
  {
    q: z.string().optional().describe("Search query"),
    category: z.string().optional().describe("Filter by category"),
    ...pageParams,
  },
  async (params) => call(() => api.searchCampaigns(params))
);

server.tool(
  "getNotifications",
  "Get your recent notifications (approvals, payouts, messages)",
  {
    unread_only: z.boolean().optional().describe("Only show unread notifications"),
    ...pageParams,
  },
  async (params) => call(() => api.getNotifications(params))
);

// =====================================================================
//  AFFILIATE TOOLS
// =====================================================================

server.tool(
  "listAvailableCampaigns",
  "List campaigns available to join as an affiliate. Shows active campaigns accepting new affiliates.",
  {
    category: z.string().optional().describe("Filter by category"),
    ...pageParams,
  },
  async (params) => call(() => api.listAvailableCampaigns(params))
);

server.tool(
  "joinCampaign",
  "Apply to join an affiliate campaign. Some campaigns auto-approve.",
  {
    campaign_id: z.string().describe("ID of the campaign to join"),
  },
  async ({ campaign_id }) => call(() => api.joinCampaign(campaign_id))
);

server.tool(
  "generateAffiliateLink",
  "Generate a tracking link for a campaign you've joined",
  {
    campaign_id: z.string().describe("Campaign ID to generate a link for"),
    destination_url: z.string().optional().describe("Custom destination URL"),
  },
  async (params) => call(() => api.generateAffiliateLink(params))
);

server.tool(
  "listMyLinks",
  "List all your affiliate tracking links",
  pageParams,
  async (params) => call(() => api.listMyLinks(params))
);

server.tool("getEarningsSummary", "Get your earnings summary — total, pending, available balance, paid out", {}, async () => {
  return call(() => api.getEarningsSummary());
});

server.tool(
  "listCommissions",
  "List your individual commission records from conversions and sales",
  {
    commission_status: z.string().optional().describe("Filter: pending, approved, paid, rejected"),
    ...pageParams,
  },
  async (params) => call(() => api.listCommissions(params))
);

server.tool("getClickAnalytics", "Get click analytics — totals, today, this week, this month", {}, async () => {
  return call(() => api.getClickAnalytics());
});

server.tool(
  "requestPayout",
  "Request a payout of your available earnings",
  {
    amount: z.number().optional().describe("Amount to request (defaults to full balance)"),
  },
  async (params) => call(() => api.requestPayout(params))
);

server.tool(
  "listActiveCampaigns",
  "List campaigns you've joined and are currently active in",
  pageParams,
  async (params) => call(() => api.listActiveCampaigns(params))
);

// =====================================================================
//  BRAND TOOLS
// =====================================================================

server.tool(
  "createCampaign",
  "Create a new affiliate marketing campaign with a commission structure",
  {
    name: z.string().describe("Campaign name"),
    description: z.string().optional().describe("Campaign description"),
    commission_type: z
      .enum(["percentage", "fixed", "hybrid"])
      .optional()
      .describe("Commission type (default: percentage)"),
    commission_rate: z.number().describe("Commission rate (e.g. 10.0 for 10%)"),
    category: z.string().optional().describe("Campaign category"),
    destination_url: z.string().optional().describe("Landing page URL"),
  },
  async (params) => call(() => api.createCampaign(params))
);

server.tool(
  "listBrandCampaigns",
  "List all campaigns owned by your brand",
  {
    campaign_status: z.string().optional().describe("Filter by status"),
    ...pageParams,
  },
  async (params) => call(() => api.listBrandCampaigns(params))
);

server.tool(
  "getCampaignPerformance",
  "Get detailed performance metrics for a campaign — clicks, conversions, revenue, EPC",
  {
    campaign_id: z.string().describe("Campaign ID"),
  },
  async ({ campaign_id }) => call(() => api.getCampaignPerformance(campaign_id))
);

server.tool(
  "listAffiliateApplications",
  "List affiliate applications for your campaigns",
  {
    application_status: z.string().optional().describe("Filter: pending, active, rejected"),
    ...pageParams,
  },
  async (params) => call(() => api.listAffiliateApplications(params))
);

server.tool(
  "decideApplication",
  "Approve or reject an affiliate's application to join your campaign",
  {
    application_id: z.string().describe("Application ID"),
    decision: z.enum(["approve", "reject"]).describe("Approve or reject"),
    reason: z.string().optional().describe("Reason for the decision"),
  },
  async ({ application_id, ...data }) =>
    call(() => api.decideApplication(application_id, data))
);

server.tool("getBrandDashboard", "Get your brand's overall performance dashboard", {}, async () => {
  return call(() => api.getBrandDashboard());
});

server.tool(
  "listBrandAffiliates",
  "List all affiliates working with your brand",
  pageParams,
  async (params) => call(() => api.listBrandAffiliates(params))
);

// =====================================================================
//  START
// =====================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
