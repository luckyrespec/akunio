import { redirect } from "next/navigation";

// Copilot standalone telah digabung ke Nara di /asisten.
// Route lama dipertahankan sebagai redirect untuk bookmark.
export default function AiComposerPage() {
  redirect("/asisten");
}
