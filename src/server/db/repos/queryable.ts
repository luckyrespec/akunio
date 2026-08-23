import type { db } from "@/server/db";

export type Queryable = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
