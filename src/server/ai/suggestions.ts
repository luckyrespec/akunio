import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { accounts } from "@/server/db/schema/org";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { listDrafts } from "@/server/db/repos/drafts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export type NaraSuggestion = {
  label: string;
  prompt: string;
  icon: "Receipt" | "Wallet" | "BarChart3" | "Search";
  reason?: string;
};

const FALLBACK_SUGGESTIONS: NaraSuggestion[] = [
  { label: "Beli perlengkapan 500rb", prompt: "Buat jurnal beli perlengkapan kantor tunai Rp 500.000", icon: "Receipt" },
  { label: "Bayar sewa 15jt via BCA", prompt: "Bayar sewa kantor 3 bulan 15 juta via BCA", icon: "Wallet" },
  { label: "Cek saldo kas & bank", prompt: "Berapa saldo kas dan bank hari ini?", icon: "Wallet" },
  { label: "Laporan laba rugi", prompt: "Tampilkan laba rugi bulan ini", icon: "BarChart3" },
  { label: "Cari jurnal sewa", prompt: "Cari jurnal sewa bulan lalu", icon: "Search" },
  { label: "Penjualan tunai 2jt", prompt: "Buat jurnal penjualan tunai Rp 2.000.000", icon: "Receipt" },
  { label: "Neraca terbaru", prompt: "Tampilkan neraca per hari ini", icon: "BarChart3" },
  { label: "Draft yang pending", prompt: "Ada draft yang perlu direview?", icon: "Search" },
];

const suggestionsSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Label tombol max 28 karakter" },
          prompt: { type: "string", description: "Prompt natural Indonesia max 80 karakter" },
          icon: { type: "string", enum: ["Receipt", "Wallet", "BarChart3", "Search"] },
        },
        required: ["label", "prompt", "icon"],
      },
    },
  },
  required: ["suggestions"],
} as const;

// In-memory cache per org, TTL 6 jam
const cache = new Map<string, { at: number; data: NaraSuggestion[] }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function getCache(orgId: string): NaraSuggestion[] | null {
  const hit = cache.get(orgId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(orgId);
    return null;
  }
  return hit.data;
}

function setCache(orgId: string, data: NaraSuggestion[]) {
  cache.set(orgId, { at: Date.now(), data });
}

// Clear for tests
export function clearSuggestionsCache() {
  cache.clear();
}

// Naikkan saran yang relevan dengan halaman aktif ke depan (stabil, tanpa LLM).
function boostByPage(list: NaraSuggestion[], pagePath?: string): NaraSuggestion[] {
  const p = (pagePath ?? "").toLowerCase();
  let re: RegExp | null = null;
  if (p.includes("jurnal")) re = /jurnal|draft|catat|posting/i;
  else if (p.includes("kas") || p.includes("bank")) re = /kas|bank|saldo|bayar/i;
  else if (p.includes("aturan")) re = /sak|bab|aturan|standar/i;
  else if (p.includes("persediaan")) re = /stok|barang|persediaan/i;
  else if (p.includes("faktur")) re = /faktur|tagihan|invoice|piutang|utang/i;
  else if (p.includes("aset")) re = /aset|susut|depresiasi/i;
  else if (p.includes("dashboard")) re = /briefing|laba|rugi|kas/i;
  if (!re) return list;
  const pattern = re;
  const hit = list.filter((s) => pattern.test(`${s.label} ${s.prompt}`));
  if (hit.length === 0) return list;
  const rest = list.filter((s) => !pattern.test(`${s.label} ${s.prompt}`));
  return [...hit, ...rest];
}

async function collectSignals(orgId: string) {
  const started = Date.now();
  try {
    const [accRows, drafts, periods] = await Promise.all([
      withOrg(orgId, (tx) => tx.select().from(accounts).where(eq(accounts.orgId, orgId))),
      withOrg(orgId, (tx) => listDrafts(tx, orgId)).catch(() => []),
      withOrg(orgId, (tx) => listPeriods(tx, orgId)).catch(() => []),
    ]);
    const leafAccs = accRows.filter((a) => !accRows.some((c) => c.parentCode === a.code));
    const topAccounts = leafAccs.slice(0, 8).map((a) => `${a.code} ${a.name}`).join(", ") || "Belum ada akun";

    let recentMemos = "Belum ada jurnal";
    try {
      const journals = await withOrg(orgId, (tx) => listEntriesWithLines(tx, orgId, 5));
      if (journals.length > 0) recentMemos = journals.map((j) => `${j.number}: ${j.memo}`).join(" | ");
    } catch {}

    const pendingCount = drafts.filter((d) => d.status === "PENDING").length;
    const periodInfo = periods.length
      ? periods.slice(-3).map((p) => `${p.name} ${p.status}`).join(", ")
      : "Belum ada periode";

    let liveNumbers = "";
    try {
      const year = new Date().getFullYear();
      const accRows2 = accRows;
      const metas = reportMetaMap(accRows2);
      const cashLines = await withOrg(orgId, (tx) => postedLinesThrough(tx, orgId, `${year}-12-31`));
      const aggs = aggregateFromLines(cashLines, metas);
      const cashMinor = aggs.filter((a) => a.meta.isCash || a.meta.isBank).reduce((s, a) => s + signed(a.meta, a), 0n);
      const ytd = incomeStatement(aggs);
      const { Money } = await import("@/core/money/money");
      liveNumbers = `Kas&Bank ${Money.fromMinor(cashMinor).formatIdr()}, Laba ${Money.fromMinor(ytd.netIncomeMinor).formatIdr()}`;
    } catch {
      liveNumbers = "Kas/Laba tidak tersedia";
    }

    // console.log("collectSignals", Date.now()-started, "ms");
    return { topAccounts, recentMemos, pendingCount, periodInfo, liveNumbers };
  } catch (e) {
    console.warn("collectSignals failed", e);
    return {
      topAccounts: "Kas, Bank, Beban, Pendapatan",
      recentMemos: "Belum ada data",
      pendingCount: 0,
      periodInfo: "Tidak tersedia",
      liveNumbers: "",
    };
  }
}

