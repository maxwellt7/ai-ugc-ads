import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Loader2, Upload, Sparkles, X, FileText, PenTool, Wand2, Film, Box, Zap } from "lucide-react";
import { toast } from "sonner";

type IntakeMode = "description" | "script";
type AdStyle = "ugc" | "animated" | "direct_response";

interface FormData {
  productName: string;
  productDescription: string;
  targetAudienceAge: string;
  targetAudienceGender: string;
  targetAudienceLifestyle: string;
  adGoal: "awareness" | "conversion" | "retention" | "";
  toneVibe: string;
  segmentCount: number;
  scriptConcept: string;
  productImageUrl: string | null;
  imageAnalysis: string | null;
  intakeMode: IntakeMode;
  adStyle: AdStyle;
}

const DESCRIPTION_STEPS = [
  { id: 1, label: "PRODUCT" },
  { id: 2, label: "AUDIENCE" },
  { id: 3, label: "DIRECTION" },
  { id: 4, label: "CONCEPT" },
  { id: 5, label: "IMAGE" },
];

const SCRIPT_STEPS = [
  { id: 1, label: "PRODUCT" },
  { id: 2, label: "AUDIENCE" },
  { id: 3, label: "DIRECTION" },
  { id: 4, label: "SCRIPT" },
  { id: 5, label: "IMAGE" },
];

