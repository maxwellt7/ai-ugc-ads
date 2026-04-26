/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export interface BriefIntakeData {
  productName: string;
  productDescription: string;
  targetAudienceAge: string;
  targetAudienceGender: string;
  targetAudienceLifestyle: string;
  adGoal: "awareness" | "conversion" | "retention";
  toneVibe: string;
  segmentCount: number;
  scriptConcept: string;
  productImageUrl?: string | null;
}

export interface ImageAnalysisResult {
  suggestedAngles: string[];
  suggestedUseCases: string[];
  suggestedDemographics: string;
  suggestedTone: string;
}

export interface BriefHistoryItem {
  id: number;
  productName: string;
  adGoal: "awareness" | "conversion" | "retention";
  segmentCount: number;
  createdAt: Date;
}

export interface FullBrief {
  id: number;
  productName: string;
  productDescription: string;
  targetAudienceAge: string;
  targetAudienceGender: string;
  targetAudienceLifestyle: string;
  adGoal: "awareness" | "conversion" | "retention";
  toneVibe: string;
  segmentCount: number;
  scriptConcept: string;
  productImageUrl: string | null;
  imageAnalysis: string | null;
  generatedBrief: string;
  pinterestLinks: unknown;
  createdAt: Date;
}
