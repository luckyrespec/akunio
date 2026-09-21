import { Money } from "@/core/money/money";

export interface JournalLineInput {
  accountCode: string;
  debitText: string;
  creditText: string;
}

export interface ValidationAccount {
  code: string;
  parentCode: string | null;
  archivedAt: Date | null;
}

export interface ValidationContext {
  accounts: ValidationAccount[];
  periodStatus: string | null;
  periodName: string | null;
}

function parseSide(raw: string): bigint | null {
  const t = raw.trim();
  if (t === "" || t === "0") return 0n;
  try {
    return Money.parseIdr(t).minor;
  } catch {
    return null;
  }
}

export function validateJournalLines(
  lines: JournalLineInput[],
  ctx: ValidationContext,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (ctx.periodStatus !== null && ctx.periodStatus !== "OPEN") {
    const name = ctx.periodName ?? ctx.periodStatus;
    errors.push(`Periode ${name} tidak terbuka (status: ${ctx.periodStatus}). Tanggal transaksi harus berada dalam periode berstatus OPEN.`);
  }

  const byCode = new Map(ctx.accounts.map((a) => [a.code, a]));
  let totalDebit = 0n;
  let totalCredit = 0n;

  lines.forEach((line, i) => {
    const no = i + 1;
    const acct = byCode.get(line.accountCode);
    if (!acct) {
      errors.push(`Baris ${no}: akun ${line.accountCode} tidak ditemukan di COA.`);
    } else {
      if (ctx.accounts.some((a) => a.parentCode === acct.code)) {
        errors.push(`Baris ${no}: akun ${acct.code} adalah akun GROUP (memiliki akun anak) dan tidak dapat dipakai untuk posting. Pilih akun anak yang dapat diposting.`);
      }
      if (acct.archivedAt !== null) {
        errors.push(`Baris ${no}: akun ${acct.code} sudah diarsipkan dan tidak dapat dipakai untuk posting.`);
      }
    }

    const d = parseSide(line.debitText);
    const c = parseSide(line.creditText);
    if (d === null) {
      errors.push(`Baris ${no}: nominal debit "${line.debitText}" tidak valid.`);
    }
    if (c === null) {
      errors.push(`Baris ${no}: nominal kredit "${line.creditText}" tidak valid.`);
    }
    const debit = d ?? 0n;
    const credit = c ?? 0n;
    const debitFilled = debit > 0n;
    const creditFilled = credit > 0n;
    if (debitFilled === creditFilled) {
      errors.push(`Baris ${no}: setiap baris harus mengisi tepat satu sisi (debit atau kredit) dengan nominal lebih dari 0.`);
    }
    totalDebit += debit;
    totalCredit += credit;
  });

  if (totalDebit !== totalCredit) {
    errors.push(
      `Jurnal tidak seimbang: total debit ${Money.formatIdr(totalDebit)} tidak sama dengan total kredit ${Money.formatIdr(totalCredit)}.`,
    );
  }

  return { ok: errors.length === 0, errors };
}
