import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation, useParams } from "wouter";
import { useMemo, useEffect, useRef } from "react";
import { ArrowLeft, Copy, Check, Download, Loader2, ExternalLink, Play, Film, RefreshCw, AlertCircle, Scissors, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Streamdown } from "streamdown";

function extractSegmentPrompts(brief: string): { title: string; prompt: string }[] {
  const segments: { title: string; prompt: string }[] = [];
  const regex = /###\s+Segment\s+\d+.*?\n[\s\S]*?```([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(brief)) !== null) {
    const fullMatch = match[0];
    const titleMatch = fullMatch.match(/###\s+(Segment\s+\d+.*)/);
    const title = titleMatch ? titleMatch[1].trim() : "Segment";
    const prompt = match[1].trim();
    segments.push({ title, prompt });
  }
  return segments;
}

type VideoJobStatus = "pending" | "created" | "processing" | "completed" | "failed";

interface VideoJobState {
  jobId: number;
  segmentIndex: number;
  status: VideoJobStatus;
  videoUrl: string | null;
  errorMessage: string | null;
}

function VideoStatusBadge({ status }: { status: VideoJobStatus }) {
  const config: Record<VideoJobStatus, { label: string; color: string }> = {
    pending: { label: "QUEUED", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
    created: { label: "SUBMITTED", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
    processing: { label: "GENERATING", color: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
    completed: { label: "COMPLETE", color: "bg-green-500/20 text-green-400 border-green-500/40" },
    failed: { label: "FAILED", color: "bg-red-500/20 text-red-400 border-red-500/40" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border ${c.color}`}>
      {(status === "created" || status === "processing") && (
        <Loader2 className="w-3 h-3 animate-spin" />
      )}
      {status === "completed" && <Check className="w-3 h-3" />}
      {status === "failed" && <AlertCircle className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

/** Hook that polls a single video job via tRPC until terminal state */
function useVideoJobPoller(jobId: number | null, segmentIndex: number, onUpdate: (state: VideoJobState) => void) {
  const shouldPoll = jobId !== null && jobId > 0;
  const terminalRef = useRef(false);

  const { data } = trpc.video.checkStatus.useQuery(
    { jobId: jobId! },
    {
      enabled: shouldPoll && !terminalRef.current,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 5000;
      },
    }
  );

  useEffect(() => {
    if (data) {
      const isTerminal = data.status === "completed" || data.status === "failed";
      terminalRef.current = isTerminal;
      onUpdate({
        jobId: data.id,
        segmentIndex: data.segmentIndex,
        status: data.status as VideoJobStatus,
        videoUrl: data.videoUrl ?? null,
        errorMessage: data.errorMessage ?? null,
      });
    }
  }, [data, segmentIndex, onUpdate]);
}

/** Wrapper component that polls one video job */
function VideoJobPoller({ jobId, segmentIndex, onUpdate }: { jobId: number; segmentIndex: number; onUpdate: (state: VideoJobState) => void }) {
  useVideoJobPoller(jobId, segmentIndex, onUpdate);
  return null;
}

export default function BriefResult() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const briefId = parseInt(params.id || "0", 10);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [videoJobs, setVideoJobs] = useState<Map<number, VideoJobState>>(new Map());
  const [generatingSegment, setGeneratingSegment] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [stitching, setStitching] = useState(false);

  const { data: brief, isLoading } = trpc.brief.getById.useQuery(
    { id: briefId },
    { enabled: briefId > 0 && isAuthenticated }
  );

  // Load existing video jobs for this brief via tRPC
  const { data: existingJobs } = trpc.video.listByBrief.useQuery(
    { briefId },
    { enabled: briefId > 0 && isAuthenticated }
  );

  // Seed videoJobs state from existing DB records
  useEffect(() => {
    if (existingJobs && existingJobs.length > 0) {
      setVideoJobs((prev) => {
        const next = new Map(prev);
        for (const job of existingJobs) {
          next.set(job.segmentIndex, {
            jobId: job.id,
            segmentIndex: job.segmentIndex,
            status: job.status as VideoJobStatus,
            videoUrl: job.videoUrl,
            errorMessage: job.errorMessage,
          });
        }
        return next;
      });
    }
  }, [existingJobs]);

  const segments = useMemo(() => {
    if (!brief?.generatedBrief) return [];
    return extractSegmentPrompts(brief.generatedBrief);
  }, [brief?.generatedBrief]);

  const generateMutation = trpc.video.generate.useMutation();
  const generateAllMutation = trpc.video.generateAll.useMutation();
  const stitchCreateMutation = trpc.stitch.create.useMutation();
  const utils = trpc.useUtils();

  // Load existing stitch job for this brief
  const { data: existingStitchJob, refetch: refetchStitch } = trpc.stitch.getByBrief.useQuery(
    { briefId },
    { enabled: briefId > 0 && isAuthenticated }
  );

  // Determine if stitch job needs polling
  const stitchNeedsPolling = existingStitchJob &&
    existingStitchJob.status !== "done" &&
    existingStitchJob.status !== "failed";

  // Poll stitch status via tRPC
  const { data: stitchStatusData } = trpc.stitch.checkStatus.useQuery(
    { stitchJobId: existingStitchJob?.id ?? 0 },
    {
      enabled: !!stitchNeedsPolling && !!existingStitchJob?.id,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "done" || status === "failed") return false;
        return 5000;
      },
    }
  );

  // When stitch polling completes, refetch the main stitch query
  useEffect(() => {
    if (stitchStatusData && (stitchStatusData.status === "done" || stitchStatusData.status === "failed")) {
      refetchStitch();
    }
  }, [stitchStatusData, refetchStitch]);

  // Callback for when a poller updates a job state
  const handleJobUpdate = (state: VideoJobState) => {
    setVideoJobs((prev) => {
      const next = new Map(prev);
      const existing = next.get(state.segmentIndex);
      // Only update if status actually changed
      if (existing && existing.status === state.status && existing.videoUrl === state.videoUrl) {
        return prev;
      }
      next.set(state.segmentIndex, state);
      return next;
    });
    // If completed, invalidate the list query to keep DB in sync
    if (state.status === "completed" || state.status === "failed") {
      utils.video.listByBrief.invalidate({ briefId });
    }
  };

  // Determine which jobs need polling (in-progress ones)
  const jobsToPolArray = useMemo(() => {
    const result: { jobId: number; segmentIndex: number }[] = [];
    const entries = Array.from(videoJobs.entries());
    for (const [segIdx, job] of entries) {
      if (job.status === "pending" || job.status === "created" || job.status === "processing") {
        result.push({ jobId: job.jobId, segmentIndex: segIdx });
      }
    }
    return result;
  }, [videoJobs]);

  const handleGenerateSegment = async (segmentIndex: number, prompt: string) => {
    setGeneratingSegment(segmentIndex);
    try {
      const result = await generateMutation.mutateAsync({
        briefId,
        segmentIndex,
        prompt,
        duration: 15,
      });

      setVideoJobs((prev) => {
        const next = new Map(prev);
        next.set(segmentIndex, {
          jobId: result.jobId,
          segmentIndex,
          status: result.status as VideoJobStatus,
          videoUrl: null,
          errorMessage: null,
        });
        return next;
      });

      toast.success("Video generation started for Segment " + (segmentIndex + 1));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start video generation";
      toast.error(msg);
    } finally {
      setGeneratingSegment(null);
    }
  };

  const handleGenerateAll = async () => {
    if (segments.length === 0) return;
    setGeneratingAll(true);
    try {
      const segmentInputs = segments.map((seg, i) => ({
        segmentIndex: i,
        prompt: seg.prompt,
      }));

      const result = await generateAllMutation.mutateAsync({
        briefId,
        segments: segmentInputs,
        duration: 15,
      });

      for (const r of result.results) {
        setVideoJobs((prev) => {
          const next = new Map(prev);
          next.set(r.segmentIndex, {
            jobId: r.jobId,
            segmentIndex: r.segmentIndex,
            status: r.status as VideoJobStatus,
            videoUrl: null,
            errorMessage: null,
          });
          return next;
        });
      }

      toast.success("Video generation started for all " + segments.length + " segments!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start video generation";
      toast.error(msg);
    } finally {
      setGeneratingAll(false);
    }
  };

  const copySegment = async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedIndex(index);
      toast.success("Segment prompt copied!");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const copyAll = async () => {
    if (!brief?.generatedBrief) return;
    try {
      await navigator.clipboard.writeText(brief.generatedBrief);
      setCopiedAll(true);
      toast.success("Full brief copied!");
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadBrief = () => {
    if (!brief?.generatedBrief) return;
    const blob = new Blob([brief.generatedBrief], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (brief.productName.replace(/\s+/g, "_") + "_UGC_Brief.txt");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Brief downloaded!");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="font-sans text-sm text-muted-foreground uppercase tracking-widest">Loading brief...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!brief) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <span className="font-display text-4xl text-foreground">BRIEF NOT FOUND</span>
        <Button onClick={() => navigate("/")} variant="outline" className="border-border text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> GO HOME
        </Button>
      </div>
    );
  }

  const pinterestLinks: string[] = (() => {
    try {
      if (typeof brief.pinterestLinks === "string") {
        return JSON.parse(brief.pinterestLinks);
      }
      if (Array.isArray(brief.pinterestLinks)) {
        return brief.pinterestLinks;
      }
      return [];
    } catch {
      return [];
    }
  })();

  const allSegmentsHaveVideo = segments.length > 0 && segments.every((_, i) => {
    const job = videoJobs.get(i);
    return job && (job.status === "created" || job.status === "processing" || job.status === "completed");
  });

  const allSegmentsCompleted = segments.length > 0 && segments.every((_, i) => {
    const job = videoJobs.get(i);
    return job && job.status === "completed";
  });

  const canStitch = allSegmentsCompleted && !existingStitchJob;
  const stitchInProgress = existingStitchJob &&
    existingStitchJob.status !== "done" &&
    existingStitchJob.status !== "failed";
  const stitchDone = existingStitchJob?.status === "done";
  const stitchFailed = existingStitchJob?.status === "failed";

  const handleStitch = async () => {
    setStitching(true);
    try {
      await stitchCreateMutation.mutateAsync({ briefId });
      toast.success("Video stitching started! This may take 1-2 minutes.");
      refetchStitch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start stitching";
      toast.error(msg);
    } finally {
      setStitching(false);
    }
  };

  const stitchStatusLabel = (status: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      pending: { label: "PENDING", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
      queued: { label: "QUEUED", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
      fetching: { label: "FETCHING CLIPS", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
      rendering: { label: "RENDERING", color: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
      saving: { label: "SAVING", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" },
      done: { label: "COMPLETE", color: "bg-green-500/20 text-green-400 border-green-500/40" },
      failed: { label: "FAILED", color: "bg-red-500/20 text-red-400 border-red-500/40" },
    };
    return labels[status] || labels.pending;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Render pollers for in-progress jobs */}
      {jobsToPolArray.map((j) => (
        <VideoJobPoller key={j.jobId} jobId={j.jobId} segmentIndex={j.segmentIndex} onUpdate={handleJobUpdate} />
      ))}

      {/* Nav */}
      <nav className="w-full border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-3 h-3 bg-primary" />
            <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/history")}
              className="text-muted-foreground hover:text-foreground transition-colors font-sans text-sm uppercase tracking-widest"
            >
              History
            </button>
            <Button
              onClick={() => navigate("/create")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-4"
            >
              New Brief
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-1 container py-12 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
              {brief.productName}
            </h1>
            <p className="text-muted-foreground font-sans text-sm mt-2 uppercase tracking-widest">
              {brief.segmentCount} segments · {brief.adGoal} · {new Date(brief.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={copyAll}
              variant="outline"
              className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs px-4 h-10"
            >
              {copiedAll ? <Check className="w-4 h-4 mr-2 text-green-400" /> : <Copy className="w-4 h-4 mr-2" />}
              {copiedAll ? "COPIED" : "COPY ALL"}
            </Button>
            <Button
              onClick={downloadBrief}
              variant="outline"
              className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs px-4 h-10"
            >
              <Download className="w-4 h-4 mr-2" /> DOWNLOAD
            </Button>
          </div>
        </div>

        <div className="brutal-divider mb-8" />

        {/* Product Summary */}
        <section className="mb-10">
          <h2 className="font-display text-2xl tracking-wider uppercase mb-4">
            CAMPAIGN <span className="text-primary">SUMMARY</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
            {[
              { label: "PRODUCT", value: brief.productName },
              { label: "GOAL", value: brief.adGoal.toUpperCase() },
              { label: "SEGMENTS", value: String(brief.segmentCount) },
              { label: "DURATION", value: brief.segmentCount * 15 + "s" },
            ].map((item, i) => (
              <div key={i} className="border border-border p-4">
                <span className="font-sans text-xs text-muted-foreground uppercase tracking-widest block">{item.label}</span>
                <span className="font-display text-xl mt-1 block">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pinterest Links */}
        {pinterestLinks.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-wider uppercase mb-4">
              PINTEREST <span className="text-primary">CASTING</span>
            </h2>
            <div className="space-y-2">
              {pinterestLinks.map((link: string, i: number) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border border-border p-3 hover:border-primary/50 hover:bg-secondary/30 transition-all group"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground truncate">
                    {link}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="brutal-divider mb-10" />

        {/* Video Generation Section */}
        {segments.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl tracking-wider uppercase">
                VIDEO <span className="text-primary">GENERATION</span>
              </h2>
              {!allSegmentsHaveVideo && (
                <Button
                  onClick={handleGenerateAll}
                  disabled={generatingAll || allSegmentsHaveVideo}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-5 h-10"
                >
                  {generatingAll ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> GENERATING...</>
                  ) : (
                    <><Film className="w-4 h-4 mr-2" /> GENERATE ALL VIDEOS</>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {segments.map((seg, i) => {
                const job = videoJobs.get(i);
                const isInProgress = job && (job.status === "created" || job.status === "processing" || job.status === "pending");
                const isComplete = job?.status === "completed";
                const isFailed = job?.status === "failed";

                return (
                  <div key={i} className="border border-border">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-display text-lg tracking-wider uppercase truncate">{seg.title}</span>
                        {job && <VideoStatusBadge status={job.status} />}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          onClick={() => copySegment(seg.prompt, i)}
                          variant="outline"
                          size="sm"
                          className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs"
                        >
                          {copiedIndex === i ? (
                            <><Check className="w-3 h-3 mr-1 text-green-400" /> COPIED</>
                          ) : (
                            <><Copy className="w-3 h-3 mr-1" /> COPY</>
                          )}
                        </Button>
                        {!isInProgress && !isComplete && (
                          <Button
                            onClick={() => handleGenerateSegment(i, seg.prompt)}
                            disabled={generatingSegment === i || generatingAll}
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs"
                          >
                            {generatingSegment === i ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> STARTING...</>
                            ) : isFailed ? (
                              <><RefreshCw className="w-3 h-3 mr-1" /> RETRY</>
                            ) : (
                              <><Play className="w-3 h-3 mr-1" /> GENERATE</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Prompt text */}
                    <pre className="p-4 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto whitespace-pre-wrap border-b border-border">
                      {seg.prompt}
                    </pre>

                    {/* Video Player when completed */}
                    {isComplete && job.videoUrl && (
                      <div className="p-4 bg-secondary/10">
                        <div className="relative w-full max-w-[280px] mx-auto aspect-[9/16] bg-black border border-border">
                          <video
                            src={job.videoUrl}
                            controls
                            className="w-full h-full object-contain"
                            playsInline
                          />
                        </div>
                        <div className="flex justify-center mt-3">
                          <a
                            href={job.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                          >
                            <Download className="w-3 h-3" /> DOWNLOAD VIDEO
                          </a>
                        </div>
                      </div>
                    )}

                    {/* In-progress spinner */}
                    {isInProgress && (
                      <div className="p-6 flex flex-col items-center gap-3 bg-secondary/10">
                        <div className="relative w-16 h-16">
                          <div className="absolute inset-0 border-2 border-primary/20 border-t-primary animate-spin" style={{ borderRadius: 0 }} />
                          <Film className="absolute inset-0 m-auto w-6 h-6 text-primary" />
                        </div>
                        <span className="font-sans text-xs text-muted-foreground uppercase tracking-widest">
                          Generating 15s video... this may take 2-5 minutes
                        </span>
                      </div>
                    )}

                    {/* Error state */}
                    {isFailed && job.errorMessage && (
                      <div className="p-4 bg-red-500/5 border-t border-red-500/20">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <span className="font-mono text-xs text-red-400">{job.errorMessage}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Stitch Final Ad Section */}
        {(canStitch || existingStitchJob) && (
          <section className="mb-10">
            <div className="brutal-divider mb-10" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl tracking-wider uppercase">
                FINAL <span className="text-primary">AD</span>
              </h2>
              {canStitch && (
                <Button
                  onClick={handleStitch}
                  disabled={stitching}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-5 h-10"
                >
                  {stitching ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> SUBMITTING...</>
                  ) : (
                    <><Scissors className="w-4 h-4 mr-2" /> STITCH FINAL AD</>
                  )}
                </Button>
              )}
              {stitchFailed && !canStitch && (
                <Button
                  onClick={handleStitch}
                  disabled={stitching}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-5 h-10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> RETRY STITCH
                </Button>
              )}
            </div>

            {/* Stitch in progress */}
            {stitchInProgress && (
              <div className="border border-border p-8 flex flex-col items-center gap-4">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 border-2 border-primary/20 border-t-primary animate-spin" style={{ borderRadius: 0 }} />
                  <Clapperboard className="absolute inset-0 m-auto w-8 h-8 text-primary" />
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans uppercase tracking-widest border ${stitchStatusLabel(existingStitchJob?.status || "pending").color}`}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {stitchStatusLabel(existingStitchJob?.status || "pending").label}
                </span>
                <span className="font-sans text-xs text-muted-foreground uppercase tracking-widest">
                  Stitching {existingStitchJob?.segmentCount || segments.length} segments into final ad... this may take 1-2 minutes
                </span>
              </div>
            )}

            {/* Stitch complete — show final video */}
            {stitchDone && existingStitchJob?.finalVideoUrl && (
              <div className="border border-border">
                <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Clapperboard className="w-5 h-5 text-primary" />
                    <span className="font-display text-lg tracking-wider uppercase">FINAL STITCHED AD</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-green-500/20 text-green-400 border-green-500/40">
                      <Check className="w-3 h-3" /> COMPLETE
                    </span>
                  </div>
                  <a
                    href={existingStitchJob.finalVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-sans uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Download className="w-3 h-3" /> DOWNLOAD FINAL AD
                  </a>
                </div>
                <div className="p-6 bg-secondary/10">
                  <div className="relative w-full max-w-[320px] mx-auto aspect-[9/16] bg-black border border-border">
                    <video
                      src={existingStitchJob.finalVideoUrl}
                      controls
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  </div>
                  <p className="text-center mt-4 font-sans text-xs text-muted-foreground uppercase tracking-widest">
                    {existingStitchJob.segmentCount} segments · {(existingStitchJob.segmentCount || 0) * 15}s total
                  </p>
                </div>
              </div>
            )}

            {/* Stitch failed */}
            {stitchFailed && existingStitchJob?.errorMessage && (
              <div className="border border-red-500/30 p-4 bg-red-500/5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-sans text-xs text-red-400 uppercase tracking-widest block mb-1">Stitch Failed</span>
                    <span className="font-mono text-xs text-red-400">{existingStitchJob.errorMessage}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="brutal-divider mb-10" />

        {/* Seedance Prompts (copy-paste section) */}
        {segments.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-wider uppercase mb-6">
              SEEDANCE <span className="text-primary">PROMPTS</span>
            </h2>
            <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest mb-4">
              Copy-paste ready prompts for manual generation in Seedance 2.0
            </p>
            <div className="space-y-6">
              {segments.map((seg, i) => (
                <div key={i} className="border border-border">
                  <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                    <span className="font-display text-lg tracking-wider uppercase">{seg.title}</span>
                    <Button
                      onClick={() => copySegment(seg.prompt, i)}
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs"
                    >
                      {copiedIndex === i ? (
                        <><Check className="w-3 h-3 mr-1 text-green-400" /> COPIED</>
                      ) : (
                        <><Copy className="w-3 h-3 mr-1" /> COPY</>
                      )}
                    </Button>
                  </div>
                  <pre className="p-4 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                    {seg.prompt}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="brutal-divider mb-10" />

        {/* Full Brief (rendered markdown) */}
        <section className="mb-10">
          <h2 className="font-display text-2xl tracking-wider uppercase mb-6">
            FULL <span className="text-primary">BRIEF</span>
          </h2>
          <div className="border border-border p-6 prose prose-invert prose-sm max-w-none font-sans [&_h1]:font-display [&_h1]:tracking-wider [&_h2]:font-display [&_h2]:tracking-wider [&_h3]:font-display [&_h3]:tracking-wider [&_code]:font-mono [&_pre]:bg-secondary [&_pre]:border [&_pre]:border-border [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline [&_strong]:text-foreground [&_hr]:border-primary [&_hr]:border-t-2">
            <Streamdown>{brief.generatedBrief}</Streamdown>
          </div>
        </section>

        {/* Back */}
        <div className="flex items-center justify-between pt-8 border-t border-border">
          <Button
            onClick={() => navigate("/history")}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-sm px-6 h-12"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> HISTORY
          </Button>
          <Button
            onClick={() => navigate("/create")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6 h-12"
          >
            NEW BRIEF
          </Button>
        </div>
      </main>
    </div>
  );
}
