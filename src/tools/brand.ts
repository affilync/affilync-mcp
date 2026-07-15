/**
 * Brand tools. Read tools are always registered; mutating tools are skipped
 * when the server runs in read-only mode.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AffilyncAPI } from "../api.js";
import { DESTRUCTIVE, READ, WRITE, call, pageParams } from "../util.js";

export function registerBrandTools(
  server: McpServer,
  api: AffilyncAPI,
  opts: { readOnly: boolean }
): void {
  // ---- Reads ----

  server.tool(
    "listBrandCampaigns",
    "List all campaigns owned by your brand",
    { campaign_status: z.string().optional().describe("Filter by status"), ...pageParams },
    READ,
    (params) => call(() => api.listBrandCampaigns(params))
  );

  server.tool(
    "getCampaignPerformance",
    "Get detailed performance metrics for a campaign — clicks, conversions, revenue, EPC",
    { campaign_id: z.string().min(1).describe("Campaign ID") },
    READ,
    ({ campaign_id }) => call(() => api.getCampaignPerformance(campaign_id))
  );

  server.tool(
    "listAffiliateApplications",
    "List affiliate applications for your campaigns",
    {
      application_status: z
        .enum(["pending", "active", "rejected"])
        .optional()
        .describe("Filter by application status"),
      ...pageParams,
    },
    READ,
    (params) => call(() => api.listAffiliateApplications(params))
  );

  server.tool(
    "getBrandDashboard",
    "Get your brand's overall performance dashboard",
    {},
    READ,
    () => call(() => api.getBrandDashboard())
  );

  server.tool(
    "listBrandAffiliates",
    "List all affiliates working with your brand",
    pageParams,
    READ,
    (params) => call(() => api.listBrandAffiliates(params))
  );

  if (opts.readOnly) return;

  // ---- Mutations ----

  server.tool(
    "createCampaign",
    "Create a new affiliate marketing campaign with a commission structure",
    {
      name: z.string().min(1).describe("Campaign name"),
      description: z.string().optional().describe("Campaign description"),
      commission_type: z
        .enum(["percentage", "fixed", "hybrid"])
        .optional()
        .describe("Commission type (default: percentage)"),
      commission_rate: z
        .number()
        .min(0)
        .max(100)
        .describe("Commission rate (e.g. 10.0 for 10%; 0–100)"),
      category: z.string().optional().describe("Campaign category"),
      destination_url: z
        .string()
        .url()
        .optional()
        .describe("Landing page URL (must be a valid http(s) URL)"),
    },
    WRITE,
    (params) => call(() => api.createCampaign(params))
  );

  server.tool(
    "decideApplication",
    "Approve or reject an affiliate's application to join your campaign. Consequential — affects who can earn commissions on your campaign.",
    {
      application_id: z.string().min(1).describe("Application ID"),
      decision: z.enum(["approve", "reject"]).describe("Approve or reject"),
      reason: z.string().optional().describe("Reason for the decision"),
    },
    DESTRUCTIVE,
    ({ application_id, ...data }) => call(() => api.decideApplication(application_id, data))
  );
}
