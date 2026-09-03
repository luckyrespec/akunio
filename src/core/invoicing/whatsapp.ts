import { Money } from "@/core/money/money";

export function normalizeIndonesianPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

export interface WhatsAppReminderInput {
  name: string;
  phone?: string | null;
}

export interface WhatsAppInvoiceInput {
  invoiceNumber: string;
  dueDate: string;
  remainingMinor: bigint;
}

export interface BankAccountInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export function formatWhatsAppReminder(
  contact: WhatsAppReminderInput,
  invoice: WhatsAppInvoiceInput,
  bank?: BankAccountInfo
): {
  phone: string;
  message: string;
  waLink: string;
} {
  const phone = contact.phone ? normalizeIndonesianPhone(contact.phone) : "";
  const remainingStr = Money.fromMinor(invoice.remainingMinor).formatIdr();

  const bankText = bank
    ? `\nPembayaran dapat ditransfer melalui:\n*Bank ${bank.bankName}*\nNo. Rekening: *${bank.accountNumber}*\nA/N: *${bank.accountHolder}*\n`
    : "";

  const message = `Halo ${contact.name},

Semoga dalam keadaan sehat selalu.

Kami ingin menginformasikan pengingat mengenai tagihan faktur *#${invoice.invoiceNumber}* sebesar *${remainingStr}* yang jatuh tempo pada *${invoice.dueDate}*.
${bankText}
Mohon konfirmasikan kepada kami apabila pembayaran telah dilakukan atau jika ada kendala terkait tagihan ini.

Terima kasih atas kerja samanya! 🙏`;

  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return {
    phone,
    message,
    waLink,
  };
}
