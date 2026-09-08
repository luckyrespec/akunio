export interface ThreadItem {
  id: string;
  title: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
  pinned?: boolean;
  modelPreset?: string;
}

function isThreadItem(v: unknown): v is ThreadItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o["id"] === "string" && typeof o["title"] === "string";
}

export function parseThreadsResponse(data: unknown): ThreadItem[] {
  const raw: unknown =
    Array.isArray(data) ? data
    : typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>)["threads"])
      ? (data as Record<string, unknown>)["threads"]
      : [];
  return (raw as unknown[]).filter(isThreadItem);
}
