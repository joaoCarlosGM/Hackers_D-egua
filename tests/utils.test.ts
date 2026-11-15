import { describe, expect, it } from "vitest";
import { activityLink, csv, safeFilenamePart } from "../src/utils";
describe("GitHub Pages links and private CSV", () => {
  it("uses the free GitHub Pages subdirectory and preserves hash activity links", () => {
    expect(activityLink("session-id", "https://joaocarlosgm.github.io")).toBe(
      "https://joaocarlosgm.github.io/Hackers_D-egua/#atividade/session-id",
    );
  });
  it("uses readable sanitized duo names in downloaded credential files", () => {
    expect(safeFilenamePart("Dupla Poraquê & Pitiú")).toBe("dupla-poraque-pitiu");
    expect(safeFilenamePart("../Equipe\\\\Samba.csv")).toBe("equipe-samba-csv");
    expect(safeFilenamePart("   ")).toBe("sem-nome");
  });
  it("quotes names, line breaks and prevents spreadsheet formula injection", () => {
    expect(
      csv([
        [
          'Ana, "Silva"',
          "line\nbreak",
          '=HYPERLINK("bad")',
          " +cmd",
          "@SUM(A1)",
          null,
          12,
        ],
      ]),
    ).toBe(
      '\uFEFF"Ana, ""Silva""","line\nbreak","\'=HYPERLINK(""bad"")","\' +cmd","\'@SUM(A1)","","12"',
    );
  });
});
