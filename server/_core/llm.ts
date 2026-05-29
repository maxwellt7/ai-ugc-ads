import { withProviderTelemetry } from "../services/providerTelemetry";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const PROMPT_REGISTRY = {
  briefGeneration: "v1",
  imageAnalysis: "v1",
  scriptGeneration: "v1",
  segmentRegeneration: "v1",
  thumbstopperCallout: "v1",
} as const;

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return { role, name, content: contentParts[0].text };
  }
  return { role, name, content: contentParts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") {
    if (!tools || tools.length !== 1) {
      throw new Error(
        "tool_choice 'required' needs exactly one configured tool"
      );
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

function buildOpenAiCompatiblePayload(params: InvokeParams) {
  const normalizedToolChoice = normalizeToolChoice(
    params.toolChoice || params.tool_choice,
    params.tools
  );
  const payload: Record<string, unknown> = {
    messages: params.messages.map(normalizeMessage),
    max_tokens: params.maxTokens || params.max_tokens || 32768,
  };
  if (params.tools?.length) payload.tools = params.tools;
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
  const responseFormat = normalizeResponseFormat(params);
  if (responseFormat) payload.response_format = responseFormat;
  return payload;
}

function resolveProvider() {
  const provider = (ENV.llmProvider || "manus").toLowerCase();
  if (
    provider === "manus" ||
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "gemini"
  ) {
    return provider;
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

async function invokeOpenAiCompatible(
  provider: "manus" | "openai" | "gemini",
  params: InvokeParams
): Promise<InvokeResult> {
  const payload = buildOpenAiCompatiblePayload(params);
  if (provider === "manus") {
    if (!ENV.forgeApiKey) throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
    payload.model = ENV.llmModelManus;
    payload.thinking = { budget_tokens: 128 };
  } else if (provider === "openai") {
    if (!ENV.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");
    payload.model = ENV.llmModelOpenAi;
  } else {
    if (!ENV.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured");
    payload.model = ENV.llmModelGemini;
  }

  const endpoint =
    provider === "manus"
      ? ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
        ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
        : "https://forge.manus.im/v1/chat/completions"
      : provider === "openai"
      ? `${ENV.openAiBaseUrl.replace(/\/$/, "")}/chat/completions`
      : `${ENV.geminiBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const authHeader =
    provider === "manus"
      ? `Bearer ${ENV.forgeApiKey}`
      : provider === "openai"
      ? `Bearer ${ENV.openAiApiKey}`
      : `Bearer ${ENV.geminiApiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed (${provider}): ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return (await response.json()) as InvokeResult;
}

function flattenMessageContent(content: MessageContent | MessageContent[]): string {
  return ensureArray(content)
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text;
      if (part.type === "image_url") return `[image_url:${part.image_url.url}]`;
      if (part.type === "file_url") return `[file_url:${part.file_url.url}]`;
      return "";
    })
    .join("\n");
}

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const systemMessages = params.messages.filter((m) => m.role === "system");
  const userAssistantMessages = params.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: flattenMessageContent(m.content),
    }));

  const response = await fetch(
    `${ENV.anthropicBaseUrl.replace(/\/$/, "")}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ENV.llmModelAnthropic,
        max_tokens: params.maxTokens || params.max_tokens || 4096,
        system: systemMessages.map((m) => flattenMessageContent(m.content)).join(
          "\n\n"
        ),
        messages: userAssistantMessages,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed (anthropic): ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as any;
  const text =
    data?.content?.find?.((part: any) => part.type === "text")?.text ?? "";

  return {
    id: data.id ?? crypto.randomUUID(),
    created: Math.floor(Date.now() / 1000),
    model: data.model ?? ENV.llmModelAnthropic,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.stop_reason ?? "stop",
      },
    ],
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens ?? 0,
          completion_tokens: data.usage.output_tokens ?? 0,
          total_tokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        }
      : undefined,
  };
}

async function runShadowInvocation(params: InvokeParams) {
  const provider = ENV.llmShadowProvider.toLowerCase();
  if (!provider || provider === resolveProvider()) return;
  try {
    if (provider === "anthropic") {
      await invokeAnthropic(params);
    } else if (provider === "openai" || provider === "gemini" || provider === "manus") {
      await invokeOpenAiCompatible(provider, params);
    }
  } catch (error) {
    console.warn(
      `[LLM] Shadow invocation failed for provider=${provider}:`,
      error
    );
  }
}

export function getPromptRegistry() {
  return PROMPT_REGISTRY;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const provider = resolveProvider();
  const result = await withProviderTelemetry(
    "llm",
    provider,
    "chat.completions",
    {
      promptRegistryVersion: PROMPT_REGISTRY.briefGeneration,
      messageCount: params.messages.length,
    },
    async () => {
      if (provider === "anthropic") {
        return invokeAnthropic(params);
      }
      return invokeOpenAiCompatible(provider, params);
    }
  );

  void runShadowInvocation(params);
  return result;
}
