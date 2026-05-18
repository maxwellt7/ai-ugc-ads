import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user-" + userId,
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

// Mock the db module
vi.mock("./db", () => ({
  createBrief: vi.fn().mockResolvedValue(42),
  getBriefsByUserId: vi.fn().mockResolvedValue([
    {
      id: 1,
      productName: "TestProduct",
      adGoal: "awareness",
      segmentCount: 2,
      createdAt: new Date("2025-01-01"),
    },
  ]),
  getBriefById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) {
      return Promise.resolve({
        id: 1,
        userId: 1,
        productName: "TestProduct",
        productDescription: "A test product",
        targetAudienceAge: "25-35",
        targetAudienceGender: "Female",
        targetAudienceLifestyle: "Health-conscious",
        adGoal: "awareness",
        toneVibe: "casual",
        segmentCount: 2,
        scriptConcept: "Test script",
        productImageUrl: null,
        imageAnalysis: null,
        generatedBrief: "# Test Brief\n\n## Step 1\n\n### Segment 1 of 2 — Hook\n\n```\nTest prompt\n```",
        pinterestLinks: JSON.stringify(["https://www.pinterest.com/search/pins/?q=test"]),
        createdAt: new Date("2025-01-01"),
      });
    }
    return Promise.resolve(null);
  }),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  updateBrief: vi.fn().mockResolvedValue(undefined),
  getVideoSummaryByBriefIds: vi.fn().mockResolvedValue([]),
  getStitchSummaryByBriefIds: vi.fn().mockResolvedValue([]),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    id: "test",
    created: Date.now(),
    model: "test",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            "# Your UGC Ad — Director's Brief\n\n**Product:** TestProduct\n\nhttps://www.pinterest.com/search/pins/?q=test+one\nhttps://www.pinterest.com/search/pins/?q=test+two\nhttps://www.pinterest.com/search/pins/?q=test+three\nhttps://www.pinterest.com/search/pins/?q=test+four\n\n### Segment 1 of 2 — Hook (0:00-0:15)\n\n```\n9:16. 15 seconds. Test prompt content.\n```\n\n### Segment 2 of 2 — CTA (0:15-0:30)\n\n```\n9:16. 15 seconds. Test CTA prompt.\n```",
        },
        finish_reason: "stop",
      },
    ],
  }),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock the storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

describe("brief.generate", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.generate({
        productName: "Test",
        productDescription: "A test",
        targetAudienceAge: "25-35",
        targetAudienceGender: "Female",
        targetAudienceLifestyle: "Active",
        adGoal: "awareness",
        toneVibe: "casual",
        segmentCount: 2,
        scriptConcept: "Test script",
      })
    ).rejects.toThrow();
  });

  it("generates a brief and returns briefId, content, and pinterest links", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.generate({
      productName: "TestProduct",
      productDescription: "A test product description",
      targetAudienceAge: "25-35",
      targetAudienceGender: "Female",
      targetAudienceLifestyle: "Health-conscious",
      adGoal: "awareness",
      toneVibe: "casual and genuine",
      segmentCount: 2,
      scriptConcept: "Show someone discovering the product",
    });

    expect(result.briefId).toBe(42);
    expect(result.generatedBrief).toContain("Director's Brief");
    expect(result.pinterestLinks).toBeInstanceOf(Array);
    expect(result.pinterestLinks.length).toBe(4);
    expect(result.pinterestLinks[0]).toContain("pinterest.com");
  });

  it("validates segment count is between 1 and 4", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.generate({
        productName: "Test",
        productDescription: "A test",
        targetAudienceAge: "25-35",
        targetAudienceGender: "Female",
        targetAudienceLifestyle: "Active",
        adGoal: "awareness",
        toneVibe: "casual",
        segmentCount: 5,
        scriptConcept: "Test script",
      })
    ).rejects.toThrow();

    await expect(
      caller.brief.generate({
        productName: "Test",
        productDescription: "A test",
        targetAudienceAge: "25-35",
        targetAudienceGender: "Female",
        targetAudienceLifestyle: "Active",
        adGoal: "awareness",
        toneVibe: "casual",
        segmentCount: 0,
        scriptConcept: "Test script",
      })
    ).rejects.toThrow();
  });

  it("validates adGoal is one of awareness, conversion, retention", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.generate({
        productName: "Test",
        productDescription: "A test",
        targetAudienceAge: "25-35",
        targetAudienceGender: "Female",
        targetAudienceLifestyle: "Active",
        adGoal: "invalid" as any,
        toneVibe: "casual",
        segmentCount: 2,
        scriptConcept: "Test script",
      })
    ).rejects.toThrow();
  });
});

