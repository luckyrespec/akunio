"use client";

import { COA_TEMPLATE } from "@/core/accounts/coa-template";
import type { AccountDef, AccountType } from "@/core/accounts/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE_CODES = new Set(COA_TEMPLATE.map((d) => d.code));

const TYPE_ORDER: AccountType[] = ["ASET", "LIABILITAS", "EKUITAS", "PENDAPATAN", "BEBAN"];

export function CoaPreview({
  defs,
  onConfirm,
  disabled,
}: {
  defs: AccountDef[];
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-4 shadow-xs" data-testid="coa-preview">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-ink">
          Bagan akun SAK EMKM — {defs.length} akun
        </p>
        <Badge variant="outline" className="border-rule text-[11px] text-ink-soft">
          {defs.filter((d) => !BASE_CODES.has(d.code)).length} akun khas usaha
        </Badge>
      </div>
      <div className="paper-scrollbar mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
        {TYPE_ORDER.map((t) => {
          const rows = defs.filter((d) => d.type === t);
          if (rows.length === 0) return null;
          return (
            <div key={t}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                {t} · {rows.length}
              </p>
              <ul className="mt-1 space-y-1">
                {rows.map((d) => (
                  <li
                    key={d.code}
                    className="flex items-center justify-between gap-2 rounded-lg border border-rule/50 bg-canvas/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-ink">
                      <span className="tnum text-ink-soft">{d.code}</span> · {d.name}
                    </span>
                    {!BASE_CODES.has(d.code) && (
                      <span className="shrink-0 rounded-full border border-terra/25 bg-terra/10 px-2 py-0.5 text-[11px] font-medium text-terra">
                        khas
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Cocok? Tekan tombol di bawah — atau ketik: <span className="font-medium">tambah &lt;nama&gt;</span>,{" "}
        <span className="font-medium">hapus &lt;kode&gt;</span>, <span className="font-medium">lihat</span>.
      </p>
      <Button
        type="button"
        data-testid="coa-confirm"
        disabled={disabled}
        onClick={onConfirm}
        className="mt-2 w-full bg-terra hover:bg-terra/90"
      >
        {disabled ? "Memproses..." : "Gunakan COA ini"}
      </Button>
    </div>
  );
}
