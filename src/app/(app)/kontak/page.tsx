import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { ContactDirectory } from "@/components/contacts/contact-directory";
import { KontakImportCard } from "./kontak-import-card";

export default async function KontakPage() {
  const ctx = await requireContext();
  const contactsList = await withOrg(ctx.orgId, (tx) => listContactsRepo(tx, ctx.orgId));

  return (
    <div className="space-y-6">
      <KontakImportCard />
      <ContactDirectory initialContacts={contactsList} />
    </div>
  );
}
