import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { ClerkLoaded, ClerkLoading, ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();
const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || "manus").toLowerCase();
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkJwtTemplate = import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined;

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const authTokenStorageKey =
          import.meta.env.VITE_AUTH_TOKEN_STORAGE_KEY || "auth-token";
        let authToken =
          typeof window !== "undefined"
            ? window.localStorage.getItem(authTokenStorageKey)
            : null;

        if (authProvider === "clerk" && typeof window !== "undefined") {
          try {
            const clerk = (window as any).Clerk;
            if (clerk?.session) {
              authToken = await clerk.session.getToken(
                clerkJwtTemplate ? { template: clerkJwtTemplate } : undefined
              );
              if (authToken) {
                window.localStorage.setItem(authTokenStorageKey, authToken);
              }
            }
          } catch (error) {
            console.warn("[Auth] Failed to fetch Clerk token", error);
          }
        }

        const headers = new Headers(init?.headers || {});
        if (authToken) {
          headers.set("Authorization", `Bearer ${authToken}`);
        }
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers,
        });
      },
    }),
  ],
});

const AppProviders = (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

createRoot(document.getElementById("root")!).render(
  authProvider === "clerk" && clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkLoading />
      <ClerkLoaded>{AppProviders}</ClerkLoaded>
    </ClerkProvider>
  ) : (
    AppProviders
  )
);
