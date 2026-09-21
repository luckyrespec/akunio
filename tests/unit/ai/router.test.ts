import { describe, it, expect } from "vitest";
import { LlmAgent, isRoutedAgent } from "@google/adk";
import { routeIntent, buildAccountantRouter } from "@/server/ai/agents/router";
import { buildRoutedAdkAgent } from "@/server/ai/agents/adk-runner";
import { bookkeepingAgent, analystAgent, accountantCoordinator } from "@/server/ai/agents/definitions";
import { DEFAULT_AI_PREFS } from "@/lib/ai-prefs";

describe("routeIntent", () => {
  it("catat/posting/draft/faktur/kas → bookkeeping", () => {
    expect(routeIntent("catat bayar sewa 5jt")).toBe("bookkeeping");
    expect(routeIntent("buatkan faktur untuk PT ABC")).toBe("bookkeeping");
  });
  it("laba/rugi/laporan/kenapa turun → analyst", () => {
    expect(routeIntent("kenapa laba bulan ini turun?")).toBe("analyst");
  });
  it("ambigu → coordinator", () => {
    expect(routeIntent("halo")).toBe("coordinator");
  });
  it("campuran aksi + tanya analisis → bookkeeping (aksi menang)", () => {
    expect(routeIntent("catat bayar sewa ini, kenapa laba turun?")).toBe("bookkeeping");
  });
});

describe("buildAccountantRouter", () => {
  it("terkontruksi tanpa network dan bernama accountant_router", () => {
    const router = buildAccountantRouter({
      bookkeeping: bookkeepingAgent,
      analyst: analystAgent,
      coordinator: accountantCoordinator,
    });
    expect(router.name).toBe("accountant_router");
    expect(bookkeepingAgent).toBeInstanceOf(LlmAgent);
    expect(analystAgent).toBeInstanceOf(LlmAgent);
    expect(accountantCoordinator).toBeInstanceOf(LlmAgent);
  });
});

describe("buildRoutedAdkAgent", () => {
  it("me-root-kan accountant_router tanpa network (slot coordinator = agen routed)", () => {
    const root = buildRoutedAdkAgent({
      orgId: "org-uji",
      actorEmail: "uji@example.com",
      route: "bookkeeping",
      instruction: "konteks uji",
      model: "gemini-3.5-flash-lite",
      gate: { prefs: DEFAULT_AI_PREFS, hitlPolicy: "smart", allowAllForSession: false },
    });
    expect(root.name).toBe("accountant_router");
    expect(isRoutedAgent(root)).toBe(true);
  });
});
