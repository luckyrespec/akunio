# Plan E — Baseline Hijau + Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9 baseline merah menjadi hijau (6 RLS, 2 storage, 1 registry NARA) + playbook reset/reseed/preservasi + seluruh gate hijau.

**Architecture:** Isolasi-RLS pindah ke PG docker lokal (superuser tersedia); suite lain tetap Neon `vitest`/`ledger_test`. SeaweedFS diberikonfig S3; registry NARA single-source. Prasyarat: Plan A–D selesai (test baru ikut diverifikasi di sini).

**Tech Stack:** Neon Postgres / Docker pgvector:pg16 / SeaweedFS / Vitest 4 / Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-13-audit-remediation-design.md` (Section 5).

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any`.
- Jangan pernah `TRUNCATE`/hapus `D:\Lucky\weed_strorage\data` (koleksi riil).
- `bun.exe` auto-load `.env` — target DB lain via temp config / `node.exe` eksplisit.
- PowerShell tanpa `&&`; e2e `workers:1`, `test.setTimeout(180_000)` untuk alur panjang, inner polling timeout 3000ms.
- `data-testid` stabil (`kasir-*`, `setoran-*`, `kas-bank-*`, `onboarding-*`).

## File Structure

- Create: `scripts/rls-docker-setup.mjs`, `s3config.json` (atau path config disepakati), `tests/integration/rls-isolation.test.ts` (pindahan 6 test), skrip npm `test:rls`.
- Modify: `scripts/weed-dev.cmd`, `scripts/weed-ensure-bucket.mjs`, `src/server/ai/nara-tools.ts` (atau file registry aktual), `tests/unit/ai/nara-tools-registry.test.ts`.
- Modify: `scripts/reset-dev.mjs` (preserve test user), `docs/runbook-app-user.md` (Plan A) + `docs/runbook-reset-dev.md` (baru).
- Modify: `package.json` (skrip `test:rls`), `vitest.config.mts` bila perlu project split (hindari bila env-switch cukup).

---

### Task E1: Suite RLS ke docker lokal

**Files:**
- Create: `scripts/rls-docker-setup.mjs`
- Create: `tests/integration/rls-isolation.test.ts`
- Modify: `package.json`, `tests/integration/helpers.ts` (dukung `TEST_RLS_DATABASE_URL`)
- Test: suite itu sendiri

**Interfaces:**
- Consumes: `guardTestDb` (URL wajib mengandung `ledger_test`), migrasi 0000–0022, `db:sql`.
- Produces: `bun run test:rls` hijau dengan BYPASSRLS dicabut.

- [ ] **Step 1: Nyalakan docker + buat database ledger_test**

Run: `bun run db:up`
Lalu:
```bash
node.exe -e "const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:'postgres://postgres:postgres@localhost:54329/ledger'});await p.query('CREATE DATABASE ledger_test');await p.end();console.log('ok');})()"
```
Expected: `ok` (atau `already exists` — lanjutkan).

- [ ] **Step 2: Migrasi + SQL ke docker via temp config**

Buat `drizzle.config.docker.ts` (copy `drizzle.config.ts`, `dbCredentials.url: 'postgres://postgres:postgres@localhost:54329/ledger_test'`), lalu:
```bash
bunx drizzle-kit migrate --config=drizzle.config.docker.ts
```
Expected: migrasi 0000–0022 applied. Lalu apply raw SQL dengan `.env` sementara (copy `.env` → `.env.bak`, set `DATABASE_URL` docker, `bun run db:sql`, restore). Hapus `drizzle.config.docker.ts` setelahnya (jangan commit; verifikasi `git status` bersih dari file itu).

- [ ] **Step 3: Skrip setup peran tanpa bypass**

