"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "@/server/actions/redirect-guard";
import { withOrg } from "@/server/db/repos/with-org";
import { resolveFinding, dismissFinding, createProposal } from "@/server/db/repos/findings.repo";
import { resolveRelatedRefs } from "@/app/(app)/temuan/finding-meta";
import type { AccountProposal, CorrectionFrame } from "@/server/doctor/builders";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

export async function resolveFindingAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, async (tx) => {
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
    await withOrg(ctx.orgId, async (tx) => {
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
    const { listFindings } = await import("@/server/db/repos/findings.repo");
    const result = await withOrg(ctx.orgId, async (tx) => {
      const res = await runDoctorAuditScan(tx, ctx.orgId);
      const allFindings = await listFindings(tx, ctx.orgId);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "DOCTOR_AUDIT_SCAN",
        subjectType: "ai_finding",
        subjectId: ctx.orgId,
        data: { scanSummary: res },
      });
      const serializedAll = allFindings.map((f) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        status: f.status,
        evidence: (f.evidence as Record<string, unknown>) ?? null,
        createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      }));
      return {
        ...res,
        allFindings: serializedAll,
        openFindings: serializedAll.filter((f) => f.status === "open"),
      };
    });
    revalidatePath("/temuan");
    return { ok: true, data: result };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memindai buku" };
  }
}

export async function uploadFindingReceiptAction(findingId: string, formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "File tidak ditemukan." };

    const { ALLOWED_MIMES, MAX_DOCUMENT_BYTES, putDocument } = await import("@/server/storage/storage");
    if (!ALLOWED_MIMES.includes(file.type as never)) {
      return { ok: false, error: "Format file tidak didukung. Harap unggah berkas gambar (PNG/JPG) atau PDF." };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: "Ukuran file maksimal 5 MB." };
    }

    const result = await withOrg(ctx.orgId, async (tx) => {
      const { getFinding, resolveFinding } = await import("@/server/db/repos/findings.repo");
      const { createDocumentRow } = await import("@/server/db/repos/documents.repo");
      const { appendAudit } = await import("@/server/db/repos/audit.repo");

      const finding = await getFinding(tx, ctx.orgId, findingId);
      if (!finding) throw new Error("TEMUAN_TIDAK_DITEMUKAN");

      const ev = (finding.evidence as Record<string, unknown> | null) ?? {};
      const entryId = ev.entryId;
      if (typeof entryId !== "string" || !entryId) {
        throw new Error("Entri jurnal terkait tidak ditemukan dalam bukti temuan.");
      }

      // 1. Simpan berkas fisik ke S3 / SeaweedFS storage
      const buffer = Buffer.from(await file.arrayBuffer());
      const { storageKey } = await putDocument(ctx.orgId, { buffer, mime: file.type });

      // 2. Buat rekaman dokumen di database
      const docRow = await createDocumentRow(tx, {
        orgId: ctx.orgId,
        storageKey,
        mime: file.type,
        sizeBytes: file.size,
      });

      // 3. Tautkan dokumen fisik ke entri jurnal
      const { linkDocumentToEntry } = await import("@/server/db/repos/journals.repo");
      await linkDocumentToEntry(tx, {
        orgId: ctx.orgId,
        entryId,
        documentId: docRow.id,
        fileName: file.name,
      });

      // 4. Otomatis tandai temuan selesai!
      await resolveFinding(tx, ctx.orgId, findingId);

      // 5. Audit log
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "FINDING_RESOLVED",
        subjectType: "ai_finding",
        subjectId: findingId,
        data: {
          reason: "RECEIPT_UPLOADED",
          entryId,
          documentId: docRow.id,
          fileName: file.name,
        },
      });

      return { docId: docRow.id, fileName: file.name, sizeBytes: file.size, mime: file.type };
    });

    try {
      revalidatePath(`/temuan/${findingId}`);
      revalidatePath("/temuan");
      revalidatePath("/dashboard");
    } catch {}

    return { ok: true, data: result };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("Gagal mengunggah bukti temuan:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengunggah dokumen bukti." };
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

