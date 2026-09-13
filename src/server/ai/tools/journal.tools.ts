import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { withOrg } from "@/server/db/repos/with-org";
import {
  listEntriesWithLines,
  postJournalEntry,
  toMinor,
  dec,
} from "@/server/db/repos/journals.repo";
import { searchJournals } from "@/server/db/repos/search.repo";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { DraftEntrySchema } from "../schema";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";
import type { ToolDefinition, ToolHandler } from "./types";

export const journalToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "search_journals",
    description: "Cari entri jurnal yang sudah diposting berdasarkan kata kunci memo atau nomor JE.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci memo atau nomor jurnal" },
        limit: { type: "number", description: "Jumlah hasil maksimal (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "list_journals",
    description: "Ambil daftar jurnal transaksi terbaru lengkap dengan baris debit dan kredit.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Jumlah transaksi (default: 10)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "create_journal_draft",
    description: "Buat draft jurnal double-entry HANYA bila pengguna eksplisit meminta draft. Untuk permintaan mencatat biasa, gunakan post_journal.",
    parameters: {
      type: "object",
      properties: {
        memo: { type: "string", description: "Keterangan transaksi" },
        dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Kode akun (misal 1-1001)" },
              debitText: { type: "string", description: "Nominal debit rupiah; WAJIB string kosong ('') bila nol — jangan tulis '0'" },
              creditText: { type: "string", description: "Nominal kredit rupiah; WAJIB string kosong ('') bila nol — jangan tulis '0'" },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
            required: ["accountCode", "debitText", "creditText", "confidence", "reason"],
          },
        },
        explanation: { type: "string", description: "Penjelasan logis transaksi" },
      },
      required: ["memo", "lines", "explanation"],
    },
  },
  {
    type: "function",
    name: "post_journal",
    description: "Pilihan utama untuk mencatat transaksi: posting resmi langsung ke buku besar sebagai jurnal JE-YYYY-NNNN. Kartu persetujuan tampil sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        memo: { type: "string", description: "Keterangan jurnal" },
        dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Kode akun" },
              debit: { type: "string", description: "Nominal debit" },
              credit: { type: "string", description: "Nominal kredit" },
              memo: { type: "string", description: "Keterangan baris (opsional)" },
            },
            required: ["accountCode", "debit", "credit"],
          },
        },
      },
      required: ["memo", "dateISO", "lines"],
    },
  },
  {
    type: "function",
    name: "reverse_journal",
    description: "Buat jurnal pembalik (reversal) untuk membatalkan entri jurnal yang salah.",
    parameters: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "ID atau Nomor jurnal yang ingin dibalikkan" },
        reason: { type: "string", description: "Alasan pembatalan/pembalikan" },
        dateISO: { type: "string", description: "Tanggal pembalik YYYY-MM-DD" },
      },
      required: ["entryId", "reason"],
    },
  },
];

