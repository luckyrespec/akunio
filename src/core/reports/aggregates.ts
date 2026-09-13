import type { AccountType, NormalBalance } from "@/core/accounts/types";

export interface LedgerLine {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface ReportAccountMeta {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
  contra?: boolean;
  isCash?: boolean;
  isBank?: boolean;
}

export interface AccountAggregate {
  meta: ReportAccountMeta;
  debitMinor: bigint;
  creditMinor: bigint;
}

export function aggregateFromLines(
  lines: readonly LedgerLine[],
  metasById: Map<string, ReportAccountMeta>,
): AccountAggregate[] {
  const byId = new Map<string, AccountAggregate>();
  for (const l of lines) {
    const meta = metasById.get(l.accountId);
    if (!meta) throw new Error(`AKUN_TIDAK_DIKENAL: ${l.accountId}`);
    let a = byId.get(l.accountId);
    if (!a) { a = { meta, debitMinor: 0n, creditMinor: 0n }; byId.set(l.accountId, a); }
    a.debitMinor += l.debitMinor;
    a.creditMinor += l.creditMinor;
  }
  return [...byId.values()];
}

export function signed(
  meta: ReportAccountMeta,
  a: { debitMinor: bigint; creditMinor: bigint },
): bigint {
  const net = meta.normal === "D" ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor;
  return meta.contra ? -net : net;
}
