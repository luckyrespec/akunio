/**
 * Salin teks ke clipboard dengan fallback textarea (konteks non-secure / browser lama).
 * Mengembalikan true bila berhasil, false bila tidak tersedia/gagal.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    const nav = globalThis.navigator as
      | { clipboard?: { writeText?: (t: string) => Promise<void> } }
      | undefined;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
    const doc = globalThis.document as unknown as
      | {
          createElement: (tag: string) => {
            value: string;
            style: Record<string, string>;
            focus: () => void;
            select: () => void;
          };
          body: { appendChild: (el: unknown) => void; removeChild: (el: unknown) => void };
          execCommand: (cmd: string) => boolean;
        }
      | undefined;
    if (!doc) return false;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
