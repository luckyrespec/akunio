import { and, eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import type { Queryable } from "@/server/db/repos/queryable";
import type { AccountProposal } from "@/server/doctor/builders";

// Saldo normal yang konsisten per tipe (di luar akun kontra, yang tak pernah
// diusulkan lewat jalur ini — usulan selalu akun biasa).
const EXPECTED_NORMAL: Record<AccountProposal["type"], "D" | "K"> = {
  ASET: "D",
  BEBAN: "D",
  LIABILITAS: "K",
  EKUITAS: "K",
  PENDAPATAN: "K",
};

// R6: Task 7 menyimpan usulan dengan nama placeholder "Akun <kode>" dan induk
// fallback digit yang belum tentu ada — nama semacam itu WAJIB ditolak di sini
// (fail closed; penamaan nyata terjadi di UI review Task 9), jangan pernah
// membuat akun sampah.
const PLACEHOLDER_NAME = /^akun \d+$/i;

// Validasi usulan akun COA baru. Throw `USULAN_AKUN_TIDAK_VALID: <alasan>`
// (Bahasa Indonesia) bila usulan tak layak dibuat — pemanggil (acceptDraftAction)
// mengandalkan throw ini untuk menggagalkan posting secara atomik.
export async function validateAccountProposal(
  q: Queryable,
  orgId: string,
  p: AccountProposal,
): Promise<void> {
  const fail = (reason: string): never => {
    throw new Error(`USULAN_AKUN_TIDAK_VALID: ${reason}`);
  };
  const code = p.code.trim();
  if (!code) fail("kode akun kosong.");
  if (code.length > 8) fail(`kode akun "${code}" terlalu panjang (maks 8 karakter).`);
  const name = p.name.trim();
  if (!name) fail(`nama akun ${code} kosong.`);
  if (PLACEHOLDER_NAME.test(name)) {
    fail(`nama akun "${name}" masih placeholder — beri nama akun yang sebenarnya sebelum posting.`);
  }
  const expected = EXPECTED_NORMAL[p.type];
  if (!expected) fail(`tipe akun "${p.type}" tidak dikenal.`);
  if (p.normal !== "D" && p.normal !== "K") {
    fail(`saldo normal "${p.normal}" tidak valid (harus D atau K).`);
  }
  if (p.normal !== expected) {
    fail(`kombinasi tipe ${p.type} dan saldo normal ${p.normal} tidak konsisten.`);
  }
  const dup = await q.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, code))).limit(1);
  if (dup.length > 0) fail(`kode akun ${code} sudah dipakai.`);
  const parentCode = p.parentCode.trim();
  if (!parentCode) fail(`kode induk akun ${code} kosong.`);
  const parentRows = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, parentCode))).limit(1);
  const parent = parentRows[0];
  if (!parent) fail(`induk ${parentCode} tidak ditemukan di COA.`);
  if (parent.type !== p.type) {
    fail(`tipe ${p.type} tidak sesuai dengan tipe induk ${parentCode} (${parent.type}).`);
  }
  const kids = await q.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.parentCode, parentCode))).limit(1);
  if (kids.length === 0) fail(`induk ${parentCode} bukan akun header.`);
}