Tulis `scripts/rls-docker-setup.mjs`: buat role `app_user` + password kuat (baca `TEST_RLS_PASSWORD`, default acak per run? — tidak: deterministik dari env, fallback `AppStr0ng!Local` khusus docker lokal), GRANT CONNECT/db + USAGE/CREATE? (skema public: USAGE + SELECT/INSERT/UPDATE/DELETE semua tabel + USAGE sequences), lalu `ALTER ROLE app_user NOBYPASSRLS` sebagai superuser postgres, verifikasi `SELECT rolbypassrls FROM pg_roles WHERE rolname='app_user'` == false.

- [ ] **Step 4: Pindah 6 test isolasi**

Identifikasi 6 file/kasus merah RLS (cari `BYPASSRLS|app.current_org|isolasi` di `tests/integration`), pindah ke `tests/integration/rls-isolation.test.ts` (satu file, pola `makeOrg` + dua org + posting silang ditolak). `helpers.ts` TIDAK berubah (`guardTestDb` lolos karena URL docker mengandung `ledger_test`; `setup.ts` menghormati `TEST_DATABASE_URL` yang sudah di-set).

- [ ] **Step 5: Skrip npm + run hijau**

`package.json` (tanpa `&&` — dua skrip berurutan):
```json
"test:rls:setup": "bun scripts/rls-docker-setup.mjs",
"test:rls": "vitest run tests/integration/rls-isolation.test.ts"
```
Jalankan berurutan (setup sekali, run tiap kali):
```bash
bun run test:rls:setup
$env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:54329/ledger_test'
$env:TEST_APP_DATABASE_URL='postgres://app_user:<pwd-docker>@localhost:54329/ledger_test'
bun run test:rls
```
Expected: 6/6 PASS (sebelumnya merah di Neon). Hapus env override setelah selesai (`Remove-Item Env:\TEST_RLS_*` bila dipakai).

- [ ] **Step 6: Commit**

```bash
git add scripts/rls-docker-setup.mjs tests/integration/rls-isolation.test.ts package.json
git commit -m "test(rls): suite isolasi ke docker lokal tanpa bypass"
```

### Task E2: SeaweedFS terima demo/demo

**Files:**
- Create: `s3config.json` (repo root atau `docker/`)
- Modify: `scripts/weed-dev.cmd`, `scripts/weed-ensure-bucket.mjs`
- Test: `tests/integration/storage*.test.ts` (existing, probe-gated)

**Interfaces:**
- Consumes: `weed.exe` di `D:\Lucky\weed_strorage\weed.exe`.
- Produces: `putDocument`/`getDocument` demo/demo PASS tanpa `SKIP_STORAGE_TESTS=1`.

- [ ] **Step 1: Tulis s3config + pasang ke cmd**

```json
{ "identities": [{ "name": "demo", "credentials": [{ "accessKey": "demo", "secretKey": "demo" }] }] }
```
Tambah flag `-s3.config=<path absolut s3config.json>` di `weed-dev.cmd`. Bila `weed server` menolak flag (cek `weed help`), pakai mekanisme config resmi versi terinstal dan sesuaikan file ini (jangan hardcode tebakan kedua).

- [ ] **Step 2: Restart weed + pastikan bucket**

Restart `weed:dev` (`cmd /c scripts\weed-dev.cmd` di jendela sendiri), run: `bun scripts/weed-ensure-bucket.mjs`
Expected: bucket `neraca-docs` ada.

- [ ] **Step 3: Run storage suite tanpa skip**

Run: `$env:SKIP_STORAGE_TESTS='0'; bunx vitest run tests/integration/storage.test.ts`
Expected: PASS (sebelumnya 2 merah).

- [ ] **Step 4: Commit**

```bash
git add s3config.json scripts/weed-dev.cmd scripts/weed-ensure-bucket.mjs
git commit -m "fix(dev): weed S3 terima demo/demo + bucket neraca-docs"
```

### Task E3: Registry NARA single-source

**Files:**
- Modify: `src/server/ai/nara-tools.ts` (atau file definisi aktual — verifikasi dulu)
- Modify: `tests/unit/ai/nara-tools-registry.test.ts`
- Test: test itu sendiri

