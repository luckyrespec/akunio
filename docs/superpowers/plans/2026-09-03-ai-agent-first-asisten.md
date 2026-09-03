# AI Agent First & Asisten Akuntansi Interaktif Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Neraca into an AI Agent First accounting SaaS featuring ChatGPT/Gemini-style chat sessions, persistent multi-attachments via SeaweedFS S3, real-time streaming with Chain of Thought reasoning, a modern UI built with `ai-elements`, full-suite accounting CRUD tools, and a Smart Human-in-the-Loop (HITL) confirmation system.

**Architecture:** Full-stack architecture using Next.js 16 App Router, `@google/genai` Interactions API streaming via Server-Sent Events (SSE), PostgreSQL/Drizzle ORM for thread/message/tool persistence, SeaweedFS S3 storage for document attachments, `ai-elements` React components skinned with Paper & Ink matte design tokens, and a robust transaction execution engine with double-entry invariants, period locks, advisory locks, and immutable audit logs.

**Tech Stack:** Next.js 16.3 (App Router), React 19, Tailwind CSS 4, shadcn/ui, `ai-elements`, `@google/genai` 2.18, Drizzle ORM 0.45, PostgreSQL 18, SeaweedFS S3, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-agent-first-asisten-design.md`

## Global Constraints

- Never use deprecated Gemini models (`2.5-*`, `2.0-*`, `1.5-*`). Use `gemini-3.5-flash-lite` for Fast preset and `gemini-3.7-flash` (or current 3.x thinking flagship) with `thinking_summaries: "auto"` for Deep Reasoning preset.
- Interactions API config must specify `store: false`.
- All monetary values must use `BigInt` minor units via `Money` class (`numeric(18,2)` in DB) — never use JavaScript floating point `number` for accounting sums.
- Strict double-entry balance validation: $\sum \text{Debit} == \sum \text{Kredit}$ before posting.
- Never allow journal mutations if the target date is within a closed accounting period.
- Journal sequence numbers (`JE-YYYY-NNNN`) must be acquired under `pg_advisory_xact_lock`.
- Every agent mutation must record an entry in `audit_logs` with `actor: "nara"`.
- TypeScript check `bunx tsc --noEmit` must pass with zero errors and no `any` leaks.

---

### Task 1: Database Schema & Chat Repo Enhancements

**Files:**
- Modify: `src/server/db/schema/rag.ts`
- Modify: `src/server/db/repos/chat.repo.ts`
- Test: `tests/integration/chat-sessions.test.ts`

**Interfaces:**
- Produces:
  - `chatThreads` table columns: `modelPreset: string`, `pinned: boolean`, `updatedAt: Date`
  - `chatMessages` table columns: `reasoning: string | null`, `attachments: unknown | null`, `toolInvocations: unknown | null`
  - `createThread(q, orgId, title, modelPreset?): Promise<ChatThread>`
  - `updateThread(q, orgId, threadId, patch: { title?: string; modelPreset?: string; pinned?: boolean }): Promise<ChatThread | null>`
  - `deleteThread(q, orgId, threadId): Promise<boolean>`
  - `addMessage(q, threadId, role, content, opts?: { reasoning?: string; attachments?: unknown; toolInvocations?: unknown; citations?: unknown }): Promise<ChatMessage>`

- [ ] **Step 1: Write failing integration test for thread lifecycle & message metadata**

Create `tests/integration/chat-sessions.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { chatThreads, chatMessages } from "@/server/db/schema/rag";
import {
  createThread,
  getThread,
  listThreads,
  updateThread,
  deleteThread,
  addMessage,
  listMessages,
} from "@/server/db/repos/chat.repo";
import { setupTestOrg } from "./helpers";

