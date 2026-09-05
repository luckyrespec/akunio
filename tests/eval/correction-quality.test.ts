import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveEvidenceAmounts } from "@/core/doctor/evidence";
import {
  buildAbnormalCorrection,
  buildDuplicateCorrection,
  buildMissingReceiptCorrection,
  buildOddDateCorrection,
  type CorrectionFrame,
} from "@/server/doctor/builders";
import { validateCitations } from "@/server/doctor/citations";
import { generateCorrectionNarration, type SakChunk } from "@/server/ai/correction-narrator";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";

// Eval kualitas koreksi Doctor berlandaskan SAK EMKM — 5 kasus deterministik
// (4 tipe temuan + 1 gerbang tanpa-chunk), pola tests/eval/draft-accuracy.test.ts.
// Murni/tanpa DB: builder + evidence resolver + pemeta COA + narator mock
// (AI_MOCK=1) + validator sitasi. Tanpa API key live.
// Anomali rasio (SUMMARY_ONLY, tanpa jurnal koreksi) tidak masuk hitungan
// kasus bermakna di sini — jalurnya sudah dikunci tests/unit/doctor/builders.test.ts.

// ±Rp1 dalam minor (Money SCALE=100): selisih frame vs evidence di atas ini gagal.
const TOLERANSI_RP1_MINOR = 100n;
const DOC_ID = "SAK-EMKM-2024";

// COA daun fiktif untuk eval (cukup untuk semua kode yang dipakai kasus).
const COA_DAUN = [
  { id: "akun-1110", code: "1110", name: "Kas" },
  { id: "akun-1600", code: "1600", name: "Uang Muka" },
  { id: "akun-3100", code: "3100", name: "Modal Disetor" },
  { id: "akun-5200", code: "5200", name: "Beban ATK" },
];

// Parafrase orisinal 2 kalimat per Bab (bukan salinan dokumen SAK).
const CHUNK_BAB7: SakChunk = {
  id: "sak-bab7",
  section: "SAK-EMKM-Bab7",
  content:
    "Kekeliruan pencatatan periode sebelumnya dibetulkan dengan menyajikan ulang angka pembanding. " +
    "Sifat kesalahan dan dampaknya dijelaskan dalam catatan atas laporan keuangan.",
};
const CHUNK_BAB2: SakChunk = {
  id: "sak-bab2",
  section: "SAK-EMKM-Bab2",
  content:
    "Transaksi diakui ketika manfaat ekonomi besar kemungkinan mengalir dan nilainya dapat diukur andal. " +
    "Setiap pos disajikan sesuai substansi pengaturannya pada periode yang tepat.",
};
const CHUNK_BAB3: SakChunk = {
  id: "sak-bab3",
  section: "SAK-EMKM-Bab3",
  content:
    "Saldo setiap akun disajikan di sisi normalnya pada akhir periode pelaporan. " +
    "Saldo yang menyimpang ditelusuri sebabnya lalu direklasifikasi ke sisi yang benar.",
};
const CHUNK_BAB6: SakChunk = {
  id: "sak-bab6",
  section: "SAK-EMKM-Bab6",
  content:
    "Setiap pengeluaran dicatat berdasar dokumen pendukung yang sah dan disimpan tertib. " +
    "Tanpa bukti yang cukup, pos disajikan sementara sambil menunggu kelengkapan dokumen.",
};

function totalDebit(frame: CorrectionFrame): bigint {
  return frame.lines.reduce((s, l) => s + l.debitMinor, 0n);
}

function totalKredit(frame: CorrectionFrame): bigint {
  return frame.lines.reduce((s, l) => s + l.creditMinor, 0n);
}

// D=K dan nominal == evidence (±Rp1).
function assertUangSetiaBukti(frame: CorrectionFrame, evidenceMinor: bigint): void {
  const d = totalDebit(frame);
  const c = totalKredit(frame);
  expect(d).toBe(c);
  const selisih = d >= evidenceMinor ? d - evidenceMinor : evidenceMinor - d;
  expect(selisih <= TOLERANSI_RP1_MINOR).toBe(true);
}

