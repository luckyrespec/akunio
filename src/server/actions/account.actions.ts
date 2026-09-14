"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { withOrg } from "@/server/db/repos/with-org";
import { accounts } from "@/server/db/schema/org";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  createAccount,
  getAccountById,
  setAccountArchived,
  type AccountType,
} from "@/server/db/repos/accounts.repo";
import { updateAccount } from "@/server/db/repos/accounts.repo";
import { journalLines } from "@/server/db/schema/journal";

export async function editAccountNameAction(accountId: string, newName: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const cleanName = newName.trim();
    if (!cleanName) {
      return { ok: false as const, error: "Nama akun tidak boleh kosong." };
    }

    await withOrg(ctx.orgId, async (tx) => {
      const existing = await getAccountById(tx, ctx.orgId, accountId);
      if (!existing) throw new Error("AKUN_TIDAK_DITEMUKAN");

      const row = await updateAccount(tx, ctx.orgId, accountId, { name: cleanName });
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "ACCOUNT_UPDATE",
        subjectType: "account",
        subjectId: accountId,
        data: { code: row.code, oldName: existing.name, newName: row.name },
      });
    });

    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memperbarui nama akun." };
  }
}

export async function deleteAccountAction(accountId: string) {
  try {
    const ctx = await requireContext(["OWNER"]);

    const result = await withOrg(ctx.orgId, async (tx) => {
      const existing = await getAccountById(tx, ctx.orgId, accountId);
      if (!existing) throw new Error("AKUN_TIDAK_DITEMUKAN");

      // 1. Cek apakah ada akun anak yang berinduk pada akun ini
      const [childAccount] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.parentCode, existing.code)))
        .limit(1);

      if (childAccount) {
        return {
          ok: false as const,
          error: "Akun induk tidak dapat dihapus karena masih memiliki sub-akun di bawahnya.",
        };
      }

      // 2. Cek apakah ada catatan transaksi/mutasi pada buku besar
      const [usedInJournal] = await tx
        .select({ id: journalLines.id })
        .from(journalLines)
        .where(and(eq(journalLines.orgId, ctx.orgId), eq(journalLines.accountId, accountId)))
        .limit(1);

      if (usedInJournal) {
        return {
          ok: false as const,
          error: "Akun tidak dapat dihapus karena sudah memiliki riwayat mutasi/saldo di buku besar.",
        };
      }

      // Hapus akun
      await tx
        .delete(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.id, accountId)));

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "ACCOUNT_DELETE",
        subjectType: "account",
        subjectId: accountId,
        data: { code: existing.code, name: existing.name },
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return result;
    }

    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus akun." };
  }
}

export async function archiveAccountAction(accountId: string, archive: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, async (tx) => {
      const existing = await getAccountById(tx, ctx.orgId, accountId);
      if (!existing) throw new Error("AKUN_TIDAK_DITEMUKAN");
      const row = await setAccountArchived(tx, ctx.orgId, accountId, archive ? new Date() : null);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: archive ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE",
        subjectType: "account",
        subjectId: accountId,
        data: { code: row.code },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "GAGAL" };
  }
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
  normal: "D" | "K";
  parentCode?: string;
  isCash?: boolean;
  isBank?: boolean;
  contra?: boolean;
}

export async function createAccountAction(input: CreateAccountInput) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

    const cleanCode = input.code.trim();
    const cleanName = input.name.trim();

    if (!cleanCode) {
      return { ok: false as const, error: "Kode akun wajib diisi." };
    }
    if (!cleanName) {
      return { ok: false as const, error: "Nama akun wajib diisi." };
    }
    if (!input.type) {
      return { ok: false as const, error: "Kategori akun wajib dipilih." };
    }
    if (!input.normal || (input.normal !== "D" && input.normal !== "K")) {
      return { ok: false as const, error: "Saldo normal akun harus Debit (D) atau Kredit (K)." };
    }

    const row = await withOrg(ctx.orgId, async (tx) => {
      // Check for code uniqueness within the organization
      const [existing] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, cleanCode)))
        .limit(1);

      if (existing) {
        throw new Error(`Kode akun "${cleanCode}" sudah digunakan.`);
      }

      // If parentCode is provided, verify it exists
      if (input.parentCode?.trim()) {
        const [parent] = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, input.parentCode.trim())))
          .limit(1);

        if (!parent) {
          throw new Error(`Akun induk dengan kode "${input.parentCode}" tidak ditemukan.`);
        }
      }

      const created = await createAccount(tx, {
        orgId: ctx.orgId,
        code: cleanCode,
        name: cleanName,
        type: input.type,
        normal: input.normal,
        parentCode: input.parentCode?.trim() || undefined,
        isCash: Boolean(input.isCash),
        isBank: Boolean(input.isBank),
        contra: Boolean(input.contra),
      });

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "ACCOUNT_CREATE",
        subjectType: "account",
        subjectId: created.id,
        data: {
          code: created.code,
          name: created.name,
          type: created.type,
          parentCode: created.parentCode,
        },
      });

      return created;
    });

    revalidatePath("/pengaturan");
    return { ok: true as const, account: row };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambahkan akun." };
  }
}

/**
 * Rincian satu akun COA untuk sheet drawer (dipakai chat Akunio + reusable).
 * Lookup per kode akun.
 */
export async function getAccountDetailAction(code: string) {
  try {
    const ctx = await requireContext();
    const clean = code.trim();
    if (!clean) return { ok: false as const, error: "Kode akun kosong." };
    const rows = await withOrg(ctx.orgId, (tx) =>
      tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, clean)))
        .limit(1),
    );
    const acc = rows[0];
    if (!acc) return { ok: false as const, error: `Akun ${clean} tidak ditemukan.` };
    return {
      ok: true as const,
      data: {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normal: acc.normal,
        parentCode: acc.parentCode,
        isCash: acc.isCash,
        isBank: acc.isBank,
        archived: Boolean(acc.archivedAt),
      },
    };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat akun." };
  }
}
