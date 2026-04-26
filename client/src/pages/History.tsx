import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, FileText } from "lucide-react";

export default function History() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: briefs, isLoading } = trpc.brief.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
          <button onClick={() => navigate("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-3 h-3 bg-primary" />
            <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
          </button>
          <Button
            onClick={() => navigate("/create")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6"
          >
            New Brief
          </Button>
        </div>
      </nav>

      <main className="flex-1 container py-12 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
              BRIEF <span className="text-primary">HISTORY</span>
            </h1>
            <div className="brutal-divider mt-4 max-w-[80px]" />
          </div>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-xs px-4 h-10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> HOME
          </Button>
        </div>

        {(!briefs || briefs.length === 0) ? (
          <div className="border border-border p-16 flex flex-col items-center justify-center gap-6">
            <FileText className="w-12 h-12 text-muted-foreground/30" strokeWidth={1} />
            <span className="font-display text-2xl text-muted-foreground/50 tracking-wider">NO BRIEFS YET</span>
            <Button
              onClick={() => navigate("/create")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6"
            >
              CREATE YOUR FIRST BRIEF
            </Button>
          </div>
        ) : (
          <div className="space-y-0">
            {briefs.map((brief) => (
              <button
                key={brief.id}
                onClick={() => navigate("/brief/" + brief.id)}
                className="w-full flex items-center justify-between border border-border p-5 hover:bg-secondary/30 hover:border-primary/30 transition-all text-left group"
              >
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 border border-border flex items-center justify-center bg-secondary/50 group-hover:border-primary/50 group-hover:bg-primary/10 transition-colors">
                    <FileText className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <div>
                    <span className="font-display text-lg tracking-wider block group-hover:text-primary transition-colors">
                      {brief.productName}
                    </span>
                    <span className="font-sans text-xs text-muted-foreground uppercase tracking-widest">
                      {brief.segmentCount} segments · {brief.adGoal} · {new Date(brief.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
