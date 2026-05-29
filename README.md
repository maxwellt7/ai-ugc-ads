# UGC Ad Director

UGC ad brief and production workflow app (React + Express/tRPC) with pluggable providers for auth, LLM, storage, video generation, and stitching.

## Deploy on Vercel

This repository is configured for Vercel with:
- serverless entrypoint at `api/index.ts`
- rewrites in `vercel.json`
- production static serving from `dist/public`

### 1) Install and build locally

```bash
pnpm install
pnpm build
```

### 2) Configure environment variables in Vercel

Copy values from `.env.example` and set them in your Vercel project.

Minimum required:
- `DATABASE_URL`
- `AUTH_PROVIDER`
- `LLM_PROVIDER`
- `STORAGE_PROVIDER`
- `WAVESPEED_API_KEY`
- `SHOTSTACK_API_KEY`

## Clerk Integration

To run with Clerk auth:

### 1) Set auth provider

- `AUTH_PROVIDER=clerk`
- `VITE_AUTH_PROVIDER=clerk`

### 2) Server-side JWT verification settings

Set these from your Clerk instance:
- `AUTH_JWT_ISSUER=https://<your-clerk-domain>`
- `AUTH_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json`
- `AUTH_JWT_AUDIENCE=<audience-if-used>`

### 3) Frontend Clerk settings

- `VITE_CLERK_PUBLISHABLE_KEY=<your-publishable-key>`
- `VITE_CLERK_SIGN_IN_URL=/sign-in`
- `VITE_CLERK_SIGN_UP_URL=/sign-up`
- `VITE_CLERK_JWT_TEMPLATE=backend` (or your configured Clerk JWT template)

### 4) Clerk dashboard

- Create/confirm JWT template used by `VITE_CLERK_JWT_TEMPLATE`.
- Ensure the template issuer/audience aligns with `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE`.

## Useful scripts

- `pnpm dev` - run local development server
- `pnpm build` - build client and server bundle
- `pnpm start` - run production bundle locally
- `pnpm check` - TypeScript check
- `pnpm test` - run tests

