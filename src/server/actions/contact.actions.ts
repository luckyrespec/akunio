"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  createContactRepo,
  updateContactRepo,
  listContactsRepo,
  getContactByIdRepo,
  type CreateContactInput,
  type UpdateContactInput,
} from "@/server/db/repos/contacts.repo";
import { type ContactType } from "@/server/db/schema/invoicing";

export async function createContactAction(input: CreateContactInput) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const contact = await createContactRepo(db, ctx.orgId, input);
    revalidatePath("/kontak");
    return { ok: true as const, data: contact };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambahkan kontak." };
  }
}

export async function updateContactAction(id: string, input: UpdateContactInput) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const updated = await updateContactRepo(db, ctx.orgId, id, input);
    revalidatePath("/kontak");
    return { ok: true as const, data: updated };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memperbarui kontak." };
  }
}

export async function listContactsAction(filter?: { type?: ContactType | "ALL"; search?: string }) {
  try {
    const ctx = await requireContext();
    const data = await listContactsRepo(db, ctx.orgId, filter);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat kontak." };
  }
}

export async function getContactAction(id: string) {
  try {
    const ctx = await requireContext();
    const data = await getContactByIdRepo(db, ctx.orgId, id);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat detail kontak." };
  }
}

/**
 * Rincian satu kontak untuk sheet drawer (dipakai chat Akunio + reusable).
 * Dipetakan ke primitif serial agar aman untuk Server Action.
 */
export async function getContactDetailAction(id: string) {
  try {
    const ctx = await requireContext();
    const clean = id.trim();
    if (!clean) return { ok: false as const, error: "Id kontak kosong." };
    const c = await getContactByIdRepo(db, ctx.orgId, clean);
    if (!c || c.orgId !== ctx.orgId) return { ok: false as const, error: "Kontak tidak ditemukan." };
    return {
      ok: true as const,
      data: {
        id: c.id,
        type: c.type,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        taxId: c.taxId,
        paymentTermsDays: c.paymentTermsDays,
        notes: c.notes,
      },
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat detail kontak." };
  }
}
