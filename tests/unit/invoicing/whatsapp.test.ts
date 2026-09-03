import { describe, it, expect } from "vitest";
import { formatWhatsAppReminder, normalizeIndonesianPhone } from "@/core/invoicing/whatsapp";

describe("WhatsApp Reminder Generator", () => {
  it("normalizes Indonesian phone numbers correctly", () => {
    expect(normalizeIndonesianPhone("081234567890")).toBe("6281234567890");
    expect(normalizeIndonesianPhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeIndonesianPhone("6281234567890")).toBe("6281234567890");
    expect(normalizeIndonesianPhone("81234567890")).toBe("6281234567890");
  });

  it("formats polite Indonesian reminder message and wa.me link", () => {
    const contact = { name: "Pak Budi", phone: "081234567890" };
    const invoice = {
      invoiceNumber: "INV-2026-0001",
      dueDate: "2026-09-15",
      remainingMinor: 55500000n, // Rp 555.000
    };
    const bank = { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT Neraca" };

    const result = formatWhatsAppReminder(contact, invoice, bank);
    expect(result.phone).toBe("6281234567890");
    expect(result.message).toContain("Pak Budi");
    expect(result.message).toContain("INV-2026-0001");
    expect(result.message).toContain("Rp555.000");
    expect(result.message).toContain("Bank BCA");
    expect(result.message).toContain("1234567890");
    expect(result.waLink).toContain("https://wa.me/6281234567890?text=");
  });
});