export const journalHandlers: Record<string, ToolHandler> = {
  search_journals: async (orgId, _actorEmail, args) => {
    const query = String(args.query ?? "").trim();
    const limit = Number(args.limit ?? 5);
    const rows = await withOrg(orgId, (tx) => searchJournals(tx, orgId, query, limit));
    return { success: true, data: rows };
  },

  list_journals: async (orgId, _actorEmail, args) => {
    const limit = Number(args.limit ?? 10);
    const rows = await withOrg(orgId, (tx) => listEntriesWithLines(tx, orgId, limit));
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        number: r.number,
        date: r.entryDate,
        memo: r.memo,
        lines: r.lines.map((l) => ({
          code: l.accountCode,
          name: l.accountName,
          debit: dec(l.debitMinor),
          credit: dec(l.creditMinor),
        })),
      })),
    };
  },

  create_journal_draft: async (orgId, _actorEmail, args) => {
    const parsed = DraftEntrySchema.safeParse({
      dateISO: new Date().toISOString().slice(0, 10),
      overallConfidence: 0.9,
      ...args,
    });
    if (!parsed.success) {
      return {
        success: false,
        error:
          "Draf jurnal tidak valid: setiap baris harus mengisi tepat satu sisi (debit atau kredit), sisi lainnya dikosongkan.",
      };
    }
    const draft = parsed.data;
    const accRows = await withOrg(orgId, (tx) =>
      tx.select().from(accounts).where(eq(accounts.orgId, orgId)),
    );
    const mapping = resolveDraftAccounts(draft, accRows);
    const row = await withOrg(orgId, async (tx) => {
      const d = await createDraft(tx, {
        orgId,
        kind: "TEXT",
        inputText: draft.memo,
        draft: { ...draft, mapping },
        model: "akunio-agent",
      });
      await appendAudit(tx, {
        orgId,
        actor: "akunio",
        action: "AKUNIO_DRAFT_CREATE",
        subjectType: "ai_draft",
        subjectId: d.id,
        data: { memo: draft.memo, linesCount: draft.lines.length },
      });
      return d;
    });
    return { success: true, data: { draftId: row.id, memo: draft.memo } };
  },

  post_journal: async (orgId, actorEmail, args) => {
    const memo = String(args.memo ?? "").trim();
    const dateISO = String(args.dateISO ?? "").slice(0, 10);
    const rawLines = (args.lines as Array<{ accountCode: string; debit: string; credit: string; memo?: string }>) ?? [];

    const accRows = await withOrg(orgId, (tx) =>
      tx.select().from(accounts).where(eq(accounts.orgId, orgId)),
    );
    const codeMap = new Map(accRows.map((a) => [a.code, a]));

    let totalDebit = 0n;
    let totalCredit = 0n;
    const lines: Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint; memo?: string }> = [];

    for (const l of rawLines) {
      const acc = codeMap.get(l.accountCode);
      if (!acc) {
        return { success: false, error: `Akun dengan kode ${l.accountCode} tidak ditemukan di COA.` };
      }
      const debitMinor = toMinor(String(l.debit || "0"));
      const creditMinor = toMinor(String(l.credit || "0"));
      totalDebit += debitMinor;
      totalCredit += creditMinor;
      lines.push({
        accountId: acc.id,
        debitMinor,
        creditMinor,
        memo: l.memo,
      });
    }

    if (totalDebit !== totalCredit || totalDebit <= 0n) {
      return {
        success: false,
        error: `Jurnal tidak seimbang! Total Debit (${dec(totalDebit)}) harus sama dengan Total Kredit (${dec(totalCredit)}) dan lebih besar dari 0.`,
      };
    }

    const res = await withOrg(orgId, async (tx) => {
      const posted = await postJournalEntry(tx, orgId, actorEmail, {
        memo,
        dateISO,
        lines,
        source: "AI",
      });
      await appendAudit(tx, {
        orgId,
        actor: "akunio",
        action: "AKUNIO_POST_JOURNAL",
        subjectType: "journal_entry",
        subjectId: posted.id,
        data: { number: posted.number, memo },
      });
      return posted;
    });

    return { success: true, data: { journalId: res.id, number: res.number, memo } };
  },

  reverse_journal: async (orgId, actorEmail, args) => {
    const entryIdOrNum = String(args.entryId ?? "").trim();
    const reason = String(args.reason ?? "Pembalikan jurnal via Akunio AI");
    const dateISO = args.dateISO ? String(args.dateISO).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const rows = await withOrg(orgId, (tx) => listEntriesWithLines(tx, orgId, 100));
    const target = rows.find((r) => r.id === entryIdOrNum || r.number === entryIdOrNum);
    if (!target) {
      return { success: false, error: `Jurnal ${entryIdOrNum} tidak ditemukan.` };
    }

    // Swap debit and credit lines
    const reversedLines = target.lines.map((l) => ({
      accountId: l.accountId,
      debitMinor: l.creditMinor,
      creditMinor: l.debitMinor,
      memo: `Reversal: ${l.memo ?? target.memo}`,
    }));

    const res = await withOrg(orgId, async (tx) => {
      const posted = await postJournalEntry(
        tx,
        orgId,
        actorEmail,
        {
          memo: `Reversal dari ${target.number}: ${reason}`,
          dateISO,
          lines: reversedLines,
          source: "AI",
        },
        { reversalOfId: target.id },
      );
      await appendAudit(tx, {
        orgId,
        actor: "akunio",
        action: "AKUNIO_REVERSE_JOURNAL",
        subjectType: "journal_entry",
        subjectId: posted.id,
        data: { originalJournal: target.number, reversalNumber: posted.number },
      });
      return posted;
    });

    return { success: true, data: { reversalNumber: res.number, targetNumber: target.number } };
  },
};
