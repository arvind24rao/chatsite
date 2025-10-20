import { API_BASE, PROCESS_LIMIT } from "./config";

// Generic POST helper with nice errors
async function post<T>(
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(headers || {})
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  // Try to parse JSON even on non-2xx to surface API error payloads
  let data: any = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (data ?? {}) as T;
}

export const Api = {
  // Send a user message into the thread
  sendMessage: (args: { thread_id: string; user_id: string; content: string }) =>
    post("/api/send_message", args),

  // Ask the bot to process the current queue in dry-run (preview) mode.
  // NOTE: operatorId is sent in X-User-Id header.
  previewDryRun: (threadId: string, operatorId: string) =>
    post(
      `/api/bot/process?thread_id=${encodeURIComponent(threadId)}&limit=${PROCESS_LIMIT}&dry_run=true`,
      {},
      { "X-User-Id": operatorId }
    ),
};