**Interfaces:**
- Consumes: tidak ada.
- Produces: satu `TOOL_REGISTRY: Record<name, { def, handler }>`; `ALL_NARA_TOOLS`/`naraToolHandlers`/`executeNaraTool` diturunkan.

- [ ] **Step 1: Verifikasi struktur aktual**

Baca file registry + 1 tool file; catat bentuk `def` dan `handler` persis sebelum refactor.

- [ ] **Step 2: Refactor ke single-source + kunci test**

Test baru menegaskan tiap entri punya `def`+`handler` fungsi dan `executeNaraTool` resolve dari registry yang sama (tak ada daftar kedua untuk drift).

- [ ] **Step 3: Run di tree kotor (tambah file tool dummy, hapus lagi)**

Run: `bunx vitest run tests/unit/ai/nara-tools-registry.test.ts`
Expected: PASS dengan dan tanpa file tool tak-teregistrasi (file baru tanpa registrasi tak memecahkan suite; coverage tool dijamin executor explicit-import).

- [ ] **Step 4: Commit**

```bash
git add src/server/ai/nara-tools.ts tests/unit/ai/nara-tools-registry.test.ts
git commit -m "fix(ai): registry NARA single-source anti-drift"
```

### Task E4: Reset-dev preserve test user + runbook

**Files:**
- Modify: `scripts/reset-dev.mjs`
- Create: `docs/runbook-reset-dev.md`
- Test: dry-run di database scratch (bukan dev!)

**Interfaces:**
- Consumes: `scripts/export-rag-sak.mjs`, `scripts/backup-vectors.mjs`, `scripts/restore-vectors.mjs`.
- Produces: reset aman: RAG terrestore, `kerjaanlucky@gmail.com` utuh + org-nya bisa login.

- [ ] **Step 1: Tambah preserve user**

Sebelum TRUNCATE: dump `organizations/memberships/org_profiles/user-mirror` milik email ke JSON (`backups/preserve-<ts>.json`, flag `--preserve-user=kerjaanlucky@gmail.com` default). Setelah TRUNCATE: restore baris itu + verifikasi `SELECT count` cocok. RAG: verifikasi count `ifrs_chunks`/`sak_sources` seperti existing (`:62-65`) + langkah restore otomatis dari `backups/rag-sak-emkm-<latest>.json` bila berubah.

- [ ] **Step 2: Uji di scratch (DILARANG di dev)**

Buat DB scratch `ledger_scratch` di Neon cabang sekali-pakai? — cabang Neon butuh id; alternatif: jalankan logika preserve/restore terhadap docker `ledger` (non-test) sebagai latihan, verifikasi user dummy kembali utuh. Catat hasil di runbook.

- [ ] **Step 3: Tulis runbook**

`docs/runbook-reset-dev.md`: urutan backup → `--confirm` → verifikasi (count RAG, login test user, dasbor) → rollback (restore backup). Peringatan: JANGAN `rm -rf` data weed; JANGAN reset tanpa backup terbaru.

- [ ] **Step 4: Commit**

```bash
git add scripts/reset-dev.mjs docs/runbook-reset-dev.md
git commit -m "feat(dev): reset preserve test user + runbook"
```

### Task E5: Gate final seluruhnya

- [ ] **Step 1: tsc + build**

Run: `bunx tsc --noEmit; if ($?) { bun run build }` — koreksi: `bun run build`
Expected: PASS.

- [ ] **Step 2: vitest penuh**

Run: `bun run test`
Expected: PASS semua (0 merah; RLS via `bun run test:rls` terpisah hijau).

- [ ] **Step 3: e2e penuh**

Prasyarat: tidak ada `:3000` idle (`reuseExistingServer:true` — matikan dulu), branch E2E dimigrasi (temp config + `E2E_DATABASE_URL`), `AI_MOCK=1`. Run: `bun run e2e`
Expected: PASS (workers:1).

- [ ] **Step 4: Commit penanda (bila ada sisa)**

```bash
git status --short
```
Commit hanya bila ada perubahan tertinggal; bila bersih, tanpa commit dan laporkan gate hijau.
