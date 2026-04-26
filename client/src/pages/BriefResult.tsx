import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation, useParams } from "wouter";
import { useMemo } from "react";
import { ArrowLeft, Copy, Check, Download, Loader2, ExternalLink } from "lucide-react";
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

export default function BriefResult() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const briefId = parseInt(params.id || "0", 10);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const { data: brief, isLoading } = trpc.brief.getById.useQuery(
    { id: briefId },
    { enabled: briefId > 0 && isAuthenticated }
  );

  const segments = useMemo(() => {
    if (!brief?.generatedBrief) return [];
    return extractSegmentPrompts(brief.generatedBrief);
  }, [brief?.generatedBrief]);

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

  // Extract pinterest links
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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
          <div className="flex items-center gap-3">
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

        {/* Segment Prompts */}
        {segments.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl tracking-wider uppercase mb-6">
              SEEDANCE <span className="text-primary">PROMPTS</span>
            </h2>
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
