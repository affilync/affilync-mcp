/**
 * Affiliate tools. Read tools are always registered; mutating tools are
 * skipped when the server runs in read-only mode.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AffilyncAPI } from "../api.js";
import { DESTRUCTIVE, READ, WRITE, call, pageParams } from "../util.js";

export function registerAffiliateTools(
  server: McpServer,
  api: AffilyncAPI,
  opts: { readOnly: boolean }
): void {
  // ---- Reads ----

  server.tool(
    "listAvailableCampaigns",
    "List campaigns available to join as an affiliate. Shows active campaigns accepting new affiliates.",
    { category: z.string().optional().describe("Filter by category"), ...pageParams },
    READ,
    (params) => call(() => api.listAvailableCampaigns(params))
  );

  server.tool(
    "listMyLinks",
    "List all your affiliate tracking links",
    pageParams,
    READ,
    (params) => call(() => api.listMyLinks(params))
  );

  server.tool(
    "getEarningsSummary",
    "Get your earnings summary — total, pending, available balance, paid out",
    {},
    READ,
    () => call(() => api.getEarningsSummary())
  );

  server.tool(
    "listCommissions",
    "List your individual commission records from conversions and sales",
    {
      commission_status: z
        .enum(["pending", "approved", "paid", "rejected"])
        .optional()
        .describe("Filter by commission status"),
      ...pageParams,
    },
    READ,
    (params) => call(() => api.listCommissions(params))
  );

  server.tool(
    "getClickAnalytics",
    "Get click analytics — totals, today, this week, this month",
    {},
    READ,
    () => call(() => api.getClickAnalytics())
  );

  server.tool(
    "listActiveCampaigns",
    "List campaigns you've joined and are currently active in",
    pageParams,
    READ,
    (params) => call(() => api.listActiveCampaigns(params))
  );

  if (opts.readOnly) return;

  // ---- Mutations ----

  server.tool(
    "joinCampaign",
    "Apply to join an affiliate campaign. Some campaigns auto-approve.",
    { campaign_id: z.string().min(1).describe("ID of the campaign to join") },
    WRITE,
    ({ campaign_id }) => call(() => api.joinCampaign(campaign_id))
  );

  server.tool(
    "generateAffiliateLink",
    "Generate a tracking link for a campaign you've joined",
    {
      campaign_id: z.string().min(1).describe("Campaign ID to generate a link for"),
      destination_url: z
        .string()
        .url()
        .optional()
        .describe("Custom destination URL (must be a valid http(s) URL)"),
    },
    WRITE,
    (params) => call(() => api.generateAffiliateLink(params))
  );

  server.tool(
    "requestPayout",
    "Request a payout of your available earnings. IRREVERSIBLE — moves real money. Omitting the amount requests your full available balance.",
    {
      amount: z
        .number()
        .positive()
        .optional()
        .describe("Amount to request (defaults to full available balance)"),
    },
    DESTRUCTIVE,
    (params) => call(() => api.requestPayout(params))
  );
}
