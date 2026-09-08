import { db } from "@/server/db";
import {
  createContactRepo,
  findContactByNameRepo,
  getContactByIdRepo,
  listContactsRepo,
  updateContactRepo,
} from "@/server/db/repos/contacts.repo";
import type { ToolDefinition, ToolHandler } from "./types";

function toPublic(c: {
  id: string;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
}) {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    email: c.email,
    phone: c.phone,
    paymentTermsDays: c.paymentTermsDays,
  };
}

export const contactsToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "list_contacts",
    description:
      "Ambil daftar kontak (pelanggan/pemasok) beserta termin pembayarannya. Gunakan sebelum menyebut atau memilih kontak.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter tipe: CUSTOMER, VENDOR, BOTH, atau ALL (default ALL)",
        },
        search: { type: "string", description: "Filter kata kunci nama kontak (opsional)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "find_contact",
    description:
      "Cari satu kontak berdasarkan nama (cocok sebagian) atau id. Wajib dipanggil sebelum update_contact atau sebelum menyebut kontak di mutasi lain agar id-nya pasti benar.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama kontak (boleh sebagian, misal: 'Budi')" },
        contactId: { type: "string", description: "Id kontak bila sudah diketahui (opsional)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "create_contact",
    description:
      "Daftarkan kontak pelanggan/pemasok baru. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "Tipe kontak: CUSTOMER, VENDOR, atau BOTH" },
        name: { type: "string", description: "Nama kontak" },
        email: { type: "string", description: "Email (opsional)" },
        phone: { type: "string", description: "Telepon (opsional)" },
        address: { type: "string", description: "Alamat (opsional)" },
        taxId: { type: "string", description: "NPWP (opsional)" },
        paymentTermsDays: { type: "number", description: "Termin hari (default 30)" },
        notes: { type: "string", description: "Catatan (opsional)" },
      },
      required: ["type", "name"],
    },
  },
  {
    type: "function",
    name: "update_contact",
    description:
      "Ubah data kontak yang sudah ada. Panggil find_contact dulu bila id belum pasti. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Id kontak yang diubah" },
        name: { type: "string", description: "Nama baru (opsional)" },
        email: { type: "string", description: "Email (opsional)" },
        phone: { type: "string", description: "Telepon (opsional)" },
        address: { type: "string", description: "Alamat (opsional)" },
        taxId: { type: "string", description: "NPWP (opsional)" },
        paymentTermsDays: { type: "number", description: "Termin hari (opsional)" },
        notes: { type: "string", description: "Catatan (opsional)" },
      },
      required: ["contactId"],
    },
  },
];

const CONTACT_TYPES = ["CUSTOMER", "VENDOR", "BOTH"] as const;

export const contactsHandlers: Record<string, ToolHandler> = {
  list_contacts: async (orgId, _actor, args) => {
    try {
      const rawType = String(args.type ?? "ALL").toUpperCase();
      const type = (CONTACT_TYPES as readonly string[]).includes(rawType)
        ? (rawType as (typeof CONTACT_TYPES)[number])
        : "ALL";
      const rows = await listContactsRepo(db, orgId, {
        type,
        search: args.search ? String(args.search) : undefined,
      });
      return {
        success: true,
        data: { totalCount: rows.length, contacts: rows.slice(0, 50).map(toPublic) },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengambil daftar kontak";
      return { success: false, error: message };
    }
  },

  find_contact: async (orgId, _actor, args) => {
    try {
      const contactId = String(args.contactId ?? "").trim();
      const name = String(args.name ?? "").trim();
      const found = contactId
        ? await getContactByIdRepo(db, orgId, contactId)
        : name
          ? await findContactByNameRepo(db, orgId, name)
          : null;
      if (!found) return { success: false, error: "Kontak tidak ditemukan." };
      return { success: true, data: { contact: toPublic(found) } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mencari kontak";
      return { success: false, error: message };
    }
  },

  create_contact: async (orgId, _actor, args) => {
    try {
      const type = String(args.type ?? "").toUpperCase();
      if (!(CONTACT_TYPES as readonly string[]).includes(type)) {
        return { success: false, error: "Tipe kontak harus CUSTOMER, VENDOR, atau BOTH." };
      }
      const name = String(args.name ?? "").trim();
      if (!name) return { success: false, error: "Nama kontak wajib diisi." };
      const terms =
        args.paymentTermsDays === undefined || args.paymentTermsDays === null
          ? undefined
          : Number(args.paymentTermsDays);
      if (terms !== undefined && (!Number.isFinite(terms) || terms < 0)) {
        return { success: false, error: "Termin hari harus angka >= 0." };
      }
      const created = await createContactRepo(db, orgId, {
        type: type as (typeof CONTACT_TYPES)[number],
        name,
        email: args.email ? String(args.email) : null,
        phone: args.phone ? String(args.phone) : null,
        address: args.address ? String(args.address) : null,
        taxId: args.taxId ? String(args.taxId) : null,
        paymentTermsDays: terms,
        notes: args.notes ? String(args.notes) : null,
      });
      return { success: true, data: { contact: toPublic(created) } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal membuat kontak";
      return { success: false, error: message };
    }
  },

  update_contact: async (orgId, _actor, args) => {
    try {
      const contactId = String(args.contactId ?? "").trim();
      if (!contactId) return { success: false, error: "contactId wajib diisi." };
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "email", "phone", "address", "taxId", "notes"] as const) {
        if (args[k] !== undefined && args[k] !== null && String(args[k]).trim() !== "") {
          patch[k] = String(args[k]).trim();
        }
      }
      if (args.type !== undefined && args.type !== null && String(args.type).trim() !== "") {
        const type = String(args.type).toUpperCase();
        if (!(CONTACT_TYPES as readonly string[]).includes(type)) {
          return { success: false, error: "Tipe kontak harus CUSTOMER, VENDOR, atau BOTH." };
        }
        patch.type = type;
      }
      if (args.paymentTermsDays !== undefined && args.paymentTermsDays !== null) {
        const terms = Number(args.paymentTermsDays);
        if (!Number.isFinite(terms) || terms < 0) {
          return { success: false, error: "Termin hari harus angka >= 0." };
        }
        patch.paymentTermsDays = terms;
      }
      if (Object.keys(patch).length === 0) {
        return { success: false, error: "Tidak ada field yang diubah." };
      }
      const updated = await updateContactRepo(db, orgId, contactId, patch);
      if (!updated) return { success: false, error: "Kontak tidak ditemukan." };
      return { success: true, data: { contact: toPublic(updated) } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengubah kontak";
      return { success: false, error: message };
    }
  },
};
