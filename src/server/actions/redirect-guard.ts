export function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
