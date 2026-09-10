"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Money } from "@/core/money/money";
import { AccountSelect } from "@/components/account-select";
import {
  openShiftAction,
  closeShiftAction,
  postShiftVarianceAction,
  getShiftSummaryAction,
} from "@/server/actions/pos.actions";

interface ShiftRow {
  id: string;
  cashAccountId: string;
  cashCode: string;
  cashName: string;
  openedAt: string | null;
}

interface Summary {
  saleCount: number;
  tunai: string;
  qris: string;
  transfer: string;
  openingCash: string;
  expectedCash: string;
  hasVarianceDraft: boolean;
}

export function SetoranClient({
  cashAccounts,
  varianceAccounts,
  initialShifts,
}: {
  cashAccounts: Array<{ id: string; code: string; name: string }>;
  varianceAccounts: Array<{ id: string; code: string; name: string }>;
  initialShifts: ShiftRow[];
}) {
  const router = useRouter();
  const [openCashId, setOpenCashId] = React.useState(cashAccounts[0]?.id ?? "");
  const [openingCash, setOpeningCash] = React.useState("0");
  const [countedByShift, setCountedByShift] = React.useState<Record<string, string>>({});
  const [varianceByShift, setVarianceByShift] = React.useState<Record<string, string>>({});
  const [summaries, setSummaries] = React.useState<Record<string, Summary>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const loadSummary = React.useCallback(async (shiftId: string) => {
    const res = await getShiftSummaryAction(shiftId);
    if (res.ok) {
      setSummaries((prev) => ({
        ...prev,
        [shiftId]: {
          saleCount: res.data.saleCount,
          tunai: res.data.tunai,
          qris: res.data.qris,
          transfer: res.data.transfer,
          openingCash: res.data.openingCash,
          expectedCash: res.data.expectedCash,
          hasVarianceDraft: res.data.hasVarianceDraft,
        },
      }));
    }
  }, []);

  React.useEffect(() => {
    for (const s of initialShifts) {
      if (!summaries[s.id]) void loadSummary(s.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShifts]);

  async function doOpen() {
    if (!openCashId) {
      setError("Pilih kas / bank untuk shift.");
      return;
    }
    setBusy("open");
    setError(null);
    setNotice(null);
    try {
      const res = await openShiftAction({ cashAccountId: openCashId, openingCashText: openingCash || "0" });
      if (!res.ok) throw new Error(res.error);
      setNotice("Shift dibuka.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka shift.");
    } finally {
      setBusy(null);
    }
  }

  async function doClose(shiftId: string) {
    setBusy(shiftId);
    setError(null);
    setNotice(null);
    try {
      const res = await closeShiftAction({
        shiftId,
        cashCountedText: countedByShift[shiftId] ?? "",
        varianceAccountId: varianceByShift[shiftId] || null,
      });
      if (!res.ok) throw new Error(res.error);
      const v = BigInt(res.data.variance);
      setNotice(
        v === 0n
          ? "Shift ditutup pas. Terima kasih."
          : `Shift ditutup dengan selisih ${Money.formatIdr(v)}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menutup shift.");
    } finally {
      setBusy(null);
    }
  }

  async function doPostVariance(shiftId: string) {
    setBusy(`${shiftId}-post`);
    setError(null);
    try {
      const res = await postShiftVarianceAction(shiftId);
      if (!res.ok) throw new Error(res.error);
      setNotice("Jurnal selisih diposting.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting selisih.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="h-fit rounded-xl border border-rule bg-paper p-4">
        <h2 className="text-sm font-semibold text-ink">Buka Shift Baru</h2>
        <p className="mt-1 text-[11px] text-ink-soft">Satu shift berjalan per rekening kas.</p>
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Kas / bank shift</span>
            <select
              data-testid="setoran-cash"
              value={openCashId}
              onChange={(e) => setOpenCashId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Kas awal (modal laci)</span>
            <input
              data-testid="setoran-opening"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              inputMode="numeric"
              placeholder="cth 100000"
              className="tnum mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            />
          </label>
          <button
            type="button"
            data-testid="setoran-open-submit"
            disabled={busy === "open"}
            onClick={doOpen}
            className="h-9 w-full rounded-xl bg-terra text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-50"
          >
            {busy === "open" ? "Membuka..." : "Buka Shift"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-rule bg-paper p-4">
        <h2 className="text-sm font-semibold text-ink">Shift Berjalan</h2>
        {error && <p data-testid="setoran-error" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        {notice && <p className="mt-2 text-xs font-medium text-emerald-700">{notice}</p>}
        {initialShifts.length === 0 && (
          <p className="mt-2 text-xs text-ink-soft">Tidak ada shift berjalan. Buka shift dulu sebelum berjualan.</p>
        )}
        <div className="mt-3 space-y-3">
          {initialShifts.map((s) => {
            const sum = summaries[s.id];
            return (
              <div key={s.id} data-testid={`setoran-shift-${s.id}`} className="rounded-xl border border-rule/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink">
                    {s.cashCode} · {s.cashName}
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    buka {s.openedAt?.slice(0, 16).replace("T", " ") ?? "-"}
                  </p>
                </div>
                {sum ? (
                  <dl className="tnum mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div><dt className="text-ink-soft">Transaksi</dt><dd className="font-semibold">{sum.saleCount}×</dd></div>
                    <div><dt className="text-ink-soft">Tunai</dt><dd className="font-semibold">{Money.formatIdr(BigInt(sum.tunai))}</dd></div>
                    <div><dt className="text-ink-soft">QRIS/Transfer</dt><dd className="font-semibold">{Money.formatIdr(BigInt(sum.qris) + BigInt(sum.transfer))}</dd></div>
                    <div><dt className="text-ink-soft">Ekspektasi laci</dt><dd className="font-semibold">{Money.formatIdr(BigInt(sum.expectedCash))}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 text-[11px] text-ink-soft">Memuat ringkasan...</p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="block">
                    <span className="text-[11px] font-medium text-ink-soft">Hitung fisik laci</span>
                    <input
                      data-testid="setoran-counted"
                      value={countedByShift[s.id] ?? ""}
                      onChange={(e) => setCountedByShift((p) => ({ ...p, [s.id]: e.target.value }))}
                      inputMode="numeric"
                      placeholder="cth 150000"
                      className="tnum mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
                    />
                  </label>
                  <div>
                    <span className="text-[11px] font-medium text-ink-soft">Akun selisih (bila tidak pas)</span>
                    <div data-testid="setoran-variance-account" className="mt-1">
                      <AccountSelect
                        accounts={varianceAccounts}
                        value={varianceByShift[s.id] ?? ""}
                        onValueChange={(v) => setVarianceByShift((p) => ({ ...p, [s.id]: v }))}
                        placeholder="Pilih akun selisih..."
                        showCreateLink
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      data-testid="setoran-close-submit"
                      disabled={busy === s.id}
                      onClick={() => doClose(s.id)}
                      className="h-9 rounded-xl border border-rule px-4 text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-50"
                    >
                      {busy === s.id ? "Menutup..." : "Tutup Shift"}
                    </button>
                    {sum?.hasVarianceDraft && (
                      <button
                        type="button"
                        data-testid="setoran-post-variance"
                        disabled={busy === `${s.id}-post`}
                        onClick={() => doPostVariance(s.id)}
                        className="h-9 rounded-xl bg-terra px-4 text-xs font-semibold text-paper hover:opacity-90 disabled:opacity-50"
                      >
                        Posting Selisih
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
