export type ValuationMethod = "WEIGHTED_AVERAGE" | "FIFO";
export type RecordingMethod = "PERPETUAL" | "PERIODIC";

export interface FifoLayer {
  id?: string;
  itemId: string;
  date: string;
  initialQty: number;
  remainingQty: number;
  unitCostMinor: bigint;
  referenceType: "PURCHASE" | "OPENING_BALANCE" | "ADJUSTMENT";
  referenceId?: string | null;
}

export interface LayerConsumption {
  layerId?: string;
  qtyConsumed: number;
  unitCostMinor: bigint;
  totalCostMinor: bigint;
}

export interface InventoryItemState {
  currentQty: number;
  totalCostMinor: bigint;
  averageCostMinor: bigint;
}