describe("Chat Sessions Repository", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("creates, updates title, and lists threads ordered by updatedAt", async () => {
    const t1 = await createThread(db, orgId, "Sesi Pertama", "fast");
    expect(t1.id).toBeDefined();
    expect(t1.title).toBe("Sesi Pertama");
    expect(t1.modelPreset).toBe("fast");

    const updated = await updateThread(db, orgId, t1.id, { title: "Sesi Pertama (Revisi)" });
    expect(updated?.title).toBe("Sesi Pertama (Revisi)");

    const threads = await listThreads(db, orgId);
    expect(threads.some((t) => t.id === t1.id && t.title === "Sesi Pertama (Revisi)")).toBe(true);
  });

  it("stores message with reasoning, attachments, and tool invocations", async () => {
    const t = await createThread(db, orgId, "Sesi Reasoning");
    const msg = await addMessage(db, t.id, "assistant", "Hasil perhitungan laba", {
      reasoning: "Memeriksa baris pendapatan dan beban...",
      attachments: [{ id: "att-1", fileName: "nota.pdf" }],
      toolInvocations: [{ toolName: "get_report", status: "auto" }],
      citations: [{ kind: "IFRS", ref: "§3" }],
    });

    expect(msg.content).toBe("Hasil perhitungan laba");
    expect(msg.reasoning).toBe("Memeriksa baris pendapatan dan beban...");
    expect(Array.isArray(msg.attachments)).toBe(true);
    expect(Array.isArray(msg.toolInvocations)).toBe(true);

    const msgs = await listMessages(db, t.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0].reasoning).toBe("Memeriksa baris pendapatan dan beban...");
  });

  it("deletes thread and cascades delete to messages", async () => {
    const t = await createThread(db, orgId, "Sesi Hapus");
    await addMessage(db, t.id, "user", "Halo");
    await addMessage(db, t.id, "assistant", "Halo juga");

    const deleted = await deleteThread(db, orgId, t.id);
    expect(deleted).toBe(true);

    const checkThread = await getThread(db, orgId, t.id);
    expect(checkThread).toBeNull();

    const remainingMsgs = await listMessages(db, t.id);
    expect(remainingMsgs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/chat-sessions.test.ts`  
Expected: FAIL (missing columns or functions `updateThread`, `deleteThread`).

- [ ] **Step 3: Update `src/server/db/schema/rag.ts` and `src/server/db/repos/chat.repo.ts`**

In `src/server/db/schema/rag.ts`:
Add `modelPreset`, `pinned`, `updatedAt` to `chatThreads`.
Add `reasoning`, `attachments`, `toolInvocations` to `chatMessages`.

In `src/server/db/repos/chat.repo.ts`:
Implement `createThread`, `updateThread`, `deleteThread`, and update `addMessage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/chat-sessions.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/rag.ts src/server/db/repos/chat.repo.ts tests/integration/chat-sessions.test.ts
git commit -m "feat(db): enhance chat threads and messages schema with reasoning and attachments"
```

---

### Task 2: Multi-Attachment Upload Endpoint & Storage Integration

**Files:**
- Create: `src/app/api/nara/upload/route.ts`
- Test: `tests/integration/nara-upload.test.ts`

**Interfaces:**
- Consumes: `@/server/storage/storage` (`putDocument`, `ALLOWED_MIMES`, `MAX_DOCUMENT_BYTES`), `createDocumentRow`
- Produces: `POST /api/nara/upload` returning JSON `{ files: Array<{ id: string; storageKey: string; mime: string; fileName: string; sizeBytes: number; url: string }> }`

- [ ] **Step 1: Write integration test for upload endpoint**

Create `tests/integration/nara-upload.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestOrg } from "./helpers";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/nara/upload/route";

describe("Nara Upload API", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("rejects unauthorized requests and disallowed mime types", async () => {
    const fd = new FormData();
    const fakeFile = new File(["dummy text"], "test.exe", { type: "application/x-msdownload" });
    fd.append("file", fakeFile);

    const req = new NextRequest("http://localhost:3000/api/nara/upload", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-upload.test.ts`  
Expected: FAIL (Cannot find module `@/app/api/nara/upload/route`).

- [ ] **Step 3: Implement `src/app/api/nara/upload/route.ts`**

Handle multi-file upload, check auth context via `requireContext()`, validate MIME & size, persist via `putDocument`, insert row via `createDocumentRow`, and return structured metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/nara-upload.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nara/upload/route.ts tests/integration/nara-upload.test.ts
git commit -m "feat(api): add multi-attachment upload endpoint for nara chat"
```

---

### Task 3: Full Accounting Suite Tools & Execution Engine

**Files:**
- Create: `src/server/ai/nara-tools.ts`
- Modify: `src/server/ai/nara.ts`
- Test: `tests/integration/nara-tools.test.ts`

**Interfaces:**
- Produces:
  - `ALL_NARA_TOOLS`: List of GenAI tool function schemas.
  - `MUTATING_TOOLS`: Set of tool names requiring HITL approval in smart mode: `["create_journal_draft", "post_journal", "reverse_journal", "create_account", "update_account", "archive_account", "open_period", "close_period"]`.
  - `SAFE_TOOLS`: Set of tool names auto-executed: `["list_accounts", "search_journals", "list_journals", "get_report", "get_financial_kpis", "list_periods", "check_accounting_health"]`.
  - `executeNaraTool(orgId: string, userId: string, toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>`

- [ ] **Step 1: Write integration tests for accounting tool execution**

Create `tests/integration/nara-tools.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestOrg } from "./helpers";
import { executeNaraTool, MUTATING_TOOLS, SAFE_TOOLS } from "@/server/ai/nara-tools";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";

describe("Nara Accounting Tools Execution", () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
    userId = org.ownerUserId;
  });

  it("categorizes tools into safe and mutating correctly", () => {
    expect(SAFE_TOOLS.has("list_accounts")).toBe(true);
    expect(SAFE_TOOLS.has("get_report")).toBe(true);
    expect(MUTATING_TOOLS.has("post_journal")).toBe(true);
    expect(MUTATING_TOOLS.has("create_account")).toBe(true);
  });

  it("executes safe tool list_accounts without error", async () => {
    const res = await executeNaraTool(orgId, userId, "list_accounts", {});
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("executes mutating tool create_account and validates presence in DB", async () => {
    const res = await executeNaraTool(orgId, userId, "create_account", {
      code: "6-9999",
      name: "Beban AI Testing",
      type: "EXPENSE",
      normal: "D",
    });
    expect(res.success).toBe(true);

    const [acc] = await db.select().from(accounts).where(eq(accounts.code, "6-9999"));
    expect(acc).toBeDefined();
    expect(acc.name).toBe("Beban AI Testing");
  });

  it("validates double-entry balance in post_journal", async () => {
    const res = await executeNaraTool(orgId, userId, "post_journal", {
      memo: "Transaksi Tidak Seimbang",
      dateISO: "2026-09-03",
      lines: [
        { accountCode: "1-1001", debitMinor: "100000", creditMinor: "0" },
        { accountCode: "5-1001", debitMinor: "0", creditMinor: "50000" }, // unbalance
      ],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/seimbang|balance/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-tools.test.ts`  
Expected: FAIL (Module `@/server/ai/nara-tools` not found).

- [ ] **Step 3: Implement `src/server/ai/nara-tools.ts`**

Define schemas for all 15 tools. Implement `executeNaraTool` covering COA management, journal drafts/posting/reversals with advisory locks and double-entry balance checks, period open/close, financial reports, KPIs, and doctor diagnostics. Append audit logs via `appendAudit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/nara-tools.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/nara-tools.ts tests/integration/nara-tools.test.ts
git commit -m "feat(ai): implement full accounting suite tools and execution engine with audit logs"
```

---

### Task 4: Streaming SSE Route & HITL Confirmation Endpoints

**Files:**
- Create: `src/app/api/nara/chat/stream/route.ts`
- Create: `src/app/api/nara/chat/confirm/route.ts`
- Create: `src/app/api/nara/threads/route.ts`
- Create: `src/app/api/nara/threads/[id]/route.ts`
- Test: `tests/integration/nara-stream.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/nara/chat/stream`: Server-Sent Events emitting `reasoning`, `text`, `tool_approval_request`, `tool_call`, `done`.
  - `POST /api/nara/chat/confirm`: Handles tool approval / denial decision, executes action if approved, resumes assistant turn.
  - `GET /api/nara/threads`: List threads for authenticated org.
  - `POST /api/nara/threads`: Create thread `{ title, modelPreset }`.
  - `PATCH /api/nara/threads/[id]`: Rename thread title or change preset.
  - `DELETE /api/nara/threads/[id]`: Delete thread and cascade messages.

- [ ] **Step 1: Write integration test for thread management and confirm API**

Create `tests/integration/nara-stream.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestOrg } from "./helpers";
import { NextRequest } from "next/server";
import { GET as listThreadsApi, POST as createThreadApi } from "@/app/api/nara/threads/route";
import { PATCH as renameThreadApi, DELETE as deleteThreadApi } from "@/app/api/nara/threads/[id]/route";

describe("Nara Threads and Confirm API", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("handles thread CRUD via API endpoints", async () => {
    // 1. Create thread
    const postReq = new NextRequest("http://localhost:3000/api/nara/threads", {
      method: "POST",
      body: JSON.stringify({ title: "Sesi API Baru", modelPreset: "deep" }),
      headers: { "content-type": "application/json" },
    });
    const createRes = await createThreadApi(postReq);
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.title).toBe("Sesi API Baru");

    // 2. Rename thread
    const patchReq = new NextRequest(`http://localhost:3000/api/nara/threads/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Sesi API Diperbarui" }),
      headers: { "content-type": "application/json" },
    });
    const patchRes = await renameThreadApi(patchReq, { params: Promise.resolve({ id: created.id }) });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.title).toBe("Sesi API Diperbarui");

    // 3. Delete thread
    const delReq = new NextRequest(`http://localhost:3000/api/nara/threads/${created.id}`, {
      method: "DELETE",
    });
    const delRes = await deleteThreadApi(delReq, { params: Promise.resolve({ id: created.id }) });
    expect(delRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-stream.test.ts`  
Expected: FAIL (Cannot find modules).

- [ ] **Step 3: Implement thread routes and SSE streaming route**

Implement:
- `src/app/api/nara/threads/route.ts`
- `src/app/api/nara/threads/[id]/route.ts`
- `src/app/api/nara/chat/confirm/route.ts`
- `src/app/api/nara/chat/stream/route.ts` with SSE stream pipeline, Gemini thinking deltas, and Smart HITL interceptor.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/nara-stream.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nara/threads/ src/app/api/nara/chat/ tests/integration/nara-stream.test.ts
git commit -m "feat(api): add sse streaming route, hitl confirmation and thread crud endpoints"
```

---

### Task 5: `ai-elements` React UI Component Library

**Files:**
- Create: `src/components/ai-elements/conversation.tsx`
- Create: `src/components/ai-elements/message.tsx`
- Create: `src/components/ai-elements/reasoning.tsx`
- Create: `src/components/ai-elements/confirmation.tsx`
- Create: `src/components/ai-elements/prompt-input.tsx`
- Create: `src/components/ai-elements/attachments.tsx`
- Create: `src/components/ai-elements/model-selector.tsx`
- Test: Typecheck `bunx tsc --noEmit`

**Interfaces:**
- Produces:
  - `<Conversation>`, `<ConversationContent>`, `<ConversationScrollButton>`, `<ConversationEmptyState>`
  - `<Message>`, `<MessageContent>`, `<MessageResponse>`
  - `<Reasoning>`, `<ReasoningTrigger>`, `<ReasoningContent>`
  - `<Confirmation>`, `<ConfirmationTitle>`, `<ConfirmationRequest>`, `<ConfirmationAccepted>`, `<ConfirmationRejected>`, `<ConfirmationActions>`, `<ConfirmationAction>`
  - `<PromptInput>`, `<PromptInputTextarea>`, `<PromptInputSubmit>`, `<PromptInputActions>`
  - `<Attachments>`, `<AttachmentItem>`, `<AttachmentThumbnail>`, `<AttachmentRemove>`
  - `<ModelSelector>`

- [ ] **Step 1: Create components conforming to the `ai-elements` specification**

Build the components in `src/components/ai-elements/` applying Paper & Ink matte styling (using Tailwind classes `bg-paper`, `text-ink`, `border-border`, `font-mono` for numbers, subtle motion animations).

- [ ] **Step 2: Verify type safety**

Run: `bunx tsc --noEmit`  
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-elements/
git commit -m "feat(ui): add ai-elements components styled with paper and ink design system"
```

---

### Task 6: Overhaul `/asisten` Page & Chat Client

**Files:**
- Modify: `src/app/(app)/asisten/page.tsx`
- Modify: `src/app/(app)/asisten/asisten-client.tsx`
- Test: `bunx tsc --noEmit`

**Interfaces:**
- Consumes: `src/components/ai-elements/*`, `/api/nara/chat/stream`, `/api/nara/chat/confirm`, `/api/nara/upload`, `/api/nara/threads`
- Produces: Complete responsive AI chat experience with sidebar thread management, multi-file attachments, live streaming reasoning, and inline HITL confirmation cards.

- [ ] **Step 1: Update `src/app/(app)/asisten/page.tsx`**

Ensure initial threads and organization settings are fetched server-side and passed to client component.

- [ ] **Step 2: Rewrite `src/app/(app)/asisten/asisten-client.tsx`**

Integrate:
- Collapsible Left Sidebar for Threads (with Search, New Chat button, inline title rename, delete confirmation).
- Chat Area using `Conversation` with auto-scroll and `ConversationScrollButton`.
- Empty state with `Suggestion` cards for accounting prompts.
- Messages with avatar, attachment previews, `Reasoning` collapsible thought box, and citations.
- Inline `Confirmation` approval cards for mutating tools with "Setujui", "Selalu Izinkan Sesi Ini", and "Tolak".
- Bottom sticky `PromptInput` with file upload chips, model selector (Nara Kilat vs Nara Analis), multiline input, and submit button.

- [ ] **Step 3: Verify build and types**

Run: `bunx tsc --noEmit`  
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/asisten/
git commit -m "feat(asisten): revamp assistant page with ai-elements, sessions sidebar and hitl workflow"
```

---

### Task 7: Organization HITL Policy Settings

**Files:**
- Modify: `src/app/(app)/pengaturan/pengaturan-client.tsx` (or settings subcomponents)
- Modify: `src/server/db/schema/org.ts`
- Test: `tests/integration/hitl-policy.test.ts`

**Interfaces:**
- Produces:
  - Settings UI card: "Kebijakan AI & Human-in-the-Loop"
  - Radios: `smart` (default), `strict`, `autonomous`
  - Persistence to organization settings

- [ ] **Step 1: Write integration test for HITL policy**

Create `tests/integration/hitl-policy.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestOrg } from "./helpers";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";

describe("Organization HITL Policy Setting", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("updates and persists aiHitlPolicy setting", async () => {
    await db.update(organizations).set({
      settings: { aiHitlPolicy: "strict" },
    }).where(eq(organizations.id, orgId));

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const settings = org.settings as { aiHitlPolicy?: string };
    expect(settings?.aiHitlPolicy).toBe("strict");
  });
});
```

- [ ] **Step 2: Implement HITL settings UI in Pengaturan**

Add configuration controls in settings for AI copilot policy.

- [ ] **Step 3: Run test to verify it passes**

Run: `bun run test tests/integration/hitl-policy.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/pengaturan/ tests/integration/hitl-policy.test.ts
git commit -m "feat(settings): add hitl policy settings configuration"
```

---

### Task 8: Full Verification & E2E Validation

**Files:**
- Test: `bun run test`
- Test: `bunx tsc --noEmit`
- Test: `bun run build`

- [ ] **Step 1: Run full unit & integration test suite**

Run: `bun run test`  
Expected: All tests pass.

- [ ] **Step 2: Run strict TypeScript compiler check**

Run: `bunx tsc --noEmit`  
Expected: 0 errors.

- [ ] **Step 3: Verify Next.js production build**

Run: `bun run build`  
Expected: Build succeeds with green status.

- [ ] **Step 4: Final commit and summary**

```bash
git commit --allow-empty -m "chore: complete ai agent first asisten upgrade"
```
