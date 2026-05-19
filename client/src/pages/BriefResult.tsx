import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation, useParams } from "wouter";
import { useMemo, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Copy, Check, Download, Loader2, ExternalLink, Play, Film, RefreshCw, AlertCircle, Scissors, Clapperboard, MessageSquare, Send, Upload, Pencil, Save, X, User, Zap, ShieldCheck, RotateCcw, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { Textarea } from "@/components/ui/textarea";

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
  prompt?: string | null;
  feedback?: string | null;
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
        prompt: data.prompt ?? null,
        feedback: data.feedback ?? null,
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
  const [feedbackText, setFeedbackText] = useState<Map<number, string>>(new Map());
  const [feedbackOpen, setFeedbackOpen] = useState<Set<number>>(new Set());
  const [regenerating, setRegenerating] = useState<number | null>(null);

  // Creator image state
  const [creatorImageUrl, setCreatorImageUrl] = useState<string | null>(null);
  const [creatorImagePreview, setCreatorImagePreview] = useState<string | null>(null);
  const [isUploadingCreator, setIsUploadingCreator] = useState(false);

  // Editable brief state
  const [isEditing, setIsEditing] = useState(false);
  const [editedBriefText, setEditedBriefText] = useState("");
  const [isSavingBrief, setIsSavingBrief] = useState(false);

  const { data: brief, isLoading, refetch: refetchBrief } = trpc.brief.getById.useQuery(
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
            prompt: job.prompt,
            feedback: job.feedback,
          });
        }
        return next;
      });
    }
  }, [existingJobs]);

  // Initialize creator image from brief data
  useEffect(() => {
    if (brief?.creatorImageUrl) {
      setCreatorImageUrl(brief.creatorImageUrl);
      setCreatorImagePreview(brief.creatorImageUrl);
    }
  }, [brief?.creatorImageUrl]);

  // Initialize edited brief text
  useEffect(() => {
    if (brief) {
      setEditedBriefText(brief.editedBrief || brief.generatedBrief);
    }
  }, [brief]);

  // The "active" brief content — use editedBrief if available, otherwise generatedBrief
  const activeBriefContent = brief?.editedBrief || brief?.generatedBrief || "";

  const segments = useMemo(() => {
    if (!activeBriefContent) return [];
    const parsed = extractSegmentPrompts(activeBriefContent);
    // Enforce segment count: only return the number of segments the user requested
    if (brief?.segmentCount && parsed.length > brief.segmentCount) {
      return parsed.slice(0, brief.segmentCount);
    }
    return parsed;
  }, [activeBriefContent, brief?.segmentCount]);

  // Thumbstopper state
  const [thumbstopperUrl, setThumbstopperUrl] = useState<string | null>(null);
  const [thumbstopperCallout, setThumbstopperCallout] = useState<string>("");
  const [isGeneratingThumbstopper, setIsGeneratingThumbstopper] = useState(false);
  const [customCallout, setCustomCallout] = useState("");

  // Audio QC state
  const [audioQcResults, setAudioQcResults] = useState<Map<number, { status: string; issues: string[]; transcript?: string }>>(new Map());
  const [runningAudioQc, setRunningAudioQc] = useState<number | null>(null);
  const [runningBatchQc, setRunningBatchQc] = useState(false);

  // Re-stitch state
  const [isResettingStitch, setIsResettingStitch] = useState(false);

  const generateMutation = trpc.video.generate.useMutation();
  const generateAllMutation = trpc.video.generateAll.useMutation();
  const regenerateMutation = trpc.video.regenerate.useMutation();
  const stitchCreateMutation = trpc.stitch.create.useMutation();
  const stitchResetMutation = trpc.stitch.reset.useMutation();
  const thumbstopperMutation = trpc.thumbstopper.generate.useMutation();
  const audioQcCheckMutation = trpc.audioQc.check.useMutation();
  const audioQcCheckAllMutation = trpc.audioQc.checkAll.useMutation();
  const uploadMutation = trpc.brief.uploadImage.useMutation();
  const updateCreatorImageMutation = trpc.brief.updateCreatorImage.useMutation();
  const updateBriefMutation = trpc.brief.update.useMutation();
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
  const handleJobUpdate = useCallback((state: VideoJobState) => {
    setVideoJobs((prev) => {
      const next = new Map(prev);
      const existing = next.get(state.segmentIndex);
      if (existing && existing.status === state.status && existing.videoUrl === state.videoUrl) {
        return prev;
      }
      next.set(state.segmentIndex, state);
      return next;
    });
    if (state.status === "completed" || state.status === "failed") {
      utils.video.listByBrief.invalidate({ briefId });
    }
  }, [briefId, utils.video.listByBrief]);

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

  // Creator image upload handler
  const handleCreatorImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setIsUploadingCreator(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        setCreatorImagePreview(reader.result as string);

        const result = await uploadMutation.mutateAsync({
          fileName: "creator-" + file.name,
          fileBase64: base64,
          contentType: file.type,
        });

        const fullUrl = window.location.origin + result.url;
        setCreatorImageUrl(fullUrl);

        // Save to brief
        await updateCreatorImageMutation.mutateAsync({
          id: briefId,
          creatorImageUrl: fullUrl,
        });

        toast.success("Creator reference image saved — it will be used for all video segments");
        setIsUploadingCreator(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Upload failed");
      setIsUploadingCreator(false);
    }
  };

  const removeCreatorImage = async () => {
    setCreatorImageUrl(null);
    setCreatorImagePreview(null);
    // Note: we don't clear from DB since there's no "null" update path, but the UI won't pass it
  };

  // Brief editing handlers
  const handleStartEditing = () => {
    setEditedBriefText(activeBriefContent);
    setIsEditing(true);
  };

  const handleSaveBrief = async () => {
    setIsSavingBrief(true);
    try {
      await updateBriefMutation.mutateAsync({
        id: briefId,
        editedBrief: editedBriefText,
      });
      setIsEditing(false);
      refetchBrief();
      toast.success("Brief saved! Video prompts will use your edited version.");
    } catch {
      toast.error("Failed to save brief");
    } finally {
      setIsSavingBrief(false);
    }
  };

  const handleCancelEditing = () => {
    setEditedBriefText(activeBriefContent);
    setIsEditing(false);
  };

  const handleGenerateSegment = async (segmentIndex: number, prompt: string) => {
    setGeneratingSegment(segmentIndex);
    try {
      const result = await generateMutation.mutateAsync({
        briefId,
        segmentIndex,
        prompt,
        duration: 15,
        referenceImages: creatorImageUrl ? [creatorImageUrl] : undefined,
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
        referenceImages: creatorImageUrl ? [creatorImageUrl] : undefined,
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

  const handleRegenerate = async (segmentIndex: number, originalPrompt: string) => {
    const fb = feedbackText.get(segmentIndex) || "";
    if (!fb.trim()) {
      toast.error("Please provide feedback before regenerating");
      return;
    }
    setRegenerating(segmentIndex);
    try {
      const result = await regenerateMutation.mutateAsync({
        briefId,
        segmentIndex,
        originalPrompt,
        feedback: fb.trim(),
        duration: 15,
        referenceImages: creatorImageUrl ? [creatorImageUrl] : undefined,
      });

      setVideoJobs((prev) => {
        const next = new Map(prev);
        next.set(segmentIndex, {
          jobId: result.jobId,
          segmentIndex,
          status: result.status as VideoJobStatus,
          videoUrl: null,
          errorMessage: null,
          prompt: result.revisedPrompt,
          feedback: fb.trim(),
        });
        return next;
      });

      // Clear feedback
      setFeedbackText((prev) => {
        const next = new Map(prev);
        next.delete(segmentIndex);
        return next;
      });
      setFeedbackOpen((prev) => {
        const next = new Set(prev);
        next.delete(segmentIndex);
        return next;
      });

      toast.success("Regenerating Segment " + (segmentIndex + 1) + " with your feedback!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate";
      toast.error(msg);
    } finally {
      setRegenerating(null);
    }
  };

  const toggleFeedback = (index: number) => {
    setFeedbackOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
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
    if (!activeBriefContent) return;
    try {
      await navigator.clipboard.writeText(activeBriefContent);
      setCopiedAll(true);
      toast.success("Full brief copied!");
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadBrief = () => {
    if (!activeBriefContent) return;
    const blob = new Blob([activeBriefContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (brief!.productName.replace(/\s+/g, "_") + "_UGC_Brief.txt");
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

  // Fixed: allow stitch when all segments complete AND either no stitch job exists OR previous stitch failed
  const canStitch = allSegmentsCompleted && (!existingStitchJob || existingStitchJob.status === "failed");
  const stitchInProgress = existingStitchJob &&
    existingStitchJob.status !== "done" &&
    existingStitchJob.status !== "failed";
  const stitchDone = existingStitchJob?.status === "done";
  const stitchFailed = existingStitchJob?.status === "failed";

  const handleStitch = async () => {
    setStitching(true);
    try {
      await stitchCreateMutation.mutateAsync({
        briefId,
        thumbstopperUrl: thumbstopperUrl || undefined,
        thumbstopperDuration: thumbstopperUrl ? 3 : undefined,
      });
      toast.success("Video stitching started! This may take 1-2 minutes." + (thumbstopperUrl ? " Thumbstopper included!" : ""));
      refetchStitch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start stitching";
      toast.error(msg);
    } finally {
      setStitching(false);
    }
  };

  // Thumbstopper generation handler
  const handleGenerateThumbstopper = async () => {
    if (!brief) return;
    setIsGeneratingThumbstopper(true);
    try {
      const result = await thumbstopperMutation.mutateAsync({
        briefId,
        productName: brief.productName,
        adGoal: brief.adGoal,
        targetAudience: brief.targetAudienceAge + ", " + brief.targetAudienceGender + ", " + brief.targetAudienceLifestyle,
        customCallout: customCallout.trim() || undefined,
      });
      setThumbstopperUrl(result.imageUrl);
      setThumbstopperCallout(result.calloutText);
      toast.success("Thumbstopper generated: \"" + result.calloutText + "\"");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate thumbstopper";
      toast.error(msg);
    } finally {
      setIsGeneratingThumbstopper(false);
    }
  };

  // Audio QC single segment handler
  const handleAudioQcCheck = async (jobId: number, segmentIndex: number, expectedDialogue?: string) => {
    setRunningAudioQc(segmentIndex);
    try {
      const result = await audioQcCheckMutation.mutateAsync({
        jobId,
        expectedDialogue,
      });
      setAudioQcResults((prev) => {
        const next = new Map(prev);
        next.set(segmentIndex, {
          status: result.status,
          issues: result.issues || [],
          transcript: result.transcript || undefined,
        });
        return next;
      });
      if (result.status === "passed") {
        toast.success("Segment " + (segmentIndex + 1) + " audio QC passed!");
      } else {
        toast.error("Segment " + (segmentIndex + 1) + " audio QC failed — " + (result.issues?.[0] || "issues detected"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Audio QC failed";
      toast.error(msg);
    } finally {
      setRunningAudioQc(null);
    }
  };

  // Audio QC batch handler
  const handleAudioQcAll = async () => {
    setRunningBatchQc(true);
    try {
      const result = await audioQcCheckAllMutation.mutateAsync({ briefId });
      for (const r of result.results) {
        setAudioQcResults((prev) => {
          const next = new Map(prev);
          next.set(r.segmentIndex, { status: r.status, issues: r.issues });
          return next;
        });
      }
      toast.success(result.passed + "/" + result.totalChecked + " segments passed audio QC");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Batch audio QC failed";
      toast.error(msg);
    } finally {
      setRunningBatchQc(false);
    }
  };

  // Re-stitch handler
  const handleResetStitch = async () => {
    setIsResettingStitch(true);
    try {
      await stitchResetMutation.mutateAsync({ briefId });
      toast.success("Stitch reset! You can now re-stitch with updated segments.");
      refetchStitch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset stitch";
      toast.error(msg);
    } finally {
      setIsResettingStitch(false);
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

  // Build a naming convention for the brief
  const briefName = brief.productName.replace(/\s+/g, "_") + "_" + brief.adGoal + "_" + brief.segmentCount + "seg";

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
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-4 h-9"
            >
              NEW BRIEF
            </Button>
          </div>
        </div>
      </nav>

      <main className="container py-10 max-w-4xl mx-auto">
        {/* Campaign Summary */}
        <section className="mb-10">
          <h1 className="font-display text-5xl md:text-6xl tracking-wider uppercase leading-none mb-2">
            {brief.productName}
          </h1>
          <div className="brutal-divider mt-4 mb-6 max-w-[80px]" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-sans">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-widest block mb-1">Goal</span>
              <span className="text-foreground uppercase">{brief.adGoal}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-widest block mb-1">Segments</span>
              <span className="text-foreground">{brief.segmentCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-widest block mb-1">Duration</span>
              <span className="text-foreground">{brief.segmentCount * 15}s</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-widest block mb-1">Brief ID</span>
              <span className="text-foreground font-mono text-xs">{briefName}</span>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              onClick={copyAll}
              variant="outline"
              className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs h-10 px-4"
            >
              {copiedAll ? <><Check className="w-3 h-3 mr-2 text-green-400" /> COPIED</> : <><Copy className="w-3 h-3 mr-2" /> COPY ALL</>}
            </Button>
            <Button
              onClick={downloadBrief}
              variant="outline"
              className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs h-10 px-4"
            >
              <Download className="w-3 h-3 mr-2" /> DOWNLOAD BRIEF
            </Button>
            {!isEditing && (
              <Button
                onClick={handleStartEditing}
                variant="outline"
                className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs h-10 px-4"
              >
                <Pencil className="w-3 h-3 mr-2" /> EDIT BRIEF
              </Button>
            )}
          </div>

          {brief.editedBrief && (
            <p className="mt-3 text-xs text-primary font-sans uppercase tracking-widest flex items-center gap-2">
              <Pencil className="w-3 h-3" /> Using edited version
            </p>
          )}
        </section>

        <div className="brutal-divider mb-10" />

        {/* Creator Reference Image — Avatar Anchoring */}
        <section className="mb-10">
          <h2 className="font-display text-2xl tracking-wider uppercase mb-4">
            CREATOR <span className="text-primary">REFERENCE</span>
          </h2>
          <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest mb-4">
            Upload ONE creator reference image — this person will appear consistently across ALL video segments
          </p>

          {!creatorImagePreview ? (
            <label className="flex items-center gap-4 border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 cursor-pointer group max-w-md">
              <div className="w-16 h-16 border border-border group-hover:border-primary flex items-center justify-center flex-shrink-0 transition-colors">
                <User className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <span className="font-sans text-sm text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-widest block">
                  {isUploadingCreator ? "Uploading..." : "Upload creator image"}
                </span>
                <span className="font-sans text-xs text-muted-foreground/50 mt-1 block">
                  This becomes the anchor avatar for Seedance
                </span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleCreatorImageUpload}
                className="hidden"
                disabled={isUploadingCreator}
              />
            </label>
          ) : (
            <div className="flex items-start gap-4 max-w-md">
              <div className="relative w-24 h-24 border border-border flex-shrink-0">
                <img src={creatorImagePreview} alt="Creator reference" className="w-full h-full object-cover" />
                <button
                  onClick={removeCreatorImage}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-background border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="pt-2">
                <span className="font-sans text-xs uppercase tracking-widest text-green-400 flex items-center gap-2">
                  <Check className="w-3 h-3" /> ANCHOR AVATAR SET
                </span>
                <p className="font-sans text-xs text-muted-foreground mt-1">
                  This image will be passed as a reference to WaveSpeed for every segment, ensuring visual consistency.
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="brutal-divider mb-10" />

        {/* Pinterest Casting Links */}
        {pinterestLinks.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-wider uppercase mb-4">
              PINTEREST <span className="text-primary">CASTING</span>
            </h2>
            <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest mb-4">
              Find your creator — pick ONE consistent character reference for all segments
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pinterestLinks.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 border border-border hover:border-primary/50 transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">
                    {decodeURIComponent(link.split("q=")[1] || "").replace(/\+/g, " ")}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="brutal-divider mb-10" />

        {/* Video Generation Section — unified with prompts and feedback */}
        {segments.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl tracking-wider uppercase">
                VIDEO <span className="text-primary">SEGMENTS</span>
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

            {creatorImageUrl && (
              <div className="mb-4 p-3 border border-green-500/30 bg-green-500/5 flex items-center gap-3">
                <User className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="font-sans text-xs text-green-400 uppercase tracking-widest">
                  Creator reference image will be passed to all segments for consistent avatar
                </span>
              </div>
            )}

            <div className="space-y-6">
              {segments.map((seg, i) => {
                const job = videoJobs.get(i);
                const isInProgress = job && (job.status === "created" || job.status === "processing" || job.status === "pending");
                const isComplete = job?.status === "completed";
                const isFailed = job?.status === "failed";
                const isFeedbackOpen = feedbackOpen.has(i);
                const currentFeedback = feedbackText.get(i) || "";
                const segmentLabel = briefName + "_seg" + (i + 1);

                return (
                  <div key={i} className="border border-border">
                    {/* Segment header */}
                    <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-display text-lg tracking-wider uppercase truncate">{seg.title}</span>
                        {job && <VideoStatusBadge status={job.status} />}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-[10px] text-muted-foreground/60 hidden md:block">{segmentLabel}</span>
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
                      {job?.prompt || seg.prompt}
                    </pre>

                    {/* Previous feedback if any */}
                    {job?.feedback && (
                      <div className="px-4 py-2 bg-primary/5 border-b border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-3 h-3 text-primary" />
                          <span className="font-sans text-[10px] uppercase tracking-widest text-primary">Previous Feedback</span>
                        </div>
                        <p className="font-sans text-xs text-muted-foreground">{job.feedback}</p>
                      </div>
                    )}

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
                        <div className="flex flex-wrap justify-center gap-4 mt-3">
                          <a
                            href={job.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                          >
                            <Download className="w-3 h-3" /> DOWNLOAD
                          </a>
                          <button
                            onClick={() => toggleFeedback(i)}
                            className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" /> {isFeedbackOpen ? "CLOSE" : "FEEDBACK"}
                          </button>
                          <button
                            onClick={() => handleAudioQcCheck(job.jobId, i, seg.prompt)}
                            disabled={runningAudioQc === i}
                            className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          >
                            {runningAudioQc === i ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> CHECKING...</>
                            ) : (
                              <><ShieldCheck className="w-3 h-3" /> AUDIO QC</>
                            )}
                          </button>
                        </div>
                        {/* Audio QC Result */}
                        {audioQcResults.get(i) && (
                          <div className={`mt-3 p-3 border ${
                            audioQcResults.get(i)!.status === "passed"
                              ? "border-green-500/30 bg-green-500/5"
                              : "border-red-500/30 bg-red-500/5"
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              {audioQcResults.get(i)!.status === "passed" ? (
                                <><ShieldCheck className="w-3 h-3 text-green-400" /><span className="text-xs font-sans uppercase tracking-widest text-green-400">Audio QC Passed</span></>
                              ) : (
                                <><AlertCircle className="w-3 h-3 text-red-400" /><span className="text-xs font-sans uppercase tracking-widest text-red-400">Audio QC Failed</span></>
                              )}
                            </div>
                            {audioQcResults.get(i)!.issues.length > 0 && (
                              <ul className="list-disc list-inside text-xs text-red-400 font-sans mt-1">
                                {audioQcResults.get(i)!.issues.map((issue, idx) => (
                                  <li key={idx}>{issue}</li>
                                ))}
                              </ul>
                            )}
                            {audioQcResults.get(i)!.transcript && (
                              <details className="mt-2">
                                <summary className="text-xs font-sans text-muted-foreground cursor-pointer uppercase tracking-widest">View Transcript</summary>
                                <p className="mt-1 text-xs font-mono text-muted-foreground whitespace-pre-wrap">{audioQcResults.get(i)!.transcript}</p>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Feedback & Regeneration panel */}
                    {(isComplete || isFailed) && isFeedbackOpen && (
                      <div className="p-4 border-t border-border bg-secondary/5">
                        <div className="flex items-center gap-2 mb-3">
                          <MessageSquare className="w-4 h-4 text-primary" />
                          <span className="font-sans text-xs uppercase tracking-widest text-foreground">
                            Provide Feedback & Regenerate
                          </span>
                        </div>
                        <Textarea
                          value={currentFeedback}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeedbackText((prev) => {
                              const next = new Map(prev);
                              next.set(i, val);
                              return next;
                            });
                          }}
                          placeholder="e.g. The creator should be smiling more, the lighting is too dark, make the product more visible in the first 5 seconds..."
                          rows={3}
                          className="bg-input border-border text-foreground font-sans text-sm px-3 py-2 placeholder:text-muted-foreground/50 resize-none mb-3"
                        />
                        <Button
                          onClick={() => handleRegenerate(i, job?.prompt || seg.prompt)}
                          disabled={regenerating === i || !currentFeedback.trim()}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs h-9 px-4"
                        >
                          {regenerating === i ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> REGENERATING...</>
                          ) : (
                            <><Send className="w-3 h-3 mr-1" /> REGENERATE WITH FEEDBACK</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Failed — show feedback toggle */}
                    {isFailed && !isFeedbackOpen && (
                      <div className="p-4 bg-red-500/5 border-t border-red-500/20">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <span className="font-mono text-xs text-red-400">{job?.errorMessage || "Generation failed"}</span>
                          </div>
                          <button
                            onClick={() => toggleFeedback(i)}
                            className="text-xs font-sans uppercase tracking-widest text-primary hover:text-primary/80 flex-shrink-0"
                          >
                            FEEDBACK & RETRY
                          </button>
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
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Audio QC Batch Check */}
        {allSegmentsCompleted && (
          <section className="mb-10">
            <div className="brutal-divider mb-10" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl tracking-wider uppercase">
                AUDIO <span className="text-primary">QUALITY CHECK</span>
              </h2>
              <Button
                onClick={handleAudioQcAll}
                disabled={runningBatchQc}
                variant="outline"
                className="border-border text-foreground hover:bg-primary hover:text-primary-foreground font-sans uppercase tracking-widest text-xs h-10 px-4"
              >
                {runningBatchQc ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> CHECKING ALL...</>
                ) : (
                  <><ShieldCheck className="w-4 h-4 mr-2" /> CHECK ALL SEGMENTS</>
                )}
              </Button>
            </div>
            <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest mb-4">
              Validate audio quality across all segments before stitching. Detects glitches, silence, and mismatched dialogue.
            </p>
            {audioQcResults.size > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from(audioQcResults.entries()).sort((a, b) => a[0] - b[0]).map(([segIdx, result]) => (
                  <div key={segIdx} className={`p-3 border ${
                    result.status === "passed" ? "border-green-500/30 bg-green-500/5" :
                    result.status === "failed" ? "border-red-500/30 bg-red-500/5" :
                    "border-yellow-500/30 bg-yellow-500/5"
                  }`}>
                    <span className="font-sans text-xs uppercase tracking-widest block mb-1 text-muted-foreground">Seg {segIdx + 1}</span>
                    <span className={`font-sans text-xs uppercase tracking-widest ${
                      result.status === "passed" ? "text-green-400" :
                      result.status === "failed" ? "text-red-400" : "text-yellow-400"
                    }`}>{result.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Thumbstopper Generation Section */}
        {allSegmentsCompleted && (
          <section className="mb-10">
            <div className="brutal-divider mb-10" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl tracking-wider uppercase">
                THUMB<span className="text-primary">STOPPER</span>
              </h2>
            </div>
            <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest mb-4">
              Generate an aggressive callout frame that gets stitched as the FIRST frame of your final ad
            </p>

            {!thumbstopperUrl ? (
              <div className="border border-border p-6">
                <div className="mb-4">
                  <label className="font-sans text-xs uppercase tracking-widest text-muted-foreground block mb-2">
                    Custom callout (optional — leave blank for AI-generated)
                  </label>
                  <input
                    type="text"
                    value={customCallout}
                    onChange={(e) => setCustomCallout(e.target.value)}
                    placeholder="e.g. Stop Scrolling If You Take GLP-1s"
                    className="w-full bg-input border border-border text-foreground font-sans text-sm px-3 py-2 placeholder:text-muted-foreground/50"
                    maxLength={60}
                  />
                </div>
                <Button
                  onClick={handleGenerateThumbstopper}
                  disabled={isGeneratingThumbstopper}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs h-10 px-5"
                >
                  {isGeneratingThumbstopper ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> GENERATING...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> GENERATE THUMBSTOPPER</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="border border-border">
                <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    <span className="font-display text-lg tracking-wider uppercase">THUMBSTOPPER READY</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-green-500/20 text-green-400 border-green-500/40">
                      <Check className="w-3 h-3" /> SET
                    </span>
                  </div>
                  <Button
                    onClick={() => { setThumbstopperUrl(null); setThumbstopperCallout(""); }}
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:bg-destructive hover:text-destructive-foreground font-sans uppercase tracking-widest text-xs"
                  >
                    <X className="w-3 h-3 mr-1" /> REMOVE
                  </Button>
                </div>
                <div className="p-6 bg-secondary/10">
                  <div className="relative w-full max-w-[280px] mx-auto aspect-[9/16] bg-black border border-border">
                    <img src={thumbstopperUrl} alt="Thumbstopper" className="w-full h-full object-contain" />
                  </div>
                  <p className="text-center mt-3 font-sans text-xs text-primary uppercase tracking-widest">
                    "{thumbstopperCallout}"
                  </p>
                  <p className="text-center mt-1 font-sans text-[10px] text-muted-foreground uppercase tracking-widest">
                    This will be the first 3 seconds of your final ad
                  </p>
                </div>
              </div>
            )}
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
              <div className="flex items-center gap-2">
                {/* Re-stitch button — shown when stitch is done and user may want to re-do after regenerating segments */}
                {(stitchDone || stitchFailed) && (
                  <Button
                    onClick={handleResetStitch}
                    disabled={isResettingStitch}
                    variant="outline"
                    className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs h-10 px-4"
                  >
                    {isResettingStitch ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> RESETTING...</>
                    ) : (
                      <><RotateCcw className="w-4 h-4 mr-2" /> RE-STITCH</>
                    )}
                  </Button>
                )}
                {canStitch && (
                  <Button
                    onClick={handleStitch}
                    disabled={stitching}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-5 h-10"
                  >
                    {stitching ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> SUBMITTING...</>
                    ) : existingStitchJob?.status === "failed" ? (
                      <><RefreshCw className="w-4 h-4 mr-2" /> RETRY STITCH</>
                    ) : (
                      <><Scissors className="w-4 h-4 mr-2" /> STITCH FINAL AD</>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Thumbstopper indicator */}
            {thumbstopperUrl && !stitchDone && (
              <div className="mb-4 p-3 border border-primary/30 bg-primary/5 flex items-center gap-3">
                <Zap className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="font-sans text-xs text-primary uppercase tracking-widest">
                  Thumbstopper will be prepended as the first 3 seconds of the final ad
                </span>
              </div>
            )}

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
                  Stitching {existingStitchJob?.segmentCount || segments.length} segments into final ad...
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
                    {briefName} · {existingStitchJob.segmentCount} segments · {(existingStitchJob.segmentCount || 0) * 15}s
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

        {/* Full Brief — editable or rendered */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl tracking-wider uppercase">
              FULL <span className="text-primary">BRIEF</span>
            </h2>
            {isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCancelEditing}
                  variant="outline"
                  size="sm"
                  className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs"
                >
                  <X className="w-3 h-3 mr-1" /> CANCEL
                </Button>
                <Button
                  onClick={handleSaveBrief}
                  disabled={isSavingBrief}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs"
                >
                  {isSavingBrief ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> SAVING...</>
                  ) : (
                    <><Save className="w-3 h-3 mr-1" /> SAVE BRIEF</>
                  )}
                </Button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="border border-primary/50 p-1">
              <Textarea
                value={editedBriefText}
                onChange={(e) => setEditedBriefText(e.target.value)}
                rows={30}
                className="bg-input border-none text-foreground font-mono text-xs leading-relaxed px-4 py-3 resize-y min-h-[400px] w-full"
              />
              <p className="px-4 py-2 text-xs text-muted-foreground font-sans">
                Edit the brief above. The segment prompts (inside ``` code blocks) are what get sent to Seedance for video generation.
              </p>
            </div>
          ) : (
            <div className="border border-border p-6 prose prose-invert prose-sm max-w-none font-sans [&_h1]:font-display [&_h1]:tracking-wider [&_h2]:font-display [&_h2]:tracking-wider [&_h3]:font-display [&_h3]:tracking-wider [&_code]:font-mono [&_pre]:bg-secondary [&_pre]:border [&_pre]:border-border [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline [&_strong]:text-foreground [&_hr]:border-primary [&_hr]:border-t-2">
              <Streamdown>{activeBriefContent}</Streamdown>
            </div>
          )}
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
