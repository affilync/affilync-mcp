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
3. Use the token value as `AFFILYNC_TOKEN`

## Available Tools

### Shared (all users)
| Tool | Description |
|------|-------------|
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
