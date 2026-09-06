import { describe, it, expect } from "vitest";
import { validateInventoryImage, MAX_INVENTORY_IMAGE_BYTES } from "@/server/storage/storage";

describe("validateInventoryImage", () => {
  it("menerima jpeg kecil", () => {
    expect(() => validateInventoryImage(Buffer.alloc(100), "image/jpeg")).not.toThrow();
  });
  it("menolak pdf", () => {
    expect(() => validateInventoryImage(Buffer.alloc(100), "application/pdf")).toThrow(/MIME/);
  });
  it("menolak lebih dari 500KB", () => {
    expect(() =>
      validateInventoryImage(Buffer.alloc(MAX_INVENTORY_IMAGE_BYTES + 1), "image/png"),
    ).toThrow(/500/);
  });
});
