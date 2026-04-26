import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Loader2,
  Film,
  Check,
  AlertCircle,
  Clapperboard,
  ExternalLink,
  Play,
} from "lucide-react";

export default function History() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: briefs, isLoading } = trpc.brief.listWithStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="font-sans text-sm text-muted-foreground uppercase tracking-widest">
            Loading history...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="w-full border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-3 h-3 bg-primary" />
            <span className="font-display text-2xl tracking-wider uppercase">
              UGC AD DIRECTOR
            </span>
          </button>
          <Button
            onClick={() => navigate("/create")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs px-4 h-9"
          >
            NEW BRIEF
          </Button>
        </div>
      </nav>

      <main className="container py-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
            CAMPAIGN <span className="text-primary">HISTORY</span>
          </h1>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs h-9 px-4"
          >
            <ArrowLeft className="w-3 h-3 mr-2" /> BACK
          </Button>
        </div>

        <div className="brutal-divider mb-8" />

        {!briefs || briefs.length === 0 ? (
          <div className="border border-border p-12 flex flex-col items-center gap-4">
            <Film className="w-10 h-10 text-muted-foreground/40" />
            <span className="font-display text-xl tracking-wider uppercase text-muted-foreground">
              NO BRIEFS YET
            </span>
            <p className="font-sans text-sm text-muted-foreground/60 text-center">
              Create your first UGC ad brief to get started.
            </p>
            <Button
              onClick={() => navigate("/create")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-xs mt-2 px-5 h-10"
            >
              CREATE BRIEF
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {briefs.map((brief) => {
              const briefName =
                brief.productName.replace(/\s+/g, "_") +
                "_" +
                brief.adGoal +
                "_" +
                brief.segmentCount +
                "seg";

              const vs = brief.videoStatus;
              const ss = brief.stitchStatus;

              const hasVideos = vs && vs.total > 0;
              const allComplete = vs && vs.completed === brief.segmentCount;
              const hasFailed = vs && vs.failed > 0;
              const hasStitch = ss !== null && ss !== undefined;
              const stitchDone = hasStitch && ss.status === "done";
              const stitchInProgress =
                hasStitch &&
                ss.status !== "done" &&
                ss.status !== "failed";

              return (
                <button
                  key={brief.id}
                  onClick={() => navigate("/brief/" + brief.id)}
                  className="w-full text-left border border-border hover:border-primary/40 transition-colors group"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20 group-hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 bg-primary flex-shrink-0" />
                      <span className="font-display text-lg tracking-wider uppercase truncate">
                        {brief.productName}
                      </span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>

                  {/* Details row */}
                  <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-sans mb-3">
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase tracking-widest block mb-0.5">
                          Goal
                        </span>
                        <span className="text-foreground uppercase text-xs">
                          {brief.adGoal}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase tracking-widest block mb-0.5">
                          Segments
                        </span>
                        <span className="text-foreground text-xs">
                          {brief.segmentCount} x 15s
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase tracking-widest block mb-0.5">
                          Created
                        </span>
                        <span className="text-foreground text-xs">
                          {new Date(brief.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase tracking-widest block mb-0.5">
                          Brief ID
                        </span>
                        <span className="text-foreground font-mono text-[10px]">
                          {briefName}
                        </span>
                      </div>
                    </div>

                    {/* Video & Stitch Status */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Video generation progress */}
                      {hasVideos ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border ${
                            allComplete
                              ? "bg-green-500/20 text-green-400 border-green-500/40"
                              : hasFailed
                              ? "bg-red-500/20 text-red-400 border-red-500/40"
                              : "bg-blue-500/20 text-blue-400 border-blue-500/40"
                          }`}
                        >
                          {allComplete ? (
                            <Check className="w-3 h-3" />
                          ) : hasFailed ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <Film className="w-3 h-3" />
                          )}
                          {vs.completed}/{vs.total} VIDEOS
                          {hasFailed ? " (" + vs.failed + " FAILED)" : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-secondary/30 text-muted-foreground border-border">
                          <Play className="w-3 h-3" /> NO VIDEOS YET
                        </span>
                      )}

                      {/* Stitch status */}
                      {stitchDone && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-green-500/20 text-green-400 border-green-500/40">
                          <Clapperboard className="w-3 h-3" /> FINAL AD READY
                        </span>
                      )}

                      {stitchInProgress && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-purple-500/20 text-purple-400 border-purple-500/40">
                          <Loader2 className="w-3 h-3 animate-spin" /> STITCHING
                        </span>
                      )}

                      {hasStitch && ss.status === "failed" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest border bg-red-500/20 text-red-400 border-red-500/40">
                          <AlertCircle className="w-3 h-3" /> STITCH FAILED
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
