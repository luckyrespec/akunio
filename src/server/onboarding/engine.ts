import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts, fiscalPeriods, organizations } from "@/server/db/schema/org";
import { subledgerControls } from "@/server/db/schema/subledger";
import { journalEntries } from "@/server/db/schema/journal";
import {
  getProfile,
  upsertProfile,
  addOnboardingMessage,
  listOnboardingMessages,
  type OrgProfile,
} from "@/server/db/repos/onboarding.repo";
import { seedOrgAccounts, seedFiscalPeriods } from "@/server/bootstrap/seed-org";
import {
  BUSINESS_TYPE_LABELS,
  type BusinessType,
} from "@/core/accounts/business-types";
import {
  coaForBusinessType,
  validateCoaDefs,
  inferAccountType,
  suggestAccountCode,
} from "@/core/accounts/coa-templates";
import type { AccountDef } from "@/core/accounts/types";
import { DEFAULT_NORMAL } from "@/core/accounts/types";
import type { OnboardingStep } from "@/server/db/schema/onboarding";
import { chatModel } from "@/server/ai/models";
import type { Queryable } from "@/server/db/repos/queryable";
import {
  parseBusinessType,
  parseRevenue,
  parseEmployees,
  parseReferral,
  parseConfirm,
  parseUbahTarget,
  parseCoaIntent,
} from "./parse";

export interface EngineReply {
  reply: string;
  chips: string[];
  step: OnboardingStep;
  coaPreview?: AccountDef[];
  finished?: boolean;
}

export interface FinalizeResult {
  ok: boolean;
  replaced: boolean;
  already?: boolean;
}

const NAMA_CHIPS: string[] = [];
const JENIS_CHIPS = Object.values(BUSINESS_TYPE_LABELS);
const SKALA_CHIPS = ["Baru memulai usaha", "<10jt / bulan", "10–50jt / bulan", "50–200jt / bulan", ">200jt / bulan"];
const KARYAWAN_CHIPS = ["Sendiri / 1", "2–5 orang", "6–20 orang", ">20 orang", "Lewati"];
const LOKASI_CHIPS = ["Lewati"];
const REFERRAL_CHIPS = ["Teman / Keluarga", "Google", "Instagram / TikTok", "Lainnya"];
const RINGKASAN_CHIPS = ["Ya, lanjut", "Ubah jawaban"];
const COA_CHIPS = ["Gunakan COA ini", "Tambah akun", "Hapus akun"];

const REVENUE_LABELS = {
  BARU_MULAI: "Baru memulai usaha",
  LT_10JT: "< Rp10 jt/bulan",
  "R_10_50JT": "Rp10–50 jt/bulan",
  "R_50_200JT": "Rp50–200 jt/bulan",
  GT_200JT: "> Rp200 jt/bulan",
} as const;

const REFERRAL_LABELS = {
  TEMAN: "Teman/Keluarga",
  GOOGLE: "Google",
  SOSMED: "Instagram/TikTok",
  LAINNYA: "Lainnya",
} as const;

const TYPE_ROOT_PARENT = {
  ASET: "1000",
  LIABILITAS: "2000",
  EKUITAS: "3000",
  PENDAPATAN: "4000",
  BEBAN: "5000",
} as const;

function draftOf(profile: OrgProfile): AccountDef[] | null {
  const d = profile.coaDraft as unknown;
  return Array.isArray(d) ? (d as AccountDef[]) : null;
}

/** LLM only rephrases; values never come from it. Always falls back. */
export function buildPolishPrompt(template: string): string {
  return `Parafrasekan ulang pesan onboarding berikut dalam Bahasa Indonesia yang hangat dan singkat (maks 80 kata, jangan ubah fakta, nama, angka, atau pilihan yang disebutkan, tanpa emoji berlebihan):\n\n${template}`;
}

async function polish(template: string): Promise<string> {
  try {
    if (process.env.AI_MOCK === "1" || !process.env.GEMINI_API_KEY) return template;
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const asked = ai.interactions.create({
      model: chatModel(),
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: buildPolishPrompt(template),
            },
          ],
        } as never,
      ],
      store: false,
    });
    const interaction = (await Promise.race([
      asked,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])) as unknown as { output_text?: string } | null;
    const out = interaction?.output_text?.trim();
    return out || template;
  } catch {
    return template;
  }
}

