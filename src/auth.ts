/**
 * OAuth 2.1 access-token verification for the remote MCP server.
 *
 * The MCP server is an OAuth *Protected Resource*: it validates the bearer
 * access token OFFLINE against the Authorization Server's published JWKS
 * (`${AFFILYNC_API_URL}/.well-known/jwks.json`) and — critically — checks that
 * the token's audience includes THIS server's resource URL (RFC 8707). That
 * audience binding is what prevents a token minted for another Affilync client
 * from being replayed here (confused-deputy / token pass-through).
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export interface VerifiedToken {
  sub: string;
  userType: string;
  scopes: string[];
  /** The raw bearer token, forwarded verbatim to /api/gpt/v1. */
  raw: string;
}

export interface AuthConfig {
  /** Authorization Server origin, e.g. https://api.affilync.com */
  issuerOrigin: string;
  /** This server's resource identifier, e.g. https://mcp.affilync.com */
  resource: string;
}

/** Raised when a token is missing/invalid — the caller responds 401. */
export class UnauthorizedError extends Error {}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(issuerOrigin: string) {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuerOrigin}/.well-known/jwks.json`), {
      // Cache the key set; jose refetches on unknown `kid` (rotation-safe).
      cacheMaxAge: 10 * 60 * 1000,
    });
  }
  return jwks;
}

export async function verifyAccessToken(
  token: string,
  cfg: AuthConfig,
  // Injectable for tests; production uses the AS's remote JWKS.
  keyResolver?: JWTVerifyGetKey
): Promise<VerifiedToken> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keyResolver ?? getJwks(cfg.issuerOrigin), {
      issuer: "affilync-api",
      // jose passes when the token's `aud` (array) CONTAINS this value — our
      // tokens are aud=[resource, "affilync-services"], so this asserts the
      // token was minted FOR this MCP server.
      audience: cfg.resource,
    }));
  } catch (e) {
    throw new UnauthorizedError(e instanceof Error ? e.message : "token verification failed");
  }

  // Belt-and-braces: only accept tokens explicitly minted for MCP use.
  if (payload.source !== "mcp_oauth") {
    throw new UnauthorizedError("token was not issued for MCP access");
  }

  const scopes = Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [];
  return {
    sub: String(payload.sub ?? ""),
    userType: String((payload as Record<string, unknown>).user_type ?? ""),
    scopes,
    raw: token,
  };
}

/** Extract a Bearer token from an Authorization header value. */
export function bearerFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
