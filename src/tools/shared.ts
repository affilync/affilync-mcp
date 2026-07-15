/**
 * Tools available to every authenticated user (affiliate or brand).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AffilyncAPI } from "../api.js";
import { READ, call, pageParams } from "../util.js";

export function registerSharedTools(server: McpServer, api: AffilyncAPI): void {
  server.tool(
    "ping",
    "Health check — verify the Affilync API is reachable and your token is accepted.",
    {},
    READ,
    () => call(() => api.health())
  );

  server.tool(
    "getUserProfile",
    "Get your Affilync profile. Call this first to check if you are an affiliate or brand.",
    {},
    READ,
    () => call(() => api.getUserProfile())
  );

  server.tool(
    "searchCampaigns",
    "Search for campaigns by name, description, or category",
    {
      q: z.string().optional().describe("Search query"),
      category: z.string().optional().describe("Filter by category"),
      ...pageParams,
    },
    READ,
    (params) => call(() => api.searchCampaigns(params))
  );

  server.tool(
    "getNotifications",
    "Get your recent notifications (approvals, payouts, messages)",
    {
      unread_only: z.boolean().optional().describe("Only show unread notifications"),
      ...pageParams,
    },
    READ,
    (params) => call(() => api.getNotifications(params))
  );
}
