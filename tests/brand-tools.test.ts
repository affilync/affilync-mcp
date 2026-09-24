/**
 * The brand tools' argument schemas must speak the vocabulary the API actually
 * writes. `listAffiliateApplications` proxies GET /api/gpt/v1/brand/applications,
 * whose handler filters `CampaignAffiliate.status == application_status` on
 * campaign_affiliates — so the tool's enum has to be that column's value set,
 * not the similarly-named `brand_affiliates.status`.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerBrandTools } from "../src/tools/brand.js";
import type { AffilyncAPI } from "../src/api.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Registered = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: unknown[]) => unknown;
};

/** Capture what registerBrandTools registers, without an SDK server or network. */
function registerAndCapture(opts: { readOnly: boolean }): Map<string, Registered> {
  const tools = new Map<string, Registered>();
  const server = {
    tool(
      name: string,
      description: string,
      schema: z.ZodRawShape,
      annotations: Record<string, unknown>,
      handler: (...args: unknown[]) => unknown
    ) {
      tools.set(name, { name, description, schema, annotations, handler });
    },
  } as unknown as McpServer;
  // Registration only stores handlers; nothing here calls the API.
  const api = {} as AffilyncAPI;
  registerBrandTools(server, api, opts);
  return tools;
}

/** Parse a candidate `application_status` through the tool's real arg schema. */
function accepts(status: string): boolean {
  const tool = registerAndCapture({ readOnly: true }).get("listAffiliateApplications");
  if (!tool) throw new Error("listAffiliateApplications was not registered");
  return z.object(tool.schema).safeParse({ application_status: status }).success;
}

describe("listAffiliateApplications argument schema", () => {
  it("is registered read-only with READ annotations", () => {
    const tool = registerAndCapture({ readOnly: true }).get("listAffiliateApplications");
    expect(tool).toBeDefined();
    expect(tool!.annotations).toMatchObject({ readOnlyHint: true });
  });

  // Every status below has a live writer in affilync-api against
  // campaign_affiliates.status, so a brand can hold seats in each state and
  // must be able to ask for them:
  //   pending / approved  campaign_application_service.py:91, :675
  //   rejected            campaign_application_service.py:773
  //   invited             campaign_application_service.py:465 (create_invited_seat)
  //   removed             brand_campaigns/affiliates.py:396 bulk action map
  it.each(["pending", "approved", "rejected", "invited", "removed"])(
    "can express the seat status %s, which the API writes",
    (status) => {
      expect(accepts(status)).toBe(true);
    }
  );

  it("rejects 'active', which is brand_affiliates' vocabulary and never a seat status", () => {
    // CampaignAffiliateStatus has no ACTIVE member; the handler's equality
    // filter would match nothing and return an empty list that reads to the
    // brand as "you have no affiliates".
    expect(accepts("active")).toBe(false);
  });

  it("rejects a status no writer produces", () => {
    expect(accepts("banana")).toBe(false);
  });

  it("still treats application_status as optional", () => {
    const tool = registerAndCapture({ readOnly: true }).get("listAffiliateApplications")!;
    expect(z.object(tool.schema).safeParse({}).success).toBe(true);
  });

  it("names what each accepted status means, so the model does not guess", () => {
    const tool = registerAndCapture({ readOnly: true }).get("listAffiliateApplications")!;
    const described = (tool.schema.application_status as z.ZodTypeAny).description ?? "";
    // The description must explain the two statuses whose meaning is not
    // self-evident from the word alone.
    expect(described).toMatch(/invited/i);
    expect(described).toMatch(/removed/i);
  });
});

describe("brand tool registration", () => {
  it("registers no mutating tools in read-only mode", () => {
    const readOnly = registerAndCapture({ readOnly: true });
    for (const tool of readOnly.values()) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true });
    }
    // Sanity: the full-access registration is a strict superset, so the
    // read-only assertion above is not vacuous.
    const full = registerAndCapture({ readOnly: false });
    expect(full.size).toBeGreaterThan(readOnly.size);
  });
});
