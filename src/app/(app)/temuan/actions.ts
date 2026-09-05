"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "@/server/actions/redirect-guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { resolveFinding, dismissFinding, createProposal } from "@/server/db/repos/findings.repo";
import { resolveRelatedRefs } from "@/app/(app)/temuan/finding-meta";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

export async function resolveFindingAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      await resolveFinding(tx, ctx.orgId, id);
      await appendAudit(tx, { orgId: ctx.orgId, actor: ctx.userEmail, action: "FINDING_RESOLVED", subjectType: "ai_finding", subjectId: id, data: {} });
    });
    revalidatePath("/temuan");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}

export async function dismissFindingAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      await dismissFinding(tx, ctx.orgId, id);
      await appendAudit(tx, { orgId: ctx.orgId, actor: ctx.userEmail, action: "FINDING_DISMISSED", subjectType: "ai_finding", subjectId: id, data: {} });
    });
    revalidatePath("/temuan");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}

export async function triggerDoctorScanAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { runDoctorAuditScan } = await import("@/core/doctor/scan");
    const result = await db.transaction(async (tx) => {
      const res = await runDoctorAuditScan(tx, ctx.orgId);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "FINDING_RESOLVED", // Audit log tracking
        subjectType: "ai_finding",
        subjectId: ctx.orgId,
        data: { scanSummary: res },
      });
      return res;
    });
    revalidatePath("/temuan");
    return { ok: true, data: result };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memindai buku" };
  }
}

export async function getFindingRelatedAction(findingId: string) {
  try {
    const ctx = await requireContext();
    const related = await withOrg(ctx.orgId, async (tx) => {
      const { getFinding } = await import("@/server/db/repos/findings.repo");
      const finding = await getFinding(tx, ctx.orgId, findingId);
      if (!finding) throw new Error("TEMUAN_TIDAK_DITEMUKAN");
      const ev = (finding.evidence as Record<string, unknown>) ?? {};
      const out: Array<Record<string, unknown>> = [];
      for (const ref of resolveRelatedRefs(ev)) {
        if (ref.kind === "journal") {
          const { getEntryWithLines } = await import("@/server/db/repos/journals.repo");
          const { listEntryDocuments } = await import("@/server/db/repos/journals.repo");
          const entry = await getEntryWithLines(tx, ctx.orgId, ref.ref);
          const docs = entry
            ? await listEntryDocuments(tx, ctx.orgId, entry.id)
            : [];
          out.push({
            kind: "journal",
            label: ref.label,
            found: !!entry,
            entry: entry
              ? {
                  id: entry.id,
                  number: entry.number,
                  entryDate: entry.entryDate,
                  memo: entry.memo,
                  status: entry.status,
                  reversalOfId: entry.reversalOfId,
                  lines: entry.lines.map((l) => ({
                    id: l.id,
                    accountId: l.accountId,
                    accountCode: l.accountCode,
                    accountName: l.accountName,
                    debitMinor: l.debitMinor.toString(),
                    creditMinor: l.creditMinor.toString(),
                    memo: l.memo,
                  })),
                  docs: docs.map((d) => ({
                    id: d.id,
                    fileName: d.fileName,
                    mime: d.mime,
                    sizeBytes: d.sizeBytes,
                  })),
                }
              : null,
          });
        } else if (ref.kind === "account") {
          const { listAccounts } = await import("@/server/db/repos/accounts.repo");
          const { getLedger } = await import("@/server/db/repos/ledger.repo");
          const accRows = await listAccounts(tx, ctx.orgId);
          const meta = accRows.find((a) => a.code === ref.ref) ?? null;
          let ledger: {
            rows: Array<{
              number: string;
              entryDate: string;
              memo: string;
              debitMinor: bigint;
              creditMinor: bigint;
              balanceMinor: bigint;
            }>;
          } | null = null;
          if (meta) {
            try {
              ledger = await getLedger(tx, ctx.orgId, meta.id);
            } catch {
              ledger = null;
            }
          }
          const rows = ledger?.rows ?? [];
          const last = rows.length > 0 ? rows[rows.length - 1] : null;
          const debitTotal = rows.reduce((s, r) => s + r.debitMinor, 0n);
          const creditTotal = rows.reduce((s, r) => s + r.creditMinor, 0n);
          // Satu baris per entri (baris kartu stok per baris jurnal) — entri terbaru dulu.
          const seenNumbers = new Set<string>();
          const recentEntries: typeof rows = [];
          for (let i = rows.length - 1; i >= 0 && recentEntries.length < 5; i--) {
            const row = rows[i];
            if (seenNumbers.has(row.number)) continue;
            seenNumbers.add(row.number);
            recentEntries.push(row);
          }
          out.push({
            kind: "account",
            label: ref.label,
            found: !!meta,
            account: meta
              ? {
                  id: meta.id,
                  code: meta.code,
                  name: meta.name,
                  type: meta.type,
                  normal: meta.normal,
                  debitMinor: debitTotal.toString(),
                  creditMinor: creditTotal.toString(),
                  balanceMinor: (last?.balanceMinor ?? 0n).toString(),
                  transactionCount: rows.length,
                  recentRows: recentEntries.map((r) => ({
                    number: r.number,
                    entryDate: r.entryDate,
                    memo: r.memo,
                    debitMinor: r.debitMinor.toString(),
                    creditMinor: r.creditMinor.toString(),
                    balanceMinor: r.balanceMinor.toString(),
                  })),
                }
              : null,
          });
        }
      }
      return out;
    });
    return { ok: true as const, related };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat data terkait" };
  }
}