function questionFor(step: OnboardingStep): { reply: string; chips: string[] } {
  switch (step) {
    case "NAMA":
      return {
        reply: "Halo! Saya Akunio, asisten pembukuan Anda. Senang berkenalan! Siapa nama panggilan Anda?",
        chips: NAMA_CHIPS,
      };
    case "USAHA":
      return { reply: "Apa nama usaha Anda?", chips: [] };
    case "JENIS":
      return { reply: "Usaha Anda bergerak di bidang apa? Pilih yang paling mendekati.", chips: JENIS_CHIPS };
    case "SKALA":
      return { reply: "Berapa omzet usaha per bulan? (kira-kira saja — atau pilih Baru memulai usaha)", chips: SKALA_CHIPS };
    case "LOKASI":
      return { reply: "Di kota mana usaha beroperasi? (boleh dilewati)", chips: LOKASI_CHIPS };
    case "REFERRAL":
      return { reply: "Terakhir — dari mana Anda tahu aplikasi ini?", chips: REFERRAL_CHIPS };
    default:
      return { reply: "Silakan lanjutkan.", chips: [] };
  }
}

function summaryOf(p: OrgProfile): string {
  const lines = [
    `Nama: ${p.displayName ?? "-"}`,
    `Usaha: ${p.businessName ?? "-"}`,
    `Jenis: ${p.businessType ? BUSINESS_TYPE_LABELS[p.businessType as BusinessType] : "-"}`,
    `Omzet: ${p.revenueRange ? REVENUE_LABELS[p.revenueRange as keyof typeof REVENUE_LABELS] : "-"}`,
    `Karyawan: ${p.employeeCount === null || p.employeeCount === undefined ? "-" : `${p.employeeCount} orang`}`,
    `Kota: ${p.city ?? "-"}`,
    `Tahu dari: ${p.referralSource ? REFERRAL_LABELS[p.referralSource as keyof typeof REFERRAL_LABELS] : "-"}`,
  ];
  return `Berikut ringkasan profil Anda:\n${lines.map((l) => `• ${l}`).join("\n")}\n\nSudah benar?`;
}

function coaIntro(type: BusinessType, defs: AccountDef[]): string {
  const khas = defs
    .filter((d) => !isBaseCode(d.code))
    .slice(0, 3)
    .map((d) => d.name);
  return (
    `Berdasarkan usaha ${BUSINESS_TYPE_LABELS[type]}, saya siapkan bagan akun standar SAK EMKM ` +
    `(${defs.length} akun)` +
    (khas.length > 0 ? ` — termasuk akun khas seperti ${khas.join(", ")}.` : ".") +
    ` Silakan tinjau daftarnya. Jika cocok, tekan "Gunakan COA ini", atau ketik misalnya "tambah Beban Iklan" / "hapus 5520".`
  );
}

// Codes below are all from the base template (checked against coa-template.ts).
const BASE_CODES = new Set([
  "1000", "1100", "1110", "1120", "1200", "1300", "1400", "1500", "1590", "1600",
  "2000", "2100", "2200", "2300", "2400",
  "3000", "3100", "3200", "3300",
  "4000", "4100", "4200",
  "5000", "5100", "5200", "5300", "5400", "5500", "5600", "5700", "5900",
]);

function isBaseCode(code: string): boolean {
  return BASE_CODES.has(code);
}

export async function getOnboardingView(q: Queryable, orgId: string) {
  const profile = await getProfile(q, orgId);
  let messages = await listOnboardingMessages(q, orgId);
  if (messages.length === 0) {
    const first = questionFor("NAMA");
    await upsertProfile(q, orgId, {});
    await addOnboardingMessage(q, orgId, "assistant", first.reply, "NAMA");
    messages = await listOnboardingMessages(q, orgId);
  }
  const step = (profile?.currentStep ?? "NAMA") as OnboardingStep;
  const coaPreview = step === "COA" ? (draftOf(profile!) ?? null) : null;
  return {
    profile,
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    coaPreview,
    chips: chipsForStep(step, profile),
  };
}

