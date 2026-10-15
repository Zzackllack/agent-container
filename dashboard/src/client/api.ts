export async function api<T>(
  path: string,
  options?: { method: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: options?.method ?? "GET",
    credentials: "same-origin",
    headers: options
      ? { "Content-Type": "application/json", "X-Agent-Dashboard": "1" }
      : {},
    body:
      options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "session")
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Request failed.",
    );
  }
  return body as T;
}
