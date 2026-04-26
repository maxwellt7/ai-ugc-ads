import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the wavespeed module
vi.mock("./wavespeed", () => ({
  submitVideoTask: vi.fn().mockResolvedValue({
    code: 200,
    message: "success",
    data: {
      id: "ws-task-123",
      model: "seedance-2.0",
      outputs: [],
      urls: { get: "https://api.wavespeed.ai/api/v3/predictions/ws-task-123/result" },
      status: "created",
      created_at: "2026-01-01T00:00:00Z",
      error: "",
    },
  }),
  getVideoTaskResult: vi.fn().mockResolvedValue({
    code: 200,
    message: "success",
    data: {
      id: "ws-task-123",
      outputs: ["https://cdn.wavespeed.ai/videos/test-output.mp4"],
      status: "completed",
      error: "",
    },
  }),
}));

// Mock the db module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    createVideoJob: vi.fn().mockResolvedValue(1),
    getVideoJobsByBriefId: vi.fn().mockResolvedValue([
      {
        id: 1,
        briefId: 1,
        userId: 1,
        segmentIndex: 0,
        prompt: "test prompt",
        status: "completed",
        wavespeedTaskId: "ws-task-123",
        videoUrl: "https://cdn.wavespeed.ai/videos/test.mp4",
        errorMessage: null,
        aspectRatio: "9:16",
        resolution: "720p",
        duration: 5,
        createdAt: new Date(),
      },
    ]),
    getVideoJobById: vi.fn().mockResolvedValue({
      id: 1,
      briefId: 1,
      userId: 1,
      segmentIndex: 0,
      prompt: "test prompt",
      status: "completed",
      wavespeedTaskId: "ws-task-123",
      videoUrl: "https://cdn.wavespeed.ai/videos/test.mp4",
      errorMessage: null,
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 5,
      createdAt: new Date(),
    }),
    getVideoJobByBriefAndSegment: vi.fn().mockResolvedValue(null),
    updateVideoJob: vi.fn().mockResolvedValue(undefined),
    getBriefById: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      productName: "Test Product",
      productDescription: "Test description",
      targetAudienceAge: "25-34",
      targetAudienceGender: "Female",
      targetAudienceLifestyle: "Active",
      adGoal: "awareness",
      toneVibe: "Casual",
      segmentCount: 2,
      scriptConcept: "Test concept",
      productImageUrl: null,
      imageAnalysis: null,
      generatedBrief: "# Test Brief",
      pinterestLinks: "[]",
      createdAt: new Date(),
    }),
  };
});

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("video.generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a video generation task and returns a job ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.generate({
      briefId: 1,
      segmentIndex: 0,
      prompt: "9:16. 15 seconds. Single continuous shot. UGC style.",
      duration: 5,
    });

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("status", "created");
    expect(result).toHaveProperty("wavespeedTaskId", "ws-task-123");
  });

  it("rejects when brief does not belong to user", async () => {
    const { getBriefById } = await import("./db");
    (getBriefById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      userId: 999, // different user
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.video.generate({
        briefId: 1,
        segmentIndex: 0,
        prompt: "test prompt",
      })
    ).rejects.toThrow("Brief not found or access denied");
  });

  it("validates segment index is between 0 and 3", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.video.generate({
        briefId: 1,
        segmentIndex: 5,
        prompt: "test prompt",
      })
    ).rejects.toThrow();
  });

  it("validates duration is between 4 and 15", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.video.generate({
        briefId: 1,
        segmentIndex: 0,
        prompt: "test prompt",
        duration: 20,
      })
    ).rejects.toThrow();
  });
});

describe("video.generateAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits multiple video generation tasks", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.generateAll({
      briefId: 1,
      segments: [
        { segmentIndex: 0, prompt: "Segment 1 prompt" },
        { segmentIndex: 1, prompt: "Segment 2 prompt" },
      ],
      duration: 5,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toHaveProperty("status", "created");
    expect(result.results[1]).toHaveProperty("status", "created");
  });
});

describe("video.checkStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns completed status with video URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.checkStatus({ jobId: 1 });

    expect(result.status).toBe("completed");
    expect(result.videoUrl).toBe("https://cdn.wavespeed.ai/videos/test.mp4");
  });

  it("rejects when job does not belong to user", async () => {
    const { getVideoJobById } = await import("./db");
    (getVideoJobById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      userId: 999, // different user
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.video.checkStatus({ jobId: 1 })).rejects.toThrow(
      "Video job not found or access denied"
    );
  });

  it("polls WaveSpeed API and updates videoUrl when in-progress job completes", async () => {
    const { getVideoJobById, updateVideoJob } = await import("./db");
    // Return an in-progress job (not yet completed)
    (getVideoJobById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 2,
      briefId: 1,
      userId: 1,
      segmentIndex: 0,
      prompt: "test prompt",
      status: "processing",
      wavespeedTaskId: "ws-task-456",
      videoUrl: null,
      errorMessage: null,
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 5,
      createdAt: new Date(),
    });

    // WaveSpeed returns completed with video URL
    const { getVideoTaskResult } = await import("./wavespeed");
    (getVideoTaskResult as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      message: "success",
      data: {
        id: "ws-task-456",
        outputs: ["https://cdn.wavespeed.ai/videos/final-output.mp4"],
        status: "completed",
        error: "",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.checkStatus({ jobId: 2 });

    expect(result.status).toBe("completed");
    expect(result.videoUrl).toBe("https://cdn.wavespeed.ai/videos/final-output.mp4");
    // Verify updateVideoJob was called with the video URL
    expect(updateVideoJob).toHaveBeenCalledWith(2, expect.objectContaining({
      status: "completed",
      videoUrl: "https://cdn.wavespeed.ai/videos/final-output.mp4",
    }));
  });

  it("polls WaveSpeed API and records error when job fails", async () => {
    const { getVideoJobById, updateVideoJob } = await import("./db");
    (getVideoJobById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 3,
      briefId: 1,
      userId: 1,
      segmentIndex: 1,
      prompt: "test prompt",
      status: "processing",
      wavespeedTaskId: "ws-task-789",
      videoUrl: null,
      errorMessage: null,
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 5,
      createdAt: new Date(),
    });

    const { getVideoTaskResult } = await import("./wavespeed");
    (getVideoTaskResult as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: 200,
      message: "success",
      data: {
        id: "ws-task-789",
        outputs: [],
        status: "failed",
        error: "Content moderation rejected",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.checkStatus({ jobId: 3 });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("Content moderation rejected");
    expect(updateVideoJob).toHaveBeenCalledWith(3, expect.objectContaining({
      status: "failed",
      errorMessage: "Content moderation rejected",
    }));
  });
});

describe("video.listByBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns video jobs for a brief", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.listByBrief({ briefId: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("segmentIndex", 0);
    expect(result[0]).toHaveProperty("status", "completed");
    expect(result[0]).toHaveProperty("videoUrl", "https://cdn.wavespeed.ai/videos/test.mp4");
  });
});
