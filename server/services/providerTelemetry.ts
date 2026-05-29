type LogMeta = Record<string, unknown>;

function nowMs() {
  return Date.now();
}

export async function withProviderTelemetry<T>(
  category: string,
  provider: string,
  operation: string,
  meta: LogMeta,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = nowMs();
  try {
    const result = await fn();
    console.log(
      JSON.stringify({
        type: "provider_call",
        category,
        provider,
        operation,
        status: "success",
        latencyMs: nowMs() - startedAt,
        ...meta,
      })
    );
    return result;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        type: "provider_call",
        category,
        provider,
        operation,
        status: "error",
        latencyMs: nowMs() - startedAt,
        error: err,
        ...meta,
      })
    );
    throw error;
  }
}