describe("brief.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.brief.list()).rejects.toThrow();
  });

  it("returns briefs for the authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.list();
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1);
    expect(result[0].productName).toBe("TestProduct");
  });
});

describe("brief.getById", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.brief.getById({ id: 1 })).rejects.toThrow();
  });

  it("returns a brief by id for the correct user", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.getById({ id: 1 });
    expect(result).not.toBeNull();
    expect(result!.productName).toBe("TestProduct");
    expect(result!.generatedBrief).toContain("Test Brief");
  });

  it("returns null for a brief belonging to another user", async () => {
    const { ctx } = createAuthContext(999);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.getById({ id: 1 });
    expect(result).toBeNull();
  });

  it("returns null for non-existent brief", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.getById({ id: 999 });
    expect(result).toBeNull();
  });
});

describe("brief.uploadImage", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.uploadImage({
        fileName: "test.png",
        fileBase64: "iVBORw0KGgo=",
        contentType: "image/png",
      })
    ).rejects.toThrow();
  });

  it("uploads an image and returns a URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.uploadImage({
      fileName: "test.png",
      fileBase64: "iVBORw0KGgo=",
      contentType: "image/png",
    });

    expect(result.url).toBe("/manus-storage/test-key");
  });
});

describe("brief.analyzeImage", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.analyzeImage({ imageUrl: "https://example.com/img.png" })
    ).rejects.toThrow();
  });
});

describe("brief.update", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.update({ id: 1, editedBrief: "Updated brief content" })
    ).rejects.toThrow();
  });

  it("updates the brief with edited content", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.update({
      id: 1,
      editedBrief: "# Edited Brief\n\nNew content here",
    });

    expect(result.success).toBe(true);

    const { updateBrief } = await import("./db");
    expect(updateBrief).toHaveBeenCalledWith(1, {
      editedBrief: "# Edited Brief\n\nNew content here",
    });
  });

  it("rejects when brief belongs to another user", async () => {
    const { ctx } = createAuthContext(999);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.update({ id: 1, editedBrief: "Hacked content" })
    ).rejects.toThrow("Brief not found or access denied");
  });

  it("rejects when brief does not exist", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.update({ id: 999, editedBrief: "Content" })
    ).rejects.toThrow("Brief not found or access denied");
  });
});

describe("brief.updateCreatorImage", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.updateCreatorImage({ id: 1, creatorImageUrl: "https://example.com/img.png" })
    ).rejects.toThrow();
  });

  it("updates the creator image URL on the brief", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.updateCreatorImage({
      id: 1,
      creatorImageUrl: "https://example.com/creator.png",
    });

    expect(result.success).toBe(true);
    expect(result.creatorImageUrl).toBe("https://example.com/creator.png");

    const { updateBrief } = await import("./db");
    expect(updateBrief).toHaveBeenCalledWith(1, {
      creatorImageUrl: "https://example.com/creator.png",
    });
  });

  it("rejects when brief belongs to another user", async () => {
    const { ctx } = createAuthContext(999);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.brief.updateCreatorImage({ id: 1, creatorImageUrl: "https://example.com/img.png" })
    ).rejects.toThrow("Brief not found or access denied");
  });
});

describe("brief.generate with intakeMode", () => {
  it("accepts intakeMode=script and generates a brief", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.generate({
      productName: "TestProduct",
      productDescription: "A test product",
      targetAudienceAge: "25-35",
      targetAudienceGender: "Female",
      targetAudienceLifestyle: "Health-conscious",
      adGoal: "awareness",
      toneVibe: "casual",
      segmentCount: 2,
      scriptConcept: "[HOOK] Hey check this out\n[PROBLEM] I used to struggle with...\n[CTA] Link in bio",
      intakeMode: "script",
    });

    expect(result.briefId).toBe(42);
    expect(result.generatedBrief).toContain("Director's Brief");
  });

  it("accepts intakeMode=description (default behavior)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.brief.generate({
      productName: "TestProduct",
      productDescription: "A test product",
      targetAudienceAge: "25-35",
      targetAudienceGender: "Female",
      targetAudienceLifestyle: "Health-conscious",
      adGoal: "awareness",
      toneVibe: "casual",
      segmentCount: 2,
      scriptConcept: "Show someone discovering the product",
      intakeMode: "description",
    });

    expect(result.briefId).toBe(42);
    expect(result.generatedBrief).toContain("Director's Brief");
  });
});
