function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function messageFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return singleLine(record.message);
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return formatAgentError(record.error);
  }
  return messageFromObject(record.error);
}

export function formatAgentError(value: string | null | undefined): string {
  const normalized = singleLine(value ?? "");
  if (!normalized) return "";
  if (!normalized.startsWith("{") && !normalized.startsWith("[")) {
    return normalized;
  }

  try {
    return messageFromObject(JSON.parse(normalized)) ?? normalized;
  } catch {
    return normalized;
  }
}
