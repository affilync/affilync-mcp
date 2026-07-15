import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { UnauthorizedError, bearerFromHeader, verifyAccessToken } from "../src/auth.js";

const ISSUER = "https://api.affilync.com";
const RESOURCE = "https://mcp.affilync.com";
const cfg = { issuerOrigin: ISSUER, resource: RESOURCE };

// Build a local keypair + a key resolver that returns its public key, so the
// crypto path runs without a network JWKS fetch.
async function makeSigner() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const resolver: JWTVerifyGetKey = (async () => publicKey) as unknown as JWTVerifyGetKey;
  const jwk = await exportJWK(publicKey);
  async function sign(claims: Record<string, unknown>, audience: string | string[]) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("affilync-api")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }
  return { sign, resolver, jwk };
}

describe("verifyAccessToken", () => {
  it("accepts a resource-bound mcp_oauth token and extracts scopes/userType", async () => {
    const { sign, resolver } = await makeSigner();
    const token = await sign(
      { source: "mcp_oauth", scopes: ["api:read", "api:write"], user_type: "brand" },
      [RESOURCE, "affilync-services"]
    );
    const out = await verifyAccessToken(token, cfg, resolver);
    expect(out.userType).toBe("brand");
    expect(out.scopes).toContain("api:write");
    expect(out.raw).toBe(token);
  });

  it("rejects a token whose audience is NOT this resource (confused-deputy)", async () => {
    const { sign, resolver } = await makeSigner();
    // A token minted only for the API gateway must not be accepted here.
    const token = await sign(
      { source: "mcp_oauth", scopes: ["api:read"], user_type: "affiliate" },
      ["affilync-services"]
    );
    await expect(verifyAccessToken(token, cfg, resolver)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a token that is not mcp_oauth-sourced", async () => {
    const { sign, resolver } = await makeSigner();
    const token = await sign(
      { scopes: ["api:read"], user_type: "affiliate" }, // no source
      [RESOURCE, "affilync-services"]
    );
    await expect(verifyAccessToken(token, cfg, resolver)).rejects.toThrow(/MCP access/);
  });

  it("rejects a token signed by a different key", async () => {
    const { sign } = await makeSigner();
    const other = await makeSigner();
    const token = await sign(
      { source: "mcp_oauth", scopes: ["api:read"], user_type: "affiliate" },
      [RESOURCE]
    );
    await expect(verifyAccessToken(token, cfg, other.resolver)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe("bearerFromHeader", () => {
  it("extracts the token", () => {
    expect(bearerFromHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerFromHeader("bearer   x")).toBe("x");
  });
  it("returns null when absent or malformed", () => {
    expect(bearerFromHeader(undefined)).toBeNull();
    expect(bearerFromHeader("Basic abc")).toBeNull();
    expect(bearerFromHeader("")).toBeNull();
  });
});
