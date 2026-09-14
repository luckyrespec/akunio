import { describe, it, expect } from "vitest";
import { findPendingInMessages } from "./use-nara-stream-chat";

describe("findPendingInMessages (persetujuan terikat thread)", () => {
  it("mengembalikan null bila tidak ada persetujuan pending", () => {
    expect(findPendingInMessages([])).toBeNull();
    expect(
      findPendingInMessages([{ toolInvocations: [{ callId: "c1", toolName: "get_report", status: "auto" }] }]),
    ).toBeNull();
  });

  it("menemukan persetujuan pending dari riwayat DB", () => {
    const found = findPendingInMessages([
      { toolInvocations: [{ callId: "c1", toolName: "create_journal_draft", status: "pending_approval", args: { memo: "x" } }] },
    ]);
    expect(found?.callId).toBe("c1");
    expect(found?.toolName).toBe("create_journal_draft");
    expect(found?.args).toEqual({ memo: "x" });
  });

  it("mengembalikan arsip read-only untuk persetujuan yang sudah diputuskan di pesan berikutnya", () => {
    const found = findPendingInMessages([
      { toolInvocations: [{ callId: "c1", toolName: "post_journal", status: "pending_approval", args: {} }] },
      { toolInvocations: [{ callId: "c1", toolName: "post_journal", status: "approved", args: {} }] },
    ]);
    // Perilaku arsip (50c79c2): kartu putusan tetap tampil read-only,
    // tombol disabled — bukan null.
    expect(found?.callId).toBe("c1");
    expect(found?.decided).toBe("approved");
  });

  it("memilih persetujuan terbaru bila ada beberapa", () => {
    const found = findPendingInMessages([
      { toolInvocations: [{ callId: "c1", toolName: "post_journal", status: "pending_approval", args: {} }] },
      { toolInvocations: [{ callId: "c2", toolName: "create_invoice", status: "pending_approval", args: {} }] },
    ]);
    expect(found?.callId).toBe("c2");
  });
});
