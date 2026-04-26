import { ENV } from "./_core/env";

// Use stage (sandbox) for development, v1 for production
const BASE_URL = ENV.isProduction
  ? "https://api.shotstack.io/edit/v1"
  : "https://api.shotstack.io/edit/stage";

interface ShotstackClip {
  asset: {
    type: "video";
    src: string;
  };
  start: number;
  length: number;
  transition?: {
    in?: string;
    out?: string;
  };
}

interface ShotstackEdit {
  timeline: {
    tracks: Array<{
      clips: ShotstackClip[];
    }>;
    background?: string;
  };
  output: {
    format: string;
    resolution: string;
    aspectRatio: string;
  };
}

interface ShotstackRenderResponse {
  success: boolean;
  message: string;
  response: {
    message: string;
    id: string;
  };
}

interface ShotstackStatusResponse {
  success: boolean;
  message: string;
  response: {
    status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
    id: string;
    url?: string;
    error?: string;
    created: string;
    updated: string;
  };
}

/**
 * Build a Shotstack edit JSON payload from an array of video segment URLs.
 * Clips are placed sequentially on a single track with fade transitions.
 */
export function buildStitchEdit(
  segmentVideos: Array<{ url: string; duration: number }>,
  aspectRatio: string = "9:16"
): ShotstackEdit {
  const TRANSITION_DURATION = 0.5;
  let currentStart = 0;

  const clips: ShotstackClip[] = segmentVideos.map((seg, index) => {
    const isFirst = index === 0;
    const isLast = index === segmentVideos.length - 1;

    const clip: ShotstackClip = {
      asset: {
        type: "video",
        src: seg.url,
      },
      start: currentStart,
      length: seg.duration,
    };

    // Add transitions between clips
    if (segmentVideos.length > 1) {
      clip.transition = {};
      if (!isFirst) {
        clip.transition.in = "fade";
      }
      if (!isLast) {
        clip.transition.out = "fade";
      }
    }

    // Next clip starts after this one, minus the transition overlap
    if (!isLast) {
      currentStart += seg.duration - TRANSITION_DURATION;
    }

    return clip;
  });

  return {
    timeline: {
      tracks: [{ clips }],
      background: "#000000",
    },
    output: {
      format: "mp4",
      resolution: "hd",
      aspectRatio,
    },
  };
}

/**
 * Submit a render job to Shotstack.
 */
export async function submitShotstackRender(
  edit: ShotstackEdit
): Promise<ShotstackRenderResponse> {
  const response = await fetch(`${BASE_URL}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ENV.shotstackApiKey,
    },
    body: JSON.stringify(edit),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shotstack render failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get the status of a Shotstack render job.
 */
export async function getShotstackRenderStatus(
  renderId: string
): Promise<ShotstackStatusResponse> {
  const response = await fetch(`${BASE_URL}/render/${renderId}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "x-api-key": ENV.shotstackApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shotstack status check failed (${response.status}): ${errorText}`);
  }

  return response.json();
}
