import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

type JwtClaims = {
  sub?: string;
  email?: string;
  name?: string;
};

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return new Map<string, string>();
  return new Map(Object.entries(parseCookieHeader(cookieHeader)));
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length);
}

async function verifyExternalJwt(token: string): Promise<JwtClaims> {
  const issuer = ENV.authJwtIssuer || undefined;
  const audience = ENV.authJwtAudience || undefined;

  if (ENV.authJwksUrl) {
    const jwks = createRemoteJWKSet(new URL(ENV.authJwksUrl));
    const verified = await jwtVerify(token, jwks, { issuer, audience });
    return verified.payload as JwtClaims;
  }

  if (!ENV.authJwtSecret) {
    throw ForbiddenError(
      "AUTH_JWKS_URL or AUTH_JWT_SECRET is required for JWT auth providers"
    );
  }

  const verified = await jwtVerify(
    token,
    new TextEncoder().encode(ENV.authJwtSecret),
    { issuer, audience }
  );
  return verified.payload as JwtClaims;
}

async function resolveOrCreateExternalUser(
  provider: string,
  claims: JwtClaims
): Promise<User> {
  const subject = claims.sub;
  if (!subject) throw ForbiddenError("JWT subject is missing");

  const existing = await db.getUserByExternalAuth(provider, subject);
  if (existing) {
    await db.upsertUser({
      openId: existing.openId,
      externalAuthProvider: provider,
      externalAuthId: subject,
      email: claims.email ?? existing.email,
      name: claims.name ?? existing.name,
      loginMethod: provider,
      lastSignedIn: new Date(),
    });
    return existing;
  }

  const fallbackOpenId = `${provider}:${subject}`;
  await db.upsertUser({
    openId: fallbackOpenId,
    externalAuthProvider: provider,
    externalAuthId: subject,
    email: claims.email ?? null,
    name: claims.name ?? null,
    loginMethod: provider,
    lastSignedIn: new Date(),
  });

  const created = await db.getUserByOpenId(fallbackOpenId);
  if (!created) {
    throw ForbiddenError("Failed to create user");
  }
  return created;
}

async function authenticateViaCustomCookie(req: Request): Promise<User | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  if (!sessionCookie) return null;

  const session = await sdk.verifySession(sessionCookie);
  if (!session) return null;

  const user = await db.getUserByOpenId(session.openId);
  if (!user) return null;
  await db.upsertUser({
    openId: user.openId,
    lastSignedIn: new Date(),
    loginMethod: "custom",
  });
  return user;
}

export async function authenticateRequest(req: Request): Promise<User> {
  const provider = ENV.authProvider.toLowerCase();
  if (provider === "manus") {
    return sdk.authenticateRequest(req);
  }

  if (provider === "custom") {
    const cookieUser = await authenticateViaCustomCookie(req);
    if (cookieUser) return cookieUser;
  }

  const token = getBearerToken(req);
  if (!token) {
    throw ForbiddenError("Missing bearer token");
  }
  const claims = await verifyExternalJwt(token);
  return resolveOrCreateExternalUser(provider, claims);
}
