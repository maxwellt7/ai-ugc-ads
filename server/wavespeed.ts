import { ENV } from "./_core/env";

const WAVESPEED_BASE_URL = "https://api.wavespeed.ai/api/v3";

interface WavespeedSubmitParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  referenceImages?: string[];
}

interface WavespeedSubmitResponse {
  code: number;
  message: string;
  data: {
    id: string;
    model: string;
    outputs: string[];
    urls: { get: string };
    status: string;
    created_at: string;
    error: string;
  };
}

interface WavespeedResultResponse {
  code: number;
  message: string;
  data: {
    id: string;
    outputs: string[];
    status: string;
    error: string;
    timings?: { inference: number };
  };
}

export async function submitVideoTask(params: WavespeedSubmitParams): Promise<WavespeedSubmitResponse> {
  const apiKey = ENV.wavespeedApiKey;
  if (!apiKey) {
    throw new Error("WAVESPEED_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio || "9:16",
    resolution: params.resolution || "720p",
    duration: params.duration || 15,
    enable_web_search: false,
  };

  if (params.referenceImages && params.referenceImages.length > 0) {
    body.reference_images = params.referenceImages;
  }

  const response = await fetch(`${WAVESPEED_BASE_URL}/bytedance/seedance-2.0/text-to-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WaveSpeed API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<WavespeedSubmitResponse>;
}

export async function getVideoTaskResult(taskId: string): Promise<WavespeedResultResponse> {
  const apiKey = ENV.wavespeedApiKey;
  if (!apiKey) {
    throw new Error("WAVESPEED_API_KEY is not configured");
  }

  const response = await fetch(`${WAVESPEED_BASE_URL}/predictions/${taskId}/result`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WaveSpeed API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<WavespeedResultResponse>;
}
