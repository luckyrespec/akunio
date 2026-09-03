export const BUSINESS_TYPES = [
  "DAGANG",
  "JASA",
  "KULINER",
  "MANUFAKTUR",
  "ONLINE_RESALE",
  "KOS_PROPERTI",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  DAGANG: "Dagang / Toko",
  JASA: "Jasa",
  KULINER: "Kuliner / F&B",
  MANUFAKTUR: "Manufaktur",
  ONLINE_RESALE: "Online / Reseller",
  KOS_PROPERTI: "Kos & Properti",
};