// Tak ada baris yang hilang dalam pemetaan: tiap baris frame punya entri
// mapping; kode dikenal harus terpetakan (bukan usulan).
function assertKodeTerpetakan(frame: CorrectionFrame): void {
  const mapping = resolveDraftAccounts(
    { lines: frame.lines.map((l) => ({ accountCode: l.accountCode })) },
    COA_DAUN,
  );
  expect(mapping.lines).toHaveLength(frame.lines.length);
  for (const m of mapping.lines) {
    expect(m.accountId !== null || m.unresolved).toBe(true);
  }
  expect(mapping.lines.every((m) => m.accountId !== null && !m.unresolved)).toBe(true);
}

// Narasi mock + sitasi lolos validator terhadap chunk yang di-retrieve.
async function assertSitasiTerverifikasi(
  findingType: string,
  frame: CorrectionFrame,
  chunks: SakChunk[],
): Promise<void> {
  const ringkasan =
    frame.lines.length > 0
      ? `strategi ${frame.strategy}; ` +
        frame.lines.map((l) => `${l.accountCode} D ${l.debitMinor} K ${l.creditMinor}`).join("; ")
      : `${frame.strategy}: ${frame.memo}`;
  const narasi = await generateCorrectionNarration({
    findingType,
    frameSummary: ringkasan.slice(0, 300),
    chunks,
    docId: DOC_ID,
  });
  expect(narasi.explanation.length).toBeGreaterThanOrEqual(20);
  expect(narasi.citations.length).toBeGreaterThan(0);
  const hasil = validateCitations(
    narasi,
    chunks.map((c) => ({ id: c.id, section: c.section })),
    DOC_ID,
  );
  expect(hasil.ok).toBe(true);
}

// Model murni kontrak fail-closed orkestrator (perilaku DB-nya dikunci
// tests/integration/sak-correction.test.ts): tanpa chunk → { ok:false }, bukan draf.
function gerbangKoreksi(input: {
  chunks: SakChunk[];
  docId: string | null;
}): { ok: true; draf: { memo: string } } | { ok: false; error: string } {
  if (input.chunks.length === 0 || !input.docId) {
    return { ok: false, error: "SAK_BELUM_TERSEDIA: jalankan ingest dokumen" };
  }
  return { ok: true, draf: { memo: "draf koreksi" } };
}

