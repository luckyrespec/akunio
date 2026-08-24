export interface DiffLine {
  accountCode: string;
  debitText: string;
  creditText: string;
}

export interface DiffRow {
  state: "SAME" | "CHANGED" | "ADDED" | "REMOVED";
  originalIndex: number | null;
  editedIndex: number | null;
  accountCode: string;
  debitText: string;
  creditText: string;
}

export function diffDraftVsEdited(
  original: { lines: DiffLine[] },
  edited: DiffLine[],
) {
  const rows: DiffRow[] = [];
  let changed = 0, added = 0, removed = 0;
  const usedEdited = new Set<number>();

  original.lines.forEach((o, i) => {
    const j = edited.findIndex(
      (e, k) => !usedEdited.has(k) && e.accountCode === o.accountCode,
    );
    if (j === -1) {
      removed++;
      rows.push({ state: "REMOVED", originalIndex: i, editedIndex: null, ...o });
      return;
    }
    usedEdited.add(j);
    const e = edited[j];
    const same = e.debitText === o.debitText && e.creditText === o.creditText;
    if (!same) changed++;
    rows.push({
      state: same ? "SAME" : "CHANGED", originalIndex: i, editedIndex: j,
      accountCode: e.accountCode, debitText: e.debitText, creditText: e.creditText,
    });
  });

  edited.forEach((e, j) => {
    if (!usedEdited.has(j)) {
      added++;
      rows.push({ state: "ADDED", originalIndex: null, editedIndex: j, ...e });
    }
  });

  return { changed, added, removed, rows };
}