/** Chips for a freshly loaded view (mid-flow refresh must show the same chips). */
export function chipsForStep(step: OnboardingStep, profile: OrgProfile | null): string[] {
  switch (step) {
    case "NAMA":
      return NAMA_CHIPS;
    case "USAHA":
      return [];
    case "JENIS":
      return JENIS_CHIPS;
    case "SKALA":
      return profile?.revenueRange ? KARYAWAN_CHIPS : SKALA_CHIPS;
    case "LOKASI":
      return LOKASI_CHIPS;
    case "REFERRAL":
      return REFERRAL_CHIPS;
    case "RINGKASAN":
      return RINGKASAN_CHIPS;
    case "COA":
      return COA_CHIPS;
    default:
      return [];
  }
}

export async function submitOnboardingMessage(
  q: Queryable,
  orgId: string,
  raw: string,
  hooks?: {
    /** Pengganti polish() internal agar reply bisa di-stream per token. */
    streamPolish?: (template: string) => Promise<string>;
  },
): Promise<EngineReply> {
  const text = raw.trim().slice(0, 500);
  let profile = (await getProfile(q, orgId)) ?? (await upsertProfile(q, orgId, {}));

  if (profile.status === "COMPLETED") {
    return { reply: "Onboarding Anda sudah selesai. Selamat menggunakan dashboard!", chips: [], step: "SELESAI", finished: true };
  }

  const step = profile.currentStep as OnboardingStep;
  if (!text) {
    const ask = questionFor(step === "SELESAI" ? "NAMA" : step);
    return { reply: `Pesan kosong — ${ask.reply.charAt(0).toLowerCase()}${ask.reply.slice(1)}`, chips: ask.chips, step };
  }
  await addOnboardingMessage(q, orgId, "user", text, step);

  const done = async (
    template: string,
    chips: string[],
    next: OnboardingStep,
    patch: Partial<Parameters<typeof upsertProfile>[2]> = {},
    coaPreview?: AccountDef[],
  ): Promise<EngineReply> => {
    profile = await upsertProfile(q, orgId, { ...patch, currentStep: next });
    const reply = hooks?.streamPolish ? await hooks.streamPolish(template) : await polish(template);
    await addOnboardingMessage(q, orgId, "assistant", reply, next);
    return { reply, chips, step: next, coaPreview };
  };

  switch (step) {
    case "NAMA": {
      if (text.length < 2) return done("Nama minimal 2 huruf — siapa nama panggilan Anda?", [], "NAMA");
      const name = text.slice(0, 60);
      return done(`Senang berkenalan, ${name}! Apa nama usaha Anda?`, [], "USAHA", { displayName: name });
    }
    case "USAHA": {
      if (text.length < 2) return done("Nama usaha minimal 2 huruf — apa nama usaha Anda?", [], "USAHA");
      const biz = text.slice(0, 80);
      const ask = questionFor("JENIS");
      return done(`"${biz}" — nama yang bagus! ${ask.reply}`, ask.chips, "JENIS", { businessName: biz });
    }
    case "JENIS": {
      const t = parseBusinessType(text);
      if (!t) return done("Saya belum mengenali jenis itu — pilih salah satu yang paling mendekati ya.", JENIS_CHIPS, "JENIS");
      const ask = questionFor("SKALA");
      return done(
        `Baik, usaha ${BUSINESS_TYPE_LABELS[t]}. ${ask.reply}`,
        ask.chips,
        "SKALA",
        { businessType: t },
      );
    }
    case "SKALA": {
      // Phase 1: revenue (unless already captured).
      if (!profile.revenueRange) {
        const rev = parseRevenue(text);
        if (!rev) return done("Pilih rentang omzet per bulan ya (kira-kira saja).", SKALA_CHIPS, "SKALA");
        const emp = parseEmployees(text);
        if (emp !== null) {
          const ask = questionFor("LOKASI");
          const revText = rev === "BARU_MULAI" ? REVENUE_LABELS[rev] : `Omzet ${REVENUE_LABELS[rev]}`;
          return done(`${revText}, ${emp} orang. ${ask.reply}`, ask.chips, "LOKASI", {
            revenueRange: rev,
            employeeCount: emp,
          });
        }
        return done("Berapa jumlah karyawan? (termasuk Anda sendiri; boleh Lewati)", KARYAWAN_CHIPS, "SKALA", {
          revenueRange: rev,
        });
      }
      // Phase 2: employees.
      if (/lewati|skip/i.test(text)) {
        const ask = questionFor("LOKASI");
        return done(ask.reply, ask.chips, "LOKASI");
      }
      const emp = parseEmployees(text);
      if (emp === null)
        return done("Balas dengan angka jumlah karyawan, atau tekan Lewati.", KARYAWAN_CHIPS, "SKALA");
      const ask = questionFor("LOKASI");
      return done(`Siap, ${emp} orang. ${ask.reply}`, ask.chips, "LOKASI", { employeeCount: emp });
    }
    case "LOKASI": {
      if (/lewati|skip/i.test(text)) {
        const ask = questionFor("REFERRAL");
        return done(`Tidak masalah. ${ask.reply}`, ask.chips, "REFERRAL");
      }
      const city = text.slice(0, 120);
      const ask = questionFor("REFERRAL");
      return done(`Dicatat: ${city}. ${ask.reply}`, ask.chips, "REFERRAL", { city });
    }
    case "REFERRAL": {
      const ref = parseReferral(text);
      profile = await upsertProfile(q, orgId, { referralSource: ref ?? "LAINNYA" });
      return done(`${summaryOf(profile)}`, RINGKASAN_CHIPS, "RINGKASAN");
    }
    case "RINGKASAN": {
      const target = parseUbahTarget(text);
      if (target) {
        const ask = questionFor(target);
        return done(`Baik, kita perbaiki. ${ask.reply}`, ask.chips, target);
      }
      if (!parseConfirm(text))
        return done(`${summaryOf(profile)}\n\nBalas "Ya, lanjut" jika sudah benar, atau "ubah <bagian>" (misal: ubah jenis usaha).`, RINGKASAN_CHIPS, "RINGKASAN");
      const type = profile.businessType as BusinessType | null;
      if (!type) return done("Jenis usaha belum terisi — pilih salah satu ya.", JENIS_CHIPS, "JENIS");
      const defs = coaForBusinessType(type);
      return done(coaIntro(type, defs), COA_CHIPS, "COA", { coaDraft: defs as never }, defs);
    }
    case "COA": {
      const draft = draftOf(profile) ?? coaForBusinessType(profile.businessType as BusinessType);
      const intent = parseCoaIntent(text);
      if (intent.kind === "confirm") {
        const result = await finalizeOnboarding(orgId, randomUUID());
        const reply = result.replaced
          ? `Beres! Bagan akun (${draft.length} akun) dan 12 periode tahun berjalan sudah disiapkan untuk ${profile.businessName ?? "usaha Anda"}. Selamat datang di dashboard!`
          : `Beres! Usaha Anda sudah punya jurnal tercatat, jadi bagan akun lama dipertahankan. Profil dilengkapi dan Anda bisa masuk dashboard sekarang.`;
        await addOnboardingMessage(q, orgId, "assistant", reply, "SELESAI");
        await upsertProfile(q, orgId, {});
        return { reply, chips: [], step: "SELESAI", finished: true };
      }
      if (intent.kind === "show") {
        return done("Ini daftar bagan akun yang saya siapkan — tinjau, lalu tekan Gunakan COA ini atau ubah via chat.", COA_CHIPS, "COA", {}, draft);
      }
      if (intent.kind === "add") {
        const explicit = /\bsebagai\s+(aset|liabilitas|ekuitas|pendapatan|beban)\b/i.exec(text);
        const typeWord = explicit?.[1].toLowerCase();
        const type =
          typeWord === "aset" ? ("ASET" as const)
          : typeWord === "liabilitas" ? ("LIABILITAS" as const)
          : typeWord === "ekuitas" ? ("EKUITAS" as const)
          : typeWord === "pendapatan" ? ("PENDAPATAN" as const)
          : typeWord === "beban" ? ("BEBAN" as const)
          : inferAccountType(intent.name);
        if (!type) {
          return done(
            `"${intent.name}" termasuk tipe apa? Balas misalnya: tambah ${intent.name} sebagai BEBAN.`,
            ["ASET", "LIABILITAS", "EKUITAS", "PENDAPATAN", "BEBAN"].map((t) => `Tambah ${intent.name} sebagai ${t}`),
            "COA",
            {},
            draft,
          );
        }
        if (intent.name.length < 2 || intent.name.length > 60)
          return done("Nama akun 2–60 huruf. Coba lagi ya.", COA_CHIPS, "COA", {}, draft);
        if (draft.some((d) => d.name.toLowerCase() === intent.name.toLowerCase()))
          return done(`"${intent.name}" sudah ada di daftar.`, COA_CHIPS, "COA", {}, draft);
        const added: AccountDef = {
          code: suggestAccountCode(draft, type),
          name: intent.name,
          type,
          normal: DEFAULT_NORMAL[type],
          parentCode: TYPE_ROOT_PARENT[type],
          isCash: /^(kas|bank)\b/i.test(intent.name),
          isBank: /^bank\b/i.test(intent.name),
        };
        const next = [...draft, added];
        const errors = validateCoaDefs(next);
        if (errors.length > 0) return done(`Belum bisa menambah: ${errors[0]}`, COA_CHIPS, "COA", {}, draft);
        return done(
          `Ditambahkan: ${added.code} ${added.name} (${type}). Ada lagi, atau tekan Gunakan COA ini?`,
          COA_CHIPS,
          "COA",
          { coaDraft: next as never },
          next,
        );
      }
      if (intent.kind === "remove") {
        const query = intent.query.toLowerCase();
        const hits = draft.filter(
          (d) => d.code === intent.query || d.name.toLowerCase().includes(query),
        );
        if (hits.length === 0)
          return done(`Tidak ketemu akun "${intent.query}" di daftar. Coba kode atau sebagian nama yang pas.`, COA_CHIPS, "COA", {}, draft);
        if (hits.length > 1)
          return done(
            `Ada ${hits.length} yang cocok: ${hits.map((h) => `${h.code} ${h.name}`).join("; ")}. Sebutkan kodenya ya.`,
            COA_CHIPS,
            "COA",
            {},
            draft,
          );
        const next = draft.filter((d) => d !== hits[0]);
        const errors = validateCoaDefs(next);
        if (errors.length > 0)
          return done(`Tidak bisa menghapus ${hits[0].code} ${hits[0].name}: masih dipakai sebagai induk. Hapus dulu akun di bawahnya.`, COA_CHIPS, "COA", {}, draft);
        return done(`Dihapus: ${hits[0].code} ${hits[0].name}. Ada lagi?`, COA_CHIPS, "COA", { coaDraft: next as never }, next);
      }
      if (intent.kind === "type") {
        return done(`Untuk menambah akun tipe ${intent.type}, balas: tambah <nama akun> sebagai ${intent.type}.`, COA_CHIPS, "COA", {}, draft);
      }
      return done(`Saya bisa bantu: tekan "Gunakan COA ini", atau ketik "tambah <nama>" / "hapus <kode>" / "lihat".`, COA_CHIPS, "COA", {}, draft);
    }
    case "SELESAI":
      return { reply: "Onboarding Anda sudah selesai. Selamat menggunakan dashboard!", chips: [], step: "SELESAI", finished: true };
  }
}

