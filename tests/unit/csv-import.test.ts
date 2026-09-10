import { describe, it, expect } from "vitest";
import { parseCsv } from "@/core/import/csv";

describe("parseCsv", () => {
  it("deteksi titik-koma ala Excel Indonesia", () => {
    const p = parseCsv("nama;harga_jual;stok_awal\nTeh Botol;5000;24\n");
    expect(p.headers).toEqual(["nama", "harga_jual", "stok_awal"]);
    expect(p.rows).toEqual([["Teh Botol", "5000", "24"]]);
  });

  it("deteksi koma", () => {
    const p = parseCsv("name,price\nKopi,8000\n");
    expect(p.headers).toEqual(["name", "price"]);
    expect(p.rows).toEqual([["Kopi", "8000"]]);
  });

  it("quote berisi delimiter + escaped quote", () => {
    const p = parseCsv('nama;catatan\n"Indomie; goreng";"rasa ""spesial"""\n');
    expect(p.rows).toEqual([["Indomie; goreng", 'rasa "spesial"']]);
  });

  it("BOM, CRLF, dan baris kosong dilewati", () => {
    const p = parseCsv("﻿nama;stok\r\nMie;10\r\n\r\nKopi;5\r\n");
    expect(p.headers).toEqual(["nama", "stok"]);
    expect(p.rows).toEqual([["Mie", "10"], ["Kopi", "5"]]);
  });

  it("kosong total", () => {
    expect(parseCsv("  \n ")).toEqual({ headers: [], rows: [] });
  });
});