export async function generatePersonalSuggestions(
  orgId: string,
  opts?: { excludeLabels?: string[]; pagePath?: string }
): Promise<NaraSuggestion[]> {
  const cached = getCache(orgId);
  if (cached) return boostByPage(cached, opts?.pagePath);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return boostByPage(FALLBACK_SUGGESTIONS, opts?.pagePath);
  }

  const signals = await collectSignals(orgId);
  const exclude = opts?.excludeLabels?.length ? `Jangan ulang label: ${opts.excludeLabels.join(", ")}.` : "";

  const prompt = `Anda adalah modul asisten akuntansi cerdas untuk UMKM Indonesia di aplikasi pembukuan Akunio.

Tugas: Buat 8 saran tombol aksi cepat yang DIPERSONALISASI dari data transaksi pembukuan organisasi.

Data org:
- Akun: ${signals.topAccounts}
- Jurnal terbaru: ${signals.recentMemos}
- Draft pending: ${signals.pendingCount} perlu review
- Periode: ${signals.periodInfo}
- Kas/Laba: ${signals.liveNumbers}
${exclude}

Aturan:
- Setiap saran = {label, prompt, icon} — label max 28 char, prompt natural Indonesia max 80 char.
- prompt harus actionable (buat jurnal, cari jurnal, tampilkan laporan, cek saldo/draft).
- icon pilih: Receipt (buat jurnal), Wallet (kas/bayar), BarChart3 (laporan), Search (cari/cek).
- Jangan halusinasi angka spesifik (jangan "Rp 12.345.678"), gunakan pola seperti "sewa", "kas", "bulan ini".
- Jika pendingCount>0, salah satu saran harus tentang draft pending.
- Jika jurnal sewa sering muncul, beri saran sewa.
- Variasikan: 2-3 saran buat jurnal, 2 saran cek laporan/saldo, 2 saran cari/riwayat, 1 saran draft.
- Kembalikan JSON valid sesuai schema, hanya itu.`;

  const ai = new GoogleGenAI({ apiKey });

  try {
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: [{ type: "user_input", content: [{ type: "text", text: prompt }] } as never],
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: suggestionsSchema as never,
      },
    } as never);

    const raw = (interaction as unknown as { output_text?: string }).output_text ?? "";
    const parsed = JSON.parse(raw) as { suggestions: NaraSuggestion[] };
    let suggestions = parsed.suggestions ?? [];

    // Validate & sanitize
    suggestions = suggestions.slice(0, 8).map((s) => ({
      label: String(s.label).slice(0, 28),
      prompt: String(s.prompt).slice(0, 80),
      icon: (["Receipt", "Wallet", "BarChart3", "Search"] as const).includes(s.icon as never) ? s.icon : "Search",
    }));

    if (suggestions.length < 8) throw new Error("suggestions kurang");

    // Dedup vs exclude
    if (opts?.excludeLabels?.length) {
      const excludeSet = new Set(opts.excludeLabels.map((v) => v.toLowerCase()));
      const filtered = suggestions.filter((s) => !excludeSet.has(s.label.toLowerCase()));
      if (filtered.length < 8) {
        // pad with fallback
        for (const f of FALLBACK_SUGGESTIONS) {
          if (filtered.length >= 8) break;
          if (!excludeSet.has(f.label.toLowerCase()) && !filtered.some((x) => x.label === f.label)) filtered.push(f);
        }
        suggestions = filtered;
      } else {
        suggestions = filtered.slice(0, 8);
      }
    }

    setCache(orgId, suggestions);
    return boostByPage(suggestions, opts?.pagePath);
  } catch (e) {
    console.warn("generatePersonalSuggestions fallback", (e as Error).message);
    return FALLBACK_SUGGESTIONS;
  }
}

export { FALLBACK_SUGGESTIONS };