export default function IntakeForm() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [adStyle, setAdStyle] = useState<AdStyle | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode | null>(null);
  const [step, setStep] = useState(1);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    productName: "",
    productDescription: "",
    targetAudienceAge: "",
    targetAudienceGender: "",
    targetAudienceLifestyle: "",
    adGoal: "",
    toneVibe: "",
    segmentCount: 2,
    scriptConcept: "",
    productImageUrl: null,
    imageAnalysis: null,
    intakeMode: "description",
    adStyle: "ugc",
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    suggestedAngles: string[];
    suggestedUseCases: string[];
    suggestedDemographics: string;
    suggestedTone: string;
  } | null>(null);

  const uploadMutation = trpc.brief.uploadImage.useMutation();
  const analyzeMutation = trpc.brief.analyzeImage.useMutation();
  const generateMutation = trpc.brief.generate.useMutation();
  const generateScriptMutation = trpc.brief.generateScript.useMutation();

  const STEPS = intakeMode === "script" ? SCRIPT_STEPS : DESCRIPTION_STEPS;

  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        setImagePreview(reader.result as string);

        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
        });

        updateField("productImageUrl", result.url);
        toast.success("Image uploaded");

        // Auto-analyze
        setIsAnalyzing(true);
        try {
          const analysis = await analyzeMutation.mutateAsync({
            imageUrl: window.location.origin + result.url,
          });
          setAnalysisResult(analysis);
          updateField("imageAnalysis", JSON.stringify(analysis));
          toast.success("Image analyzed — suggestions available");
        } catch {
          toast.error("Image analysis failed, but upload succeeded");
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [uploadMutation, analyzeMutation, updateField]);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    setAnalysisResult(null);
    updateField("productImageUrl", null);
    updateField("imageAnalysis", null);
  }, [updateField]);

  const applySuggestion = useCallback((field: keyof FormData, value: string) => {
    updateField(field, value as FormData[typeof field]);
    toast.success("Suggestion applied");
  }, [updateField]);

  const handleGenerateScript = useCallback(async () => {
    if (formData.adGoal === "") {
      toast.error("Please complete the direction step first");
      return;
    }
    setIsGeneratingScript(true);
    try {
      const result = await generateScriptMutation.mutateAsync({
        productName: formData.productName,
        productDescription: formData.productDescription,
        targetAudienceAge: formData.targetAudienceAge,
        targetAudienceGender: formData.targetAudienceGender,
        targetAudienceLifestyle: formData.targetAudienceLifestyle,
        adGoal: formData.adGoal,
        toneVibe: formData.toneVibe,
        segmentCount: formData.segmentCount,
        adStyle: formData.adStyle,
      });
      updateField("scriptConcept", result.script);
      toast.success("Script generated using Belief Engineering framework!");
    } catch {
      toast.error("Script generation failed. Please try again.");
    } finally {
      setIsGeneratingScript(false);
    }
  }, [formData, generateScriptMutation, updateField]);

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return formData.productName.trim().length > 0 && formData.productDescription.trim().length > 0;
      case 2:
        return (
          formData.targetAudienceAge.trim().length > 0 &&
          formData.targetAudienceGender.trim().length > 0 &&
          formData.targetAudienceLifestyle.trim().length > 0
        );
      case 3:
        return formData.adGoal !== "" && formData.toneVibe.trim().length > 0;
      case 4:
        return formData.scriptConcept.trim().length > 0;
      case 5:
        return true; // Image is optional
      default:
        return false;
    }
  };

  const handleGenerate = async () => {
    if (formData.adGoal === "") {
      toast.error("Please select an ad goal");
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        productName: formData.productName,
        productDescription: formData.productDescription,
        targetAudienceAge: formData.targetAudienceAge,
        targetAudienceGender: formData.targetAudienceGender,
        targetAudienceLifestyle: formData.targetAudienceLifestyle,
        adGoal: formData.adGoal,
        toneVibe: formData.toneVibe,
        segmentCount: formData.segmentCount,
        scriptConcept: formData.scriptConcept,
        productImageUrl: formData.productImageUrl,
        imageAnalysis: formData.imageAnalysis,
        intakeMode: intakeMode || "description",
        adStyle: formData.adStyle,
      });

      toast.success("Brief generated!");
      navigate("/brief/" + result.briefId);
    } catch (err) {
      toast.error("Generation failed. Please try again.");
    }
  };

  if (authLoading) {
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

  // Step 0: Ad Style Selection
  if (!adStyle) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <nav className="w-full border-b border-border">
          <div className="container flex items-center justify-between h-16">
            <button onClick={() => navigate("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-3 h-3 bg-primary" />
              <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
            </button>
            <button
              onClick={() => navigate("/history")}
              className="text-muted-foreground hover:text-foreground transition-colors font-sans text-sm uppercase tracking-widest"
            >
              History
            </button>
          </div>
        </nav>

        <main className="flex-1 container py-16 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="font-display text-5xl md:text-6xl tracking-wider uppercase leading-none mb-4">
              CHOOSE YOUR <span className="text-primary">AD STYLE</span>
            </h1>
            <div className="brutal-divider mt-4 mx-auto max-w-[80px]" />
            <p className="mt-6 text-muted-foreground font-sans text-sm tracking-wide max-w-lg mx-auto">
              Select the type of video ad you want to create. Each style generates different visual prompts optimized for that format.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* UGC Ad */}
            <button
              onClick={() => {
                setAdStyle("ugc");
                setFormData(prev => ({ ...prev, adStyle: "ugc" }));
              }}
              className="group border-2 border-border hover:border-primary transition-all p-8 text-left space-y-4"
            >
              <div className="w-14 h-14 border border-border group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center transition-all">
                <Film className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-display text-2xl tracking-wider uppercase">UGC AD</h3>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                Hyper-realistic AI-generated UGC creator talking to camera. iPhone-style footage, natural lighting, authentic feel.
              </p>
              <span className="inline-block font-sans text-xs uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Most popular →
              </span>
            </button>

            {/* Animated Ad */}
            <button
              onClick={() => {
                setAdStyle("animated");
                setFormData(prev => ({ ...prev, adStyle: "animated" }));
              }}
              className="group border-2 border-border hover:border-primary transition-all p-8 text-left space-y-4"
            >
              <div className="w-14 h-14 border border-border group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center transition-all">
                <Box className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-display text-2xl tracking-wider uppercase">ANIMATED</h3>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                3D animated mascot/character. Colorful, expressive, brand-appropriate with stylized environments.
              </p>
              <span className="inline-block font-sans text-xs uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Eye-catching →
              </span>
            </button>

            {/* Direct Response */}
            <button
              disabled
              className="group border-2 border-border/50 p-8 text-left space-y-4 opacity-50 cursor-not-allowed"
            >
              <div className="w-14 h-14 border border-border/50 flex items-center justify-center">
                <Zap className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <h3 className="font-display text-2xl tracking-wider uppercase text-muted-foreground/50">DIRECT RESPONSE</h3>
              <p className="font-sans text-sm text-muted-foreground/50 leading-relaxed">
                High-conversion direct response format with aggressive hooks, social proof, and urgency.
              </p>
              <span className="inline-block font-sans text-xs uppercase tracking-widest text-muted-foreground/30">
                Coming soon
              </span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Step 1: Mode selection (description vs script)
  if (!intakeMode) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <nav className="w-full border-b border-border">
          <div className="container flex items-center justify-between h-16">
            <button onClick={() => navigate("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-3 h-3 bg-primary" />
              <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
            </button>
            <button
              onClick={() => navigate("/history")}
              className="text-muted-foreground hover:text-foreground transition-colors font-sans text-sm uppercase tracking-widest"
            >
              History
            </button>
          </div>
        </nav>

        <main className="flex-1 container py-16 max-w-3xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => setAdStyle(null)}
              className="font-sans text-xs text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors"
            >
              ← CHANGE AD STYLE
            </button>
            <div className="mt-2 inline-block border border-primary/30 bg-primary/5 px-3 py-1">
              <span className="font-sans text-xs uppercase tracking-widest text-primary">
                {adStyle === "ugc" ? "UGC Ad" : adStyle === "animated" ? "Animated Ad" : "Direct Response"}
              </span>
            </div>
          </div>

          <div className="text-center mb-12">
            <h1 className="font-display text-5xl md:text-6xl tracking-wider uppercase leading-none mb-4">
              HOW DO YOU WANT TO <span className="text-primary">START</span>?
            </h1>
            <div className="brutal-divider mt-4 mx-auto max-w-[80px]" />
            <p className="mt-6 text-muted-foreground font-sans text-sm tracking-wide max-w-lg mx-auto">
              Choose your starting point. Either way, the system will generate a full director's brief that you can edit before creating videos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Description mode */}
            <button
              onClick={() => {
                setIntakeMode("description");
                setFormData(prev => ({ ...prev, intakeMode: "description" }));
              }}
              className="group border-2 border-border hover:border-primary transition-all p-8 text-left space-y-4"
            >
              <div className="w-14 h-14 border border-border group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center transition-all">
                <PenTool className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-display text-2xl tracking-wider uppercase">DESCRIPTION</h3>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                Describe your product, audience, and ad concept. The AI will write the full script and Seedance prompts for you.
              </p>
              <span className="inline-block font-sans text-xs uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Best for new ideas →
              </span>
            </button>

            {/* Script mode */}
            <button
              onClick={() => {
                setIntakeMode("script");
                setFormData(prev => ({ ...prev, intakeMode: "script" }));
              }}
              className="group border-2 border-border hover:border-primary transition-all p-8 text-left space-y-4"
            >
              <div className="w-14 h-14 border border-border group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center transition-all">
                <FileText className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-display text-2xl tracking-wider uppercase">FULL SCRIPT</h3>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                Already have a script? Paste it in and the AI will convert it into a director's brief with Seedance prompts.
              </p>
              <span className="inline-block font-sans text-xs uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Best for existing scripts →
              </span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  const progressPercent = (step / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="w-full border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-3 h-3 bg-primary" />
            <span className="font-display text-2xl tracking-wider uppercase">UGC AD DIRECTOR</span>
          </button>
          <button
            onClick={() => navigate("/history")}
            className="text-muted-foreground hover:text-foreground transition-colors font-sans text-sm uppercase tracking-widest"
          >
            History
          </button>
        </div>
      </nav>

      {/* Progress */}
      <div className="w-full border-b border-border">
        <div className="container py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIntakeMode(null)}
                className="font-sans text-xs text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors"
              >
                ← {intakeMode === "script" ? "SCRIPT" : "DESCRIPTION"} MODE
              </button>
              <span className="text-muted-foreground/30">|</span>
              <span className="font-sans text-xs text-primary/70 uppercase tracking-widest">
                {adStyle === "ugc" ? "UGC" : adStyle === "animated" ? "ANIMATED" : "DR"}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => s.id < step && setStep(s.id)}
                  className={
                    "font-display text-xs tracking-widest uppercase transition-colors " +
                    (s.id === step
                      ? "text-primary"
                      : s.id < step
                      ? "text-foreground cursor-pointer hover:text-primary"
                      : "text-muted-foreground/40")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Progress value={progressPercent} className="h-[3px] bg-border [&>div]:bg-primary" />
        </div>
      </div>

      {/* Form content */}
      <main className="flex-1 container py-12 max-w-2xl mx-auto">
        {/* Step 1: Product */}
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
                YOUR <span className="text-primary">PRODUCT</span>
              </h2>
              <div className="brutal-divider mt-4 max-w-[80px]" />
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Product Name
                </Label>
                <Input
                  value={formData.productName}
                  onChange={(e) => updateField("productName", e.target.value)}
                  placeholder="e.g. GlowSerum Pro"
                  className="bg-input border-border text-foreground font-sans text-lg h-14 px-4 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Product Description
                </Label>
                <Textarea
                  value={formData.productDescription}
                  onChange={(e) => updateField("productDescription", e.target.value)}
                  placeholder="What does it do? Key features and benefits..."
                  rows={4}
                  className="bg-input border-border text-foreground font-sans text-base px-4 py-3 placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Audience */}
        {step === 2 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
                TARGET <span className="text-primary">AUDIENCE</span>
              </h2>
              <div className="brutal-divider mt-4 max-w-[80px]" />
            </div>

            {analysisResult?.suggestedDemographics && (
              <div className="border border-primary/30 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-sans text-xs uppercase tracking-widest">AI Suggestion from Image</span>
                </div>
                <p className="text-sm text-muted-foreground font-sans">{analysisResult.suggestedDemographics}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestion("targetAudienceLifestyle", analysisResult.suggestedDemographics)}
                  className="text-xs uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                >
                  Apply to Lifestyle
                </Button>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Age Range
                </Label>
                <Input
                  value={formData.targetAudienceAge}
                  onChange={(e) => updateField("targetAudienceAge", e.target.value)}
                  placeholder="e.g. 25-35"
                  className="bg-input border-border text-foreground font-sans text-lg h-14 px-4 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Gender
                </Label>
                <Input
                  value={formData.targetAudienceGender}
                  onChange={(e) => updateField("targetAudienceGender", e.target.value)}
                  placeholder="e.g. Female, All, Male"
                  className="bg-input border-border text-foreground font-sans text-lg h-14 px-4 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Lifestyle / Interests
                </Label>
                <Input
                  value={formData.targetAudienceLifestyle}
                  onChange={(e) => updateField("targetAudienceLifestyle", e.target.value)}
                  placeholder="e.g. health-conscious, busy professionals, skincare enthusiasts"
                  className="bg-input border-border text-foreground font-sans text-lg h-14 px-4 placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Direction */}
        {step === 3 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
                AD <span className="text-primary">DIRECTION</span>
              </h2>
              <div className="brutal-divider mt-4 max-w-[80px]" />
            </div>

            {analysisResult?.suggestedTone && (
              <div className="border border-primary/30 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-sans text-xs uppercase tracking-widest">AI Suggested Tone</span>
                </div>
                <p className="text-sm text-muted-foreground font-sans">{analysisResult.suggestedTone}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestion("toneVibe", analysisResult.suggestedTone)}
                  className="text-xs uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                >
                  Apply Suggestion
                </Button>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Ad Goal
                </Label>
                <Select
                  value={formData.adGoal}
                  onValueChange={(v) => updateField("adGoal", v as FormData["adGoal"])}
                >
                  <SelectTrigger className="bg-input border-border text-foreground font-sans text-lg h-14">
                    <SelectValue placeholder="Select goal..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="awareness">Awareness</SelectItem>
                    <SelectItem value="conversion">Conversion</SelectItem>
                    <SelectItem value="retention">Retention</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Tone & Vibe
                </Label>
                <Input
                  value={formData.toneVibe}
                  onChange={(e) => updateField("toneVibe", e.target.value)}
                  placeholder="e.g. casual and genuine, excited discovery, skeptical-to-convinced"
                  className="bg-input border-border text-foreground font-sans text-lg h-14 px-4 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                  Number of Segments (1–4)
                </Label>
                <div className="flex items-center gap-4">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateField("segmentCount", n)}
                      className={
                        "w-14 h-14 border font-display text-2xl transition-all " +
                        (formData.segmentCount === n
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-input text-muted-foreground hover:border-primary/50")
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground font-sans tracking-wide">
                  {formData.segmentCount * 15}s total duration
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Script/Concept */}
        {step === 4 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
                {intakeMode === "script" ? (
                  <>YOUR <span className="text-primary">SCRIPT</span></>
                ) : (
                  <>SCRIPT & <span className="text-primary">CONCEPT</span></>
                )}
              </h2>
              <div className="brutal-divider mt-4 max-w-[80px]" />
              {intakeMode === "script" && (
                <p className="mt-4 text-muted-foreground font-sans text-sm tracking-wide">
                  Paste your full script below. The AI will convert it into a director's brief with Seedance 2.0 prompts, maintaining your script's structure and dialogue.
                </p>
              )}
            </div>

            {/* AI Script Generation Button */}
            {intakeMode === "description" && (
              <div className="border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Wand2 className="w-4 h-4" />
                  <span className="font-sans text-xs uppercase tracking-widest">AI Script Writer (Belief Engineering)</span>
                </div>
                <p className="text-sm text-muted-foreground font-sans">
                  Don't have a script? Let the AI write one using the Belief Engineering framework — proven direct-response copywriting that moves viewers from skepticism to action.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript || formData.adGoal === ""}
                  className="text-xs uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                >
                  {isGeneratingScript ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Writing Script...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3 mr-2" />
                      Generate Script with AI
                    </>
                  )}
                </Button>
              </div>
            )}

            {intakeMode === "description" && analysisResult && analysisResult.suggestedAngles.length > 0 && (
              <div className="border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-sans text-xs uppercase tracking-widest">AI Suggested Ad Angles</span>
                </div>
                <div className="space-y-1">
                  {analysisResult.suggestedAngles.map((angle, i) => (
                    <p key={i} className="text-sm text-muted-foreground font-sans">{"\u2022"} {angle}</p>
                  ))}
                </div>
                {analysisResult.suggestedUseCases.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 text-primary mt-2">
                      <span className="font-sans text-xs uppercase tracking-widest">Use Cases</span>
                    </div>
                    <div className="space-y-1">
                      {analysisResult.suggestedUseCases.map((uc, i) => (
                        <p key={i} className="text-sm text-muted-foreground font-sans">{"\u2022"} {uc}</p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-sans text-sm uppercase tracking-widest text-muted-foreground">
                {intakeMode === "script" ? "Full Script" : "Script or Concept"}
              </Label>
              <Textarea
                value={formData.scriptConcept}
                onChange={(e) => updateField("scriptConcept", e.target.value)}
                placeholder={
                  intakeMode === "script"
                    ? "Paste your full ad script here...\n\nExample:\n[HOOK] Hey, you know what changed my morning routine?\n[PROBLEM] I used to spend 20 minutes on skincare...\n[SOLUTION] Then I found GlowSerum Pro...\n[CTA] Link in bio, use code GLOW20..."
                    : "Describe your ad concept, the story arc, key messages, or paste a rough script..."
                }
                rows={intakeMode === "script" ? 14 : 10}
                className="bg-input border-border text-foreground font-sans text-base px-4 py-3 placeholder:text-muted-foreground/50 resize-none"
              />
              <p className="text-xs text-muted-foreground font-sans tracking-wide">
                {intakeMode === "script"
                  ? "The AI will break your script into " + formData.segmentCount + " segments and create detailed Seedance prompts for each."
                  : "Be as detailed as possible. The AI will use this to craft your Seedance prompts."}
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Image */}
        {step === 5 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl tracking-wider uppercase">
                PRODUCT <span className="text-primary">IMAGE</span>
              </h2>
              <div className="brutal-divider mt-4 max-w-[80px]" />
              <p className="mt-4 text-muted-foreground font-sans text-sm tracking-wide">
                Optional. Upload a product photo and the AI will analyze it to suggest ad angles, use-cases, and demographics.
              </p>
            </div>

            {!imagePreview ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 transition-colors p-12 cursor-pointer group">
                <Upload className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                <span className="font-sans text-sm text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-widest">
                  {isUploading ? "Uploading..." : "Click to upload product image"}
                </span>
                <span className="font-sans text-xs text-muted-foreground/50 mt-2">
                  PNG, JPG, WebP — Max 5MB
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="relative border border-border">
                  <img src={imagePreview} alt="Product" className="w-full max-h-64 object-contain bg-black/50" />
                  <button
                    onClick={removeImage}
                    className="absolute top-2 right-2 w-8 h-8 bg-background/80 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="flex items-center gap-3 text-primary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="font-sans text-sm uppercase tracking-widest">Analyzing image...</span>
                  </div>
                )}

                {analysisResult && (
                  <div className="border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-sans text-xs uppercase tracking-widest">Image Analysis Results</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-sans uppercase tracking-widest">Suggested Angles:</p>
                      {analysisResult.suggestedAngles.map((a, i) => (
                        <p key={i} className="text-sm text-foreground font-sans">{"\u2022"} {a}</p>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-sans uppercase tracking-widest">Use Cases:</p>
                      {analysisResult.suggestedUseCases.map((u, i) => (
                        <p key={i} className="text-sm text-foreground font-sans">{"\u2022"} {u}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-sans uppercase tracking-widest">Demographics:</p>
                      <p className="text-sm text-foreground font-sans">{analysisResult.suggestedDemographics}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-sans uppercase tracking-widest">Tone:</p>
                      <p className="text-sm text-foreground font-sans">{analysisResult.suggestedTone}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-12 pt-8 border-t border-border">
          <Button
            variant="outline"
            onClick={() => step === 1 ? setIntakeMode(null) : setStep(step - 1)}
            className="border-border text-foreground hover:bg-secondary font-sans uppercase tracking-widest text-sm px-6 h-12"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 1 ? "CHANGE MODE" : "BACK"}
          </Button>

          {step < STEPS.length ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-widest text-sm px-6 h-12 disabled:opacity-30"
            >
              NEXT <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !canProceed()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-display text-xl tracking-widest uppercase px-8 h-14"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  GENERATING...
                </>
              ) : (
                <>
                  GENERATE BRIEF <Sparkles className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
