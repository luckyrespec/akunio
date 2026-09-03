import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { NextRequest } from "next/server";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Upload API", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Upload Test")).orgId;
    process.env.TEST_CTX_ORG = orgId;
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await truncateAll();
  });

  it("rejects disallowed mime types with 400", async () => {
    const { POST } = await import("@/app/api/nara/upload/route");

    const fd = new FormData();
    const fakeExe = new File(["dummy executable"], "danger.exe", { type: "application/x-msdownload" });
    fd.append("file", fakeExe);

    const req = new NextRequest("http://localhost:3000/api/nara/upload", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tipe file/i);
  });

  it("rejects files exceeding max size limit with 400", async () => {
    const { POST } = await import("@/app/api/nara/upload/route");

    const fd = new FormData();
    // 6 MB fake file
    const largeBuffer = new Uint8Array(6 * 1024 * 1024);
    const largeFile = new File([largeBuffer], "huge.pdf", { type: "application/pdf" });
    fd.append("file", largeFile);

    const req = new NextRequest("http://localhost:3000/api/nara/upload", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ukuran file/i);
  });
});
