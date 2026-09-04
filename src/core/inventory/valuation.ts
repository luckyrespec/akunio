import type { FifoLayer, LayerConsumption } from "./types";

/**
 * Menghitung Moving Weighted Average Cost saat ada barang masuk.
 * Kuantitas menggunakan desimal (float) sementara nominal selalu BigInt rupiah minor.
 */
export function calculateWeightedAverage(
  currentQty: number,
  currentTotalCostMinor: bigint,
  incomingQty: number,
  incomingUnitCostMinor: bigint,
): { newQty: number; newTotalCostMinor: bigint; newAverageCostMinor: bigint } {
  if (incomingQty <= 0) {
    return {
      newQty: currentQty,
      newTotalCostMinor: currentTotalCostMinor,
      newAverageCostMinor: currentQty > 0 ? currentTotalCostMinor / BigInt(Math.round(currentQty)) : 0n,
    };
  }

  const incomingTotalMinor = (incomingUnitCostMinor * BigInt(Math.round(incomingQty * 10000))) / 10000n;
  const newQty = currentQty + incomingQty;
  const newTotalCostMinor = currentTotalCostMinor + incomingTotalMinor;
  const newAverageCostMinor = newQty > 0
    ? (newTotalCostMinor * 10000n) / BigInt(Math.round(newQty * 10000))
    : 0n;

  return {
    newQty,
    newTotalCostMinor,
    newAverageCostMinor,
  };
}

/**
 * Mengonsumsi antrean batch layer FIFO untuk barang yang keluar/dijual/rusak.
 */
export function consumeFifoLayers(
  layers: FifoLayer[],
  qtyToDeduct: number,
): {
  consumedCostMinor: bigint;
  remainingLayers: FifoLayer[];
  consumedBreakdown: LayerConsumption[];
} {
  let remainingToDeduct = qtyToDeduct;
  let totalConsumedCostMinor = 0n;
  const consumedBreakdown: LayerConsumption[] = [];
  const remainingLayers: FifoLayer[] = [];

  for (const layer of layers) {
    if (remainingToDeduct <= 0) {
      remainingLayers.push({ ...layer });
      continue;
    }

    if (layer.remainingQty <= remainingToDeduct) {
      // Habiskan seluruh layer ini
      const takeQty = layer.remainingQty;
      const costMinor = (layer.unitCostMinor * BigInt(Math.round(takeQty * 10000))) / 10000n;
      totalConsumedCostMinor += costMinor;
      consumedBreakdown.push({
        layerId: layer.id,
        qtyConsumed: takeQty,
        unitCostMinor: layer.unitCostMinor,
        totalCostMinor: costMinor,
      });
      remainingToDeduct -= takeQty;
    } else {
      // Ambil sebagian dari layer ini
      const takeQty = remainingToDeduct;
      const costMinor = (layer.unitCostMinor * BigInt(Math.round(takeQty * 10000))) / 10000n;
      totalConsumedCostMinor += costMinor;
      consumedBreakdown.push({
        layerId: layer.id,
        qtyConsumed: takeQty,
        unitCostMinor: layer.unitCostMinor,
        totalCostMinor: costMinor,
      });
      remainingLayers.push({
        ...layer,
        remainingQty: layer.remainingQty - takeQty,
      });
      remainingToDeduct = 0;
    }
  }

  return {
    consumedCostMinor: totalConsumedCostMinor,
    remainingLayers,
    consumedBreakdown,
  };
}

/**
 * Menghitung selisih opname fisik vs buku sistem dan valuasinya.
 */
export function calculateStockDifference(
  systemQty: number,
  physicalQty: number,
  unitCostMinor: bigint,
): {
  differenceQty: number;
  differenceValueMinor: bigint;
  isDeficit: boolean;
} {
  const differenceQty = physicalQty - systemQty;
  const absQty = Math.abs(differenceQty);
  const rawValueMinor = (unitCostMinor * BigInt(Math.round(absQty * 10000))) / 10000n;
  const differenceValueMinor = differenceQty < 0 ? -rawValueMinor : rawValueMinor;

  return {
    differenceQty,
    differenceValueMinor,
    isDeficit: differenceQty < 0,
  };
}
