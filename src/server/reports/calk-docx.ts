import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { Money } from "@/core/money/money";
import type { CalkNarrative, CalkFinancialData } from "./calk-types";

export interface CalkDocxData extends CalkFinancialData {
  narrative: CalkNarrative;
}

export async function buildCalkDocx(data: CalkDocxData): Promise<Buffer> {
  const tableBorderNone = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  const tableBorderGrid = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D0D7DE" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D0D7DE" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D0D7DE" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D0D7DE" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
  };

  const createRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
          borders: tableBorderNone,
        }),
        new TableCell({
          width: { size: 6000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20 })] })],
          borders: tableBorderNone,
        }),
      ],
    });

  const createTaxRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 5500, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: label, size: 20 })] })],
          borders: tableBorderGrid,
        }),
        new TableCell({
          width: { size: 3500, type: WidthType.DXA },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: value, bold: true, size: 20 })],
            }),
          ],
          borders: tableBorderGrid,
        }),
      ],
    });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: [
          // KOP RESMI DOKUMEN
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: data.entityName.toUpperCase(),
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "CATATAN ATAS LAPORAN KEUANGAN (CALK)",
                bold: true,
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: `Untuk Periode yang Berakhir pada ${data.periodEndsOn} | Berdasarkan SAK EMKM`,
                italics: true,
                size: 20,
              }),
            ],
          }),

          // BAB 1: INFORMASI UMUM ENTITAS
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            children: [new TextRun({ text: "1. INFORMASI UMUM ENTITAS", bold: true, size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 150 },
            children: [new TextRun({ text: data.narrative.generalInfo, size: 21 })],
          }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: [
              createRow("Nama Entitas", data.entityName),
              createRow("Bidang Usaha", data.businessType),
              createRow("Domisili Usaha", data.city || "Indonesia"),
              createRow("Mata Uang Pelaporan", "Rupiah (IDR)"),
              createRow("Periode Laporan", data.periodEndsOn),
            ],
          }),

          // BAB 2: DASAR PENYUSUNAN LAPORAN KEUANGAN
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "2. DASAR PENYUSUNAN LAPORAN KEUANGAN", bold: true, size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 150 },
            children: [new TextRun({ text: data.narrative.accountingBasis, size: 21 })],
          }),

          // BAB 3: IKHTISAR KEBIJAKAN AKUNTANSI SIGNIFIKAN
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "3. IKHTISAR KEBIJAKAN AKUNTANSI SIGNIFIKAN", bold: true, size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "a. Kas dan Setara Kas: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.policies.cash, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "b. Piutang Usaha: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.policies.receivables, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "c. Persediaan: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.policies.inventory, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "d. Aset Tetap: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.policies.fixedAssets, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 150 },
            children: [
              new TextRun({ text: "e. Pengakuan Pendapatan dan Beban: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.policies.revenueExpense, size: 21 }),
            ],
          }),

          // BAB 4: PENJELASAN POS-POS LAPORAN KEUANGAN
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "4. PENJELASAN POS-POS LAPORAN KEUANGAN", bold: true, size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "4.1 Kas dan Setara Kas: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.accountNotes.cashAndBank, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "4.2 Piutang Usaha: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.accountNotes.receivables, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "4.3 Persediaan: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.accountNotes.inventory, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "4.4 Aset Tetap: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.accountNotes.fixedAssets, size: 21 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 150 },
            children: [
              new TextRun({ text: "4.5 Liabilitas: ", bold: true, size: 21 }),
              new TextRun({ text: data.narrative.accountNotes.liabilities, size: 21 }),
            ],
          }),

          // BAB 5: PAJAK PENGHASILAN (BAB 15 SAK EMKM & PP 55/2022)
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "5. PAJAK PENGHASILAN (SAK EMKM BAB 15 & PP 55 TAHUN 2022)",
                bold: true,
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 150 },
            children: [new TextRun({ text: data.narrative.incomeTaxNote, size: 21 })],
          }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: [
              createTaxRow("Jenis Wajib Pajak", data.taxpayerType === "INDIVIDUAL" ? "Orang Pribadi (UMKM)" : "Badan Usaha"),
              createTaxRow("Nomor Pokok Wajib Pajak (NPWP)", data.npwp || "Belum Terdaftar"),
              createTaxRow("Akumulasi Peredaran Bruto (Omzet)", Money.fromMinor(data.totalGrossRevenueMinor).formatIdr()),
              createTaxRow("Dasar Pengenaan Pajak (DPP)", Money.fromMinor(data.taxableRevenueMinor).formatIdr()),
              createTaxRow("Tarif Pajak PPh Final (PP 55/2022)", "0,5%"),
              createTaxRow("Beban PPh Final Terutang", Money.fromMinor(data.taxDueMinor).formatIdr()),
              createTaxRow("Realisasi Penyetoran (NTPN)", Money.fromMinor(data.taxPaidMinor).formatIdr()),
              createTaxRow(
                "Daftar NTPN Resmi",
                data.ntpnList.length > 0 ? data.ntpnList.join(", ") : "Belum Ada Setoran"
              ),
            ],
          }),

          // TANDA TANGAN & PENGESAHAN
          new Paragraph({
            spacing: { before: 600, after: 50 },
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `${data.city || "Indonesia"}, ${data.periodEndsOn}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: data.entityName,
                bold: true,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 800 },
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "( ___________________________ )",
                bold: true,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "Pimpinan Entitas / Direktur",
                size: 19,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
