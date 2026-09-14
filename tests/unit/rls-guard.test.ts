import { describe, it, expect } from "vitest";
import { guardTestDb } from "../integration/helpers";

// M5: ensureRlsTestRole (DDL peran test) wajib berpagar guardTestDb agar tak
// pernah menyentuh DB dev. Unit murni — tanpa koneksi DB.
describe("guardTestDb pagar peran RLS (M5)", () => {
  it("melempar SAFETY pada URL non-test", () => {
    expect(() =>
      guardTestDb("postgres://user:pw@localhost:5432/neondb"),
    ).toThrow(/SAFETY/);
    expect(() =>
      guardTestDb("postgres://user:pw@localhost:5432/akunio_dev"),
    ).toThrow(/SAFETY/);
  });

  it("meloloskan URL ledger_test apa adanya", () => {
    const url = "postgres://user:pw@localhost:5432/ledger_test";
    expect(guardTestDb(url)).toBe(url);
  });
});
