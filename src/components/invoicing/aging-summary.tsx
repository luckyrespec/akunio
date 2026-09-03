"use client";

import * as React from "react";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle, ShieldAlert, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AgingItem {
  invoiceId: string;
  invoiceNumber: string;
  contactName: string;
  dueDate: string;
  daysOverdue: number;
  outstandingMinor: bigint;
  bucket: "CURRENT" | "1_30" | "31_60" | "OVER_60";
}

export interface AgingSummaryProps {
  currentMinor: bigint;
  days1To30Minor: bigint;
  days31To60Minor: bigint;
  daysOver60Minor: bigint;
  totalOutstandingMinor: bigint;
  itemized?: AgingItem[];
  onSendReminder?: (item: AgingItem) => void;
}

export function AgingSummary({
  currentMinor,
  days1To30Minor,
  days31To60Minor,
  daysOver60Minor,
  totalOutstandingMinor,
  itemized = [],
  onSendReminder,
}: AgingSummaryProps) {
  return (
    <div className="space-y-6">
      {/* 4 Aging Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Belum Jatuh Tempo */}
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Lancar (Belum Tempo)</span>
            <CheckCircle className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-display font-semibold text-ink">
            {Money.fromMinor(currentMinor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Jatuh tempo di masa datang</div>
        </div>

        {/* 1 - 30 Hari */}
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">1 – 30 Hari</span>
            <Clock className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-display font-semibold text-ink">
            {Money.fromMinor(days1To30Minor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Lewat tempo ringan</div>
        </div>

        {/* 31 - 60 Hari */}
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">31 – 60 Hari</span>
            <AlertTriangle className="size-4 text-orange-600" />
          </div>
          <div className="mt-2 text-xl font-display font-semibold text-ink">
            {Money.fromMinor(days31To60Minor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Perlu follow-up aktif</div>
        </div>

        {/* > 60 Hari */}
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">&gt; 60 Hari</span>
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <div className="mt-2 text-xl font-display font-semibold text-ink text-destructive">
            {Money.fromMinor(daysOver60Minor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Risiko kredit macet</div>
        </div>
      </div>

      {/* Itemized Breakdown Table */}
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Daftar Tagihan Beredar</h3>
            <p className="text-xs text-ink-soft">Rincian faktur yang belum lunas dikelompokkan berdasarkan umur tagihan</p>
          </div>
          <Badge variant="outline" className="border-rule text-xs">
            Total: {Money.fromMinor(totalOutstandingMinor).formatIdr()}
          </Badge>
        </div>

        {itemized.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-soft">
            Tidak ada faktur beredar yang belum lunas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-rule bg-canvas/50 text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nomor Faktur</th>
                  <th className="px-4 py-2.5 font-medium">Mitra / Kontak</th>
                  <th className="px-4 py-2.5 font-medium">Jatuh Tempo</th>
                  <th className="px-4 py-2.5 font-medium">Keterlambatan</th>
                  <th className="px-4 py-2.5 font-medium">Kategori Umur</th>
                  <th className="px-4 py-2.5 font-medium text-right">Sisa Tagihan</th>
                  <th className="px-4 py-2.5 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {itemized.map((item) => (
                  <tr key={item.invoiceId} className="hover:bg-canvas/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink font-mono">{item.invoiceNumber}</td>
                    <td className="px-4 py-3 text-ink">{item.contactName}</td>
                    <td className="px-4 py-3 text-ink-soft">{item.dueDate}</td>
                    <td className="px-4 py-3">
                      {item.daysOverdue > 0 ? (
                        <span className="text-destructive font-medium">{item.daysOverdue} hari</span>
                      ) : (
                        <span className="text-emerald-700">Tepat waktu</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.bucket === "CURRENT" && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 bg-emerald-50/50">
                          Lancar
                        </Badge>
                      )}
                      {item.bucket === "1_30" && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-50/50">
                          1–30 Hari
                        </Badge>
                      )}
                      {item.bucket === "31_60" && (
                        <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-700 bg-orange-50/50">
                          31–60 Hari
                        </Badge>
                      )}
                      {item.bucket === "OVER_60" && (
                        <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/10">
                          &gt;60 Hari
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {Money.fromMinor(item.outstandingMinor).formatIdr()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {onSendReminder && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-rule text-ink hover:text-emerald-700"
                          onClick={() => onSendReminder(item)}
                        >
                          <MessageSquare className="size-3.5 mr-1 text-emerald-600" />
                          Ingatkan WA
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
