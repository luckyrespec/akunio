export interface StatementLineForMatching {
  id: string;
  date: string;
  type: "CR" | "DB";
  amountMinor: bigint;
  description: string;
  referenceNumber?: string | null;
}

export interface JournalLineForMatching {
  id: string;
  date: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo?: string | null;
}

export interface ContactInfo {
  id: string;
  name: string;
}

export interface InvoiceInfo {
  id: string;
  invoiceNumber: string;
  contactId?: string | null;
}

export interface MatchProposal {
  statementLineId: string;
  journalLineId: string;
  confidenceScore: number;
  aiNotes?: string;
  tier: "TIER1_EXACT" | "TIER2_AI_RECOMMENDATION";
}

export interface MatchResult {
  exactMatches: MatchProposal[];
  aiSuggestions: MatchProposal[];
  unmatchedStatementLineIds: string[];
  unmatchedJournalLineIds: string[];
}

export interface DifferenceResult {
  statementBalanceMinor: bigint;
  reconciledLedgerBalanceMinor: bigint;
  differenceMinor: bigint;
  isBalanced: boolean;
}

function parseDateDays(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
}

/**
 * Calculates reconciliation difference between statement closing balance and reconciled ledger balance.
 */
export function calculateReconciliationDifference(
  statementBalanceMinor: bigint,
  reconciledLedgerBalanceMinor: bigint
): DifferenceResult {
  const differenceMinor = statementBalanceMinor - reconciledLedgerBalanceMinor;
  return {
    statementBalanceMinor,
    reconciledLedgerBalanceMinor,
    differenceMinor,
    isBalanced: differenceMinor === 0n,
  };
}

/**
 * Pure 3-tier matching engine for bank statement lines and ledger journal lines.
 */
export function matchBankTransactions(
  statementLines: StatementLineForMatching[],
  journalLines: JournalLineForMatching[],
  contacts: ContactInfo[] = [],
  invoices: InvoiceInfo[] = []
): MatchResult {
  const exactMatches: MatchProposal[] = [];
  const aiSuggestions: MatchProposal[] = [];

  const matchedStmtIds = new Set<string>();
  const matchedJournalIds = new Set<string>();

  // 1. TIER 1: Exact Auto-Match
  // Amount matches exactly, opposite flow (Bank CR = Ledger Debit, Bank DB = Ledger Credit),
  // Date within +/- 3 days window.
  for (const sLine of statementLines) {
    if (matchedStmtIds.has(sLine.id)) continue;
    const sDays = parseDateDays(sLine.date);

    for (const jLine of journalLines) {
      if (matchedJournalIds.has(jLine.id)) continue;

      // Check amount and direction
      const directionMatches =
        (sLine.type === "CR" && jLine.debitMinor === sLine.amountMinor) ||
        (sLine.type === "DB" && jLine.creditMinor === sLine.amountMinor);

      if (!directionMatches) continue;

      const jDays = parseDateDays(jLine.date);
      const diffDays = Math.abs(sDays - jDays);

      if (diffDays <= 3) {
        exactMatches.push({
          statementLineId: sLine.id,
          journalLineId: jLine.id,
          confidenceScore: 100,
          tier: "TIER1_EXACT",
        });
        matchedStmtIds.add(sLine.id);
        matchedJournalIds.add(jLine.id);
        break;
      }
    }
  }

  // 2. TIER 2: AI Recommendation Match
  // For remaining unmatched statement lines:
  // - Nominal matches but date > 3 days, OR
  // - Description matches an invoice number or contact name mentioned in ledger entry
  for (const sLine of statementLines) {
    if (matchedStmtIds.has(sLine.id)) continue;

    const descUpper = sLine.description.toUpperCase();

    // Check if description contains any known invoice number
    let matchedInvoice: InvoiceInfo | undefined;
    for (const inv of invoices) {
      if (descUpper.includes(inv.invoiceNumber.toUpperCase())) {
        matchedInvoice = inv;
        break;
      }
    }

    // Check if description contains any known contact name
    let matchedContact: ContactInfo | undefined;
    for (const c of contacts) {
      if (c.name && c.name.length >= 3 && descUpper.includes(c.name.toUpperCase())) {
        matchedContact = c;
        break;
      }
    }

    for (const jLine of journalLines) {
      if (matchedJournalIds.has(jLine.id)) continue;

      const directionMatches =
        (sLine.type === "CR" && jLine.debitMinor === sLine.amountMinor) ||
        (sLine.type === "DB" && jLine.creditMinor === sLine.amountMinor);

      if (!directionMatches) continue;

      let score = 0;
      const notes: string[] = [];

      if (matchedInvoice) {
        score += 85;
        notes.push(`Nomor faktur ${matchedInvoice.invoiceNumber} terdeteksi pada mutasi bank`);
      } else if (matchedContact) {
        score += 75;
        notes.push(`Nama mitra ${matchedContact.name} terdeteksi pada mutasi bank`);
      } else {
        score += 70;
        notes.push(`Nominal cocok, namun tanggal transaksi berselisih lebih dari 3 hari`);
      }

      aiSuggestions.push({
        statementLineId: sLine.id,
        journalLineId: jLine.id,
        confidenceScore: Math.min(score, 95),
        aiNotes: notes.join(". "),
        tier: "TIER2_AI_RECOMMENDATION",
      });
      matchedStmtIds.add(sLine.id);
      matchedJournalIds.add(jLine.id);
      break;
    }
  }

  const unmatchedStatementLineIds = statementLines
    .filter((s) => !matchedStmtIds.has(s.id))
    .map((s) => s.id);

  const unmatchedJournalLineIds = journalLines
    .filter((j) => !matchedJournalIds.has(j.id))
    .map((j) => j.id);

  return {
    exactMatches,
    aiSuggestions,
    unmatchedStatementLineIds,
    unmatchedJournalLineIds,
  };
}
