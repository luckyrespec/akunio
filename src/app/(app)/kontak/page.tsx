import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { ContactDirectory } from "@/components/contacts/contact-directory";

export default async function KontakPage() {
  const ctx = await requireContext();
  const contactsList = await listContactsRepo(db, ctx.orgId);

  return (
    <div className="space-y-6">
      <ContactDirectory initialContacts={contactsList} />
    </div>
  );
}
