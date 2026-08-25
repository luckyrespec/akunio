# Bun Full-Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan tooling project dari npm ke Bun sepenuhnya — Bun sebagai package manager, runtime aplikasi (`next dev/build/start`), dan launcher tooling — tanpa mengubah kode aplikasi dan tanpa break (semua gerbang S0–S5 hijau).

**Architecture:** Lockfile dikonversi ke `bun.lock`, runtime dipaksa lewat prefix `--bun` di dalam definisi script package.json, permukaan berisiko (vitest worker) diverifikasi lewat spike dengan fallback eksplisit ke worker Node. Spec: `docs/superpowers/specs/2026-08-25-bun-migration-design.md`.

**Tech Stack:** Bun 1.3+ (Windows), Next 16.3 Turbopack, Vitest 4, Playwright 1.62, Drizzle-kit, PostgreSQL 18 native, SeaweedFS.

## Global Constraints

- Hanya file yang disebut di plan ini yang boleh berubah; **nol perubahan di `src/`** (pengecualian kosmetik tercantum eksplisit).
- Node v24 tetap terinstall; `eslint` dan `npx tsc --noEmit` tetap diluncurkan Node (tidak diberi `--bun`).
- `bun.lock` wajib ter-commit; `package-lock.json` dihapus dari tree (pemulihan via git history).
- Semua gerbang verifikasi hijau sebelum migrasi dinyatakan sukses: S0 install, S1 dev boot, S2 build, S3 vitest, S4 typecheck, S5 e2e.
- Environment Windows PowerShell 5.1 — jangan pakai bash heredoc untuk tulis file; gunakan tool write/edit.
- Database test adalah `ledger_test` saja; jangan pernah truncate DB dev `ledger`.
- Jangan pernah menghapus/mengubah isi `D:\Lucky\weed_strorage\data`.
- Gaya commit repo: lowercase conventional (`chore(...)`, `docs:`), pesan Bahasa Inggris singkat.

---

### Task 1: Install Bun + titik rollback

**Files:**
- None (environment + git tag)

**Interfaces:**
- Produces: `bun` tersedia di PATH (versi ≥1.3); git tag `pre-bun-migration` dipakai Task 2 dan prosedur rollback.

- [ ] **Step 1: Pastikan tidak ada server dev yang menyimpan lock file**

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Expected: tidak ada output / error "No matching MSFT_NetTCPConnection" — keduanya oke.

- [ ] **Step 2: Install Bun via official installer**

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

Expected: installer mencetak versi yang terpasang.

- [ ] **Step 3: Verifikasi instalasi**

```powershell
bun --version; bun --revision
```

Expected: versi ≥ 1.3.x tercetak. Jika `bun` tidak dikenali, jalankan fix PATH lalu buka terminal baru dan ulangi Step 3:

```powershell
[System.Environment]::SetEnvironmentVariable("Path", [System.Environment]::GetEnvironmentVariable("Path","User") + ";$env:USERPROFILE\.bun\bin", [System.EnvironmentVariableTarget]::User)
```

- [ ] **Step 4: Buat tag rollback**

```bash
git tag pre-bun-migration
```

Run: `git tag --list "pre-bun*"`
Expected: satu baris `pre-bun-migration`.

---

### Task 2: Konversi lockfile (gerbang S0)

**Files:**
- Delete: `package-lock.json`
- Create: `bun.lock` (dihasilkan `bun install`, jangan ditulis manual)

**Interfaces:**
- Consumes: `bun` dari Task 1.
- Produces: `node_modules` hasil resolusi Bun + `bun.lock` ter-commit; semua task berikutnya bergantung pada ini.

- [ ] **Step 1: Hapus artefak npm**

```powershell
Remove-Item -LiteralPath "node_modules" -Recurse -Force
Remove-Item -LiteralPath "package-lock.json" -Force
```

Expected: keduanya hilang. (`package-lock.json` masih ada di git history — itu rollback path.)

- [ ] **Step 2: Install dependensi dengan Bun**

```powershell
bun install
```

Expected: selesai tanpa error; jika muncul warning postinstall, catat dan tangani kasus per kasus sebelum lanjut (semua dep project ini pure-JS/native resmi, tidak ada yang butuh postinstall).

- [ ] **Step 3: Verifikasi lockfile baru**

```powershell
Test-Path bun.lock; git status --short
```

Expected: `True`; `git status` menampilkan `D package-lock.json` dan `?? bun.lock`.