describe("eval kualitas koreksi doctor", () => {
  let aiMockLama: string | undefined;

  beforeAll(() => {
    aiMockLama = process.env.AI_MOCK;
    process.env.AI_MOCK = "1";
  });

  afterAll(() => {
    if (aiMockLama === undefined) delete process.env.AI_MOCK;
    else process.env.AI_MOCK = aiMockLama;
  });

  it("duplikat: jurnal pembalik senilai evidence, terpetakan, tersitasi", async () => {
    // Rp75.000 → 7500000 minor.
    const evidence = resolveEvidenceAmounts({ amountMinor: "7500000", entryId: "e-atk" });
    const frame = buildDuplicateCorrection({
      id: "e-atk",
      memo: "Beli ATK",
      lines: [
        { accountCode: "5200", debitMinor: 7500000n, creditMinor: 0n },
        { accountCode: "1110", debitMinor: 0n, creditMinor: 7500000n },
      ],
    });
    expect(frame.reversalOfId).toBe("e-atk");
    assertUangSetiaBukti(frame, evidence.amountMinor);
    expect(totalDebit(frame)).toBe(7500000n);
    assertKodeTerpetakan(frame);
    await assertSitasiTerverifikasi("duplicates", frame, [CHUNK_BAB7]);
  });

  it("saldo abnormal: reklasifikasi senilai evidence, kode tak dikenal jadi usulan", async () => {
    // Rp25.000 → 2500000 minor pada akun 1110 yang bersaldo abnormal.
    const evidence = resolveEvidenceAmounts({ amountMinor: "2500000", code: "1110" });
    const frame = buildAbnormalCorrection("1110", evidence.amountMinor, "D");
    assertUangSetiaBukti(frame, evidence.amountMinor);
    expect(frame.lines.some((l) => l.accountCode === "1110")).toBe(true);
    assertKodeTerpetakan(frame);
    // Cabang "terusulkan": tanpa 3100 di COA, baris lawan tak terpetakan —
    // orkestrator mengubahnya menjadi AccountProposal (bukan dijatuhkan diam-diam).
    const mappingTanpa3100 = resolveDraftAccounts(
      { lines: frame.lines.map((l) => ({ accountCode: l.accountCode })) },
      COA_DAUN.filter((a) => a.code !== "3100"),
    );
    const lawan = mappingTanpa3100.lines.find((m) => m.accountCode === "3100");
    expect(lawan?.accountId).toBeNull();
    expect(lawan?.unresolved).toBe(true);
    await assertSitasiTerverifikasi("abnormalBalances", frame, [CHUNK_BAB2, CHUNK_BAB3]);
  });

  it("bukti hilang: parkir ke penampung senilai evidence, sumber beban tersubstitusi", async () => {
    // Rp1.000.000 → 100000000 minor.
    const evidence = resolveEvidenceAmounts({ amountMinor: "100000000", entryId: "e-bbm" });
    const bingkaiAwal = buildMissingReceiptCorrection(evidence.amountMinor, "1600");
    // R5 orkestrator: kredit placeholder diganti akun beban asal dari entri temuan.
    const frame: CorrectionFrame = {
      ...bingkaiAwal,
      lines: [bingkaiAwal.lines[0], { ...bingkaiAwal.lines[1], accountCode: "5200" }],
    };
    assertUangSetiaBukti(frame, evidence.amountMinor);
    expect(frame.lines[0].accountCode).toBe("1600");
    expect(frame.lines[1].accountCode).toBe("5200");
    assertKodeTerpetakan(frame);
    await assertSitasiTerverifikasi("missingReceipts", frame, [CHUNK_BAB2, CHUNK_BAB6]);
  });

  it("tanggal ganjil: bingkai CUTOFF bermemo pindah periode, tersitasi", async () => {
    const frame = buildOddDateCorrection(
      { id: "e-9", number: "JE-2026-0042", entryDate: "2026-08-31" },
      { startsOn: "2026-09-01", endsOn: "2026-09-30" },
    );
    expect(frame.strategy).toBe("CUTOFF");
    expect(frame.lines).toHaveLength(0);
    expect(frame.memo).toContain("JE-2026-0042");
    expect(frame.memo).toContain("2026-09-01");
    await assertSitasiTerverifikasi("oddDates", frame, [CHUNK_BAB2]);
  });

  it("tanpa chunk: gerbang menolak dengan { ok:false }, bukan draf", async () => {
    await expect(
      generateCorrectionNarration({
        findingType: "duplicates",
        frameSummary: "pembalik Rp75.000 atas JE-2026-0001",
        chunks: [],
        docId: DOC_ID,
      }),
    ).rejects.toThrow("SAK_TIDAK_TERSEDIA");
    // Narasi yang valid-skema pun gagal validasi tanpa chunk ter-retrieve.
    const tanpaChunk = validateCitations(
      {
        explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.",
        citations: [{ docId: DOC_ID, bab: "7", paragraph: "7.16" }],
      },
      [],
      DOC_ID,
    );
    expect(tanpaChunk.ok).toBe(false);
    const hasil = gerbangKoreksi({ chunks: [], docId: DOC_ID });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.error.split(":")[0]).toBe("SAK_BELUM_TERSEDIA");
      expect("draf" in hasil).toBe(false);
    }
  });
});
