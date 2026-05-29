import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import {
  createBrief, getBriefsByUserId, getBriefById, updateBrief,
  createVideoJob, getVideoJobsByBriefId, getVideoJobById, updateVideoJob,
  getVideoJobByBriefAndSegment, deleteVideoJob,
  createStitchJob, getStitchJobById, getStitchJobByBriefId, updateStitchJob, deleteStitchJob,
  getVideoSummaryByBriefIds, getStitchSummaryByBriefIds, getVideoJobByIdempotencyKey, getStitchJobByIdempotencyKey,
} from "./db";
import { buildStitchEdit } from "./shotstack";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
import { z } from "zod";
import { services } from "./services/runtimeServices";
import { ENV } from "./_core/env";

async function persistExternalMediaUrl(
  sourceUrl: string,
  destinationKey: string,
  contentType: string
) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download external media: ${response.status} ${response.statusText}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const stored = await services.storage.put(destinationKey, buffer, contentType);
  return stored.url;
}

const SEEDANCE_SYSTEM_PROMPT = [
  "You are the Seedance 2.0 UGC Ad Director. You create hyper-realistic AI UGC video ad prompts.",
  "",
  "MANDATORY RULES:",
  "1. Follow the EXACT output format below. Do NOT invent your own format.",
  "2. Seedance 2.0 DOES generate speech and dialogue natively with lipsync. NEVER tell users to add voiceover in post.",
  "3. NEVER use the word \"cinematic\" anywhere. These are UGC ads that look like iPhone footage.",
  "4. Every output MUST include Pinterest links. Never skip them.",
  "5. Do NOT ask clarifying questions. Make creative decisions yourself.",
  "6. STRICTLY produce the EXACT number of segments requested. If the user says 3 segments, output EXACTLY 3 segments — no more, no fewer. Adapt the script to fit the requested segment count by combining or splitting content as needed.",
  "",
  "ANTI-CINEMATIC RULES (NON-NEGOTIABLE):",
  "ALWAYS use: iPhone handheld, natural lighting / window light, UGC style, slight camera shake, casual, authentic, 9:16",
  "NEVER use: cinematic, camera brands (ARRI, RED, Blackmagic), anamorphic, film grain, dramatic lighting, speed ramp, bloom flash, lens flare, whip pan, crane, dolly, steadicam, gimbal, Dutch angle, color grade, LUT, bokeh, epic, breathtaking, stunning, slow motion (unless \"iPhone slow-mo\"), depth of field alone (say \"phone camera depth of field\")",
  "",
  "NO TEXT OVERLAYS (CRITICAL):",
  "NEVER include any text, captions, subtitles, titles, lower thirds, or text overlays in the video prompts.",
  "NEVER describe text appearing on screen, floating text, caption bars, notification-style text, or any visible written words.",
  "NEVER mention 'text overlay', 'caption', 'subtitle', 'title card', or 'on-screen text' in any prompt.",
  "If the scene involves a phone screen, describe it as showing a generic app interface or being face-down — NEVER with readable text.",
  "The video should be PURELY visual + audio with spoken dialogue. Any text will be added in post-production, NOT by the AI video generator.",
  "",
  "CREATOR CONSISTENCY (CRITICAL):",
  "You MUST define ONE detailed creator persona at the start of the brief. This EXACT same person appears in EVERY segment.",
  "Include: approximate age, ethnicity, hair color/style, build, clothing style.",
  "Every segment prompt MUST begin with the SAME creator description so Seedance generates a visually consistent person.",
  "Example: \"A 28-year-old woman with shoulder-length dark brown hair, light olive skin, wearing a cream oversized hoodie\"",
  "This description MUST be repeated verbatim at the start of every segment prompt inside the code block.",
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
  intakeMode?: string;
  adStyle?: string;
}) {
  const totalDuration = data.segmentCount * 15;
  const lines = [
    "Create a complete UGC ad director's brief for the following product and campaign:",
    "",
    "**Product:** " + data.productName,
    "**Description:** " + data.productDescription,
    "**Target Audience:** " + data.targetAudienceAge + ", " + data.targetAudienceGender + ", " + data.targetAudienceLifestyle,
    "**Ad Goal:** " + data.adGoal,
    "**Tone/Vibe:** " + data.toneVibe,
    "**Number of Segments:** EXACTLY " + data.segmentCount + " (each 15 seconds, " + totalDuration + "s total)",
    (data.intakeMode === "script"
      ? "**Full Script (convert to Seedance prompts):**\n" + data.scriptConcept
      : "**Script/Concept:** " + data.scriptConcept),
    "",
    "CRITICAL: You MUST produce EXACTLY " + data.segmentCount + " segments. Not " + (data.segmentCount + 1) + ", not " + (data.segmentCount - 1) + ". EXACTLY " + data.segmentCount + ". If the script has more sections than " + data.segmentCount + ", combine them. If it has fewer, split them.",
  ];

  if (data.adStyle === "animated") {
    lines.push(
      "",
      "AD STYLE: ANIMATED 3D MASCOT",
      "Instead of a human UGC creator, this ad features an animated 3D mascot/character.",
      "Replace all references to a human creator with a detailed 3D character description.",
      "The character should be: colorful, expressive, brand-appropriate, with exaggerated features for engagement.",
      "Environment should be stylized/rendered rather than realistic.",
      "Keep the same segment structure but adapt visual descriptions for animation.",
      "Audio should still include natural-sounding voiceover matched to the character.",
    );
  }

  if (data.intakeMode === "script") {
    lines.push(
      "",
      "SCRIPT-TO-BRIEF CONVERSION INSTRUCTIONS:",
      "The user has provided a FULL SCRIPT above. Your job is to:",
      "1. Preserve the user's dialogue and structure as closely as possible",
      "2. Break the script into EXACTLY " + data.segmentCount + " segments of 15 seconds each",
      "3. Convert each section into a detailed Seedance 2.0 visual prompt with specific actions, expressions, and environment",
      "4. Keep the user's exact dialogue in the Audio section of each segment",
      "5. Add visual direction (hands, face, lighting, background) that matches the script's intent",
      "6. Do NOT rewrite the user's words — enhance them with visual specificity",
    );
  }

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
    "**Duration:** " + totalDuration + "s (" + data.segmentCount + " segments x 15s)",
    "**Creator Persona:** [DETAILED description — age, ethnicity, hair, build, clothing. This EXACT person appears in every segment.]",
    "**Ad Structure:** Hook > Problem/Proof > Benefit/Demo > CTA (adapt based on segment count)",
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
    "IMPORTANT: Each segment prompt MUST start with the EXACT same creator description (from Creator Persona above) to maintain visual consistency across all segments.",
    "",
    "(Output EXACTLY " + data.segmentCount + " segments in this format:)",
    "",
    "### Segment N of " + data.segmentCount + " — [Section Name] (0:00-0:15)",
    "",
    "**What's happening:** [One sentence]",
    "",
    "```",
    "9:16. 15 seconds. Single continuous shot. UGC style. iPhone handheld.",
    "",
    "[CREATOR PERSONA DESCRIPTION — repeated verbatim from above]",
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
          intakeMode: z.enum(["description", "script"]).optional(),
          adStyle: z.enum(["ugc", "animated", "direct_response"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const userPrompt = buildUserPrompt({
          ...input,
          imageAnalysis: input.imageAnalysis,
          adStyle: input.adStyle || "ugc",
        });

        const llmResponse = await services.llm.invoke({
          messages: [
            { role: "system", content: SEEDANCE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        });

        let generatedBrief =
          typeof llmResponse.choices[0]?.message?.content === "string"
            ? llmResponse.choices[0].message.content
            : "";

        // Post-process: enforce segment count matches request
        const segmentHeaders = generatedBrief.match(/### Segment \d+ of \d+/g) || [];
        if (segmentHeaders.length > input.segmentCount) {
          console.warn("[Brief] LLM generated " + segmentHeaders.length + " segments but " + input.segmentCount + " were requested. Truncating extra segments.");
          // Find the start of the (N+1)th segment and truncate everything after it
          const segmentPattern = /### Segment \d+ of \d+/g;
          let matchResult;
          let matchCount = 0;
          let truncateIndex = -1;
          while ((matchResult = segmentPattern.exec(generatedBrief)) !== null) {
            matchCount++;
            if (matchCount === input.segmentCount + 1) {
              truncateIndex = matchResult.index;
              break;
            }
          }
          if (truncateIndex > 0) {
            // Find the previous section divider (---) before the extra segment
            const beforeExtra = generatedBrief.substring(0, truncateIndex);
            const lastDivider = beforeExtra.lastIndexOf("---");
            if (lastDivider > 0) {
              generatedBrief = generatedBrief.substring(0, lastDivider).trimEnd();
            } else {
              generatedBrief = beforeExtra.trimEnd();
            }
            // Re-append the Step 4 review section if it was cut off
            if (!generatedBrief.includes("## Step 4")) {
              generatedBrief += "\n\n---\n\n## Step 4: Generate & Review\n\n1. Generate all segments in Seedance 2.0\n2. Check: Does the creator look consistent across segments?\n3. Check: Does it look like a real person filmed this on their phone?\n4. If anything looks off, regenerate that segment with the same @Image1\n5. Stitch segments in order and export";
            }
          }
        } else if (segmentHeaders.length < input.segmentCount && segmentHeaders.length > 0) {
          console.warn("[Brief] LLM generated " + segmentHeaders.length + " segments but " + input.segmentCount + " were requested. Brief may have fewer segments than expected.");
        }

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
          intakeMode: input.intakeMode || "description",
          adStyle: input.adStyle || "ugc",
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
          imageUrl: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const llmResponse = await services.llm.invoke({
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
        const { url } = await services.storage.put(key, buffer, input.contentType);
        return { url };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getBriefsByUserId(ctx.user.id);
    }),

    /** Enhanced list with video and stitch summaries */
    listWithStatus: protectedProcedure.query(async ({ ctx }) => {
      const briefList = await getBriefsByUserId(ctx.user.id);
      if (briefList.length === 0) return [];

      const briefIds = briefList.map((b) => b.id);
      const [videoSummaries, stitchSummaries] = await Promise.all([
        getVideoSummaryByBriefIds(briefIds),
        getStitchSummaryByBriefIds(briefIds),
      ]);

      const videoMap = new Map(videoSummaries.map((v) => [v.briefId, v]));
      const stitchMap = new Map(stitchSummaries.map((s) => [s.briefId, s]));

      return briefList.map((b) => {
        const vs = videoMap.get(b.id);
        const ss = stitchMap.get(b.id);
        return {
          ...b,
          videoStatus: vs ? {
            total: Number(vs.totalJobs),
            completed: Number(vs.completedJobs),
            failed: Number(vs.failedJobs),
          } : null,
          stitchStatus: ss ? {
            status: ss.status,
            finalVideoUrl: ss.finalVideoUrl,
          } : null,
        };
      });
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

    /** Update the brief content (editable brief) */
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          editedBrief: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.id);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }
        await updateBrief(input.id, { editedBrief: input.editedBrief });
        return { success: true };
      }),

    /** Generate a script using belief engineering framework when user doesn't have one */
    generateScript: protectedProcedure
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
          adStyle: z.enum(["ugc", "animated", "direct_response"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const beliefPrompt = [
          "You are an expert direct-response copywriter using the Belief Engineering framework.",
          "Your job is to write a compelling UGC video ad script.",
          "",
          "BELIEF ENGINEERING FRAMEWORK:",
          "1. Identify the Belief Gap — the distance between prospect's current beliefs and beliefs needed to buy",
          "2. Build a Belief Bridge using the Six Bricks: Outcome, Identity, Problem, Solution, Product, Credibility",
          "3. Move prospect from Closed → Receptive → Transformed state",
          "",
          "AD STRUCTURE (adapt to segment count):",
          "- HOOK (first segment): Use a scroll-stopping opener. Options:",
          "  * 'Why Problem' — 'Why are [audience] struggling with [problem]?'",
          "  * 'Internal Dialogue' — First-person emotional moment",
          "  * 'Why Contrast' — 'Why do some people [outcome] easily but others struggle?'",
          "  * 'Case Study' — '[Name] got [result] in [timeframe]'",
          "  * 'Real Reason' — 'What's the REAL reason you can't [outcome]?'",
          "",
          "- BODY (middle segments): Install beliefs using:",
          "  * Root cause / Fatal Flaw of common solutions",
          "  * Unique mechanism (Hidden Lock + Master Key)",
          "  * Social proof / transformation story",
          "  * 'It's not your fault' absolution",
          "  * Remove the Retreat (make inaction feel risky)",
          "",
          "- CTA (final segment): Close with:",
          "  * Bullet points tied to problems/outcomes",
          "  * Urgency / scarcity",
          "  * Clear next step",
          "",
          "RULES:",
          "- Write natural, conversational dialogue (contractions, filler words, fragments)",
          "- Each segment = 15 seconds of spoken content",
          "- Include stage directions in brackets [looks at camera, holds product up]",
          "- Make it feel like a real person talking to camera, NOT a polished commercial",
          "- Be specific and aggressive — generic scripts don't convert",
          "",
          "OUTPUT FORMAT:",
          "Return ONLY the script text, broken into segments with clear labels.",
          "Each segment should have: the spoken dialogue + [stage directions]",
        ].join("\n");

        const userMsg = [
          "Write a " + input.segmentCount + "-segment UGC video ad script for:",
          "",
          "Product: " + input.productName,
          "Description: " + input.productDescription,
          "Target: " + input.targetAudienceAge + ", " + input.targetAudienceGender + ", " + input.targetAudienceLifestyle,
          "Goal: " + input.adGoal,
          "Tone: " + input.toneVibe,
          "Style: " + (input.adStyle || "ugc"),
          "",
          "Write EXACTLY " + input.segmentCount + " segments, each 15 seconds of natural spoken content.",
          "Make the hook AGGRESSIVE and scroll-stopping. Use belief engineering to move the viewer from skepticism to action.",
        ].join("\n");

        const llmResponse = await services.llm.invoke({
          messages: [
            { role: "system", content: beliefPrompt },
            { role: "user", content: userMsg },
          ],
        });

        const script = typeof llmResponse.choices[0]?.message?.content === "string"
          ? llmResponse.choices[0].message.content
          : "";

        return { script };
      }),

    /** Upload/update the creator reference image for consistent avatar */
    updateCreatorImage: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          creatorImageUrl: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.id);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }
        await updateBrief(input.id, { creatorImageUrl: input.creatorImageUrl });
        return { success: true, creatorImageUrl: input.creatorImageUrl };
      }),
  }),

  video: router({
    generate: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          segmentIndex: z.number().min(0).max(3),
          prompt: z.string().min(1),
          segmentName: z.string().optional(),
          referenceImages: z.array(z.string()).optional(),
          duration: z.number().min(4).max(15).optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.idempotencyKey) {
          const existingByKey = await getVideoJobByIdempotencyKey(
            ctx.user.id,
            input.idempotencyKey
          );
          if (existingByKey) {
            return {
              jobId: existingByKey.id,
              status: existingByKey.status,
              message: "Video generation already processed for idempotency key",
            };
          }
        }

        // Check if a job already exists for this segment
        const existing = await getVideoJobByBriefAndSegment(input.briefId, input.segmentIndex);
        if (existing && (existing.status === "created" || existing.status === "processing")) {
          return { jobId: existing.id, status: existing.status, message: "Video generation already in progress" };
        }

        // If there's a failed or completed job, delete it so we can create a fresh one
        if (existing) {
          await deleteVideoJob(existing.id);
        }

        // Verify the brief belongs to the user
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const dur = input.duration || 15;

        // Create the video job record
        const jobId = await createVideoJob({
          briefId: input.briefId,
          userId: ctx.user.id,
          segmentIndex: input.segmentIndex,
          prompt: input.prompt,
          status: "pending",
          aspectRatio: "9:16",
          resolution: "720p",
          duration: dur,
          idempotencyKey: input.idempotencyKey || null,
        });

        // Submit to WaveSpeed API
        try {
          console.log("[WaveSpeed] Submitting task: duration=" + dur + ", segmentIndex=" + input.segmentIndex + ", briefId=" + input.briefId);
          const result = await services.video.submit({
            prompt: input.prompt,
            aspectRatio: "9:16",
            resolution: "720p",
            duration: dur,
            referenceImages: input.referenceImages,
          });
          console.log("[WaveSpeed] Task submitted: id=" + result.data.id);

          await updateVideoJob(jobId, {
            wavespeedTaskId: result.data.id,
            status: "created",
          });

          return { jobId, status: "created", wavespeedTaskId: result.data.id };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          console.error("[WaveSpeed] Submit failed:", errMsg);
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
              segmentName: z.string().optional(),
            })
          ),
          referenceImages: z.array(z.string()).optional(),
          duration: z.number().min(4).max(15).optional(),
          idempotencyKeyPrefix: z.string().min(1).max(120).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const dur = input.duration || 15;
        const results = [];

        for (const seg of input.segments) {
          // Check if a job already exists for this segment
          const existing = await getVideoJobByBriefAndSegment(input.briefId, seg.segmentIndex);
          if (existing && (existing.status === "created" || existing.status === "processing")) {
            results.push({ jobId: existing.id, segmentIndex: seg.segmentIndex, status: existing.status });
            continue;
          }

          // Delete old job if exists
          if (existing) {
            await deleteVideoJob(existing.id);
          }

          const jobId = await createVideoJob({
            briefId: input.briefId,
            userId: ctx.user.id,
            segmentIndex: seg.segmentIndex,
            prompt: seg.prompt,
            status: "pending",
            aspectRatio: "9:16",
            resolution: "720p",
            duration: dur,
            idempotencyKey: input.idempotencyKeyPrefix
              ? `${input.idempotencyKeyPrefix}:${seg.segmentIndex}`
              : null,
          });

          try {
            console.log("[WaveSpeed] Submitting bulk task: duration=" + dur + ", segmentIndex=" + seg.segmentIndex);
            const result = await services.video.submit({
              prompt: seg.prompt,
              aspectRatio: "9:16",
              resolution: "720p",
              duration: dur,
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

    /** Regenerate a segment with feedback — updates prompt via LLM then resubmits */
    regenerate: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          segmentIndex: z.number().min(0).max(3),
          originalPrompt: z.string().min(1),
          feedback: z.string().min(1),
          referenceImages: z.array(z.string()).optional(),
          duration: z.number().min(4).max(15).optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.idempotencyKey) {
          const existingByKey = await getVideoJobByIdempotencyKey(
            ctx.user.id,
            input.idempotencyKey
          );
          if (existingByKey) {
            return {
              jobId: existingByKey.id,
              status: existingByKey.status,
              revisedPrompt: existingByKey.prompt,
              wavespeedTaskId: existingByKey.wavespeedTaskId,
            };
          }
        }

        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        // Use LLM to revise the prompt based on feedback
        const productName = brief.productName || "the product";
        const revisionResponse = await services.llm.invoke({
          messages: [
            {
              role: "system",
              content: [
                "You are a UGC video ad prompt editor. You revise video generation prompts based on user feedback.",
                "",
                "CRITICAL RULES:",
                "- The product being advertised is: " + productName + ". Use ONLY this name in any dialogue or script references.",
                "- NEVER use the word 'Seedance' in the ad dialogue or script. Seedance is the video generation tool, NOT the product.",
                "- NEVER replace the product name with any other word.",
                "- Output ONLY the revised prompt text — no markdown fences, no headers, no explanation.",
                "- Keep the same format: 9:16, 15 seconds, same creator description, same time blocks [0:00-0:05], [0:05-0:10], [0:10-0:15], and Audio line.",
                "- Apply the feedback while maintaining UGC style (iPhone handheld, natural dialogue, no cinematic language).",
                "- Preserve the product name exactly as it appears in the original prompt.",
                "- NEVER include text overlays, captions, subtitles, or any visible text in the video prompt. Text is added in post, not by the AI video generator.",
                "- If a phone screen is shown, describe it as a generic app interface or face-down — NEVER with readable text.",
              ].join("\n"),
            },
            {
              role: "user",
              content: "Product name: " + productName + "\n\nHere is the original video prompt:\n\n" + input.originalPrompt + "\n\nUser feedback:\n" + input.feedback + "\n\nRevise the prompt to address this feedback. Remember: the product is '" + productName + "' — do NOT substitute any other name. Output ONLY the revised prompt content.",
            },
          ],
        });

        const revisedPrompt =
          typeof revisionResponse.choices[0]?.message?.content === "string"
            ? revisionResponse.choices[0].message.content.trim()
            : input.originalPrompt;

        // Delete old video job for this segment
        const existing = await getVideoJobByBriefAndSegment(input.briefId, input.segmentIndex);
        if (existing) {
          await deleteVideoJob(existing.id);
        }

        const dur = input.duration || 15;

        // Create new video job with revised prompt and feedback
        const jobId = await createVideoJob({
          briefId: input.briefId,
          userId: ctx.user.id,
          segmentIndex: input.segmentIndex,
          prompt: revisedPrompt,
          feedback: input.feedback,
          status: "pending",
          aspectRatio: "9:16",
          resolution: "720p",
          duration: dur,
          idempotencyKey: input.idempotencyKey || null,
        });

        // Submit to WaveSpeed
        try {
          console.log("[WaveSpeed] Regenerating segment " + input.segmentIndex + " with feedback, duration=" + dur);
          const result = await services.video.submit({
            prompt: revisedPrompt,
            aspectRatio: "9:16",
            resolution: "720p",
            duration: dur,
            referenceImages: input.referenceImages,
          });

          await updateVideoJob(jobId, {
            wavespeedTaskId: result.data.id,
            status: "created",
          });

          return { jobId, status: "created", revisedPrompt, wavespeedTaskId: result.data.id };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          await updateVideoJob(jobId, {
            status: "failed",
            errorMessage: errMsg,
          });
          throw new Error("Failed to submit regeneration task: " + errMsg);
        }
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
            prompt: job.prompt,
            feedback: job.feedback,
          };
        }

        // Poll WaveSpeed API for status update
        if (job.wavespeedTaskId) {
          try {
            const result = await services.video.getResult(job.wavespeedTaskId);
            const newStatus = result.data.status === "completed" ? "completed" as const
              : result.data.status === "failed" ? "failed" as const
              : "processing" as const;

            const updateData: Record<string, string> = { status: newStatus };
            if (newStatus === "completed" && result.data.outputs?.length > 0) {
              let outputUrl = result.data.outputs[0];
              if (
                ENV.durableMediaCopy &&
                outputUrl.startsWith("http") &&
                !outputUrl.startsWith("/manus-storage/")
              ) {
                try {
                  outputUrl = await persistExternalMediaUrl(
                    outputUrl,
                    `video-jobs/${job.briefId}/segment-${job.segmentIndex}.mp4`,
                    "video/mp4"
                  );
                } catch (error) {
                  console.warn("[Video] durable copy failed, using provider URL", error);
                }
              }
              updateData.videoUrl = outputUrl;
            }
            if (newStatus === "failed" && result.data.error) {
              updateData.errorMessage = result.data.error;
            }

            await updateVideoJob(job.id, updateData as any);

            return {
              id: job.id,
              status: newStatus,
              videoUrl:
                newStatus === "completed" ? updateData.videoUrl || null : null,
              errorMessage: newStatus === "failed" ? result.data.error || null : null,
              segmentIndex: job.segmentIndex,
              prompt: job.prompt,
              feedback: job.feedback,
            };
          } catch {
            return {
              id: job.id,
              status: job.status,
              videoUrl: job.videoUrl,
              errorMessage: job.errorMessage,
              segmentIndex: job.segmentIndex,
              prompt: job.prompt,
              feedback: job.feedback,
            };
          }
        }

        return {
          id: job.id,
          status: job.status,
          videoUrl: job.videoUrl,
          errorMessage: job.errorMessage,
          segmentIndex: job.segmentIndex,
          prompt: job.prompt,
          feedback: job.feedback,
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
          prompt: j.prompt,
          feedback: j.feedback,
          createdAt: j.createdAt,
        }));
      }),
  }),

  stitch: router({
    create: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          thumbstopperUrl: z.string().optional(),
          thumbstopperDuration: z.number().min(1).max(5).optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.idempotencyKey) {
          const existingByKey = await getStitchJobByIdempotencyKey(
            ctx.user.id,
            input.idempotencyKey
          );
          if (existingByKey) {
            return {
              stitchJobId: existingByKey.id,
              shotstackRenderId: existingByKey.shotstackRenderId,
              status: existingByKey.status,
              segmentCount: existingByKey.segmentCount,
            };
          }
        }

        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        // Delete any existing failed stitch job so we can retry
        const existingStitch = await getStitchJobByBriefId(input.briefId);
        if (existingStitch && existingStitch.status === "failed") {
          await deleteStitchJob(existingStitch.id);
        }

        // Get all completed video jobs for this brief
        const videoJobs = await getVideoJobsByBriefId(input.briefId);
        const completedJobs = videoJobs
          .filter((j) => j.status === "completed" && j.videoUrl)
          .sort((a, b) => a.segmentIndex - b.segmentIndex);

        if (completedJobs.length === 0) {
          throw new Error("No completed video segments to stitch");
        }

        // Stabilize video URLs: WaveSpeed URLs may expire, so get signed URLs for our stored videos
        // or re-upload external URLs to our storage for Shotstack to access
        const segmentVideos: Array<{ url: string; duration: number }> = [];
        for (const j of completedJobs) {
          let stableUrl = j.videoUrl!;
          // If the URL is from our storage (starts with /manus-storage/), get a signed URL
          if (stableUrl.startsWith("/manus-storage/")) {
            const key = stableUrl.replace("/manus-storage/", "");
            stableUrl = await services.storage.getSignedUrl(key);
          } else if (!stableUrl.startsWith("http")) {
            // Relative URL — try to get signed
            stableUrl = await services.storage.getSignedUrl(stableUrl);
          }
          // If it's an external URL (WaveSpeed), download and re-upload to our storage
          if (stableUrl.includes("wavespeed") || stableUrl.includes("amazonaws") || stableUrl.includes("cdn")) {
            try {
              console.log("[Stitch] Stabilizing external video URL for segment " + j.segmentIndex);
              const resp = await fetch(stableUrl);
              if (resp.ok) {
                const buffer = Buffer.from(await resp.arrayBuffer());
                const { url: storedUrl } = await services.storage.put(
                  "stitch-videos/" + input.briefId + "/seg" + j.segmentIndex + ".mp4",
                  buffer,
                  "video/mp4"
                );
                // Get a signed URL for the stored video
                const storedKey = storedUrl.replace("/manus-storage/", "");
                stableUrl = await services.storage.getSignedUrl(storedKey);
              }
            } catch (err) {
              console.warn("[Stitch] Failed to stabilize URL for segment " + j.segmentIndex + ":", err);
              // Fall back to original URL
            }
          }
          segmentVideos.push({ url: stableUrl, duration: j.duration || 15 });
        }

        // Prepare thumbstopper if provided
        let thumbstopper: { url: string; duration: number } | undefined;
        if (input.thumbstopperUrl) {
          let tsUrl = input.thumbstopperUrl;
          if (tsUrl.startsWith("/manus-storage/")) {
            const key = tsUrl.replace("/manus-storage/", "");
            tsUrl = await services.storage.getSignedUrl(key);
          }
          thumbstopper = { url: tsUrl, duration: input.thumbstopperDuration || 3 };
        }

        // Create the stitch job record
        const stitchJobId = await createStitchJob({
          briefId: input.briefId,
          userId: ctx.user.id,
          segmentCount: completedJobs.length,
          status: "pending",
          aspectRatio: "9:16",
          thumbstopperUrl: input.thumbstopperUrl || null,
          idempotencyKey: input.idempotencyKey || null,
        });

        try {
          // Build the Shotstack edit JSON and submit (with optional thumbstopper)
          const edit = buildStitchEdit(segmentVideos, "9:16", thumbstopper);
          console.log("[Stitch] Submitting to Shotstack with " + segmentVideos.length + " segments" + (thumbstopper ? " + thumbstopper" : ""));
          const renderResponse = await services.stitch.submit(edit);

          await updateStitchJob(stitchJobId, {
            shotstackRenderId: renderResponse.response.id,
            status: "queued",
          });

          return {
            stitchJobId,
            shotstackRenderId: renderResponse.response.id,
            status: "queued",
            segmentCount: completedJobs.length,
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          await updateStitchJob(stitchJobId, {
            status: "failed",
            errorMessage: errMsg,
          });
          throw new Error("Failed to submit stitch render: " + errMsg);
        }
      }),

    checkStatus: protectedProcedure
      .input(z.object({ stitchJobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await getStitchJobById(input.stitchJobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new Error("Stitch job not found or access denied");
        }

        // If already done or failed, return cached result
        if (job.status === "done" || job.status === "failed") {
          return {
            id: job.id,
            status: job.status,
            finalVideoUrl: job.finalVideoUrl,
            errorMessage: job.errorMessage,
          };
        }

        // Poll Shotstack API for status update
        if (job.shotstackRenderId) {
          try {
            const result = await services.stitch.getResult(job.shotstackRenderId);
            const ssStatus = result.response.status;

            if (ssStatus === "done") {
              let finalVideoUrl = result.response.url || null;
              if (finalVideoUrl && ENV.durableMediaCopy && finalVideoUrl.startsWith("http")) {
                try {
                  finalVideoUrl = await persistExternalMediaUrl(
                    finalVideoUrl,
                    `stitch-jobs/${job.briefId}/final-${job.id}.mp4`,
                    "video/mp4"
                  );
                } catch (error) {
                  console.warn("[Stitch] durable copy failed, using provider URL", error);
                }
              }
              await updateStitchJob(job.id, {
                status: "done",
                finalVideoUrl,
              });
              return {
                id: job.id,
                status: "done" as const,
                finalVideoUrl,
                errorMessage: null,
              };
            } else if (ssStatus === "failed") {
              const errMsg = result.response.error || "Shotstack render failed";
              await updateStitchJob(job.id, {
                status: "failed",
                errorMessage: errMsg,
              });
              return {
                id: job.id,
                status: "failed" as const,
                finalVideoUrl: null,
                errorMessage: errMsg,
              };
            } else {
              // Still in progress — update status
              const mappedStatus = ssStatus as "queued" | "fetching" | "rendering" | "saving";
              await updateStitchJob(job.id, { status: mappedStatus });
              return {
                id: job.id,
                status: mappedStatus,
                finalVideoUrl: null,
                errorMessage: null,
              };
            }
          } catch {
            return {
              id: job.id,
              status: job.status,
              finalVideoUrl: job.finalVideoUrl,
              errorMessage: job.errorMessage,
            };
          }
        }

        return {
          id: job.id,
          status: job.status,
          finalVideoUrl: job.finalVideoUrl,
          errorMessage: job.errorMessage,
        };
      }),

    getByBrief: protectedProcedure
      .input(z.object({ briefId: z.number() }))
      .query(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const job = await getStitchJobByBriefId(input.briefId);
        if (!job) return null;

        return {
          id: job.id,
          status: job.status,
          finalVideoUrl: job.finalVideoUrl,
          errorMessage: job.errorMessage,
          segmentCount: job.segmentCount,
          createdAt: job.createdAt,
        };
      }),

    /** Delete existing stitch job to allow re-stitching after segment regeneration */
    reset: protectedProcedure
      .input(z.object({ briefId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const existingStitch = await getStitchJobByBriefId(input.briefId);
        if (existingStitch) {
          await deleteStitchJob(existingStitch.id);
        }

        return { success: true, message: "Stitch job reset. You can now re-stitch with updated segments." };
      }),
  }),

  /** Thumbstopper generation: creates an aggressive callout image for the start of the ad */
  thumbstopper: router({
    generate: protectedProcedure
      .input(
        z.object({
          briefId: z.number(),
          productName: z.string().min(1),
          adGoal: z.string().min(1),
          targetAudience: z.string().min(1),
          customCallout: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        // Step 1: Generate the callout text using LLM with belief engineering
        let calloutText = input.customCallout || "";
        if (!calloutText) {
          const llmResponse = await services.llm.invoke({
            messages: [
              {
                role: "system",
                content: [
                  "You are an expert direct-response copywriter. Generate a SINGLE aggressive thumbstopper callout for a video ad.",
                  "",
                  "RULES:",
                  "- Maximum 8 words",
                  "- Must create instant curiosity or urgency",
                  "- Use belief engineering: target a blocking belief or promise an outcome",
                  "- Examples of great callouts:",
                  "  * 'The Secret Nobody Tells You About [X]'",
                  "  * 'Stop Doing [Common Mistake] NOW'",
                  "  * 'I Lost 30lbs Without [Thing They Hate]'",
                  "  * 'Why [Audience] Are Switching To THIS'",
                  "  * 'The REAL Reason You Can't [Outcome]'",
                  "  * 'Wait... THIS Actually Works?!'",
                  "",
                  "Return ONLY the callout text, nothing else. No quotes, no explanation.",
                ].join("\n"),
              },
              {
                role: "user",
                content: "Product: " + input.productName + "\nGoal: " + input.adGoal + "\nTarget: " + input.targetAudience + "\n\nGenerate ONE aggressive thumbstopper callout.",
              },
            ],
          });
          calloutText = typeof llmResponse.choices[0]?.message?.content === "string"
            ? llmResponse.choices[0].message.content.trim().replace(/^"|"$/g, "")
            : "WATCH THIS";
        }

        // Step 2: Generate the thumbstopper image
        const imagePrompt = [
          "Bold, eye-catching social media ad thumbnail. 9:16 vertical format.",
          "Dark/moody background with high contrast.",
          "Large, bold white text overlay reading: \"" + calloutText + "\"",
          "Text should be centered, impactful, and impossible to miss.",
          "Style: modern, clean, direct-response advertising aesthetic.",
          "No people, just bold typography on a dramatic background.",
          "Colors: dark background with bright accent (red, orange, or yellow) highlighting key words.",
        ].join(" ");

        try {
          const { url: imageUrl } = await generateImage({ prompt: imagePrompt });

          if (!imageUrl) {
            throw new Error("Image generation returned no URL");
          }

          return { calloutText, imageUrl };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          throw new Error("Failed to generate thumbstopper image: " + errMsg);
        }
      }),
  }),

  /** Audio quality control: transcribe video audio and validate against expected dialogue */
  audioQc: router({
    check: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          expectedDialogue: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const job = await getVideoJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new Error("Video job not found or access denied");
        }

        if (job.status !== "completed" || !job.videoUrl) {
          throw new Error("Video must be completed before audio QC");
        }

        // Get a stable URL for the video
        let videoUrl = job.videoUrl;
        if (videoUrl.startsWith("/manus-storage/")) {
          const key = videoUrl.replace("/manus-storage/", "");
          videoUrl = await services.storage.getSignedUrl(key);
        }

        // Transcribe the video audio
        const transcription = await transcribeAudio({
          audioUrl: videoUrl,
          language: "en",
          prompt: "Transcribe the spoken dialogue in this UGC video ad.",
        });

        if ("error" in transcription) {
          // If transcription fails, mark as skipped (service issue, not audio issue)
          await updateVideoJob(job.id, {
            audioQcStatus: "skipped",
            audioQcTranscript: "Transcription failed: " + transcription.error,
          });
          return {
            status: "skipped" as const,
            reason: transcription.error,
            transcript: null,
          };
        }

        const transcript = transcription.text;

        // Analyze audio quality using heuristics
        const issues: string[] = [];

        // Check 1: Very short or empty transcript suggests audio glitch
        if (!transcript || transcript.trim().length < 10) {
          issues.push("No intelligible speech detected — possible audio glitch or silence");
        }

        // Check 2: Repetitive patterns suggest audio loop/glitch
        if (transcript) {
          const words = transcript.split(/\s+/);
          if (words.length > 5) {
            const firstHalf = words.slice(0, Math.floor(words.length / 2)).join(" ");
            const secondHalf = words.slice(Math.floor(words.length / 2)).join(" ");
            if (firstHalf === secondHalf) {
              issues.push("Audio appears to loop/repeat — likely a generation glitch");
            }
          }
        }

        // Check 3: Segment-level analysis for gaps or anomalies
        if (transcription.segments && transcription.segments.length > 0) {
          // Check for large gaps between segments (> 5s suggests audio dropout)
          for (let i = 1; i < transcription.segments.length; i++) {
            const gap = transcription.segments[i].start - transcription.segments[i - 1].end;
            if (gap > 5) {
              issues.push("Large audio gap detected (" + gap.toFixed(1) + "s) — possible dropout");
            }
          }

          // Check for very low confidence segments
          const lowConfidence = transcription.segments.filter(s => s.avg_logprob < -1.5);
          if (lowConfidence.length > transcription.segments.length * 0.5) {
            issues.push("Over 50% of audio has very low transcription confidence — possible distortion");
          }

          // Check for high no_speech_prob
          const highNoSpeech = transcription.segments.filter(s => s.no_speech_prob > 0.8);
          if (highNoSpeech.length > transcription.segments.length * 0.5) {
            issues.push("Over 50% of segments detected as non-speech — possible audio corruption");
          }
        }

        // Check 4: If expected dialogue provided, compare similarity
        let dialogueMatch = true;
        if (input.expectedDialogue && transcript) {
          const expected = input.expectedDialogue.toLowerCase().replace(/[^a-z0-9\s]/g, "");
          const actual = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, "");
          // Simple word overlap check
          const expectedWordsArr = expected.split(/\s+/);
          const actualWords = new Set(actual.split(/\s+/));
          const overlap = expectedWordsArr.filter(w => actualWords.has(w)).length;
          const matchRatio = overlap / expectedWordsArr.length;
          if (matchRatio < 0.3) {
            issues.push("Transcribed audio doesn't match expected dialogue (" + Math.round(matchRatio * 100) + "% word overlap)");
            dialogueMatch = false;
          }
        }

        const passed = issues.length === 0;
        const qcStatus = passed ? "passed" : "failed";

        await updateVideoJob(job.id, {
          audioQcStatus: qcStatus,
          audioQcTranscript: transcript,
        });

        return {
          status: qcStatus as "passed" | "failed",
          transcript,
          issues,
          dialogueMatch,
          segmentCount: transcription.segments?.length || 0,
          duration: transcription.duration,
        };
      }),

    /** Batch check all completed segments for a brief */
    checkAll: protectedProcedure
      .input(z.object({ briefId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const brief = await getBriefById(input.briefId);
        if (!brief || brief.userId !== ctx.user.id) {
          throw new Error("Brief not found or access denied");
        }

        const jobs = await getVideoJobsByBriefId(input.briefId);
        const completedJobs = jobs.filter(j => j.status === "completed" && j.videoUrl);

        const results: Array<{ jobId: number; segmentIndex: number; status: string; issues: string[] }> = [];

        for (const job of completedJobs) {
          let videoUrl = job.videoUrl!;
          if (videoUrl.startsWith("/manus-storage/")) {
            const key = videoUrl.replace("/manus-storage/", "");
            videoUrl = await services.storage.getSignedUrl(key);
          }

          const transcription = await transcribeAudio({
            audioUrl: videoUrl,
            language: "en",
          });

          if ("error" in transcription) {
            await updateVideoJob(job.id, { audioQcStatus: "skipped" });
            results.push({ jobId: job.id, segmentIndex: job.segmentIndex, status: "skipped", issues: [transcription.error] });
            continue;
          }

          const issues: string[] = [];
          const transcript = transcription.text;

          if (!transcript || transcript.trim().length < 10) {
            issues.push("No intelligible speech detected");
          }

          if (transcription.segments) {
            const highNoSpeech = transcription.segments.filter(s => s.no_speech_prob > 0.8);
            if (highNoSpeech.length > transcription.segments.length * 0.5) {
              issues.push("Majority non-speech detected");
            }
            const lowConf = transcription.segments.filter(s => s.avg_logprob < -1.5);
            if (lowConf.length > transcription.segments.length * 0.5) {
              issues.push("Low transcription confidence");
            }
          }

          const qcStatus = issues.length === 0 ? "passed" : "failed";
          await updateVideoJob(job.id, { audioQcStatus: qcStatus, audioQcTranscript: transcript });
          results.push({ jobId: job.id, segmentIndex: job.segmentIndex, status: qcStatus, issues });
        }

        return { results, totalChecked: completedJobs.length, passed: results.filter(r => r.status === "passed").length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
