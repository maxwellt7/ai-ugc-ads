import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "./cookies";
import { services } from "../services/runtimeServices";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await services.auth.authenticateRequest(opts.req);
  } catch (error) {
    // If there's a cookie but it failed verification, clear it so the browser
    // stops sending a stale/invalid token (e.g. from a different project).
    const rawCookie = opts.req.headers.cookie || "";
    if (rawCookie.includes(COOKIE_NAME)) {
      const cookieOptions = getSessionCookieOptions(opts.req);
      opts.res.clearCookie(COOKIE_NAME, cookieOptions);
    }
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
