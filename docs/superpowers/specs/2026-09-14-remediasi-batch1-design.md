# Spec: Remediasi Sisa Wajib — Batch 1 (AI float + withOrg batch + rag-worker)

Tanggal: 2026-09-14. Pendekatan: **A. Dua track, satu spec** (disetujui).
Konteks: sisa temuan triase final `2026-09-13-audit-remediation-design.md` dibagi 2 batch; **Batch 1 dulu, Batch 2 sesudah** (disetujui). Batch 2 (dedup CREATE, M1/M2, statements.ts, documents GC, label minor, runbook example, E2E note) di luar spec ini.

## Keputusan yang dikunci

1. **Scope Batch 1**: (a) AI create/update_invoice exact-minor; (b) withOrg batch ~50 halaman + monthlyNet; (c) rag-worker job-scoped (disetujui).
2. **Bukan**: proksi db org-scoped / middleware (ditolak — YAGNI dev-stage).
3. **Cabang kerja**: lanjut di `fix/audit-remediation` (belum merge).
4. **Definisi selesai**: tsc + `bun run test` 0 merah + `test:rls` 6/6 + `e2e` 22/22.
5. **Eksekusi**: subagent-driven (brief → implement → review → fix-loop maks 5 → final review). Batch 2 dimulai hanya setelah Batch 1 hijau + persetujuan user.

## Out of scope (Batch 2, eksplisit)

Dedup CREATE faktur/aset record-level; unifikasi `toMinor` vs pembulatan dialog + koma ribuan faktur (M1/M2); unifikasi `statements.ts`; GC documents terjadwal; label (`deltaPercentage`, bucket sintetis, drilldown `Number()`, pesan ramah batas); contoh restore runbook; catatan tracking migrasi E2E; engine fiskal non-Januari; engine HPP PERIODIC.

---

## Section 1 — AI create/update_invoice exact-minor (disetujui)

Ekstrak helper `parseAmountToMinor` dari fix I1 ke modul bersama; dipakai payment (existing) + create/update (baru) — tanpa duplikasi. Semua argumen amount AI (item, pajak, diskon, total) lewat helper; tolak non-desimal/non-positif di mana domain menuntutnya. RED dengan kasus 1-sen yang TERBUKTI gagal pre-fix; GREEN + tsc; tanpa API asli di test (mock pola B3/B6). Invalid → tool return error ramah (konsisten `postWarning`), bukan exception mentah.

## Section 2 — Batch withOrg halaman + monthlyNet (disetujui)

Inventory via grep `repo(db)` di Server Components/pages; klasifikasi (a) dalam-tx lewati, (b) telanjang bungkus, (c) global jangan — pola B8. Bungkus `withOrg(orgId, fn)` tanpa ubah filter/logika; monthlyNet ikut; lewati file A9/B8 (no double-wrap). Verifikasi: tsc + suite penuh + 1 test scoping per pola (data silang tak terlihat + kontrol positif). Rollout satu commit batch (pecah 2–3 bila >30 file agar reviewable).

## Section 3 — rag-worker job-scoped (disetujui)

Tiap enqueue WAJIB sertakan `orgId` di payload (produsen yang belum kirim diperbaiki; validasi di enqueue, tolak tanpa org). Worker bungkus eksekusi per-job dalam `withOrg(orgId payload)`. Job tanpa org (legacy/antrean lama) dilewati dengan log warn + metrik, bukan crash. Test: enqueue-tanpa-org ditolak + job terisolasi. Kopling worker–queue tetap sama (tanpa infra antrean baru).

## Section 4 — Gate & rollout (disetujui)

Gate: tsc bersih + `bun run test` 0 merah + `test:rls` 6/6 + `e2e` 22/22 (wajib — sentuh runtime AI + 50 halaman). Urutan: Batch 1 → hijau → Batch 2 hanya atas persetujuan.

## Estimasi

Diisi saat planning (writing-plans).
