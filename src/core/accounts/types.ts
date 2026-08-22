export type AccountType = "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
export type NormalBalance = "D" | "K";

export interface AccountDef {
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
  parentCode?: string;
  isCash?: boolean;
  isBank?: boolean;
  contra?: boolean;
}

export const DEFAULT_NORMAL: Record<AccountType, NormalBalance> = {
  ASET: "D",
  LIABILITAS: "K",
  EKUITAS: "K",
  PENDAPATAN: "K",
  BEBAN: "D",
};
