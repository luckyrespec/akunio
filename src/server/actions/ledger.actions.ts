"use server";

import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getLedger } from "@/server/db/repos/ledger.repo";

export interface LedgerDetailItem {
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
}

export interface LedgerDetailResponse {
  ok: boolean;
  error?: string;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
    normal: string;
  };
  rows?: LedgerDetailItem[];
  closingBalanceMinor?: string;
}

export async function getAccountLedgerAction(accountId: string): Promise<LedgerDetailResponse> {
  try {
    const ctx = await requireContext();
    const result = await withOrg(ctx.orgId, (tx) => getLedger(tx, ctx.orgId, accountId));

    const rows: LedgerDetailItem[] = result.rows.map((r) => ({
      number: r.number,
      entryDate: r.entryDate,
      memo: r.memo,
      debitMinor: r.debitMinor.toString(),
      creditMinor: r.creditMinor.toString(),
      balanceMinor: r.balanceMinor.toString(),
    }));

    const closingBalance = result.rows.at(-1)?.balanceMinor ?? 0n;

    return {
      ok: true,
      account: {
        id: result.account.id,
        code: result.account.code,
        name: result.account.name,
        type: result.account.type,
        normal: result.account.normal,
      },
      rows,
      closingBalanceMinor: closingBalance.toString(),
    };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("Error fetching account ledger:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal memuat mutasi buku besar.",
    };
  }
}
