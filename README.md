# @affilync/mcp-server

MCP (Model Context Protocol) server for [Affilync](https://app.affilync.com) — manage affiliate marketing directly from Claude.

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "affilync": {
      "command": "npx",
      "args": ["@affilync/mcp-server"],
      "env": {
        "AFFILYNC_TOKEN": "<your-jwt-token>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add affilync -- env AFFILYNC_TOKEN=<your-jwt-token> npx @affilync/mcp-server
```

### Get your token

The server sends `AFFILYNC_TOKEN` as `Authorization: Bearer <token>`, so it
must be a **JWT access token** (from your Affilync login session or the OAuth
flow) — a developer **API key (`af_live_...`) will NOT work** with this server
as-is. To obtain one: log in at https://app.affilync.com, or complete the
OAuth flow (see the Affilync CLI / SDK), and use the access token value as
`AFFILYNC_TOKEN`. Note tokens expire (~60 min); re-issue as needed.

## Security model

- **Least authority.** Every tool proxies to `/api/gpt/v1/*` and carries only
  your bearer token. The backend independently enforces authentication, token
  revocation, user type (affiliate vs. brand) and write-scope — this server
  grants no capability the API wouldn't grant your token directly.
- **Read-only mode.** Set `AFFILYNC_READONLY=1` to register only read tools.
  Mutating tools (`joinCampaign`, `generateAffiliateLink`, `requestPayout`,
  `createCampaign`, `decideApplication`) are not exposed at all — the model
  cannot invoke a state change or move money. Recommended for exploration.
- **Tool safety hints.** Mutating tools are annotated so the client can prompt
  before running them; money-moving / approval tools carry a `destructiveHint`.
- **Bounded I/O.** Requests time out after 15s; responses are truncated to a
  safe size; backend error bodies are sanitized (status + short `detail` only)
  so raw server internals never reach the model.

## Available Tools

### Shared (all users)
| Tool | Description |
|------|-------------|
| `ping` | Health check — API reachable and token accepted |
| `getUserProfile` | Get your profile (affiliate or brand) |
| `searchCampaigns` | Search campaigns by name/category |
| `getNotifications` | View recent notifications |

### Affiliate Tools
| Tool | Description |
|------|-------------|
| `listAvailableCampaigns` | Browse campaigns to join |
| `joinCampaign` | Apply to join a campaign |
| `generateAffiliateLink` | Create a tracking link |
| `listMyLinks` | View your tracking links |
| `getEarningsSummary` | Total/pending/available earnings |
| `listCommissions` | Individual commission records |
| `getClickAnalytics` | Click stats (today/week/month) |
| `requestPayout` | Cash out available earnings |
| `listActiveCampaigns` | Your joined campaigns |

### Brand Tools
| Tool | Description |
|------|-------------|
| `createCampaign` | Create a campaign with commission structure |
| `listBrandCampaigns` | View your campaigns |
| `getCampaignPerformance` | Campaign metrics (clicks, conversions, EPC) |
| `listAffiliateApplications` | Review applications |
| `decideApplication` | Approve/reject an application |
| `getBrandDashboard` | Overall brand performance |
| `listBrandAffiliates` | Affiliates working with you |

## Development

```bash
npm install
AFFILYNC_TOKEN=<token> npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AFFILYNC_TOKEN` | Yes | — | JWT access token |
| `AFFILYNC_API_URL` | No | `https://api.affilync.com` | API base URL |
| `AFFILYNC_READONLY` | No | `0` | Set to `1`/`true` to register read tools only (no mutations) |
