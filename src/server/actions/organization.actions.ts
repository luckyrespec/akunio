"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { organizations } from "@/server/db/schema/org";
import { upsertProfile } from "@/server/db/repos/onboarding.repo";

export async function updateOrganizationProfileAction(payload: {
  name: string;
  businessName?: string | null;
  city?: string | null;
  address?: string | null;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const name = payload.name.trim();
    if (!name) return { ok: false as const, error: "Nama organisasi wajib diisi." };
    if (name.length > 120) return { ok: false as const, error: "Nama organisasi maksimal 120 karakter." };
    const address = (payload.address ?? "").trim();
    if (address.length > 500) return { ok: false as const, error: "Alamat maksimal 500 karakter." };

    await withOrg(ctx.orgId, async (tx) => {
      await tx
        .update(organizations)
        .set({ name })
        .where(eq(organizations.id, ctx.orgId));
      await upsertProfile(tx, ctx.orgId, {
        businessName: (payload.businessName ?? "").trim() || null,
        city: (payload.city ?? "").trim() || null,
        address: address || null,
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui profil organisasi";
    return { ok: false as const, error: message };
  }
}
