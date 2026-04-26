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

// Mock the LLM module (needed for video.regenerate)
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
          content: "9:16. 15 seconds. Revised prompt based on feedback. UGC style. iPhone handheld.\n\n[0:00-0:05] Revised opening.\n\n[0:05-0:10] Revised middle.\n\n[0:10-0:15] Revised ending.\n\nAudio: Warm female voice. Bedroom acoustics.",
        },
        finish_reason: "stop",
      },
    ],
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
        duration: 15,
        feedback: null,
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
      duration: 15,
      feedback: null,
      createdAt: new Date(),
    }),
    getVideoJobByBriefAndSegment: vi.fn().mockResolvedValue(null),
    updateVideoJob: vi.fn().mockResolvedValue(undefined),
    deleteVideoJob: vi.fn().mockResolvedValue(undefined),
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
      duration: 15,
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
      duration: 15,
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
      duration: 15,
      feedback: null,
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
      duration: 15,
      feedback: null,
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
    expect(result[0]).toHaveProperty("duration", 15);
  });
});

describe("video.regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.video.regenerate({
        briefId: 1,
        segmentIndex: 0,
        originalPrompt: "original prompt",
        feedback: "make it brighter",
      })
    ).rejects.toThrow();
  });

  it("rejects when brief does not belong to user", async () => {
    const { getBriefById } = await import("./db");
    (getBriefById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      userId: 999,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.video.regenerate({
        briefId: 1,
        segmentIndex: 0,
        originalPrompt: "original prompt",
        feedback: "make it brighter",
      })
    ).rejects.toThrow("Brief not found or access denied");
  });

  it("uses LLM to revise the prompt based on feedback and submits to WaveSpeed", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 0,
      originalPrompt: "9:16. 15 seconds. Original prompt content.",
      feedback: "Make the lighting warmer and the creator should be smiling more",
      duration: 15,
    });

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("status", "created");
    expect(result).toHaveProperty("revisedPrompt");
    expect(result).toHaveProperty("wavespeedTaskId", "ws-task-123");
    expect(result.revisedPrompt).toContain("Revised prompt based on feedback");
  });

  it("calls invokeLLM with original prompt and feedback", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 0,
      originalPrompt: "Original prompt text",
      feedback: "Add more product close-ups",
    });

    const { invokeLLM } = await import("./_core/llm");
    expect(invokeLLM).toHaveBeenCalledWith({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Original prompt text"),
        }),
      ]),
    });
    const call = (invokeLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMsg = call.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg.content).toContain("Add more product close-ups");
  });

  it("deletes existing video job before creating a new one", async () => {
    const { getVideoJobByBriefAndSegment, deleteVideoJob, createVideoJob } = await import("./db");
    (getVideoJobByBriefAndSegment as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 42,
      briefId: 1,
      userId: 1,
      segmentIndex: 0,
      status: "completed",
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 0,
      originalPrompt: "original prompt",
      feedback: "improve lighting",
    });

    expect(deleteVideoJob).toHaveBeenCalledWith(42);
    expect(createVideoJob).toHaveBeenCalledWith(
      expect.objectContaining({
        briefId: 1,
        segmentIndex: 0,
        feedback: "improve lighting",
        duration: 15,
      })
    );
  });

  it("stores feedback in the new video job record", async () => {
    const { createVideoJob } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 1,
      originalPrompt: "original prompt",
      feedback: "The product should be more visible in frame",
    });

    expect(createVideoJob).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: "The product should be more visible in frame",
        segmentIndex: 1,
      })
    );
  });

  it("submits revised prompt to WaveSpeed with correct duration", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 0,
      originalPrompt: "original prompt",
      feedback: "brighter lighting",
      duration: 15,
    });

    const { submitVideoTask } = await import("./wavespeed");
    expect(submitVideoTask).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 15,
        aspectRatio: "9:16",
      })
    );
    const call = (submitVideoTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain("Revised prompt based on feedback");
  });

  it("defaults to 15 second duration when not specified", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.video.regenerate({
      briefId: 1,
      segmentIndex: 0,
      originalPrompt: "original prompt",
      feedback: "make it better",
    });

    const { submitVideoTask } = await import("./wavespeed");
    expect(submitVideoTask).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 15 })
    );

    const { createVideoJob } = await import("./db");
    expect(createVideoJob).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 15 })
    );
  });
});
