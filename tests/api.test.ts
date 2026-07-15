import { afterEach, describe, expect, it, vi } from "vitest";
import { AffilyncAPI } from "../src/api.js";

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const res = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody ?? {},
    text: async () => JSON.stringify(response.jsonBody ?? {}),
  } as unknown as Response;
  const fn = vi.fn(async () => res);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("AffilyncAPI", () => {
  it("rejects an empty token at construction", () => {
    expect(() => new AffilyncAPI("")).toThrow(/non-empty token/);
    expect(() => new AffilyncAPI("   ")).toThrow(/non-empty token/);
  });

  it("sends the Bearer token and hits /api/gpt/v1", async () => {
    const fetchFn = mockFetch({ jsonBody: { id: "me" } });
    const api = new AffilyncAPI("tok_123");
    const out = await api.getUserProfile();
    expect(out).toEqual({ id: "me" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe("https://api.affilync.com/api/gpt/v1/me");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("clamps page_size to 50", async () => {
    const fetchFn = mockFetch({ jsonBody: {} });
    const api = new AffilyncAPI("t");
    await api.listMyLinks({ page_size: 5000 });
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.searchParams.get("page_size")).toBe("50");
  });

  it("encodes path parameters", async () => {
    const fetchFn = mockFetch({ jsonBody: {} });
    const api = new AffilyncAPI("t");
    await api.joinCampaign("a/b?c");
    expect(String(fetchFn.mock.calls[0][0])).toContain("/campaigns/a%2Fb%3Fc/join");
  });

  it("surfaces the backend `detail`, truncated, on error", async () => {
    mockFetch({ ok: false, status: 400, jsonBody: { detail: "Add a payout method first." } });
    const api = new AffilyncAPI("t");
    await expect(api.requestPayout()).rejects.toThrow("Add a payout method first.");
  });

  it("gives a token-specific message on 401/403", async () => {
    mockFetch({ ok: false, status: 401, jsonBody: {} });
    const api = new AffilyncAPI("t");
    await expect(api.getUserProfile()).rejects.toThrow(/expired|scope/i);
  });

  it("never echoes a non-JSON error body", async () => {
    const res = {
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "<html>stack trace leak</html>",
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const api = new AffilyncAPI("t");
    await expect(api.getUserProfile()).rejects.toThrow(/HTTP 500/);
    await expect(api.getUserProfile()).rejects.not.toThrow(/stack trace leak/);
  });

  it("maps an aborted request to a timeout error", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw err;
      })
    );
    const api = new AffilyncAPI("t");
    await expect(api.getUserProfile()).rejects.toThrow(/timed out/);
  });
});
