import { describe, expect, it } from "vitest";

describe("Shotstack API Key Validation", () => {
  it("SHOTSTACK_API_KEY environment variable is set", () => {
    const key = process.env.SHOTSTACK_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(0);
  });

  it("can reach Shotstack API with the key", async () => {
    const key = process.env.SHOTSTACK_API_KEY!;
    // Use the stage (sandbox) API to avoid production charges
    const response = await fetch("https://api.shotstack.io/stage/render", {
      method: "GET",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
      },
    });
    // A GET to /render should return 200 with a list (even if empty)
    // or 401/403 if the key is invalid
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 10000);
});
