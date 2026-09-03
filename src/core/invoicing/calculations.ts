import type { InvoiceStatus } from "@/server/db/schema/invoicing";

export interface ItemCalculationInput {
  quantity: number | string;
  unitPriceMinor: bigint;
  discountMinor?: bigint;
  taxRatePercent?: number | string;
}

export interface ItemCalculationResult {
  quantityNum: number;
  subtotalMinor: bigint;
  discountMinor: bigint;
  netSubtotalMinor: bigint;
  taxRate: number;
  taxMinor: bigint;
  totalMinor: bigint;
}

export interface InvoiceCalculationResult {
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  items: ItemCalculationResult[];
}

/**
 * Calculates item totals: subtotal, discount, net subtotal, tax, and item total.
 */
export function calculateItemTotal(
  quantity: number | string,
  unitPriceMinor: bigint,
  discountMinor: bigint = 0n,
  taxRatePercent: number | string = 0
): ItemCalculationResult {
  const qty = typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity;
  const taxRate = typeof taxRatePercent === "string" ? parseFloat(taxRatePercent) || 0 : taxRatePercent;

  // subtotal = qty * unitPrice
  // To keep precision with decimals in quantity:
  const qtyScaled = BigInt(Math.round(qty * 100));
  const subtotalMinor = (qtyScaled * unitPriceMinor) / 100n;
  const disc = discountMinor > subtotalMinor ? subtotalMinor : discountMinor;
  const netSubtotalMinor = subtotalMinor - disc;

  // tax = netSubtotal * (taxRate / 100)
  const taxRateScaled = BigInt(Math.round(taxRate * 100));
  const taxMinor = (netSubtotalMinor * taxRateScaled) / 10000n;

  const totalMinor = netSubtotalMinor + taxMinor;

  return {
    quantityNum: qty,
    subtotalMinor,
    discountMinor: disc,
    netSubtotalMinor,
    taxRate,
    taxMinor,
    totalMinor,
  };
}

/**
 * Calculates global invoice totals across multiple line items.
 */
export function calculateInvoiceTotals(
  items: ItemCalculationInput[],
  globalDiscountMinor: bigint = 0n
): InvoiceCalculationResult {
  let subtotalMinor = 0n;
  let itemsDiscountMinor = 0n;
  let taxMinor = 0n;
  const calculatedItems: ItemCalculationResult[] = [];

  for (const it of items) {
    const res = calculateItemTotal(
      it.quantity,
      it.unitPriceMinor,
      it.discountMinor ?? 0n,
      it.taxRatePercent ?? 0
    );
    calculatedItems.push(res);
    subtotalMinor += res.subtotalMinor;
    itemsDiscountMinor += res.discountMinor;
    taxMinor += res.taxMinor;
  }

  const totalDiscountMinor = itemsDiscountMinor + globalDiscountMinor;
  const netSubtotal = subtotalMinor > totalDiscountMinor ? subtotalMinor - totalDiscountMinor : 0n;
  const totalMinor = netSubtotal + taxMinor;

  return {
    subtotalMinor,
    discountMinor: totalDiscountMinor,
    taxMinor,
    totalMinor,
    items: calculatedItems,
  };
}

/**
 * Determines invoice status based on amount paid, total amount, and due date.
 */
export function determineInvoiceStatus(
  totalMinor: bigint,
  amountPaidMinor: bigint,
  dueDate: string | Date,
  now: Date = new Date()
): InvoiceStatus {
  if (totalMinor <= 0n) return "PAID";
  if (amountPaidMinor >= totalMinor) return "PAID";

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  // Normalize date without time for fair comparison
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (amountPaidMinor > 0n) {
    return "PARTIALLY_PAID";
  }

  if (nowDay > dueDay) {
    return "OVERDUE";
  }

  return "ISSUED";
}
