export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || "manus").toLowerCase();
  if (authProvider === "custom") {
    return import.meta.env.VITE_CUSTOM_LOGIN_URL || "/login";
  }
  if (authProvider === "clerk") {
    return import.meta.env.VITE_CLERK_SIGN_IN_URL || "/sign-in";
  }
  if (authProvider === "auth0" || authProvider === "supabase") {
    return import.meta.env.VITE_EXTERNAL_LOGIN_URL || "/login";
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
