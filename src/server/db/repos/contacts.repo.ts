import { Db } from "../index";
import type { Queryable } from "./queryable";
import { contacts, type ContactType } from "../schema/invoicing";
import { eq, and, desc, sql, ilike } from "drizzle-orm";

export interface CreateContactInput {
  type: ContactType;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  paymentTermsDays?: number;
  notes?: string | null;
}

export interface UpdateContactInput {
  type?: ContactType;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  paymentTermsDays?: number;
  notes?: string | null;
}

export async function createContactRepo(q: Queryable, orgId: string, input: CreateContactInput) {
  const [created] = await q
    .insert(contacts)
    .values({
      orgId,
      type: input.type,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      notes: input.notes ?? null,
    })
    .returning();

  return created;
}

export async function updateContactRepo(
  q: Queryable,
  orgId: string,
  id: string,
  input: UpdateContactInput
) {
  const [updated] = await q
    .update(contacts)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)))
    .returning();

  return updated ?? null;
}

export async function getContactByIdRepo(q: Queryable, orgId: string, id: string) {
  const [row] = await q
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)));

  return row ?? null;
}

export async function findContactByNameRepo(q: Queryable, orgId: string, name: string) {
  const [row] = await q
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), ilike(contacts.name, `%${name}%`)))
    .limit(1);

  return row ?? null;
}

export async function listContactsRepo(
  q: Queryable,
  orgId: string,
  filter?: { type?: ContactType | "ALL"; search?: string }
) {
  const conditions = [eq(contacts.orgId, orgId)];

  if (filter?.type && filter.type !== "ALL") {
    conditions.push(eq(contacts.type, filter.type));
  }

  if (filter?.search) {
    conditions.push(ilike(contacts.name, `%${filter.search}%`));
  }

  return q
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(desc(contacts.createdAt));
}
