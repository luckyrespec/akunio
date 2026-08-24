import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { countDraftsThisMonth, checkQuota } from "@/server/db/repos/drafts.repo";
import { ComposerClient } from "./composer-client";

export default async function AiComposerPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const used = await countDraftsThisMonth(db, ctx.orgId, new Date());
  const limit = Number(process.env.AI_MONTHLY_DRAFT_LIMIT ?? "100");
  const quota = checkQuota(used, limit);

  return (
    <section className="max-w-2xl">
      <Link href="/jurnal" className="text-xs text-ink-soft underline">← Jurnal</Link>
      <h1 className="mt-2 font-display text-2xl">Tulis Jurnal dengan Asisten</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Deskripsikan transaksi dalam Bahasa Indonesia, atau unggah foto/PDF faktur.
        Draft selalu direview sebelum diposting.
      </p>
      <div className="mt-4">
        <ComposerClient quotaAllowed={quota.allowed} quotaUsed={used} quotaLimit={limit} />
      </div>
    </section>
  );
}
