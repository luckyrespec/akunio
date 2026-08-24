import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { countDraftsThisMonth, checkQuota } from "@/server/db/repos/drafts.repo";
import { JournalChatClient } from "./journal-chat-client";

export default async function AiComposerPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const used = await countDraftsThisMonth(db, ctx.orgId, new Date());
  const limit = Number(process.env.AI_MONTHLY_DRAFT_LIMIT ?? "100");
  const quota = checkQuota(used, limit);

  return (
    <section className="max-w-3xl">
      <Link href="/jurnal" className="text-xs text-ink-soft underline">← Jurnal</Link>
      <h1 className="mt-2 font-display text-2xl">Tulis Jurnal dengan Asisten</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Chat dengan asisten — deskripsikan transaksi atau unggah faktur. Asisten akan memanggil fungsi untuk membuat draft, tetap perlu persetujuanmu sebelum diposting.
      </p>
      <div className="mt-4">
        <JournalChatClient quotaUsed={used} quotaLimit={limit} />
      </div>
    </section>
  );
}
