import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { memberships, organizations } from "@/server/db/schema/org";
import { user } from "@/server/db/schema/auth";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getInventorySettings } from "@/server/db/repos/inventory.repo";
import { getTaxSettings } from "@/server/db/repos/tax.repo";
import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function PengaturanPage() {
  const ctx = await requireContext();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const orgSettings = (org?.settings ?? {}) as { aiHitlPolicy?: "smart" | "strict" | "autonomous" };

  const data = await db.transaction(async (tx) => {
    const accounts = await listAccounts(tx, ctx.orgId);
    const periods = await listPeriods(tx, ctx.orgId);
    const invSettings = await getInventorySettings(tx, ctx.orgId);
    const taxSettings = await getTaxSettings(tx, ctx.orgId);
    const members = await tx
      .select({ email: user.email, role: memberships.role })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(memberships.createdAt);
    return { accounts, periods, members, invSettings, taxSettings };
  });

  return (
    <SettingsClient
      organization={{
        id: org?.id ?? ctx.orgId,
        name: org?.name ?? "Organisasi Saya",
        baseCurrency: org?.baseCurrency ?? "IDR",
        fiscalYearStartMonth: org?.fiscalYearStartMonth ?? 1,
        aiHitlPolicy: orgSettings.aiHitlPolicy,
      }}
      accounts={data.accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        normal: a.normal,
        parentCode: a.parentCode,
        isCash: a.isCash,
        isBank: a.isBank,
        contra: a.contra,
        archivedAt: a.archivedAt,
      }))}
      periods={data.periods.map((p) => ({
        id: p.id,
        name: p.name,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        status: p.status as "OPEN" | "CLOSED" | "LOCKED",
      }))}
      inventorySettings={
        data.invSettings
          ? {
              valuationMethod: data.invSettings.valuationMethod as "WEIGHTED_AVERAGE" | "FIFO",
              recordingMethod: data.invSettings.recordingMethod as "PERPETUAL" | "PERIODIC",
              inventoryAccountId: data.invSettings.inventoryAccountId,
              cogsAccountId: data.invSettings.cogsAccountId,
              adjustmentLossAccountId: data.invSettings.adjustmentLossAccountId,
              adjustmentGainAccountId: data.invSettings.adjustmentGainAccountId,
              isLocked: data.invSettings.isLocked,
            }
          : null
      }
      taxSettings={data.taxSettings}
      members={data.members.map((m) => ({
        email: m.email,
        role: m.role as "OWNER" | "ACCOUNTANT" | "VIEWER",
      }))}
      userRole={ctx.role}
    />
  );
}
