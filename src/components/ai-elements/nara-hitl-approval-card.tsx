"use client";

import * as React from "react";
import { Check, X, Loader2 } from "lucide-react";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import type { PendingApproval } from "@/hooks/use-nara-stream-chat";
import { Money } from "@/core/money/money";
import { terbilangRupiah } from "@/core/money/terbilang";

function formatRupiahInput(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const raw = String(value);
  try {
    return Money.parseIdr(raw).formatIdr();
  } catch {
    const n = Number(raw.replace(/[^0-9.-]+/g, ""));
    if (!Number.isFinite(n)) return raw;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }
}

/** Label Indonesia untuk kunci argumen tool yang umum. */
const FIELD_LABELS: Record<string, string> = {
  name: "Nama",
  customerName: "Pelanggan",
  code: "Kode",
  type: "Tipe",
  kind: "Jenis",
  phone: "Telepon",
  address: "Alamat",
  notes: "Catatan",
  note: "Catatan",
  memo: "Keterangan",
  explanation: "Penjelasan",
  dateISO: "Tanggal",
  entryDate: "Tanggal",
  opnameDate: "Tanggal",
  dueDate: "Jatuh Tempo",
  amountText: "Nominal",
  amount: "Nominal",
  reason: "Alasan",
  category: "Kategori",
  unit: "Satuan",
  accountCode: "Akun",
  entryId: "Jurnal",
  invoiceNumber: "Faktur",
  accountId: "Akun",
  cashAccountId: "Akun kas",
  counterAccountId: "Akun lawan",
  contactId: "Kontak",
  periodName: "Periode",
};

function prettyLabel(key: string): string {
  return (
    FIELD_LABELS[key] ??
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}

function isAmountKey(key: string): boolean {
  return /amount|nominal|total|price|cost|saldo/i.test(key);
}

function isIdKey(key: string): boolean {
  return /Id$/.test(key) && key !== "entryId" && key !== "invoiceNumber";
}

function prettyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value)) return `${value.length} item`;
  if (typeof value === "object") return "-";
  const raw = String(value);
  if (isAmountKey(key)) return formatRupiahInput(raw);
  if (isIdKey(key) && /^[0-9a-f-]{20,}$/i.test(raw)) return `${raw.slice(0, 8)}…`;
  return raw;
}

/** Fallback ramah: daftar field berlabel, bukan JSON mentah. */
function FieldList({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(
    ([k, v]) => k !== "itemsDetail" && k !== "items" && k !== "lines" && v !== null && v !== undefined && v !== "",
  );
  const itemsCount = Array.isArray(args.items) ? args.items.length : 0;
  if (entries.length === 0 && itemsCount === 0) return null;
  return (
    <div className="rounded-xl bg-canvas p-3 text-xs space-y-1.5 border border-rule text-ink">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-3">
          <span className="text-ink-soft shrink-0">{prettyLabel(k)}</span>
          <strong className="text-right font-medium text-ink break-words min-w-0">
            {prettyValue(k, v)}
          </strong>
        </div>
      ))}
      {itemsCount > 0 && (
        <div className="flex items-start justify-between gap-3">
          <span className="text-ink-soft shrink-0">Jumlah item</span>
          <strong className="text-right font-medium text-ink">{itemsCount} item</strong>
        </div>
      )}
    </div>
  );
}

