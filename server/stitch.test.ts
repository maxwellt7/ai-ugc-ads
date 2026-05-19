import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the shotstack module
vi.mock("./shotstack", () => ({
  buildStitchEdit: vi.fn().mockReturnValue({
    timeline: { tracks: [{ clips: [] }], background: "#000000" },
    output: { format: "mp4", resolution: "hd", aspectRatio: "9:16" },
  }),
  submitShotstackRender: vi.fn().mockResolvedValue({
    success: true,
    message: "Created",
    response: { message: "Render queued", id: "render-abc-123" },
  }),
  getShotstackRenderStatus: vi.fn().mockResolvedValue({
    success: true,
    message: "OK",
    response: {
      status: "rendering",
      id: "render-abc-123",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:01:00Z",
    },
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
  getBriefById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    productName: "Test Product",
    segmentCount: 2,
  }),
  getVideoJobsByBriefId: vi.fn().mockResolvedValue([
    {
      id: 10,
      briefId: 1,
      userId: 1,
      segmentIndex: 0,
      status: "completed",
      videoUrl: "https://example.com/video-0.mp4",
      duration: 15,
      errorMessage: null,
      wavespeedTaskId: "task-0",
    },
    {
      id: 11,
      briefId: 1,
      userId: 1,
      segmentIndex: 1,
      status: "completed",
      videoUrl: "https://example.com/video-1.mp4",
      duration: 15,
      errorMessage: null,
      wavespeedTaskId: "task-1",
    },
  ]),
  createStitchJob: vi.fn().mockResolvedValue(100),
  updateStitchJob: vi.fn().mockResolvedValue(undefined),
  getStitchJobById: vi.fn().mockResolvedValue({
    id: 100,
    briefId: 1,
    userId: 1,
    shotstackRenderId: "render-abc-123",
    status: "rendering",
    finalVideoUrl: null,
    errorMessage: null,
    segmentCount: 2,
    aspectRatio: "9:16",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getStitchJobByBriefId: vi.fn().mockResolvedValue({
    id: 100,
    briefId: 1,
    userId: 1,
    shotstackRenderId: "render-abc-123",
    status: "rendering",
    finalVideoUrl: null,
    errorMessage: null,
    segmentCount: 2,
    aspectRatio: "9:16",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  // Keep other db functions as no-ops
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createBrief: vi.fn(),
  getBriefsByUserId: vi.fn().mockResolvedValue([]),
  createVideoJob: vi.fn(),
  getVideoJobById: vi.fn(),
  getVideoJobByBriefAndSegment: vi.fn(),
  updateVideoJob: vi.fn(),
  deleteVideoJob: vi.fn(),
  updateBrief: vi.fn().mockResolvedValue(undefined),
  deleteStitchJob: vi.fn(),
  getVideoSummaryByBriefIds: vi.fn().mockResolvedValue([]),
  getStitchSummaryByBriefIds: vi.fn().mockResolvedValue([]),
}));

// Mock notification
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "mocked" } }],
  }),
}));

// Mock wavespeed
vi.mock("./wavespeed", () => ({
  submitVideoTask: vi.fn(),
  getVideoTaskResult: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("stitch.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a stitch job and submits to Shotstack", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.create({ briefId: 1 });

    expect(result.stitchJobId).toBe(100);
    expect(result.shotstackRenderId).toBe("render-abc-123");
    expect(result.status).toBe("queued");
    expect(result.segmentCount).toBe(2);
  });

  it("passes correct segment videos to buildStitchEdit", async () => {
    const { buildStitchEdit } = await import("./shotstack");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.stitch.create({ briefId: 1 });

    expect(buildStitchEdit).toHaveBeenCalledWith(
      [
        { url: "https://example.com/video-0.mp4", duration: 15 },
        { url: "https://example.com/video-1.mp4", duration: 15 },
      ],
      "9:16",
      undefined
    );
  });

  it("throws when no completed video segments exist", async () => {
    const { getVideoJobsByBriefId } = await import("./db");
    (getVideoJobsByBriefId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stitch.create({ briefId: 1 })).rejects.toThrow(
      "No completed video segments to stitch"
    );
  });

  it("throws when brief does not belong to user", async () => {
    const { getBriefById } = await import("./db");
    (getBriefById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      userId: 999, // different user
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stitch.create({ briefId: 1 })).rejects.toThrow(
      "Brief not found or access denied"
    );
  });
});

