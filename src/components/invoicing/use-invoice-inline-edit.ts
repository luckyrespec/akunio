"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceAction } from "@/server/actions/invoice.actions";

export interface InvoiceEditState {
  editing: boolean;
  dueDate: string;
  notes: string;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  start: () => void;
  cancel: () => void;
  setDueDate: (v: string) => void;
  setNotes: (v: string) => void;
  save: () => Promise<void>;
}

/**
 * Mode ubah-di-tempat untuk halaman faktur: jatuh tempo + catatan
 * bertukar menjadi input box; tombol Ubah menjadi Simpan + Batal.
 */
export function useInvoiceInlineEdit(invoice: {
  id: string;
  dueDate: string;
  notes: string | null;
}): InvoiceEditState {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const initialDue = String(invoice.dueDate).slice(0, 10);
  const initialNotes = invoice.notes ?? "";
  const dirty = dueDate !== initialDue || notes !== initialNotes;

  const start = () => {
    setDueDate(initialDue);
    setNotes(initialNotes);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (saving || !dirty) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError("Tanggal jatuh tempo tidak valid.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await updateInvoiceAction({ id: invoice.id, dueDate, notes });
      if (!res.ok) throw new Error(res.error || "Gagal mengoreksi faktur.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  };

  return { editing, dueDate, notes, saving, error, dirty, start, cancel, setDueDate, setNotes, save };
}