// Format minor → teks rupiah ala draf ("7.500.000", desimal ",50" bila ada).
// Sejalan dengan Money.parseIdr saat review menerima draf.
function formatMinorIdr(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  const grouped = (v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = v % 100n;
  const body = frac === 0n ? grouped : `${grouped},${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${body}`;
}

// Induk usulan akun baru per digit depan — dipakai bila kode bingkai tak ada
// di COA org. Ini usulan untuk ditelaah (Task 8 yang mengeksekusi), bukan postingan.
const PROPOSAL_HEADER_BY_DIGIT: Record<
  string,
  { type: AccountProposal["type"]; normal: "D" | "K"; parentCode: string }
> = {
  "1": { type: "ASET", normal: "D", parentCode: "1000" },
  "2": { type: "LIABILITAS", normal: "K", parentCode: "2000" },
  "3": { type: "EKUITAS", normal: "K", parentCode: "3000" },
  "4": { type: "PENDAPATAN", normal: "K", parentCode: "4000" },
  "5": { type: "BEBAN", normal: "D", parentCode: "5000" },
};

// Bab SAK EMKM per tipe temuan untuk fallback kata kunci tanpa embedding.
const SAK_BAB_BY_TYPE: Record<string, string[]> = {
  duplicates: ["Bab7"],
  abnormalBalances: ["Bab2", "Bab3", "Bab4"],
  missingReceipts: ["Bab2", "Bab6"],
  oddDates: ["Bab2"],
  ratioAnomalies: ["Bab2"],
};

export async function proposeCorrectionAction(findingId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const result = await withOrg(ctx.orgId, async (tx) => {
      const { getFinding, createProposal } = await import("@/server/db/repos/findings.repo");
      const { createDraft } = await import("@/server/db/repos/drafts.repo");
      const { appendAudit } = await import("@/server/db/repos/audit.repo");
      const { getActiveSakSource, isSakSection } = await import("@/server/db/repos/sak.repo");
      const { resolveDraftAccounts } = await import("@/core/ai/map-accounts");
      const { validateCitations } = await import("@/server/doctor/citations");
      const { generateCorrectionNarration } = await import("@/server/ai/correction-narrator");
      const {
        buildDuplicateCorrection,
        buildAbnormalCorrection,
        buildMissingReceiptCorrection,
        buildOddDateCorrection,
        buildRatioSummary,
      } = await import("@/server/doctor/builders");
      const { accounts: accountsTable } = await import("@/server/db/schema/org");
      const { eq: eqAcc, sql: drizzleSql, and, eq, desc } = await import("drizzle-orm");

      const finding = await getFinding(tx, ctx.orgId, findingId);
      if (!finding) throw new Error("TEMUAN_TIDAK_DITEMUKAN");

      // Cek apakah temuan ini sudah memiliki proposal / draf AI yang masih PENDING
      const { aiDrafts } = await import("@/server/db/schema/ai");

      const existingDrafts = await tx
        .select({ id: aiDrafts.id })
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.orgId, ctx.orgId),
            eq(aiDrafts.status, "PENDING"),
            drizzleSql`${aiDrafts.draft}->>'findingId' = ${findingId}`,
          ),
        )
        .orderBy(desc(aiDrafts.createdAt))
        .limit(1);

      if (existingDrafts.length > 0 && existingDrafts[0]?.id) {
        return { existingDraftId: existingDrafts[0].id };
      }

      const ev = (finding.evidence as Record<string, unknown> | null) ?? {};
      const findingType = finding.type;
      const todayISO = new Date().toISOString().slice(0, 10);

      // COA org + peta tipe per kode (untuk substitusi R5).
      const accRows = await tx
        .select()
        .from(accountsTable)
        .where(eqAcc(accountsTable.orgId, ctx.orgId));
      const leaves = accRows.filter(
        (a) => !accRows.some((c) => c.parentCode === a.code),
      );
      const typeByCode = new Map(accRows.map((a) => [a.code, a.type]));

      function requireEntryId(): string {
        const id = ev.entryId;
        if (typeof id !== "string" || id.length === 0) throw new Error("EVIDENCE_TIDAK_VALID");
        return id;
      }

      async function requireFindingEntry() {
        const { getEntryWithLines } = await import("@/server/db/repos/journals.repo");
        const entry = await getEntryWithLines(tx, ctx.orgId, requireEntryId());
        if (!entry) throw new Error("JURNAL_TIDAK_DITEMUKAN");
        return entry;
      }

      // Bingkai koreksi per tipe — nominal SELALU dari bukti/entri/saldo aktual,
      // tak ada angka template. Memo draf diambil dari frame.memo (R4).
      let frame: CorrectionFrame;
      if (findingType === "duplicates") {
        const entry = await requireFindingEntry();
        frame = buildDuplicateCorrection({
          id: entry.id,
          memo: entry.memo,
          lines: entry.lines.map((l) => ({
            accountCode: l.accountCode,
            debitMinor: l.debitMinor,
            creditMinor: l.creditMinor,
          })),
        });
      } else if (findingType === "oddDates") {
        const entry = await requireFindingEntry();
        const { listPeriods } = await import("@/server/db/repos/periods.repo");
        const periods = await listPeriods(tx, ctx.orgId);
        const open =
          periods.find((p) => p.status === "OPEN" && todayISO >= p.startsOn && todayISO <= p.endsOn)
          ?? periods.find((p) => p.status === "OPEN");
        if (!open) throw new Error("PERIODE_TIDAK_DITEMUKAN");
        frame = buildOddDateCorrection(
          { id: entry.id, number: entry.number, entryDate: entry.entryDate },
          { startsOn: open.startsOn, endsOn: open.endsOn },
        );
      } else if (findingType === "missingReceipts") {
        const entry = await requireFindingEntry();
        let amountMinor: bigint | null = null;
        try {
          const { resolveEvidenceAmounts } = await import("@/core/doctor/evidence");
          const resolved = resolveEvidenceAmounts(ev);
          if (resolved.amountMinor > 0n) amountMinor = resolved.amountMinor;
        } catch {
          amountMinor = null;
        }
        if (amountMinor === null) {
          amountMinor = entry.lines.reduce((s, l) => s + l.debitMinor, 0n);
        }
        if (amountMinor <= 0n) throw new Error("KOREKSI_NOMINAL_TIDAK_VALID");
        // Akun penampung harus kode nyata COA org (1600 lalu 1200); bila tak
        // ada, lempar agar alur proposal akun baru (Task 8) yang menangani.
        const suspenseCode = typeByCode.has("1600")
          ? "1600"
          : typeByCode.has("1200")
            ? "1200"
            : null;
        if (!suspenseCode) throw new Error("AKUN_PENAMPUNG_TIDAK_ADA");
        frame = buildMissingReceiptCorrection(amountMinor, suspenseCode);
        // R5: kredit placeholder (net-nol) WAJIB diganti akun beban asal dari
        // entri temuan — baris creditMinor terbesar bertipe BEBAN. Bila entri
        // tak memuat baris beban, blokir pola needs-account (accountId kosong
        // + alasan): review menahan posting sampai pengguna memilih.
        const source = [...entry.lines]
          .filter((l) => typeByCode.get(l.accountCode) === "BEBAN")
          .sort((a, b) =>
            b.creditMinor > a.creditMinor ? 1 : b.creditMinor < a.creditMinor ? -1 : 0,
          )[0];
        if (source) {
          frame = {
            ...frame,
            lines: [frame.lines[0], { ...frame.lines[1], accountCode: source.accountCode }],
          };
        } else {
          frame = {
            ...frame,
            lines: [
              frame.lines[0],
              {
                ...frame.lines[1],
                accountCode: "",
                memo: `Pilih akun beban asal dari entri temuan ${entry.number} — jurnal tidak memuat baris beban`,
              },
            ],
          };
        }
      } else if (findingType === "abnormalBalances") {
        const code = typeof ev.code === "string" && ev.code.length > 0 ? ev.code : null;
        if (!code) throw new Error("EVIDENCE_TIDAK_VALID");
        const { listAccountsWithBalances } = await import("@/server/db/repos/ledger.repo");
        const balances = await listAccountsWithBalances(tx, ctx.orgId);
        const target = balances.find((b) => b.code === code);
        if (!target) throw new Error("AKUN_TIDAK_DITEMUKAN");
        // Saldo abnormal berarti negatif di kedua sisi normal; saldo yang sudah
        // pulih berarti temuan basi — jangan buat draf buta.
        if (target.balanceMinor >= 0n) throw new Error("TEMUAN_SUDAH_SELESAI");
        frame = buildAbnormalCorrection(code, -target.balanceMinor, target.normal);
      } else if (findingType === "ratioAnomalies") {
        const { resolveEvidenceAmounts } = await import("@/core/doctor/evidence");
        const resolved = resolveEvidenceAmounts(ev);
        if (resolved.amountMinor <= 0n) throw new Error("KOREKSI_NOMINAL_TIDAK_VALID");
        const rawAvg: unknown = ev.avg;
        let avgMinor = 0n;
        if (typeof rawAvg === "string" && /^-?\d+$/.test(rawAvg.trim())) {
          avgMinor = BigInt(rawAvg.trim());
        } else if (typeof rawAvg === "bigint") {
          avgMinor = rawAvg;
        } else if (typeof rawAvg === "number" && Number.isInteger(rawAvg)) {
          avgMinor = BigInt(rawAvg);
        }
        if (avgMinor < 0n) throw new Error("EVIDENCE_TIDAK_VALID");
        frame = buildRatioSummary({
          curTotMinor: resolved.amountMinor,
          avgMinor,
          topCodes: resolved.codes,
        });
      } else {
        throw new Error("TIPE_TEMUAN_TIDAK_DIDUKUNG");
      }

      // Retrieve sitasi SAK: embedding bila ada API key, else fallback kata
      // kunci per Bab. Tanpa chunk — atau tanpa dokumen SAK aktif — kembalikan
      // SAK_BELUM_TERSEDIA, BUKAN draf asal.
      const queryText = `${findingType} ${frame.memo}`;
      let sakHits: Array<{ id: string; section: string; content: string }> = [];
      if (process.env.AI_MOCK !== "1" && process.env.GEMINI_API_KEY) {
        const { embed } = await import("@/server/ai/embeddings");
        const { hybridSearch } = await import("@/server/db/repos/rag-search");
        const hits = await hybridSearch(ctx.orgId, await embed(queryText), queryText, 4, tx);
        sakHits = hits
          .filter((h) => isSakSection(h.section ?? ""))
          .map((h) => ({ id: h.id, section: h.section as string, content: h.content }));
      } else {
        const babs = SAK_BAB_BY_TYPE[findingType] ?? ["Bab2"];
        const ors = babs.map((b) => drizzleSql`section LIKE ${`SAK-EMKM-${b}%`}`);
        const whereSql = ors.length === 1
          ? ors[0]
          : drizzleSql`(${drizzleSql.join(ors, drizzleSql` OR `)})`;
        const res = await tx.execute(
          drizzleSql`SELECT id, section, content FROM ifrs_chunks WHERE ${whereSql} LIMIT 4`,
        );
        const rows = (res as unknown as {
          rows: Array<{ id: string; section: string; content: string }>;
        }).rows ?? [];
        sakHits = rows.filter((r) => isSakSection(r.section));
      }
      const sakSource = await getActiveSakSource(tx);
      if (sakHits.length === 0 || !sakSource) {
        throw new Error("SAK_BELUM_TERSEDIA: jalankan ingest dokumen");
      }

      // Narasi → validasi sitasi (menunjuk dokumen aktif + Bab ter-retrieve).
      const frameSummary = (
        frame.lines.length > 0
          ? `strategi ${frame.strategy}; ` + frame.lines.map((l) =>
            `${l.accountCode || "(akun belum dipilih)"} D ${
              l.debitMinor > 0n ? formatMinorIdr(l.debitMinor) : "nihil"
            } K ${l.creditMinor > 0n ? formatMinorIdr(l.creditMinor) : "nihil"}`,
          ).join("; ")
          : `${frame.strategy}: ${frame.memo}`
      ).slice(0, 400);
      const narration = await generateCorrectionNarration({
        findingType,
        frameSummary,
        chunks: sakHits.map((h) => ({ id: h.id, section: h.section, content: h.content })),
        docId: sakSource.docId,
      });
      const checked = validateCitations(
        narration,
        sakHits.map((h) => ({ id: h.id, section: h.section })),
        sakSource.docId,
      );
      if (!checked.ok) throw new Error(`SITASI_TIDAK_VALID: ${checked.reason}`);

      // Selesaikan kode → ID terhadap akun leaf; kode tak terpetakan menjadi
      // AccountProposal (Task 8). Keyakinan jujur: 1.0 terpetakan / 0.45 usulan,
      // overall = rata-rata baris.
      const mapping = resolveDraftAccounts(
        { lines: frame.lines.map((l) => ({ accountCode: l.accountCode })) },
        leaves.map((a) => ({ id: a.id, code: a.code, name: a.name })),
      );
      const accountProposals: AccountProposal[] = [];
      const draftLines = frame.lines.map((l, i) => {
        const debitText = l.debitMinor > 0n ? formatMinorIdr(l.debitMinor) : "";
        const creditText = l.creditMinor > 0n ? formatMinorIdr(l.creditMinor) : "";
        if (l.accountCode === "") {
          return { accountCode: "", debitText, creditText, confidence: 0.45, reason: l.memo };
        }
        const m = mapping.lines[i];
        if (m && !m.unresolved) {
          return { accountCode: l.accountCode, debitText, creditText, confidence: 1.0, reason: l.memo };
        }
        const header = PROPOSAL_HEADER_BY_DIGIT[l.accountCode.trim()[0] ?? ""]
          ?? { type: "ASET" as const, normal: "D" as const, parentCode: "1000" };
        accountProposals.push({
          code: l.accountCode,
          name: `Akun ${l.accountCode}`,
          type: header.type,
          normal: header.normal,
          parentCode: header.parentCode,
          reason: `Dibutuhkan oleh koreksi temuan ${findingType} — ${l.memo}`,
        });
        return {
          accountCode: l.accountCode,
          debitText,
          creditText,
          confidence: 0.45,
          reason: `${l.memo} (kode ${l.accountCode} tidak ada di COA — pilih akun pengganti)`,
        };
      });
      const overallConfidence = draftLines.length === 0
        ? 0
        : draftLines.reduce((s, l) => s + l.confidence, 0) / draftLines.length;

      const draft = {
        dateISO: todayISO,
        memo: frame.memo,
        lines: draftLines,
        overallConfidence,
        explanation: narration.explanation,
      };
      const firstBab = narration.citations[0]?.bab ?? "?";
      const ifrsCitation = `SAK EMKM Bab ${firstBab} (${sakSource.docId})`;

      const proposal = await createProposal(tx, ctx.orgId, findingId, draft, ifrsCitation);
      const aiDraft = await createDraft(tx, {
        orgId: ctx.orgId,
        kind: "TEXT",
        inputText: `Koreksi temuan ${finding.type} (#${findingId.slice(0, 8)})`,
        draft: {
          ...draft,
          findingId,
          proposalId: proposal.id,
          ifrsCitation,
          mapping: { lines: mapping.lines, warnings: mapping.warnings },
          accountProposals,
          citations: narration.citations,
          sakDocId: sakSource.docId,
          sakVersion: sakSource.version,
        },
        model: "doctor-sak",
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
    // Best-effort di luar request scope (pola baku: settings.actions.ts) —
    // vitest tak punya static generation store.
    try {
      revalidatePath("/temuan");
    } catch {}
    if ("existingDraftId" in result && result.existingDraftId) {
      return { ok: true, draftId: result.existingDraftId };
    }
    if ("aiDraft" in result && result.aiDraft) {
      return { ok: true, draftId: result.aiDraft.id };
    }
    return { ok: false, error: "Gagal membuat draf usulan" };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat draf usulan" };
  }
}

