import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { createBrief, getBriefsByUserId, getBriefById, createVideoJob, getVideoJobsByBriefId, getVideoJobById, updateVideoJob, getVideoJobByBriefAndSegment } from "./db";
import { submitVideoTask, getVideoTaskResult } from "./wavespeed";
import { storagePut } from "./storage";
import { z } from "zod";

const SEEDANCE_SYSTEM_PROMPT = [
  "You are the Seedance 2.0 UGC Ad Director. You create hyper-realistic AI UGC video ad prompts.",
  "",
  "MANDATORY RULES:",
  "1. Follow the EXACT output format below. Do NOT invent your own format.",
  "2. Seedance 2.0 DOES generate speech and dialogue natively with lipsync. NEVER tell users to add voiceover in post.",
  "3. NEVER use the word \"cinematic\" anywhere. These are UGC ads that look like iPhone footage.",
  "4. Every output MUST include Pinterest links. Never skip them.",
  "5. Do NOT ask clarifying questions. Make creative decisions yourself.",
  "",
  "ANTI-CINEMATIC RULES (NON-NEGOTIABLE):",
  "ALWAYS use: iPhone handheld, natural lighting / window light, UGC style, slight camera shake, casual, authentic, 9:16",
  "NEVER use: cinematic, camera brands (ARRI, RED, Blackmagic), anamorphic, film grain, dramatic lighting, speed ramp, bloom flash, lens flare, whip pan, crane, dolly, steadicam, gimbal, Dutch angle, color grade, LUT, bokeh, epic, breathtaking, stunning, slow motion (unless \"iPhone slow-mo\"), depth of field alone (say \"phone camera depth of field\")",
  "",
  "DETAIL LEVEL:",
  "Be VERY descriptive. Every 5-second block needs 3-4 sentences of specific detail:",
  "- What the person is doing with EACH hand",
  "- Their exact facial expression",
  "- What's on the surface and what's NOT there",
  "- Background details",
  "- Specific light source and direction",
  "- If you don't describe it, Seedance invents it — and you get random artifacts",
  "",
  "AUDIO DIRECTION:",
  "Every prompt MUST include detailed audio. Seedance 2.0 generates audio natively.",
  "Voice: Match to demographic.",
  "Room tone must match the setting (bathroom: slight reverb, bedroom: soft close acoustics, kitchen: open space feel, car: muffled close acoustics, outdoors: natural ambience, living room: warm room tone).",
  "Speech pattern: Natural with pauses, filler words, contractions. NOT scripted.",
  "",
  "DIALOGUE RULES:",
  "Write dialogue that sounds REAL, not scripted:",
  "- Use contractions: \"I've been,\" \"it's literally,\" \"you're gonna\"",
  "- Include filler words: \"like,\" \"honestly,\" \"so basically\"",
  "- Casual grammar — fragments and run-ons are fine",
  "",
  "PINTEREST URL FORMAT:",
  "https://www.pinterest.com/search/pins/?q=WORDS+SEPARATED+BY+PLUS+SIGNS",
  "Make searches specific: combine person demographic + action + setting.",
  "",
  "REFERENCE IMAGE MAPPING:",
  "@Image1 = creator from Pinterest (same across ALL segments)",
  "@Image2 = setting reference if needed",
  "@Image3 = product photo (user provides this)",
  "",
  "SEEDANCE 2.0 FACTS:",
  "- Input: up to 9 images + 3 videos + 3 audio (12 total)",
  "- Output: 4-15 seconds per generation, up to 2K, 9:16 for UGC",
  "- Native audio: dialogue with lipsync, ambient sounds, room tone — all generated together",
  "- One action arc per prompt — don't describe two scene changes in one prompt",
].join("\n");

