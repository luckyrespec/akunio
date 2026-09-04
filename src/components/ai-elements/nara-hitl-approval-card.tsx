"use client";

import * as React from "react";
import { Check, X, Loader2 } from "lucide-react";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import type { PendingApproval } from "@/hooks/use-nara-stream-chat";

interface NaraHitlApprovalCardProps {
  pendingApproval: PendingApproval;
  confirmingLoading: boolean;
  onDecision: (approved: boolean, allowAll?: boolean) => void;
}

export function NaraHitlApprovalCard({
  pendingApproval,
  confirmingLoading,
  onDecision,
}: NaraHitlApprovalCardProps) {
  return (
    <div className="my-3 max-w-xl mx-auto w-full">
      <Confirmation status="pending">
        <ConfirmationTitle>
          Konfirmasi Aksi: {pendingApproval.toolName.replace(/_/g, " ").toUpperCase()}
        </ConfirmationTitle>
        <ConfirmationRequest>
          <p className="font-sans text-xs text-ink">{pendingApproval.explanation}</p>
          {pendingApproval.toolName === "post_journal" &&
          Array.isArray((pendingApproval.args as Record<string, unknown>).lines) ? (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between text-xs text-ink-soft gap-2">
                <span>
                  Keterangan:{" "}
                  <strong className="text-ink">
                    {String((pendingApproval.args as Record<string, unknown>).memo ?? "")}
                  </strong>
                </span>
                <span>
                  Tanggal:{" "}
                  <strong className="text-ink">
                    {String((pendingApproval.args as Record<string, unknown>).dateISO ?? "")}
                  </strong>
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-rule bg-canvas">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-canvas/80 border-b border-rule text-ink-soft text-[11px]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Akun</th>
                      <th className="px-3 py-1.5 font-medium text-right">Debit</th>
                      <th className="px-3 py-1.5 font-medium text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {(
                      (pendingApproval.args as Record<string, unknown>).lines as Array<
                        Record<string, unknown>
                      >
                    ).map((l, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5">
                          <span className="font-semibold text-terra">
                            {String(l.accountCode ?? "")}
                          </span>
                          {l.memo ? <span className="text-ink-soft ml-1.5">({String(l.memo)})</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">
                          {l.debit && l.debit !== "0"
                            ? `Rp ${Number(l.debit).toLocaleString("id-ID")}`
                            : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">
                          {l.credit && l.credit !== "0"
                            ? `Rp ${Number(l.credit).toLocaleString("id-ID")}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : pendingApproval.toolName === "create_invoice" ? (
            <div className="rounded-xl bg-canvas p-3 text-xs space-y-1.5 border border-rule text-ink">
              <div>
                Pelanggan:{" "}
                <strong className="text-terra">
                  {String((pendingApproval.args as Record<string, unknown>).customerName ?? "")}
                </strong>
              </div>
              <div>
                Jatuh Tempo:{" "}
                <strong>
                  {String((pendingApproval.args as Record<string, unknown>).dueDate ?? "")}
                </strong>
              </div>
              {Array.isArray((pendingApproval.args as Record<string, unknown>).items) && (
                <div className="text-[11px] text-ink-soft pt-1 border-t border-rule/50">
                  {
                    ((pendingApproval.args as Record<string, unknown>).items as unknown[]).length
                  }{" "}
                  item barang / jasa terdaftar
                </div>
              )}
            </div>
          ) : pendingApproval.toolName === "add_inventory_item" ? (
            <div className="rounded-xl bg-canvas p-3.5 text-xs space-y-2 border border-rule text-ink">
              <div className="flex items-center justify-between pb-2 border-b border-rule/50">
                <div>
                  <span className="text-[11px] font-mono text-ink-soft uppercase">Kode SKU</span>
                  <div className="font-mono font-bold text-terra text-sm">
                    {String((pendingApproval.args as Record<string, unknown>).code ?? "")}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono text-ink-soft uppercase">Satuan</span>
                  <div className="font-medium text-ink">
                    {String((pendingApproval.args as Record<string, unknown>).unit ?? "Pcs")}
                  </div>
                </div>
              </div>
              <div className="font-semibold text-sm text-ink">
                {String((pendingApproval.args as Record<string, unknown>).name ?? "")}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-rule/50">
                <div>
                  <span className="text-[11px] text-ink-soft">Stok Awal:</span>{" "}
                  <strong className="font-mono">
                    {String((pendingApproval.args as Record<string, unknown>).initialQty ?? 0)}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-ink-soft">Kategori:</span>{" "}
                  <strong>
                    {String((pendingApproval.args as Record<string, unknown>).category ?? "-")}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-ink-soft">Harga Modal:</span>{" "}
                  <strong className="font-mono">
                    Rp {Number((pendingApproval.args as Record<string, unknown>).initialCostText || 0).toLocaleString("id-ID")}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-ink-soft">Harga Jual:</span>{" "}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                    Rp {Number((pendingApproval.args as Record<string, unknown>).standardSellingPriceText || 0).toLocaleString("id-ID")}
                  </strong>
                </div>
              </div>
            </div>
          ) : pendingApproval.toolName === "batch_add_inventory_items" &&
            Array.isArray((pendingApproval.args as Record<string, unknown>).items) ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-ink-soft">
                <span>
                  Total Barang:{" "}
                  <strong className="text-ink">
                    {((pendingApproval.args as Record<string, unknown>).items as unknown[]).length} SKU
                  </strong>
                </span>
                {Boolean((pendingApproval.args as Record<string, unknown>).sourceFileName) && (
                  <span className="text-[11px] font-mono">
                    Sumber: {String((pendingApproval.args as Record<string, unknown>).sourceFileName)}
                  </span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-rule bg-canvas">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-canvas/90 border-b border-rule text-ink-soft text-[11px] sticky top-0">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">SKU</th>
                      <th className="px-2.5 py-1.5 font-medium">Nama Barang</th>
                      <th className="px-2.5 py-1.5 font-medium text-right">Stok</th>
                      <th className="px-2.5 py-1.5 font-medium text-right">Modal</th>
                      <th className="px-2.5 py-1.5 font-medium text-right">Jual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {(
                      (pendingApproval.args as Record<string, unknown>).items as Array<
                        Record<string, unknown>
                      >
                    ).map((it, idx) => (
                      <tr key={idx} className="hover:bg-paper/50">
                        <td className="px-2.5 py-1.5 font-semibold text-terra">
                          {String(it.code ?? "")}
                        </td>
                        <td className="px-2.5 py-1.5 font-sans truncate max-w-[150px]">
                          {String(it.name ?? "")}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {String(it.initialQty ?? 0)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {it.initialCostText ? `Rp ${Number(it.initialCostText).toLocaleString("id-ID")}` : "-"}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {it.standardSellingPriceText ? `Rp ${Number(it.standardSellingPriceText).toLocaleString("id-ID")}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed border border-rule text-ink">
              {JSON.stringify(pendingApproval.args, null, 2)}
            </div>
          )}
        </ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction
            variant="default"
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            disabled={confirmingLoading}
            onClick={() => onDecision(true, false)}
          >
            {confirmingLoading ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <Check className="size-3 mr-1" />
            )}
            Setujui & Jalankan
          </ConfirmationAction>

          <ConfirmationAction
            variant="outline"
            className="border-rule text-ink hover:bg-canvas"
            disabled={confirmingLoading}
            onClick={() => onDecision(true, true)}
          >
            Selalu Izinkan di Sesi Ini
          </ConfirmationAction>

          <ConfirmationAction
            variant="destructive"
            disabled={confirmingLoading}
            onClick={() => onDecision(false, false)}
          >
            <X className="size-3 mr-1" />
            Tolak
          </ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}
