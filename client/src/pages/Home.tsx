import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { ArrowRight, Film, Copy, Clock, Zap } from "lucide-react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="w-full border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-primary" />
            <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated && (
              <button
                onClick={() => navigate("/history")}
                className="text-muted-foreground hover:text-foreground transition-colors font-sans text-sm uppercase tracking-widest"
              >
                History
              </button>
            )}
            {isAuthenticated ? (
              <Button
                onClick={() => navigate("/create")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6"
              >
                Create Brief
              </Button>
            ) : (
              <Button
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="container flex flex-col items-center justify-center py-24 md:py-32 text-center">
          <div className="brutal-divider mb-12 max-w-xs mx-auto" />
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl leading-none tracking-tight uppercase">
            DIRECT YOUR
            <br />
            <span className="text-primary">UGC ADS</span>
          </h1>
          <p className="mt-8 text-muted-foreground font-sans text-lg md:text-xl max-w-2xl leading-relaxed tracking-wide">
            Fill out one form. Get a complete Seedance 2.0 director's brief with Pinterest casting links, 
            copy-paste prompts, and production-ready scripts. No human in the loop.
          </p>
          <div className="brutal-divider mt-12 max-w-xs mx-auto" />
          
          <div className="mt-12">
            {isAuthenticated ? (
              <Button
                onClick={() => navigate("/create")}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-display text-2xl tracking-widest uppercase px-12 py-6 h-auto"
              >
                START BRIEF <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            ) : (
              <Button
                onClick={() => { window.location.href = getLoginUrl(); }}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-display text-2xl tracking-widest uppercase px-12 py-6 h-auto"
              >
                SIGN IN TO START <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            )}
          </div>
        </section>

        {/* Features grid */}
        <section className="border-t border-border">
          <div className="container py-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0">
              {[
                {
                  icon: Film,
                  title: "SEEDANCE 2.0 PROMPTS",
                  desc: "Detailed 5-second block descriptions with camera, lighting, hands, expressions, and full audio direction.",
                },
                {
                  icon: Zap,
                  title: "AI-POWERED GENERATION",
                  desc: "LLM generates the complete director's brief from your intake form. Zero manual work required.",
                },
                {
                  icon: Copy,
                  title: "COPY & PASTE READY",
                  desc: "Each segment prompt sits in its own code block. One click to copy any segment or the full brief.",
                },
                {
                  icon: Clock,
                  title: "BRIEF HISTORY",
                  desc: "Every brief is saved. Revisit past campaigns, download briefs, and iterate on your best performers.",
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="border border-border p-8 flex flex-col gap-4 hover:bg-secondary/50 transition-colors"
                >
                  <feature.icon className="w-8 h-8 text-primary" strokeWidth={1.5} />
                  <h3 className="font-display text-xl tracking-wider">{feature.title}</h3>
                  <p className="text-muted-foreground font-sans text-sm leading-relaxed tracking-wide">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border">
          <div className="container py-20">
            <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase text-center mb-16">
              HOW IT <span className="text-primary">WORKS</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {[
                { step: "01", title: "FILL THE FORM", desc: "Product details, audience, tone, segments, and your script concept." },
                { step: "02", title: "AI GENERATES", desc: "The LLM applies Seedance 2.0 rules to produce a complete director's brief." },
                { step: "03", title: "COPY & CREATE", desc: "Copy each prompt into Seedance 2.0, generate your segments, and export." },
              ].map((item, i) => (
                <div key={i} className="border border-border p-10 text-center">
                  <span className="font-display text-6xl text-primary">{item.step}</span>
                  <h3 className="font-display text-2xl tracking-wider mt-4">{item.title}</h3>
                  <p className="text-muted-foreground font-sans text-sm mt-3 leading-relaxed tracking-wide">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="container py-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary" />
              <span className="font-display text-sm tracking-widest uppercase text-muted-foreground">
                UGC AD DIRECTOR
              </span>
            </div>
            <span className="text-muted-foreground font-sans text-xs tracking-wide">
              Powered by Seedance 2.0
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
