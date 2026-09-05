export interface CalkNarrative {
  generalInfo: string;
  accountingBasis: string;
  policies: {
    cash: string;
    receivables: string;
    inventory: string;
    fixedAssets: string;
    revenueExpense: string;
  };
  accountNotes: {
    cashAndBank: string;
    receivables: string;
    inventory: string;
    fixedAssets: string;
    liabilities: string;
  };
  incomeTaxNote: string;
}

export interface CalkFinancialData {
  entityName: string;
  businessType: string;
  city?: string;
  periodName: string;
  periodEndsOn: string;
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  totalEquityMinor: bigint;
  totalRevenueMinor: bigint;
  grossProfitMinor: bigint;
  netIncomeMinor: bigint;
  taxpayerType: "INDIVIDUAL" | "CORPORATE";
  npwp?: string;
  totalGrossRevenueMinor: bigint;
  taxableRevenueMinor: bigint;
  taxDueMinor: bigint;
  taxPaidMinor: bigint;
  ntpnList: string[];
}