function buildUserPrompt(data: {
  productName: string;
  productDescription: string;
  targetAudienceAge: string;
  targetAudienceGender: string;
  targetAudienceLifestyle: string;
  adGoal: string;
  toneVibe: string;
  segmentCount: number;
  scriptConcept: string;
  imageAnalysis?: string | null;
}) {
  const lines = [
    "Create a complete UGC ad director's brief for the following product and campaign:",
    "",
    "**Product:** " + data.productName,
    "**Description:** " + data.productDescription,
    "**Target Audience:** " + data.targetAudienceAge + ", " + data.targetAudienceGender + ", " + data.targetAudienceLifestyle,
    "**Ad Goal:** " + data.adGoal,
    "**Tone/Vibe:** " + data.toneVibe,
    "**Number of Segments:** " + data.segmentCount + " (each 15 seconds)",
    "**Script/Concept:** " + data.scriptConcept,
  ];

  if (data.imageAnalysis) {
    lines.push("**Image Analysis Insights:** " + data.imageAnalysis);
  }

  lines.push(
    "",
    "OUTPUT THE EXACT FORMAT BELOW:",
    "",
    "# Your UGC Ad — Director's Brief",
    "",
    "**Product:** [name]",
    "**Duration:** [total]s (" + data.segmentCount + " segments x 15s)",
    "**Ad Structure:** Hook → Problem/Proof → Benefit/Demo → CTA (adapt based on segment count)",
    "",
    "---",
    "",
    "## Step 1: Find Your Creator on Pinterest",
    "",
    "This person stars in every scene. Pick ONE consistent character reference.",
    "",
    "**Browse these links and find a person who fits your ad:**",
    "",
    "(Provide exactly 4 Pinterest search URLs with descriptions. URLs must use format: https://www.pinterest.com/search/pins/?q=WORDS+SEPARATED+BY+PLUS+SIGNS. Make searches specific to the target demographic.)",
    "",
    "**What to pick:** Natural lighting, casual clothes, phone-quality feel. NO studio lighting, NO magazine poses, NO heavy makeup.",
    "",
    "**CRITICAL:** Only use CLEAN photos — no emoji stickers, watermarks, text overlays, or app UI.",
    "",
    "Your chosen image becomes **@Image1** — upload it to Seedance 2.0 as a reference for every segment.",
    "",
    "---",
    "",
    "## Step 2: Setting & Product References (Optional)",
    "",
    "(For each scene, provide 2 Pinterest search URLs — one for setting, one for product interaction pose. Only clean photos.)",
    "",
    "---",
    "",
    "## Step 3: Seedance 2.0 Prompts — Copy & Paste",
    "",
    "Upload your Pinterest creator as @Image1 and your product photo as @Image3 for EVERY segment.",
    "",
    "(For each segment, output in this EXACT format:)",
    "",
    "### Segment N of " + data.segmentCount + " — [Section Name] (timestamp)",
    "",
    "**What's happening:** [One sentence]",
    "",
    "```",
    "9:16. 15 seconds. Single continuous shot. UGC style. iPhone handheld.",
    "",
    "@Image1 is the creator. @Image3 is the product.",
    "",
    "[0:00-0:05] [Rich, detailed description — 3-4 sentences]",
    "",
    "[0:05-0:10] [Rich, detailed description — 3-4 sentences]",
    "",
    "[0:10-0:15] [Rich, detailed description — 3-4 sentences]",
    "",
    "Audio: [Voice character]. [Room tone]. Natural speech rhythm with pauses. \"[Full dialogue].\"",
    "```",
    "",
    "---",
    "",
    "## Step 4: Generate & Review",
    "",
    "1. Generate all segments in Seedance 2.0 (on Max Fusion or Jianying)",
    "2. Check: Does the creator look consistent across segments?",
    "3. Check: Does it look like a real person filmed this on their phone?",
    "4. If anything looks off, regenerate that segment with the same @Image1",
    "5. Stitch segments in order and export",
  );

  return lines.join("\n");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  brief: router({
    generate: protectedProcedure
      .input(
        z.object({
          productName: z.string().min(1),
          productDescription: z.string().min(1),
          targetAudienceAge: z.string().min(1),
          targetAudienceGender: z.string().min(1),
          targetAudienceLifestyle: z.string().min(1),
          adGoal: z.enum(["awareness", "conversion", "retention"]),
          toneVibe: z.string().min(1),
          segmentCount: z.number().min(1).max(4),
          scriptConcept: z.string().min(1),
          productImageUrl: z.string().nullable().optional(),
          imageAnalysis: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const userPrompt = buildUserPrompt({
          ...input,
          imageAnalysis: input.imageAnalysis,
        });

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: SEEDANCE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        });

        const generatedBrief =
          typeof llmResponse.choices[0]?.message?.content === "string"
            ? llmResponse.choices[0].message.content
            : "";

        // Extract pinterest links from the generated brief
        const pinterestRegex = /https:\/\/www\.pinterest\.com\/search\/pins\/\?q=[^\s)"\]]+/g;
        const pinterestLinks = generatedBrief.match(pinterestRegex) || [];

        const briefId = await createBrief({
          userId: ctx.user.id,
          productName: input.productName,
          productDescription: input.productDescription,
          targetAudienceAge: input.targetAudienceAge,
          targetAudienceGender: input.targetAudienceGender,
          targetAudienceLifestyle: input.targetAudienceLifestyle,
          adGoal: input.adGoal,
          toneVibe: input.toneVibe,
          segmentCount: input.segmentCount,
          scriptConcept: input.scriptConcept,
          productImageUrl: input.productImageUrl ?? null,
          imageAnalysis: input.imageAnalysis ?? null,
          generatedBrief,
          pinterestLinks: JSON.stringify(pinterestLinks),
        });

        // Fire owner notification (non-blocking)
        notifyOwner({
          title: "New UGC Brief: " + input.productName,
          content: "A new " + input.segmentCount + "-segment UGC ad brief was generated for \"" + input.productName + "\" targeting " + input.targetAudienceAge + " " + input.targetAudienceGender + " (" + input.adGoal + "). Brief ID: " + briefId,
        }).catch((err) => console.warn("[Notification] Failed:", err));

        return { briefId, generatedBrief, pinterestLinks };
      }),

    analyzeImage: protectedProcedure
      .input(
        z.object({
          imageUrl: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a product marketing analyst. Analyze the product image and suggest ad angles, use-case scenarios, target demographics, and tone. Return JSON only.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this product image. Return a JSON object with these exact fields: suggestedAngles (array of 3 strings), suggestedUseCases (array of 3 strings), suggestedDemographics (string describing ideal audience), suggestedTone (string describing ideal ad tone/vibe). Return ONLY the JSON object, no markdown fences.",
                },
                {
                  type: "image_url",
                  image_url: { url: input.imageUrl, detail: "high" },
                },
              ],
            },
          ],
        });

        const content =
          typeof llmResponse.choices[0]?.message?.content === "string"
            ? llmResponse.choices[0].message.content
            : "";

        try {
          const cleaned = content.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
          const parsed = JSON.parse(cleaned);
          return {
            suggestedAngles: parsed.suggestedAngles || [],
            suggestedUseCases: parsed.suggestedUseCases || [],
            suggestedDemographics: parsed.suggestedDemographics || "",
            suggestedTone: parsed.suggestedTone || "",
          };
        } catch {
          return {
            suggestedAngles: [],
            suggestedUseCases: [],
            suggestedDemographics: "",
            suggestedTone: "",
          };
        }
      }),

    uploadImage: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string(),
          contentType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = "briefs/" + ctx.user.id + "/" + Date.now() + "-" + input.fileName;
        const { url } = await storagePut(key, buffer, input.contentType);
        return { url };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getBriefsByUserId(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const brief = await getBriefById(input.id);
        if (!brief || brief.userId !== ctx.user.id) {
          return null;
        }
        return brief;
      }),
  }),

  video: router({
    generate: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          segmentIndex: z.number().min(0).max(3),
          prompt: z.string().min(1),
          referenceImages: z.array(z.string()).optional(),
          duration: z.number().min(4).max(15).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Check if a job already exists for this segment
        const existing = await getVideoJobByBriefAndSegment(input.briefId, input.segmentIndex);
        if (existing && (existing.status === "created" || existing.status === "processing")) {
          return { jobId: existing.id, status: existing.status, message: "Video generation already in progress" };
        }

        // Verify the brief belongs to the user
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        // Create the video job record
        const jobId = await createVideoJob({
          briefId: input.briefId,
          userId: ctx.user.id,
          segmentIndex: input.segmentIndex,
          prompt: input.prompt,
          status: "pending",
          aspectRatio: "9:16",
          resolution: "720p",
          duration: input.duration || 5,
        });

        // Submit to WaveSpeed API
        try {
          const result = await submitVideoTask({
            prompt: input.prompt,
            aspectRatio: "9:16",
            resolution: "720p",
            duration: input.duration || 5,
            referenceImages: input.referenceImages,
          });

          await updateVideoJob(jobId, {
            wavespeedTaskId: result.data.id,
            status: "created",
          });

          return { jobId, status: "created", wavespeedTaskId: result.data.id };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          await updateVideoJob(jobId, {
            status: "failed",
            errorMessage: errMsg,
          });
          throw new Error("Failed to submit video task: " + errMsg);
        }
      }),

    generateAll: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          segments: z.array(
            z.object({
              segmentIndex: z.number().min(0).max(3),
              prompt: z.string().min(1),
            })
          ),
          referenceImages: z.array(z.string()).optional(),
          duration: z.number().min(4).max(15).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const results = [];
        for (const seg of input.segments) {
          // Check if a job already exists for this segment
          const existing = await getVideoJobByBriefAndSegment(input.briefId, seg.segmentIndex);
          if (existing && (existing.status === "created" || existing.status === "processing")) {
            results.push({ jobId: existing.id, segmentIndex: seg.segmentIndex, status: existing.status });
            continue;
          }

          const jobId = await createVideoJob({
            briefId: input.briefId,
            userId: ctx.user.id,
            segmentIndex: seg.segmentIndex,
            prompt: seg.prompt,
            status: "pending",
            aspectRatio: "9:16",
            resolution: "720p",
            duration: input.duration || 5,
          });

          try {
            const result = await submitVideoTask({
              prompt: seg.prompt,
              aspectRatio: "9:16",
              resolution: "720p",
              duration: input.duration || 5,
              referenceImages: input.referenceImages,
            });

            await updateVideoJob(jobId, {
              wavespeedTaskId: result.data.id,
              status: "created",
            });

            results.push({ jobId, segmentIndex: seg.segmentIndex, status: "created" });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            await updateVideoJob(jobId, {
              status: "failed",
              errorMessage: errMsg,
            });
            results.push({ jobId, segmentIndex: seg.segmentIndex, status: "failed", error: errMsg });
          }
        }

        return { results };
      }),

    checkStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await getVideoJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new Error("Video job not found or access denied");
        }

        // If already completed or failed, return cached result
        if (job.status === "completed" || job.status === "failed") {
          return {
            id: job.id,
            status: job.status,
            videoUrl: job.videoUrl,
            errorMessage: job.errorMessage,
            segmentIndex: job.segmentIndex,
          };
        }

        // Poll WaveSpeed API for status update
        if (job.wavespeedTaskId) {
          try {
            const result = await getVideoTaskResult(job.wavespeedTaskId);
            const newStatus = result.data.status === "completed" ? "completed" as const
              : result.data.status === "failed" ? "failed" as const
              : "processing" as const;

            const updateData: Record<string, string> = { status: newStatus };
            if (newStatus === "completed" && result.data.outputs?.length > 0) {
              updateData.videoUrl = result.data.outputs[0];
            }
            if (newStatus === "failed" && result.data.error) {
              updateData.errorMessage = result.data.error;
            }

            await updateVideoJob(job.id, updateData as any);

            return {
              id: job.id,
              status: newStatus,
              videoUrl: newStatus === "completed" ? result.data.outputs?.[0] || null : null,
              errorMessage: newStatus === "failed" ? result.data.error || null : null,
              segmentIndex: job.segmentIndex,
            };
          } catch {
            return {
              id: job.id,
              status: job.status,
              videoUrl: job.videoUrl,
              errorMessage: job.errorMessage,
              segmentIndex: job.segmentIndex,
            };
          }
        }

        return {
          id: job.id,
          status: job.status,
          videoUrl: job.videoUrl,
          errorMessage: job.errorMessage,
          segmentIndex: job.segmentIndex,
        };
      }),

    listByBrief: protectedProcedure
      .input(z.object({ briefId: z.number() }))
      .query(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const jobs = await getVideoJobsByBriefId(input.briefId);
        return jobs.map((j) => ({
          id: j.id,
          segmentIndex: j.segmentIndex,
          status: j.status,
          videoUrl: j.videoUrl,
          errorMessage: j.errorMessage,
          duration: j.duration,
          createdAt: j.createdAt,
        }));
      }),
  }),
});

export type AppRouter = typeof appRouter;
