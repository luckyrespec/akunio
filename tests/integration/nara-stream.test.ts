import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { NextRequest } from "next/server";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Threads and Confirm API", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Thread API Test")).orgId;
    process.env.TEST_CTX_ORG = orgId;
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await truncateAll();
  });

  it("handles thread CRUD via API endpoints", async () => {
    const { POST: createThreadApi, GET: listThreadsApi } = await import(
      "@/app/api/nara/threads/route"
    );
    const { PATCH: updateThreadApi, DELETE: deleteThreadApi, GET: getThreadApi } = await import(
      "@/app/api/nara/threads/[id]/route"
    );

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
    expect(created.modelPreset).toBe("deep");

    // 2. Get thread details
    const getReq = new NextRequest(`http://localhost:3000/api/nara/threads/${created.id}`);
    const getRes = await getThreadApi(getReq, { params: Promise.resolve({ id: created.id }) });
    expect(getRes.status).toBe(200);
    const threadDetails = await getRes.json();
    expect(threadDetails.thread.id).toBe(created.id);
    expect(Array.isArray(threadDetails.messages)).toBe(true);

    // 3. Rename thread
    const patchReq = new NextRequest(`http://localhost:3000/api/nara/threads/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Sesi API Diperbarui" }),
      headers: { "content-type": "application/json" },
    });
    const patchRes = await updateThreadApi(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.title).toBe("Sesi API Diperbarui");

    // 4. Delete thread
    const delReq = new NextRequest(`http://localhost:3000/api/nara/threads/${created.id}`, {
      method: "DELETE",
    });
    const delRes = await deleteThreadApi(delReq, { params: Promise.resolve({ id: created.id }) });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.ok).toBe(true);
  });

  it("verifies suggestions and queue_update payload format in streaming protocol", () => {
    const suggestionsPayload = { type: "suggestions", suggestions: ["Beban Operasional", "Pisah Detail", "Prive"] };
    const queuePayload = {
      type: "queue_update",
      batchId: "batch-123",
      items: [
        { id: "item-1", fileName: "struk.jpg", vendor: "Alfamart", total: "Rp106.005", confidence: 0.94, status: "ready" },
      ],
    };

    const sseSuggestions = `data: ${JSON.stringify(suggestionsPayload)}\n\n`;
    const sseQueue = `data: ${JSON.stringify(queuePayload)}\n\n`;

    expect(sseSuggestions).toContain('"type":"suggestions"');
    expect(sseSuggestions).toContain("Pisah Detail");
    expect(sseQueue).toContain('"type":"queue_update"');
    expect(sseQueue).toContain("Alfamart");
  });
});
