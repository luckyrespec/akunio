import { db } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import {
  createAccount,
  updateAccount,
  setAccountArchived,
  listAccounts as listAccountsRepo,
} from "@/server/db/repos/accounts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import type { ToolDefinition, ToolHandler } from "./types";

export const coaToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "list_accounts",
    description: "Tampilkan bagan akun (Chart of Accounts/COA) aktif organisasi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "create_account",
    description: "Tambahkan akun baru ke bagan akun (COA).",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun unik, misal: 6-1050" },
        name: { type: "string", description: "Nama akun" },
        type: {
          type: "string",
          enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
        },
        normal: { type: "string", enum: ["D", "K"] },
        parentCode: { type: "string", description: "Kode akun induk (opsional)" },
      },
      required: ["code", "name", "type", "normal"],
    },
  },
  {
    type: "function",
    name: "update_account",
    description: "Ubah nama akun atau kode induk akun COA.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun yang ingin diubah" },
        name: { type: "string", description: "Nama baru akun" },
        parentCode: { type: "string", description: "Kode akun induk baru" },
      },
      required: ["code"],
    },
  },
  {
    type: "function",
    name: "archive_account",
    description: "Arsipkan atau aktifkan kembali akun dari COA.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun" },
        archive: { type: "boolean", description: "true untuk arsipkan, false untuk pulihkan" },
      },
      required: ["code", "archive"],
    },
  },
];

export const coaHandlers: Record<string, ToolHandler> = {
  list_accounts: async (orgId) => {
    const accs = await listAccountsRepo(db, orgId);
    return {
      success: true,
      data: accs.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        normal: a.normal,
        archived: Boolean(a.archivedAt),
      })),
    };
  },

  create_account: async (orgId, _actorEmail, args) => {
    const code = String(args.code ?? "").trim();
    const name = String(args.name ?? "").trim();
    const type = String(args.type) as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
    const normal = String(args.normal) === "K" ? "K" : "D";
    const parentCode = args.parentCode ? String(args.parentCode) : undefined;

    const res = await db.transaction(async (tx) => {
      const acc = await createAccount(tx, {
        orgId,
        code,
        name,
        type,
        normal,
        parentCode,
      });
      await appendAudit(tx, {
        orgId,
        actor: "nara",
        action: "NARA_CREATE_ACCOUNT",
        subjectType: "account",
        subjectId: acc.id,
        data: { code, name, type },
      });
      return acc;
    });

    return { success: true, data: { id: res.id, code: res.code, name: res.name } };
  },

  update_account: async (orgId, _actorEmail, args) => {
    const code = String(args.code ?? "").trim();
    const accRows = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
    const target = accRows[0];
    if (!target) return { success: false, error: `Akun dengan kode ${code} tidak ditemukan.` };

    const name = args.name ? String(args.name) : undefined;
    const parentCode = args.parentCode !== undefined ? (args.parentCode ? String(args.parentCode) : null) : undefined;

    const res = await db.transaction(async (tx) => {
      const upd = await updateAccount(tx, orgId, target.id, { name, parentCode });
      await appendAudit(tx, {
        orgId,
        actor: "nara",
        action: "NARA_UPDATE_ACCOUNT",
        subjectType: "account",
        subjectId: upd.id,
        data: { code: upd.code, name: upd.name },
      });
      return upd;
    });

    return { success: true, data: { code: res.code, name: res.name } };
  },

  archive_account: async (orgId, _actorEmail, args) => {
    const code = String(args.code ?? "").trim();
    const archive = Boolean(args.archive);
    const accRows = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
    const target = accRows[0];
    if (!target) return { success: false, error: `Akun dengan kode ${code} tidak ditemukan.` };

    const res = await db.transaction(async (tx) => {
      const upd = await setAccountArchived(tx, orgId, target.id, archive ? new Date() : null);
      await appendAudit(tx, {
        orgId,
        actor: "nara",
        action: archive ? "NARA_ARCHIVE_ACCOUNT" : "NARA_RESTORE_ACCOUNT",
        subjectType: "account",
        subjectId: upd.id,
        data: { code: upd.code },
      });
      return upd;
    });

    return { success: true, data: { code: res.code, archived: Boolean(res.archivedAt) } };
  },
};
