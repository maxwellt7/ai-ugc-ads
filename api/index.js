import serverless from "serverless-http";
import { createApp } from "../dist/index.js";

let cachedHandler = null;

async function getHandler() {
  if (!cachedHandler) {
    const app = await createApp({ enableVite: false });
    cachedHandler = serverless(app);
  }
  return cachedHandler;
}

export default async function handler(req, res) {
  const appHandler = await getHandler();
  return appHandler(req, res);
}
