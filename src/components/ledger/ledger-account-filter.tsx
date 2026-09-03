"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccountSelect } from "@/components/account-select";
import { Button } from "@/components/ui/button";

export function LedgerAccountFilter({
  accounts,
  selectedId,
}: {
  accounts: Array<{ id: string; code?: string; name?: string; label?: string }>;
  selectedId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(selectedId ?? accounts[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      router.push(`/buku-besar?account=${selected}`);
    }
  };

  const handleAccountChange = (val: string) => {
    setSelected(val);
    router.push(`/buku-besar?account=${val}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5 flex-1 sm:max-w-md">
        <label htmlFor="buku-besar-account" className="text-xs font-medium text-ink-soft">
          Pilih Akun Buku Besar
        </label>
        <AccountSelect
          id="buku-besar-account"
          name="account"
          accounts={accounts}
          value={selected}
          onValueChange={handleAccountChange}
          placeholder="Cari nomor atau nama akun..."
        />
      </div>
      <Button type="submit" variant="outline" className="h-9 border-rule bg-canvas hover:bg-paper">
        Tampilkan Mutasi
      </Button>
    </form>
  );
}
