import { sql } from "drizzle-orm";
import { db } from "@/server/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
