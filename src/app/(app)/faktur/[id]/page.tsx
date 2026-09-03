import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { organizations } from "@/server/db/schema/org";
import { InvoicePrintView } from "@/components/invoicing/invoice-print-view";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const ctx = await requireContext();

  const [inv, [org]] = await Promise.all([
    getInvoiceByIdRepo(db, ctx.orgId, id),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.orgId)),
  ]);

  if (!inv) {
    notFound();
  }

  const detailData = {
    ...inv,
    orgName: org?.name || "Perusahaan",
  };

  return (
    <div className="py-2">
      <InvoicePrintView invoice={detailData} />
    </div>
  );
}
