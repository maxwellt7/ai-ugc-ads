import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME } from "../../shared/const";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  getStitchJobByProviderRenderId,
  getVideoJobByProviderTaskId,
  updateStitchJob,
  updateVideoJob,
} from "../db";
import { ENV } from "./env";
import type { Express } from "express";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function registerWebhookRoutes(app: Express) {
  app.post("/api/webhooks/wavespeed", async (req, res) => {
    if (!ENV.webhooksSharedSecret) {
      res.status(503).json({ error: "Webhooks not configured" });
      return;
    }
    if (req.headers["x-webhook-secret"] !== ENV.webhooksSharedSecret) {
      res.status(401).json({ error: "Unauthorized webhook call" });
      return;
    }

    const body = req.body as {
      taskId?: string;
      status?: string;
      outputUrl?: string;
      error?: string;
    };
    if (!body.taskId || !body.status) {
      res.status(400).json({ error: "taskId and status are required" });
      return;
    }

    const job = await getVideoJobByProviderTaskId(body.taskId);
    if (!job) {
      res.status(404).json({ error: "Video job not found" });
      return;
    }

    if (body.status === "completed") {
      await updateVideoJob(job.id, {
        status: "completed",
        videoUrl: body.outputUrl || null,
        errorMessage: null,
      });
    } else if (body.status === "failed") {
      await updateVideoJob(job.id, {
        status: "failed",
        errorMessage: body.error || "WaveSpeed webhook failure",
      });
    } else {
      await updateVideoJob(job.id, { status: "processing" });
    }

    res.json({ ok: true });
  });

  app.post("/api/webhooks/shotstack", async (req, res) => {
    if (!ENV.webhooksSharedSecret) {
      res.status(503).json({ error: "Webhooks not configured" });
      return;
    }
    if (req.headers["x-webhook-secret"] !== ENV.webhooksSharedSecret) {
      res.status(401).json({ error: "Unauthorized webhook call" });
      return;
    }

    const body = req.body as {
      renderId?: string;
      status?: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
      outputUrl?: string;
      error?: string;
    };
    if (!body.renderId || !body.status) {
      res.status(400).json({ error: "renderId and status are required" });
      return;
    }

    const job = await getStitchJobByProviderRenderId(body.renderId);
    if (!job) {
      res.status(404).json({ error: "Stitch job not found" });
      return;
    }

    if (body.status === "done") {
      await updateStitchJob(job.id, {
        status: "done",
        finalVideoUrl: body.outputUrl || null,
        errorMessage: null,
      });
    } else if (body.status === "failed") {
      await updateStitchJob(job.id, {
        status: "failed",
        errorMessage: body.error || "Shotstack webhook failure",
      });
    } else {
      await updateStitchJob(job.id, { status: body.status });
    }

    res.json({ ok: true });
  });
}

function registerAppRoutes(app: Express) {
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerWebhookRoutes(app);
  // Simple cookie-clearing endpoint for stale sessions
  app.get("/api/clear-session", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ cleared: true });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}

export async function createApp(options?: {
  server?: ReturnType<typeof createServer>;
  enableVite?: boolean;
}) {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerAppRoutes(app);

  const shouldUseVite =
    (options?.enableVite ?? true) && process.env.NODE_ENV === "development";
  // development mode uses Vite, production mode uses static files
  if (shouldUseVite) {
    if (!options?.server) {
      throw new Error("createApp requires a server instance when enableVite is true");
    }
    await setupVite(app, options.server);
  } else {
    serveStatic(app);
  }
  return app;
}

async function startServer() {
  const server = createServer();
  const app = await createApp({ server, enableVite: true });
  server.on("request", app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}
