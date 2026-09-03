"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/core/money/money";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  CreditCard,
  BookOpen,
  Loader2,
} from "lucide-react";
import { postInvoiceToJournalAction } from "@/server/actions/invoice.actions";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@/server/db/schema/invoicing";

export interface InvoiceRow {
  id: string;
  type: string;
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  contactPhone?: string | null;
  issueDate: string;
  dueDate: string;
  totalMinor: bigint;
  amountPaidMinor: bigint;
  status: InvoiceStatus;
  journalEntryId?: string | null;
}

interface InvoiceListProps {
  invoices: InvoiceRow[];
  onOpenPayment: (inv: InvoiceRow) => void;
}

export function InvoiceList({ invoices, onOpenPayment }: InvoiceListProps) {
  const router = useRouter();
  const [postingId, setPostingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handlePostJournal(id: string) {
    setPostingId(id);
    setError(null);
    try {
      const res = await postInvoiceToJournalAction(id);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memposting faktur.");
    } finally {
      setPostingId(null);
    }
  }

  function handleWhatsAppReminder(inv: InvoiceRow) {
    const remainingMinor = inv.totalMinor - inv.amountPaidMinor;
    const { waLink } = formatWhatsAppReminder(
      { name: inv.contactName, phone: inv.contactPhone },
      { invoiceNumber: inv.invoiceNumber, dueDate: inv.dueDate, remainingMinor }
    );
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-soft">
            <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
            <p>Belum ada data faktur atau tagihan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-rule bg-canvas/50 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Nomor Faktur</th>
                  <th className="px-4 py-3 font-medium">Mitra / Kontak</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Total Tagihan</th>
                  <th className="px-4 py-3 font-medium text-right">Sisa Tagihan</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {invoices.map((inv) => {
                  const remainingMinor = inv.totalMinor - inv.amountPaidMinor;
                  const isPaid = inv.status === "PAID";
                  return (
                    <tr key={inv.id} className="hover:bg-canvas/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink font-mono">
                        <Link
                          href={`/faktur/${inv.id}`}
                          className="hover:text-terra transition-colors underline-offset-2 hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink font-medium">{inv.contactName}</td>
                      <td className="px-4 py-3 text-ink-soft">{inv.issueDate}</td>
                      <td className="px-4 py-3 text-ink-soft">{inv.dueDate}</td>
                      <td className="px-4 py-3">
                        {inv.status === "PAID" && (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[10px]">
                            <CheckCircle2 className="size-3 mr-1" />
                            Lunas
                          </Badge>
                        )}
                        {inv.status === "PARTIALLY_PAID" && (
                          <Badge variant="outline" className="border-amber-500/30 text-amber-700 bg-amber-50/50 text-[10px]">
                            <Clock className="size-3 mr-1" />
                            Cicil / Parsial
                          </Badge>
                        )}
                        {inv.status === "OVERDUE" && (
                          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 text-[10px]">
                            <AlertCircle className="size-3 mr-1" />
                            Jatuh Tempo
                          </Badge>
                        )}
                        {inv.status === "ISSUED" && (
                          <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-50/50 text-[10px]">
                            Belum Bayar
                          </Badge>
                        )}
                        {inv.status === "DRAFT" && (
                          <Badge variant="outline" className="border-rule text-ink-soft text-[10px]">
                            Draft
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink">
                        {Money.fromMinor(inv.totalMinor).formatIdr()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Post to GL button if not posted */}
                          {!inv.journalEntryId && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={postingId === inv.id}
                              onClick={() => handlePostJournal(inv.id)}
                              className="h-7 text-[11px] border-rule text-ink-soft hover:text-ink"
                              title="Posting jurnal umum ke buku besar"
                            >
                              {postingId === inv.id ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : (
                                <BookOpen className="size-3 mr-1 text-terra" />
                              )}
                              Posting
                            </Button>
                          )}

                          {/* Record Payment Button */}
                          {!isPaid && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenPayment(inv)}
                              className="h-7 text-[11px] border-emerald-600/30 text-emerald-700 hover:bg-emerald-50/60"
                              title="Catat penerimaan atau pelunasan pembayaran"
                            >
                              <CreditCard className="size-3 mr-1" />
                              Bayar
                            </Button>
                          )}

                          {/* WhatsApp Reminder (for sales invoices) */}
                          {inv.type === "INVOICE" && !isPaid && inv.contactPhone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleWhatsAppReminder(inv)}
                              className="h-7 px-2 text-emerald-600 hover:bg-emerald-50"
                              title="Kirim pengingat WhatsApp ke pelanggan"
                            >
                              <MessageSquare className="size-3.5" />
                            </Button>
                          )}

                          {/* View Print Button */}
                          <Link href={`/faktur/${inv.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-ink-soft hover:text-ink"
                              title="Lihat & Cetak Faktur"
                            >
                              <FileText className="size-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
