import type { Request } from "express";
import { invokeLLM, type InvokeParams } from "../_core/llm";
import { storageGetSignedUrl, storagePut } from "../storage";
import { submitVideoTask, getVideoTaskResult } from "../wavespeed";
import { submitShotstackRender, getShotstackRenderStatus } from "../shotstack";
import { authenticateRequest } from "../_core/auth";
import type { User } from "../../drizzle/schema";
import { withProviderTelemetry } from "./providerTelemetry";
import { ENV } from "../_core/env";

export type AuthService = {
  authenticateRequest(req: Request): Promise<User>;
};

export type LLMService = {
  invoke(params: InvokeParams): Promise<Awaited<ReturnType<typeof invokeLLM>>>;
};

export type StorageService = {
  put: typeof storagePut;
  getSignedUrl: typeof storageGetSignedUrl;
};

export type VideoGenerationService = {
  submit: typeof submitVideoTask;
  getResult: typeof getVideoTaskResult;
};

export type StitchService = {
  submit: typeof submitShotstackRender;
  getResult: typeof getShotstackRenderStatus;
};

export type AppServices = {
  auth: AuthService;
  llm: LLMService;
  storage: StorageService;
  video: VideoGenerationService;
  stitch: StitchService;
};

export const services: AppServices = {
  auth: {
    authenticateRequest(req: Request) {
      return withProviderTelemetry(
        "auth",
        ENV.authProvider.toLowerCase(),
        "authenticate_request",
        {},
        async () => authenticateRequest(req)
      );
    },
  },
  llm: {
    invoke(params: InvokeParams) {
      return invokeLLM(params);
    },
  },
  storage: {
    put: storagePut,
    getSignedUrl: storageGetSignedUrl,
  },
  video: {
    submit: submitVideoTask,
    getResult: getVideoTaskResult,
  },
  stitch: {
    submit: submitShotstackRender,
    getResult: getShotstackRenderStatus,
  },
};
