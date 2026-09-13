"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Money } from "@/core/money/money";
import { updateOpnameItemCostAction } from "@/server/actions/inventory.actions";

/** Harga modal baris opname. Editable hanya saat DRAFT & barang belum punya
 *  cost (jalur migrasi tanpa nota) agar selisih bisa dinilai & dijurnal. */
export function OpnameCostCell({
  opnameId,
  itemId,
  unitCostMinor,
  differenceQty,
  editable,
}: {
  opnameId: string;
  itemId: string;
  /** minor unit (digit string). */
  unitCostMinor: string;
  differenceQty: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [value, setValue] = useState(() => (BigInt(unitCostMinor) / 100n).toString());

  const display = Money.fromMinor(BigInt(unitCostMinor)).formatIdr();

  const save = async () => {
    setBusy(true);
    try {
      const res = await updateOpnameItemCostAction(opnameId, itemId, value.trim());
      if (!res.ok) {
        setErrorText(res.error || "Gagal menyimpan harga modal");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const errorDialog = (
    <ConfirmDialog
      open={errorText !== null}
      onOpenChange={(open) => {
        if (!open) setErrorText(null);
      }}
      tone="danger"
      title="Gagal menyimpan harga modal"
      description={errorText ?? ""}
    />
  );

  if (!editing) {
    return (
      <>
        <div className="flex items-center justify-end gap-1.5">
          <span className={unitCostMinor === "0" ? "text-[var(--color-terra)]" : undefined}>
            {display}
          </span>
          {editable && (
            <button
              type="button"
              aria-label="Isi harga modal"
              title="Barang belum punya harga modal. Isi agar selisih dinilai dan jurnal terbentuk"
              onClick={() => {
                setValue((BigInt(unitCostMinor) / 100n).toString());
                setEditing(true);
              }}
              className="rounded-md p-1 text-[var(--color-terra)] transition-colors hover:bg-[var(--color-canvas)]"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </div>
        {errorDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            aria-label="Harga modal per unit"
            className="h-7 w-24 text-right font-mono text-xs"
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={save}
            aria-label="Simpan harga modal"
            className="h-7 w-7 rounded-lg bg-terra p-0 text-white hover:bg-terra/90"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setEditing(false)}
            aria-label="Batal"
            className="h-7 w-7 rounded-lg p-0"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        {differenceQty !== 0 && (
          <span className="text-[10px] text-[var(--color-ink-soft)]">
            {differenceQty > 0 ? "+" : ""}
            {differenceQty} × harga ini = nilai selisih
          </span>
        )}
      </div>
      {errorDialog}
    </>
  );
}
