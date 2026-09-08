import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { organizations } from "@/server/db/schema/org";
import { InvoicePrintView } from "@/components/invoicing/invoice-print-view";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

// Kata reserved dari eksperimen route dedicated — arahkan ke tab.
const RESERVED_REDIRECT: Record<string, string> = {
  piutang: "/faktur",
  utang: "/faktur?tab=utang",
  aging: "/faktur?tab=aging",
  "analisis-umur": "/faktur?tab=aging",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;

  const reserved = RESERVED_REDIRECT[id.toLowerCase()];
  if (reserved) redirect(reserved);
  // id faktur selalu uuid — selain itu 404 bersih, bukan 500 dari Postgres.
  if (!UUID_RE.test(id)) notFound();

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
