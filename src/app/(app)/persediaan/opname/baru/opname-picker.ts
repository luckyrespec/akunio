export interface PickerCandidate {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentQty: string;
}

export type PickerSort = "name" | "stock-desc" | "stock-asc";

export interface PickerList {
  /** Baris halaman aktif yang boleh di-render. */
  visible: PickerCandidate[];
  /** Total kandidat (setelah search, sebelum pagination). */
  total: number;
  /** Total halaman (>= 1). */
  totalPages: number;
  /** Halaman aktif setelah dijepit ke rentang valid. */
  page: number;
  pageSize: number;
  /** Indeks awal halaman aktif (0-based) untuk label "Menampilkan X–Y". */
  startIndex: number;
}

const byName = (a: PickerCandidate, b: PickerCandidate) =>
  a.name.localeCompare(b.name, "id");

/** Semua kandidat yang cocok query, terurut — dipakai pagination + "pilih semua hasil". */
export function matchPickerItems(
  items: PickerCandidate[],
  query: string,
  sort: PickerSort,
): PickerCandidate[] {
  const q = query.trim().toLowerCase();
  const matched =
    q.length === 0
      ? [...items]
      : items.filter(
          (it) => it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q),
        );
  switch (sort) {
    case "stock-desc":
      matched.sort((a, b) => Number(b.currentQty) - Number(a.currentQty) || byName(a, b));
      break;
    case "stock-asc":
      matched.sort((a, b) => Number(a.currentQty) - Number(b.currentQty) || byName(a, b));
      break;
    default:
      matched.sort(byName);
      break;
  }
  return matched;
}

/** Daftar kandidat langkah "Pilih Barang" opname: search + sort + pagination.
 *  Tanpa query pun daftar terisi (halaman 1), jadi pengguna bisa langsung centang. */
export function resolvePickerList(
  items: PickerCandidate[],
  query: string,
  opts?: { sort?: PickerSort; page?: number; pageSize?: number },
): PickerList {
  const sort = opts?.sort ?? "name";
  const pageSize = Math.max(1, Math.floor(opts?.pageSize ?? 10));
  const matched = matchPickerItems(items, query, sort);
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(opts?.page ?? 1)), totalPages);
  const startIndex = (page - 1) * pageSize;
  return {
    visible: matched.slice(startIndex, startIndex + pageSize),
    total: matched.length,
    totalPages,
    page,
    pageSize,
    startIndex,
  };
}
