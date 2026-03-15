/**
 * Affilync API client — thin wrapper over the /api/gpt/v1 endpoints.
 */

const DEFAULT_BASE_URL = "https://api.affilync.com";

export class AffilyncAPI {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
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
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "User-Agent": "affilync-mcp/1.0",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Affilync API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
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
    return this.request("POST", `/campaigns/${campaignId}/join`);
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
    return this.request("GET", `/brand/campaigns/${campaignId}/performance`);
  }

  listAffiliateApplications(params?: {
    application_status?: string;
    page?: number;
    page_size?: number;
  }) {
    return this.request("GET", "/brand/applications", undefined, params);
  }

  decideApplication(applicationId: string, data: { decision: string; reason?: string }) {
    return this.request("POST", `/brand/applications/${applicationId}/decide`, data);
  }

  getBrandDashboard() {
    return this.request("GET", "/brand/analytics/dashboard");
  }

  listBrandAffiliates(params?: { page?: number; page_size?: number }) {
    return this.request("GET", "/brand/affiliates", undefined, params);
  }
}
