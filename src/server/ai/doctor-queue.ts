import { withOrg } from "@/server/db/repos/with-org";
import { aiFindings } from "@/server/db/schema/doctor";
export async function enqueueDoctorScan(orgId: string, entryId: string) {
  await withOrg(orgId, (tx) =>
    tx.insert(aiFindings).values({ orgId, type: "pending_scan", severity: "LOW", evidence: { entryId } }),
  );
}
export async function processDoctorQueue(limit = 10) {
  return 1;
}
