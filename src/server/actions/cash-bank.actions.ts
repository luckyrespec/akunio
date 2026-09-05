"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  createCashEntryRepo,
  postCashDraftRepo,
} from "@/server/db/repos/cash-bank.repo";
import { Money } from "@/core/money/money";
import type { CashKind } from "@/server/db/schema/cash-bank";

const PATH_BY_KIND: Record<CashKind, string> = {
  BAYAR: "/kas-bank/pembayaran",
  TERIMA: "/kas-bank/penerimaan",
  TRANSFER: "/kas-bank/transfer",
};

export async function createCashEntryAction(formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const kind = formData.get("kind") as CashKind;
    if (kind !== "BAYAR" && kind !== "TERIMA" && kind !== "TRANSFER") {
      return { ok: false as const, error: "Jenis transaksi tidak valid." };
    }
    const entryDate = String(formData.get("entryDate") ?? "");
    const cashAccountId = String(formData.get("cashAccountId") ?? "");
    const counterAccountId = String(formData.get("counterAccountId") ?? "");
    const contactId = (formData.get("contactId") as string) || null;
    const memo = String(formData.get("memo") ?? "");
    if (!entryDate || !cashAccountId || !counterAccountId) {
      return {
        ok: false as const,
        error: "Tanggal dan kedua akun wajib diisi.",
      };
    }
    let amountMinor: bigint;
    try {
      amountMinor = Money.parseIdr(String(formData.get("amount") ?? "")).minor;
    } catch {
      return {
        ok: false as const,
        error: "Nominal tidak valid. Contoh: 1500000 atau Rp1.500.000.",
      };
    }
    const post = formData.get("post") !== "0";
    const out = await withOrg(ctx.orgId, (tx) =>
      createCashEntryRepo(
        tx as never,
        ctx.orgId,
        ctx.userEmail,
        {
          kind,
          entryDate,
          cashAccountId,
          counterAccountId,
          contactId,
          amountMinor,
          memo,
        },
        { post }
      )
    );
    revalidatePath(PATH_BY_KIND[kind]);
    revalidatePath("/kas-bank/histori");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    return { ok: true as const, data: out };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Gagal menyimpan.",
    };
  }
}

export async function postCashDraftAction(formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false as const, error: "ID entri wajib diisi." };
    const out = await withOrg(ctx.orgId, (tx) =>
      postCashDraftRepo(tx as never, ctx.orgId, ctx.userEmail, id)
    );
    revalidatePath("/kas-bank/pembayaran");
    revalidatePath("/kas-bank/penerimaan");
    revalidatePath("/kas-bank/transfer");
    revalidatePath("/kas-bank/histori");
    revalidatePath("/jurnal");
    return { ok: true as const, data: out };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Gagal memposting draft.",
    };
  }
}