describe("stitch.checkStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns current status when rendering", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.checkStatus({ stitchJobId: 100 });

    expect(result.id).toBe(100);
    expect(result.status).toBe("rendering");
    expect(result.finalVideoUrl).toBeNull();
  });

  it("returns done status with video URL when render completes", async () => {
    const { getShotstackRenderStatus } = await import("./shotstack");
    (getShotstackRenderStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      message: "OK",
      response: {
        status: "done",
        id: "render-abc-123",
        url: "https://cdn.shotstack.io/final-ad.mp4",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:02:00Z",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.checkStatus({ stitchJobId: 100 });

    expect(result.status).toBe("done");
    expect(result.finalVideoUrl).toBe("https://cdn.shotstack.io/final-ad.mp4");
  });

  it("returns failed status with error message when render fails", async () => {
    const { getShotstackRenderStatus } = await import("./shotstack");
    (getShotstackRenderStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      message: "OK",
      response: {
        status: "failed",
        id: "render-abc-123",
        error: "Invalid source video",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:02:00Z",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.checkStatus({ stitchJobId: 100 });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("Invalid source video");
  });

  it("updates stitch job in DB when status changes to done", async () => {
    const { getShotstackRenderStatus } = await import("./shotstack");
    const { updateStitchJob } = await import("./db");

    (getShotstackRenderStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      message: "OK",
      response: {
        status: "done",
        id: "render-abc-123",
        url: "https://cdn.shotstack.io/final-ad.mp4",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:02:00Z",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.stitch.checkStatus({ stitchJobId: 100 });

    expect(updateStitchJob).toHaveBeenCalledWith(100, {
      status: "done",
      finalVideoUrl: "https://cdn.shotstack.io/final-ad.mp4",
    });
  });
});

describe("stitch.getByBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stitch job for a brief", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.getByBrief({ briefId: 1 });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(100);
    expect(result!.status).toBe("rendering");
    expect(result!.segmentCount).toBe(2);
  });

  it("returns null when no stitch job exists", async () => {
    const { getStitchJobByBriefId } = await import("./db");
    (getStitchJobByBriefId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.getByBrief({ briefId: 1 });

    expect(result).toBeNull();
  });

  it("returns persisted finalVideoUrl after checkStatus updates it to done", async () => {
    const { getStitchJobByBriefId } = await import("./db");
    // Simulate that the DB now has the completed stitch job with finalVideoUrl
    (getStitchJobByBriefId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 100,
      briefId: 1,
      userId: 1,
      shotstackRenderId: "render-abc-123",
      status: "done",
      finalVideoUrl: "https://cdn.shotstack.io/final-ad.mp4",
      errorMessage: null,
      segmentCount: 2,
      aspectRatio: "9:16",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.getByBrief({ briefId: 1 });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("done");
    expect(result!.finalVideoUrl).toBe("https://cdn.shotstack.io/final-ad.mp4");
    expect(result!.segmentCount).toBe(2);
  });
});

describe("shotstack.buildStitchEdit", () => {
  it("builds correct edit payload with fade transitions", async () => {
    // Use the real implementation by importing the actual module
    const actual = await vi.importActual<typeof import("./shotstack")>("./shotstack");
    const { buildStitchEdit } = actual;

    const segments = [
      { url: "https://example.com/v1.mp4", duration: 15 },
      { url: "https://example.com/v2.mp4", duration: 15 },
      { url: "https://example.com/v3.mp4", duration: 15 },
    ];

    const edit = buildStitchEdit(segments, "9:16");

    expect(edit.timeline.tracks).toHaveLength(1);
    expect(edit.timeline.tracks[0].clips).toHaveLength(3);
    expect(edit.output.format).toBe("mp4");
    expect(edit.output.aspectRatio).toBe("9:16");
    expect(edit.output.resolution).toBe("hd");

    // First clip: only out transition
    expect(edit.timeline.tracks[0].clips[0].start).toBe(0);
    expect(edit.timeline.tracks[0].clips[0].length).toBe(15);
    expect(edit.timeline.tracks[0].clips[0].transition?.out).toBe("fade");
    expect(edit.timeline.tracks[0].clips[0].transition?.in).toBeUndefined();

    // Middle clip: both in and out transitions
    expect(edit.timeline.tracks[0].clips[1].start).toBe(14.5);
    expect(edit.timeline.tracks[0].clips[1].transition?.in).toBe("fade");
    expect(edit.timeline.tracks[0].clips[1].transition?.out).toBe("fade");

    // Last clip: only in transition
    expect(edit.timeline.tracks[0].clips[2].start).toBe(29);
    expect(edit.timeline.tracks[0].clips[2].transition?.in).toBe("fade");
    expect(edit.timeline.tracks[0].clips[2].transition?.out).toBeUndefined();
  });

  it("handles single segment without transitions", async () => {
    const actual = await vi.importActual<typeof import("./shotstack")>("./shotstack");
    const { buildStitchEdit } = actual;

    const segments = [{ url: "https://example.com/v1.mp4", duration: 15 }];
    const edit = buildStitchEdit(segments, "9:16");

    expect(edit.timeline.tracks[0].clips).toHaveLength(1);
    expect(edit.timeline.tracks[0].clips[0].transition).toBeUndefined();
  });
});

describe("stitch.reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes existing stitch job and returns success", async () => {
    const { deleteStitchJob } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.reset({ briefId: 1 });

    expect(result.success).toBe(true);
    expect(deleteStitchJob).toHaveBeenCalledWith(100);
  });

  it("succeeds even when no stitch job exists", async () => {
    const { getStitchJobByBriefId, deleteStitchJob } = await import("./db");
    (getStitchJobByBriefId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stitch.reset({ briefId: 1 });

    expect(result.success).toBe(true);
    expect(deleteStitchJob).not.toHaveBeenCalled();
  });

  it("throws when brief does not belong to user", async () => {
    const { getBriefById } = await import("./db");
    (getBriefById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      userId: 999,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stitch.reset({ briefId: 1 })).rejects.toThrow(
      "Brief not found or access denied"
    );
  });
});