/** Pratinjau faktur/tagihan di kartu persetujuan: pelanggan, tanggal, rincian barang. */
function InvoiceApprovalPreview({ args }: { args: Record<string, unknown> }) {
  const items = (Array.isArray(args.items) ? args.items : []) as Array<Record<string, unknown>>;
  const isBill = String(args.type ?? "").toUpperCase() === "BILL";
  let estimate = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? 1);
    const price = Number(it.unitPrice ?? 0);
    const disc = Number(it.discount ?? 0);
    if (Number.isFinite(qty) && Number.isFinite(price)) estimate += qty * price - (Number.isFinite(disc) ? disc : 0);
  }
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center justify-between text-xs text-ink-soft gap-2">
        <span>
          {isBill ? "Pemasok" : "Pelanggan"}:{" "}
          <strong className="text-terra">{String(args.customerName ?? "-")}</strong>
        </span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink border border-rule">
          {isBill ? "Tagihan Pembelian" : "Faktur Penjualan"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between text-xs text-ink-soft gap-2">
        <span>
          Jatuh Tempo: <strong className="text-ink">{String(args.dueDate ?? "-")}</strong>
        </span>
        {estimate > 0 && (
          <span>
            Estimasi Total:{" "}
            <strong className="font-mono text-ink">Rp{estimate.toLocaleString("id-ID")}</strong>
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-rule bg-canvas">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas/90 border-b border-rule text-ink-soft text-[11px] sticky top-0">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">Barang / Jasa</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Qty</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Harga</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {items.map((it, idx) => (
                <tr key={idx} className="hover:bg-paper/50">
                  <td className="px-2.5 py-1.5">
                    {String(it.description ?? "-")}
                    {Number(it.taxRate ?? 0) > 0 && (
                      <span className="text-ink-soft ml-1.5">(+PPN {String(it.taxRate)}%)</span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{String(it.quantity ?? "-")}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono">
                    {formatRupiahInput(it.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JournalLinesTable({ lines }: { lines: Array<Record<string, unknown>> }) {
  return (
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
          {lines.map((l, idx) => {
            const debit = l.debit ?? l.debitText;
            const credit = l.credit ?? l.creditText;
            return (
              <tr key={idx}>
                <td className="px-3 py-1.5">
                  <span className="font-semibold text-terra">
                    {String(l.accountCode ?? "")}
                  </span>
                  {l.memo ? <span className="text-ink-soft ml-1.5">({String(l.memo)})</span> : null}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {debit && debit !== "0" && debit !== 0 ? formatRupiahInput(debit) : "-"}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {credit && credit !== "0" && credit !== 0 ? formatRupiahInput(credit) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
  const decided = pendingApproval.decided ?? null;
  const locked = confirmingLoading || decided !== null;
  return (
    <div className="my-3 max-w-xl mx-auto w-full">
      <Confirmation status={decided ?? "pending"}>
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
              {(() => {
                const ps = (pendingApproval.args as Record<string, unknown>).periodStatus;
                if (typeof ps !== "string" || ps === "OPEN") return null;
                return (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    Periode {String((pendingApproval.args as Record<string, unknown>).periodName ?? "") || "terkait"} berstatus {ps} — posting kemungkinan ditolak. Ubah tanggal ke periode OPEN atau batalkan.
                  </p>
                );
              })()}
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
                          {l.debit && l.debit !== "0" && l.debit !== 0
                            ? formatRupiahInput(l.debit)
                            : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">
                          {l.credit && l.credit !== "0" && l.credit !== 0
                            ? formatRupiahInput(l.credit)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const total = (
                  (pendingApproval.args as Record<string, unknown>).lines as Array<
                    Record<string, unknown>
                  >
                ).reduce((acc, l) => {
                  try {
                    const v = l.debit && l.debit !== "0" && l.debit !== 0 ? Money.parseIdr(String(l.debit)).minor : 0n;
                    return acc + v;
                  } catch {
                    return acc;
                  }
                }, 0n);
                return total > 0n ? (
                  <p className="text-[11px] text-ink-soft">
                    Total <strong className="text-ink font-mono">{Money.fromMinor(total).formatIdr()}</strong>
                    {" "}— {terbilangRupiah(total)}
                  </p>
                ) : null;
              })()}
            </div>
          ) : pendingApproval.toolName === "create_invoice" ? (
            <InvoiceApprovalPreview args={pendingApproval.args as Record<string, unknown>} />
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
                    {formatRupiahInput((pendingApproval.args as Record<string, unknown>).initialCostText)}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-ink-soft">Harga Jual:</span>{" "}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatRupiahInput((pendingApproval.args as Record<string, unknown>).standardSellingPriceText)}
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
                          {it.initialCostText ? formatRupiahInput(it.initialCostText) : "-"}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {it.standardSellingPriceText ? formatRupiahInput(it.standardSellingPriceText) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : pendingApproval.toolName === "create_stock_opname" ? (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between text-xs text-ink-soft gap-2">
                <span>
                  Tanggal:{" "}
                  <strong className="text-ink">
                    {String((pendingApproval.args as Record<string, unknown>).opnameDate ?? "")}
                  </strong>
                </span>
                <span
                  className={
                    (pendingApproval.args as Record<string, unknown>).postImmediately !== false
                      ? "rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                      : "rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-soft border border-rule"
                  }
                >
                  {(pendingApproval.args as Record<string, unknown>).postImmediately !== false
                    ? "Langsung sahkan — stok bertambah"
                    : "Draft saja — tinjau di Persediaan"}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-rule bg-canvas">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas/90 border-b border-rule text-ink-soft text-[11px] sticky top-0">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">Kode</th>
                      <th className="px-2.5 py-1.5 font-medium">Nama Barang</th>
                      <th className="px-2.5 py-1.5 font-medium text-right">Fisik</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {(
                      (((pendingApproval.args as Record<string, unknown>).itemsDetail ??
                        (pendingApproval.args as Record<string, unknown>).items) as Array<
                        Record<string, unknown>
                      >) ?? []
                    ).map((it, idx) => (
                      <tr key={idx} className="hover:bg-paper/50">
                        <td className="px-2.5 py-1.5 font-mono font-semibold text-terra">
                          {String(it.code ?? it.itemId ?? "-")}
                        </td>
                        <td className="px-2.5 py-1.5 truncate max-w-[150px]">
                          {String(it.name ?? "-")}
                          {it.reason ? (
                            <span className="text-ink-soft ml-1.5">({String(it.reason)})</span>
                          ) : null}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {String(it.physicalQty ?? "-")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : pendingApproval.toolName === "create_journal_draft" &&
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
              <JournalLinesTable
                lines={
                  (pendingApproval.args as Record<string, unknown>).lines as Array<
                    Record<string, unknown>
                  >
                }
              />
              <p className="text-[11px] text-ink-soft">
                Draft saja — peninjauan dan posting dilakukan di menu Jurnal.
              </p>
            </div>
          ) : (
            <FieldList args={pendingApproval.args as Record<string, unknown>} />
          )}
        </ConfirmationRequest>
        <ConfirmationActions>
          {decided === "approved" ? (
            <ConfirmationAccepted>Tindakan disetujui &amp; dieksekusi</ConfirmationAccepted>
          ) : decided === "rejected" ? (
            <ConfirmationRejected>Tindakan ditolak oleh pengguna</ConfirmationRejected>
          ) : (
            <>
          <ConfirmationAction
            variant="default"
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            disabled={locked}
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
            disabled={locked}
            onClick={() => onDecision(true, true)}
          >
            Selalu Izinkan di Sesi Ini
          </ConfirmationAction>

          <ConfirmationAction
            variant="destructive"
            disabled={locked}
            onClick={() => onDecision(false, false)}
          >
            <X className="size-3 mr-1" />
            Tolak
          </ConfirmationAction>
            </>
          )}
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}
