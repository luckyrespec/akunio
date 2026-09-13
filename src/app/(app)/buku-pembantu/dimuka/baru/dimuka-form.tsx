"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect, type AccountOption } from "@/components/account-select";
import { Money } from "@/core/money/money";
import { createPrepaidContractAction } from "@/server/actions/prepaid.actions";

function parseMinor(text: string): bigint | null {
  if (!text.trim()) return null;
  try {
    return Money.parseIdr(text).minor;
  } catch {
    return null;
  }
}

export function DimukaForm({
  accountOptions,
  controlAccountId,
  defaultExpenseAccountId,
  cashAccountIds,
}: {
  accountOptions: AccountOption[];
  controlAccountId: string;
  defaultExpenseAccountId: string | null;
  cashAccountIds: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState("12");
  const [amountText, setAmountText] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState(defaultExpenseAccountId ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const totalMinor = parseMinor(amountText);
  const monthsNum = Number(months);
  const valid = name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    && Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= 60
    && totalMinor !== null && totalMinor > 0n && expenseAccountId !== "" && paymentAccountId !== "";

  return (
    <form
      className="space-y-4 rounded-xl border border-rule bg-paper p-5 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || totalMinor === null) return;
        setError(null);
        start(async () => {
          const res = await createPrepaidContractAction({
            name: name.trim(), vendor: vendor.trim() || undefined, startDate,
            months: monthsNum, totalMinor: totalMinor.toString(),
            controlAccountId, expenseAccountId, paymentAccountId,
            notes: notes.trim() || undefined,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.push("/buku-pembantu/dimuka");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dimuka-name">Nama kontrak</Label>
          <Input id="dimuka-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sewa ruko 12 bulan" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dimuka-vendor">Penerima bayar (opsional)</Label>
          <Input id="dimuka-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Nama pemilik ruko" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dimuka-total">Total dibayar (Rp)</Label>
          <Input id="dimuka-total" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="12.000.000" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dimuka-start">Mulai tanggal</Label>
            <Input id="dimuka-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dimuka-months">Jangka (bulan)</Label>
            <Input id="dimuka-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dimuka-expense">Akun beban bulanan</Label>
          <AccountSelect
            id="dimuka-expense"
            accounts={accountOptions}
            value={expenseAccountId}
            onValueChange={setExpenseAccountId}
            pinnedIds={defaultExpenseAccountId ? [defaultExpenseAccountId] : []}
            pinnedLabel="Disarankan"
            showCreateLink
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dimuka-pay">Dibayar dari</Label>
          <AccountSelect
            id="dimuka-pay"
            accounts={accountOptions}
            value={paymentAccountId}
            onValueChange={setPaymentAccountId}
            pinnedIds={cashAccountIds}
            pinnedLabel="Kas & bank"
            showCreateLink
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dimuka-notes">Catatan (opsional)</Label>
        <Textarea id="dimuka-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nomor kwitansi, alamat ruko…" />
      </div>
      {totalMinor !== null && totalMinor > 0n && Number.isInteger(monthsNum) && monthsNum >= 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-canvas/50 px-3.5 py-2.5">
          <span className="text-xs text-ink-soft">Estimasi amortisasi per bulan · {monthsNum} bulan</span>
          <span className="font-display text-lg font-semibold tracking-tight text-ink tnum">
            {Money.formatIdr(totalMinor / BigInt(monthsNum))}
          </span>
        </div>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <Button
        type="submit"
        disabled={pending || !valid}
        className="bg-terra text-white hover:bg-terra/90 text-xs h-9 rounded-xl shadow-2xs"
      >
        <Plus data-icon="inline-start" />
        {pending ? "Menyimpan…" : "Simpan kontrak"}
      </Button>
    </form>
  );
}