export async function finalizeOnboarding(orgId: string, key: string): Promise<FinalizeResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`);

    const profile = await getProfile(tx, orgId);
    if (!profile) throw new Error("PROFIL_TIDAK_DITEMUKAN");
    if (profile.status === "COMPLETED") return { ok: true, replaced: false, already: true };
    if (profile.idempotencyKey && profile.idempotencyKey === key) {
      return { ok: true, replaced: false, already: true };
    }

    const type = profile.businessType as BusinessType | null;
    const defs = draftOf(profile) ?? (type ? coaForBusinessType(type) : null);
    if (!defs || defs.length === 0) throw new Error("COA_BELUM_SIAP");
    const errors = validateCoaDefs(defs);
    if (errors.length > 0) throw new Error(`COA_TIDAK_VALID: ${errors[0]}`);

    const [posted] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.status, "POSTED")))
      .limit(1);

    let replaced = false;
    if (!posted) {
      await tx.delete(subledgerControls).where(eq(subledgerControls.orgId, orgId));
      await tx.delete(accounts).where(eq(accounts.orgId, orgId));
      await seedOrgAccounts(orgId, defs, tx);
      replaced = true;
    }

    // Insert only missing periods (legacy orgs already have them).
    const existingPeriods = await tx
      .select({ name: fiscalPeriods.name })
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.orgId, orgId));
    if (existingPeriods.length < 12) {
      const have = new Set(existingPeriods.map((p) => p.name));
      if (have.size === 0) {
        await seedFiscalPeriods(orgId, 1, tx);
      } else {
        const year = new Date().getFullYear();
        const pad2 = (n: number): string => String(n).padStart(2, "0");
        const missing = Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`).filter(
          (n) => !have.has(n),
        );
        if (missing.length > 0) {
          await tx.insert(fiscalPeriods).values(
            missing.map((name) => {
              const m = Number(name.slice(5, 7));
              const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
              return {
                orgId,
                name,
                startsOn: `${name}-01`,
                endsOn: `${name}-${pad2(lastDay)}`,
                status: "OPEN" as const,
              };
            }),
          );
        }
      }
    }

    if (profile.businessName) {
      await tx
        .update(organizations)
        .set({ name: profile.businessName })
        .where(eq(organizations.id, orgId));
    }

    // Inisialisasi pengaturan default persediaan & stok.
    // Kontrol subledger WAJIB akun daun (bisa diposting): induk grup seperti
    // 1300 ditolak aturan GROUP_ACCOUNT, jadi jangan pernah daftarkan induk.
    const orgAccounts = await tx.select().from(accounts).where(eq(accounts.orgId, orgId));
    const isParent = (code: string) => orgAccounts.some((a) => a.parentCode === code);
    const persediaanCands = orgAccounts.filter(
      (a) => a.code.startsWith("13") || a.code.startsWith("1-13") || a.name.toLowerCase().includes("persediaan"),
    );
    const invAcc =
      persediaanCands.find((a) => a.code === "1310" && !isParent(a.code)) ??
      persediaanCands.find((a) => !isParent(a.code)) ??
      persediaanCands[0] ??
      null;
    const cogsAcc = orgAccounts.find((a) => a.code.startsWith("5-10") || a.name.toLowerCase().includes("pokok penjualan"));
    const lossAcc = orgAccounts.find((a) => a.name.toLowerCase().includes("selisih") || a.code.startsWith("5-19"));

    const { inventorySettings } = await import("@/server/db/schema/inventory");
    await tx.insert(inventorySettings).values({
      orgId,
      valuationMethod: "WEIGHTED_AVERAGE",
      recordingMethod: type === "JASA" ? "PERIODIC" : "PERPETUAL",
      cogsAccountId: cogsAcc?.id ?? null,
      adjustmentLossAccountId: lossAcc?.id ?? null,
    }).onConflictDoNothing();
    const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
    const arAcc = orgAccounts.find((a) => a.code === "1200");
    const apAcc = orgAccounts.find((a) => a.code === "2100");
    await seedSubledgerControls(tx, orgId, {
      receivableAccountId: arAcc?.id ?? null,
      payableAccountId: apAcc?.id ?? null,
      inventoryAccountId: invAcc?.id ?? null,
    });

    await upsertProfile(tx, orgId, {
      status: "COMPLETED",
      currentStep: "SELESAI",
      completedAt: new Date(),
      idempotencyKey: key,
    });
    return { ok: true, replaced };
  });
}
