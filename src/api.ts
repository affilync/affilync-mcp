/**
 * Affilync API client — thin wrapper over the /api/gpt/v1 endpoints.
 *
 * Hardening (2026-07): every request runs under an AbortController timeout,
 * upstream error bodies are parsed for the backend's friendly `detail` and
 * truncated (never echo a raw upstream body into the model), and page_size is
 * clamped so a caller can't request an unbounded page.
 */

import { getVersion } from "./util.js";

const DEFAULT_BASE_URL = "https://api.affilync.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGE_SIZE = 50;

export class AffilyncAPI {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl?: string) {
    if (!token || token.trim().length === 0) {
      throw new Error("AffilyncAPI requires a non-empty token");
    }
    this.token = token.trim();
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = new URL(`/api/gpt/v1${path}`, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        // Defensive clamp: the model may ignore the schema max.
        const value = k === "page_size" ? Math.min(Number(v) || MAX_PAGE_SIZE, MAX_PAGE_SIZE) : v;
        url.searchParams.set(k, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "User-Agent": `affilync-mcp/${getVersion()}`,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Affilync API timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw new Error("Could not reach the Affilync API. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Surface the backend's friendly `detail` (flat JSON schema) — truncated,
      // never the raw body. 401/403 get a clearer nudge about the token.
      let detail = "";
      try {
        const parsed = (await res.json()) as { detail?: unknown; message?: unknown };
        detail = String(parsed?.detail ?? parsed?.message ?? "").slice(0, 300);
      } catch {
        /* non-JSON error body — omit it rather than leak it */
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          detail ||
            "Not authorized. Your AFFILYNC_TOKEN may be expired (they last ~60 min) or lack the required scope."
        );
      }
      throw new Error(detail || `Affilync API error (HTTP ${res.status})`);
    }

    // 204 / empty body
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  }

  // ---- Shared ----

  health() {
    return this.request("GET", "/health");
  }

  getUserProfile() {
    return this.request("GET", "/me");
  }

  searchCampaigns(params?: { q?: string; category?: string; page?: number; page_size?: number }) {
    return this.request("GET", "/campaigns/search", undefined, params);
  }

  getNotifications(params?: { unread_only?: boolean; page?: number; page_size?: number }) {
    return this.request("GET", "/notifications", undefined, params);
  }

  // ---- Affiliate ----

  listAvailableCampaigns(params?: { category?: string; page?: number; page_size?: number }) {
    return this.request("GET", "/campaigns/available", undefined, params);
  }

  joinCampaign(campaignId: string) {
    return this.request("POST", `/campaigns/${encodeURIComponent(campaignId)}/join`);
  }

  generateAffiliateLink(params: { campaign_id: string; destination_url?: string }) {
    return this.request("POST", "/links/generate", undefined, params);
  }

  listMyLinks(params?: { page?: number; page_size?: number }) {
    return this.request("GET", "/links", undefined, params);
  }

  getEarningsSummary() {
    return this.request("GET", "/earnings/summary");
  }

  listCommissions(params?: { commission_status?: string; page?: number; page_size?: number }) {
    return this.request("GET", "/earnings/commissions", undefined, params);
  }

  getClickAnalytics() {
    return this.request("GET", "/analytics/clicks");
  }

  requestPayout(params?: { amount?: number }) {
    return this.request("POST", "/payouts/request", undefined, params);
  }

  listActiveCampaigns(params?: { page?: number; page_size?: number }) {
    return this.request("GET", "/campaigns/active", undefined, params);
  }

  // ---- Brand ----

  createCampaign(data: {
    name: string;
    description?: string;
    commission_type?: string;
    commission_rate: number;
    category?: string;
    destination_url?: string;
  }) {
    return this.request("POST", "/brand/campaigns", data);
  }

  listBrandCampaigns(params?: { campaign_status?: string; page?: number; page_size?: number }) {
    return this.request("GET", "/brand/campaigns", undefined, params);
  }

  getCampaignPerformance(campaignId: string) {
    return this.request("GET", `/brand/campaigns/${encodeURIComponent(campaignId)}/performance`);
  }

  listAffiliateApplications(params?: {
    application_status?: string;
    page?: number;
    page_size?: number;
  }) {
    return this.request("GET", "/brand/applications", undefined, params);
  }

  decideApplication(applicationId: string, data: { decision: string; reason?: string }) {
    return this.request(
      "POST",
      `/brand/applications/${encodeURIComponent(applicationId)}/decide`,
      data
    );
  }

  getBrandDashboard() {
    return this.request("GET", "/brand/analytics/dashboard");
  }

  listBrandAffiliates(params?: { page?: number; page_size?: number }) {
    return this.request("GET", "/brand/affiliates", undefined, params);
  }
}
