import { describe, expect, it } from "vitest";

describe("WaveSpeed API Key Validation", () => {
  it("WAVESPEED_API_KEY environment variable is set", () => {
    const key = process.env.WAVESPEED_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });

  it("can reach WaveSpeed API with the key", async () => {
    const key = process.env.WAVESPEED_API_KEY;
    if (!key) {
      throw new Error("WAVESPEED_API_KEY not set");
    }

    // Use the balance check endpoint as a lightweight validation
    const response = await fetch("https://api.wavespeed.ai/api/v3/balance", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });

    // A valid key should return 200; invalid returns 401/403
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
  });
});
