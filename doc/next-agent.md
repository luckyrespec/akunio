# Next Agents Roadmap — ADK Accounting (fase-2+)

Konteks: fase-1 = `accountant_coordinator` + `bookkeeping_agent` +
`analyst_agent`, hybrid router deterministik, Accounting Control Layer, HITL
dipertahankan. File ini daftar agen berikutnya yang dibangun satu per satu
(setiap agen = spec → plan → implementasi sendiri).

Disiplin tetap: **LLM = reasoning, Tool = truth/action** (perhitungan,
validasi, posting = deterministic tools + control layer + approval).

## Urutan yang disarankan

1. **invoice_agent** — OCR/extract PDF-gambar (`extract_invoice`,
   `validate_invoice`, `detect_duplicate_invoice`, `lookup_vendor/PO`) +
   pipeline `workflows/invoice_to_journal.ts` (extract → duplikat → tax rule →
   draft → validate → approval → post). Beri hasil ke bookkeeping, bukan
   langsung posting.
2. **bank_rec_agent** — `get_bank_transactions`, `get_book_transactions`,
   `match_transaction`, `find_unmatched`, `create_reconciliation`; graph
   `bank_reconciliation` dengan node HITL untuk unmatched (minta penjelasan
   user, lalu suggest journal).
3. **tax_agent** — `get_tax_rules` (tabel + `effective_from/to`, jurisdiction,
   source), `calculate_vat`, `calculate_withholding_tax`,
   `check_tax_category`, `validate_tax_period`. Aturan di DB versioned, agent
   ambil rule berlaku pada tanggal transaksi. Bukan "Tax Calculation Agent"
   yang berhitung di prompt.
4. **reporting_agent** — `generate_trial_balance/profit_loss/balance_sheet/
   cash_flow/ledger/ar_aging/ap_aging` + `validate_financial_statements`
   (`Assets = Liabilities + Equity` deterministik).
5. **audit_agent** — `find_duplicate/unusual/missing_docs/large_journals/
   post_period_entries` → Finding (severity, evidence, related tx, rekomendasi
   investigasi). Bahasa temuan: "requires review", bukan tuduhan fraud.
6. **ar_ap_agent** (boleh dipecah AR vs AP bila membesar) —
   `get_receivables/payables`, balance, overdue/due, reminder,
   `prepare_payment_batch` (prepare → approval → execute; LLM tidak transfer
   langsung).
7. **inventory & assets-closing** — pindahan tool existing yang belum punya
   agen: `inventory.*`, `assets-closing.*` (depresiasi, opname, closing
   readiness), `open/close_period`, `reconciliation` mutasi.

## Kriteria naik-fase (per agen)

- Trajectory test IN_ORDER hijau + semua negative-case FAIL bila dilanggar
  (tanpa approval, rule salah tanggal, duplikat lolos, GROUP account, periode
  LOCKED).
- Control layer + audit log + idempotency terpasang sebelum tool mutasi
  pertama dibuka.
- `bunx tsc --noEmit` + `bun run build` hijau; tidak menambah tabel tanpa
  TRUNCATE list `tests/integration/helpers.ts`.
