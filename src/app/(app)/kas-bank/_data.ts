import { withOrg } from "@/server/db/repos/with-org";
import {
  getCashSummaryRepo,
  listCashEntriesRepo,
} from "@/server/db/repos/cash-bank.repo";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { accounts } from "@/server/db/schema/org";
import type { CashKind } from "@/server/db/schema/cash-bank";
import { eq } from "drizzle-orm";

export function currentMonthRange(d = new Date()): {
  dari: string;
  sampai: string;
  label: string;
} {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  const label = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(d);
  return {
    dari: `${y}-${m}-01`,
    sampai: `${y}-${m}-${last}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

export async function loadCashPageData(orgId: string, kind: CashKind) {
  const range = currentMonthRange();
  const [entries, allAccounts, contacts, summary] = await withOrg(orgId, (tx) =>
    Promise.all([
      listCashEntriesRepo(tx, orgId, kind),
      tx
        .select({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          parentCode: accounts.parentCode,
          isCash: accounts.isCash,
        })
        .from(accounts)
        .where(eq(accounts.orgId, orgId)),
      listContactsRepo(tx, orgId),
      getCashSummaryRepo(tx, orgId, kind, range.dari, range.sampai),
    ]),
  );
  const parentCodes = new Set(
    allAccounts.map((a) => a.parentCode).filter((c): c is string => !!c)
  );
  const leaf = allAccounts.filter((a) => !parentCodes.has(a.code));
  return {
    entries,
    leaf,
    cashAccounts: leaf.filter((a) => a.isCash),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name })),
    summary,
    monthLabel: range.label,
  };
}