- [ ] **Step 4: Commit konversi lockfile**

```bash
git add bun.lock package-lock.json
git commit -m "chore(bun): replace npm lockfile with bun.lock"
```

Expected: commit berhasil dengan 2 file berubah.

---

### Task 3: Script aplikasi → Bun runtime (gerbang S1 + S2)

**Files:**
- Modify: `package.json` (baris 6–8, blok `scripts`)

**Interfaces:**
- Consumes: `bun.lock` dari Task 2.
- Produces: `bun run dev|build|start` berjalan di runtime Bun; nama-nama script ini dipakai ulang oleh `playwright.config.ts` (Task 6).

- [ ] **Step 1: Ubah tiga script aplikasi**

Di `package.json`, ganti:

```json
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
```

menjadi:

```json
    "dev": "bun --bun next dev",
    "build": "bun --bun next build",
    "start": "bun --bun next start",
```

Prefix `--bun` ada DI DALAM script agar konsisten walau dipanggil `bun run` maupun sisa kebiasaan `npm run`.

- [ ] **Step 2: Gerbang S1 — boot dev server di runtime Bun + probe HTTP**

Pastikan layanan Postgres jalan dulu (`Get-Service postgresql-x64-18`), lalu:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
$p = Start-Process -FilePath "bun" -ArgumentList "run","dev" -WorkingDirectory "D:\Lucky\NgodingCuy\REAL_PROJECT\ai_accounting" -WindowStyle Hidden -PassThru -RedirectStandardOutput "C:\Users\User\AppData\Local\Temp\opencode\bun-dev.out.log" -RedirectStandardError "C:\Users\User\AppData\Local\Temp\opencode\bun-dev.err.log"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 5
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $ok = $true; break }
  } catch { }
}
if (-not $ok) { Get-Content "C:\Users\User\AppData\Local\Temp\opencode\bun-dev.err.log" -Tail 40; Get-Content "C:\Users\User\AppData\Local\Temp\opencode\bun-dev.out.log" -Tail 40; throw "S1 FAILED: dev server tidak merespons 2xx/3xx" }
"S1 PASS"
Get-Content "C:\Users\User\AppData\Local\Temp\opencode\bun-dev.out.log" -Tail 15
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Expected: tercetak `S1 PASS`; log menunjukkan Next siap tanpa error runtime. Jika gagal → ikuti aturan fallback spec Bagian 3 (maksimal 1 fix targeted; gagal permanen → turunkan seluruh migrasi ke mode PM-only: hapus semua `--bun`).

- [ ] **Step 3: Gerbang S2 — production build di runtime Bun**

```powershell
bun run build
```

Expected: build selesai tanpa error (Turbopack). Jika gagal → aturan fallback sama seperti Step 2.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(bun): run next dev/build/start on bun runtime"
```

---

### Task 4: Script infrastruktur → Bun

**Files:**
- Modify: `package.json` (baris 14 dan 16)
- Modify: `scripts/test-db-setup.mjs:84`

**Interfaces:**
- Consumes: `bun` (Task 1), dev ledger + kredensial `.env`.
- Produces: `bun run test:db:setup` yang menyiapkan `ledger_test` — prasyarat wajib Task 5 dan Task 6.

- [ ] **Step 1: Ubah dua entri script**

Di `package.json`, ganti:

```json
    "test:db:setup": "node scripts/test-db-setup.mjs",
```

menjadi:

```json
    "test:db:setup": "bun scripts/test-db-setup.mjs",
```

dan ganti:

```json
    "db:sql": "node src/server/db/scripts/apply-sql.mjs"
```

menjadi:

```json
    "db:sql": "bun src/server/db/scripts/apply-sql.mjs"
