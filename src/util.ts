/**
 * Shared helpers for the Affilync MCP server.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

/** Read the package version at runtime so it can never drift from package.json. */
export function getVersion(): string {
  try {
    // ../package.json relative to this module resolves to the repo root from
    // both src/util.ts (tsx dev) and dist/util.js (built).
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Largest tool result we hand back to the model, in characters. Guards the
 * context budget against a pathologically large list response. */
const MAX_RESULT_CHARS = 100_000;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/** Serialize `data` to a text tool result, truncating anything oversized. */
export function json(data: unknown): ToolResult {
  let text = JSON.stringify(data, null, 2);
  if (text.length > MAX_RESULT_CHARS) {
    text =
      text.slice(0, MAX_RESULT_CHARS) +
      `\n\n… [truncated ${text.length - MAX_RESULT_CHARS} chars — narrow the query or reduce page_size]`;
  }
  return { content: [{ type: "text" as const, text }] };
}

/** Run an API call and convert any error into a clean, non-leaking tool error. */
export async function call<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    return json(await fn());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

/** Pagination params shared by every list tool. Bounded so a caller can't ask
 * for an unbounded page. */
export const pageParams = {
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  page_size: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Items per page (default 20, max 50)"),
};

/** Tool annotation presets so the MCP client can reason about safety. */
export const READ = { readOnlyHint: true, openWorldHint: true } as const;
/** A create/mutation that is not destructive but changes state. */
export const WRITE = { readOnlyHint: false, idempotentHint: false, openWorldHint: true } as const;
/** An irreversible / money-moving action — the client should confirm first. */
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