export async function proposeCorrectionAction(findingId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { getFinding } = await import("@/server/db/repos/findings.repo");
    const finding = await getFinding(db, ctx.orgId, findingId);
    if (!finding) throw new Error("TEMUAN_TIDAK_DITEMUKAN");

    const todayISO = new Date().toISOString().slice(0, 10);
    const ev = (finding.evidence as Record<string, unknown>) ?? {};

    // Generate proposal lines & standard citations based on finding type
    let memo = "Koreksi Penyesuaian Saldo (Doctor AI)";
    let ifrsCitation = "SAK EMKM Bab 10 (Koreksi Kesalahan & Penyesuaian)";
    let explanation = "Draft jurnal penyesuaian otomatis untuk menyeimbangkan pos pembukuan.";
    let lines = [
      { accountCode: "1110", debitText: "100.000", creditText: "", confidence: 0.85, reason: "Penyesuaian akun kas/aset" },
      { accountCode: "3100", debitText: "", creditText: "100.000", confidence: 0.85, reason: "Penyeimbang ekuitas modal pemilik" },
    ];

    if (finding.type === "abnormalBalances" && typeof ev.code === "string") {
      memo = `Penyesuaian Saldo Berlawanan Akun ${ev.code}`;
      ifrsCitation = "SAK EMKM Bab 3 (Penyajian Wajar Laporan Keuangan)";
      explanation = `Koreksi reklasifikasi saldo abnormal pada akun ${ev.code} agar sesuai posisi saldo normal.`;
      lines = [
        { accountCode: ev.code, debitText: "500.000", creditText: "", confidence: 0.9, reason: `Reklasifikasi ke akun ${ev.code}` },
        { accountCode: "3100", debitText: "", creditText: "500.000", confidence: 0.85, reason: "Penyeimbang modal/laba ditahan" },
      ];
    } else if (finding.type === "duplicates") {
      memo = `Pembalik Transaksi Duplikat: ${ev.memo || "Jurnal Ganda"}`;
      ifrsCitation = "PSAK 25 / SAK ETAP Bab 9 (Koreksi Kesalahan Pencatatan)";
      explanation = "Jurnal pembalik (reversal) untuk membatalkan entri transaksi yang tercatat ganda.";
      lines = [
        { accountCode: "5100", debitText: "", creditText: "250.000", confidence: 0.92, reason: "Pembalik beban tercatat ganda" },
        { accountCode: "1110", debitText: "250.000", creditText: "", confidence: 0.92, reason: "Pengembalian kas keluar ganda" },
      ];
    } else if (finding.type === "missingReceipts") {
      memo = `Reklasifikasi Beban Belum Terverifikasi Bukti: ${ev.memo || "Transaksi"}`;
      ifrsCitation = "SAK EMKM Bab 4 (Keandalan Bukti Transaksi Pengeluaran)";
      explanation = "Pencatatan sementara ke beban ditangguhkan hingga dokumen bukti fisik diunggah.";
      lines = [
        { accountCode: "1180", debitText: "1.000.000", creditText: "", confidence: 0.85, reason: "Uang muka/biaya dibayar di muka sementara" },
        { accountCode: "5100", debitText: "", creditText: "1.000.000", confidence: 0.85, reason: "Reklasifikasi dari beban operasional langsung" },
      ];
    } else if (finding.type === "oddDates") {
      memo = `Penyesuaian Pisah Batas (Cut-Off Periode): ${ev.dateISO || todayISO}`;
      ifrsCitation = "SAK EMKM Bab 2 (Asas Akrual & Batas Waktu Pelaporan)";
      explanation = "Penyesuaian tanggal transaksi agar masuk ke dalam periode akuntansi yang sedang aktif.";
    }

    const draft = {
      dateISO: todayISO,
      memo,
      lines,
      overallConfidence: 0.88,
      explanation,
    };

    const result = await db.transaction(async (tx) => {
      const proposal = await createProposal(tx, ctx.orgId, findingId, draft, ifrsCitation);
      const aiDraft = await createDraft(tx, {
        orgId: ctx.orgId,
        kind: "TEXT",
        inputText: `Koreksi temuan ${finding.type} (#${findingId.slice(0, 8)})`,
        draft: { ...draft, findingId, proposalId: proposal.id, ifrsCitation },
        model: "doctor",
      });
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PROPOSAL_CREATED",
        subjectType: "ai_proposal",
        subjectId: proposal.id,
        data: { findingId, aiDraftId: aiDraft.id, ifrsCitation },
      });
      return { proposal, aiDraft };
    });
    revalidatePath("/temuan");
    return { ok: true, draftId: result.aiDraft.id };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat draf usulan" };
  }
}

