# @affilync/mcp-server

MCP (Model Context Protocol) server for [Affilync](https://app.affilync.com) — manage affiliate marketing directly from Claude.

This package ships **two** servers that expose the same tools:

| | Transport | Auth | Who runs it |
|---|---|---|---|
| **`affilync-mcp`** (stdio) | local subprocess | `AFFILYNC_TOKEN` env | each user, locally |
| **`affilync-mcp-remote`** (HTTP) | hosted at `mcp.affilync.com` | OAuth 2.1 ("Connect Affilync") | Affilync (one deployment) |

The **remote** server is the one Claude connects to by URL with one-click OAuth — see [Remote server](#remote-server-oauth-protected-resource). The **stdio** server (below) is for local/manual use with a pasted token.

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

## Environment Variables (stdio server)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AFFILYNC_TOKEN` | Yes | — | JWT access token |
| `AFFILYNC_API_URL` | No | `https://api.affilync.com` | API base URL |
| `AFFILYNC_READONLY` | No | `0` | Set to `1`/`true` to register read tools only (no mutations) |

## Remote server (OAuth Protected Resource)

`affilync-mcp-remote` is an HTTP server that Claude (or any MCP client) adds by
**URL** and authenticates against with OAuth — no token to paste. It exposes the
same tools as the stdio server, registered per-request from the user's token.

Per the MCP authorization spec it is an OAuth 2.0 **Protected Resource**:

- `GET /.well-known/oauth-protected-resource` (RFC 9728) points clients at the
  Affilync Authorization Server (`api.affilync.com`).
- Unauthenticated MCP calls get `401` + `WWW-Authenticate: Bearer resource_metadata="…"`,
  so the client knows where to start the OAuth flow.
- Each request's bearer token is verified **offline** against the AS's published
  JWKS and MUST be **audience-bound** to this server (RFC 8707) — a token minted
  for another Affilync client cannot be replayed here.
- The token is then forwarded to `/api/gpt/v1/*`, where the backend re-enforces
  auth, user-type and write-scope. A token without `api:write` runs read-only.

### Run it

```bash
npm ci && npm run build
AFFILYNC_API_URL=https://api.affilync.com \
MCP_RESOURCE_URL=https://mcp.affilync.com \
npm run start:remote          # or: affilync-mcp-remote
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_RESOURCE_URL` | `https://mcp.affilync.com` | This server's public URL (its OAuth resource identifier) |
| `AFFILYNC_API_URL` | `https://api.affilync.com` | Authorization Server + API origin |
| `PORT` | `8080` | HTTP port (Render sets this) |

### Deploy

`render.yaml` defines the `affilync-mcp-remote` web service. Two operator steps
are required to go live (they can't be done from CI):

1. Create the service from the blueprint (Render → New → Blueprint on this repo).
2. Add DNS + custom domain: Cloudflare `CNAME mcp → <service>.onrender.com`
   (proxied) and add `mcp.affilync.com` as a custom domain on the Render service.

Health check: `GET /healthz`.
