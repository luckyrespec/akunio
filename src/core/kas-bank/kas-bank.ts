export type UiCashKind = "BAYAR" | "TERIMA" | "TRANSFER" | "PAYMENT";

export class CashValidationError extends Error {}

export interface PlanArgs {
  cashAccountId: string;
  counterAccountId: string;
  cashIsCash: boolean;
  counterIsCash: boolean;
  memo: string;
}

export interface CashEntryPlan {
  debitAccountId: string;
  creditAccountId: string;
  memo: string;
}

export const CASH_KIND_PREFIX: Record<UiCashKind, string> = {
  BAYAR: "BBK",
  TERIMA: "BBM",
  TRANSFER: "TKB",
  PAYMENT: "PMB",
};

export function planCashJournal(
  kind: UiCashKind,
  a: PlanArgs
): CashEntryPlan {
  if (a.cashAccountId === a.counterAccountId)
    throw new CashValidationError("AKUN_SAMA");
  if (!a.cashIsCash) throw new CashValidationError("BUKAN_AKUN_KAS");
  if (kind === "TRANSFER") {
    if (!a.counterIsCash)
      throw new CashValidationError("TRANSFER_HARUS_ANTAR_KAS");
    return {
      debitAccountId: a.counterAccountId,
      creditAccountId: a.cashAccountId,
      memo: a.memo,
    };
  }
  if (kind === "BAYAR")
    return {
      debitAccountId: a.counterAccountId,
      creditAccountId: a.cashAccountId,
      memo: a.memo,
    };
  return {
    debitAccountId: a.cashAccountId,
    creditAccountId: a.counterAccountId,
    memo: a.memo,
  };
}

export function cashNumber(
  kind: UiCashKind,
  year: string,
  seq: number
): string {
  return `${CASH_KIND_PREFIX[kind]}-${year}-${String(seq).padStart(4, "0")}`;
}