```

- [ ] **Step 2: Ubah execSync internal**

Di `scripts/test-db-setup.mjs` baris 84, ganti:

```javascript
execSync("node src/server/db/scripts/apply-sql.mjs", {
```

menjadi:

```javascript
execSync("bun src/server/db/scripts/apply-sql.mjs", {
```

Biarkan `execSync("npx drizzle-kit migrate", ...)` di baris 77 tetap seperti adanya.

- [ ] **Step 3: Verifikasi db:sql idempotent di ledger dev**

```powershell
bun run db:sql
```

Expected: SQL RLS/triggers/vector teraplikasi tanpa error (script ini idempotent by design).

- [ ] **Step 4: Siapkan ledger_test (prasyarat S3/S5)**

```powershell
bun run test:db:setup
```

Expected: tercetak `test db ready: postgres://...ledger_test` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/test-db-setup.mjs
git commit -m "chore(bun): run db setup scripts via bun"
```

---

### Task 5: Spike vitest di Bun runtime (gerbang S3) + keputusan engine

**Files:**
- Modify: `package.json` (baris 10, entri `test`) — nilainya ditentukan hasil spike

**Interfaces:**
- Consumes: `ledger_test` siap dari Task 4, Postgres jalan.
- Produces: nilai final entri `test` + catatan keputusan (dipakai Task 7 untuk docs):
  - `"bun --bun vitest run"` jika spike lolos, atau
  - `"vitest run"` (worker Node) sebagai pengecualian sadar.

- [ ] **Step 1: Jalankan suite penuh memaksa Bun runtime**

```powershell
bun --bun vitest run
```

Expected: semua test lolos di `ledger_test` (`fileParallelism:false` tetap berlaku dari vitest.config.mts).

- [ ] **Step 2A: Jika Step 1 lolos — kunci engine Bun**

Ganti di `package.json`:

```json
    "test": "vitest run",
```

menjadi:

```json
    "test": "bun --bun vitest run",
```

Lalu verifikasi:

```powershell
bun run test
```

Expected: PASS. Lanjut ke Step 3.

- [ ] **Step 2B: Jika Step 1 gagal — satu percobaan fix targeted**

Jalankan pool forks:

```powershell
bun --bun vitest run --pool=forks
```

Jika lolos: set `"test": "bun --bun vitest run --pool=forks"`, verifikasi `bun run test` PASS, lanjut ke Step 3. Jika masih gagal: biarkan `"test": "vitest run"` TIDAK diubah (worker Node via launcher `bun run`), dan catat keputusan: `VITEST_ENGINE=node-workers` — nilai ini yang diteruskan ke Task 7 Step 2.

- [ ] **Step 3: Commit sesuai hasil**

Jika engine Bun terkunci (hasil 2A atau 2B cabang pertama):

```bash
git add package.json
git commit -m "chore(bun): run vitest on bun runtime"
```

Jika fallback Node workers: tidak ada commit di task ini (file tak berubah); cukup catat keputusan untuk Task 7.

---

### Task 6: Playwright webServer + gerbang S4/S5

**Files:**
- Modify: `playwright.config.ts:8`
- Modify: `tests/integration/helpers.ts:7`

**Interfaces:**
- Consumes: script `bun run dev` dari Task 3; `ledger_test` dari Task 4; keputusan Task 5 tidak mempengaruhi task ini.
- Produces: e2e hijau dengan dev server otomatis di-launch lewat Bun.

- [ ] **Step 1: Ubah webServer Playwright**

Di `playwright.config.ts` baris 8, ganti:

```typescript
    command: "npm run dev",
```

menjadi:

```typescript
    command: "bun run dev",
```

- [ ] **Step 2: Perbaiki pesan safety (kosmetik)**

Di `tests/integration/helpers.ts` baris 7, ganti:

```typescript
      `SAFETY: refusing to touch non-test database (${url}). Run "npm run test:db:setup" first.`,
```

menjadi:

```typescript
      `SAFETY: refusing to touch non-test database (${url}). Run "bun run test:db:setup" first.`,
```

- [ ] **Step 3: Gerbang S4 — typecheck**

```powershell
npx tsc --noEmit
```

Expected: keluar tanpa error.

- [ ] **Step 4: Prasyarat infrastruktur untuk S5**

```powershell
Get-Service postgresql-x64-18 | Select-Object Status
(Test-NetConnection 127.0.0.1 -Port 8333 -WarningAction SilentlyContinue).TcpTestSucceeded
```

Expected: Postgres `Running`; S3 gateway `True`. Jika `False`, jalankan `bun run weed:dev` di terminal terpisah, tunggu beberapa detik, uji ulang port 8333.

- [ ] **Step 5: Gerbang S5 — e2e penuh**

Bunuh proses yang memegang port 3000 (aturan AGENTS: `reuseExistingServer:true` akan memakai server basi):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
bun run e2e
```

Expected: semua skenario Playwright lolos (webServer otomatis menjalankan `bun run dev`).

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/integration/helpers.ts
git commit -m "chore(bun): playwright webServer launches via bun run dev"
```

---

### Task 7: Sinkronisasi docs (README + AGENTS.md)

**Files:**
- Modify: `README.md` (baris 8, 10, 18, 57–59, 64–66, 72, 122)
- Modify: `AGENTS.md` (blok Commands + quirk testing)

**Interfaces:**
- Consumes: keputusan `VITEST_ENGINE` dari Task 5 (menentukan satu baris opsional di AGENTS.md).
- Produces: dokumentasi konsisten dengan perintah Bun.

- [ ] **Step 1: Update README.md**

Ganti baris-baris berikut:

- Baris 8: `Prasyarat: Node 20+, lalu salah satu jalur basis data di bawah.` menjadi `Prasyarat: Bun 1.3+ (Node tetap terinstall untuk tooling eslint/tsc), lalu salah satu jalur basis data di bawah.`
- Baris 10: ``1. `npm install` `` menjadi ``1. `bun install` ``
- Baris 18: `npm run db:up` menjadi `bun run db:up`
- Baris 57: ``3. `npx drizzle-kit migrate` — skema.`` menjadi ``3. `bunx drizzle-kit migrate` — skema.``
- Baris 58: ``4. `npm run db:sql` `` menjadi ``4. `bun run db:sql` ``
- Baris 59: ``5. `npm run dev` `` menjadi ``5. `bun run dev` ``
- Baris 64: `- \`npm test\`` menjadi `- \`bun run test\``
- Baris 65: `- \`SKIP_DB_TESTS=1 npm test\`` menjadi `- \`SKIP_DB_TESTS=1 bun run test\``
- Baris 66: `- \`npm run e2e\`` menjadi `- \`bun run e2e\``
- Baris 72: ``diterapkan lewat `npm run db:sql`.`` menjadi ``diterapkan lewat `bun run db:sql`.``
- Baris 122: `jalankan \`npm run weed:dev\`` menjadi `jalankan \`bun run weed:dev\``

- [ ] **Step 2: Update blok Commands AGENTS.md**

Ganti blok ```bash``` Commands menjadi:

```markdown
```bash
bun run dev          # http://localhost:3000 (needs DB + SeaweedFS)
bun run build        # must stay green
npx tsc --noEmit     # strict, no any
bun run test         # vitest run — hits ledger_test only
bun run e2e          # playwright (AI_MOCK=1 via webServer env)
bun run test:db:setup # create ledger_test + drizzle migrate + rls/triggers/vector
bun run db:sql       # apply src/server/db/*.sql to dev ledger
bun run db:migrate   # drizzle-kit migrate (dev ledger)
bun run weed:dev     # cmd /c scripts\weed-dev.cmd — S3 gateway :8333, bucket neraca-docs
```
```

Kemudian tambahkan satu baris di bagian Testing Quirks, sesuai keputusan Task 5:

- Jika `VITEST_ENGINE=bun`: `- Vitest runs on the Bun runtime (\`--bun\` in the test script); if it breaks after a Bun upgrade, fall back to plain \`vitest run\` (Node workers).`
- Jika `VITEST_ENGINE=node-workers`: `- Vitest intentionally stays on Node workers (plain \`vitest run\`) — Bun-runtime spike failed; revisit after Bun upgrades.`

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: switch local dev commands from npm to bun"
```

---

### Task 8: Sweep verifikasi akhir (tanpa commit kecuali ada perbaikan)

**Files:**
- None (verifikasi saja)

**Interfaces:**
- Consumes: seluruh state hasil Task 1–7.

- [ ] **Step 1: Jalankan ulang gerbang cepat secara berurutan**

```powershell
bun run build; if ($?) { npx tsc --noEmit }; if ($?) { bun run test }
```

Expected: ketiganya hijau (build → typecheck → test).

- [ ] **Step 2: Audit diff kumulatif migrasi**

```bash
git diff --stat pre-bun-migration..HEAD
```

Expected: hanya file-file ini berubah: `package.json`, `bun.lock` (+), `package-lock.json` (−), `playwright.config.ts`, `scripts/test-db-setup.mjs`, `tests/integration/helpers.ts`, `README.md`, `AGENTS.md`. **Tidak ada file di bawah `src/app` atau `src/server`.**

- [ ] **Step 3: Nyatakan sukses atau perbaiki**

Jika semua hijau dan diff sesuai — migrasi selesai. Jika ada yang merah: kembalikan ke task terkait (fallback rules spec Bagian 3), jangan deklarasi sukses.

- [ ] **Step 4: (Opsional, hanya jika ada perbaikan) commit perbaikan**

```bash
git add -A
git commit -m "fix(bun): post-migration verification fixes"
```
