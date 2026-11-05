import { describe, expect, it } from "vitest";
import { activityLink, csv } from "../src/utils";
describe("GitHub Pages links and private CSV", () => {
  it("uses the free GitHub Pages subdirectory and preserves hash activity links", () => {
    expect(activityLink("session-id", "https://joaocarlosgm.github.io")).toBe(
      "https://joaocarlosgm.github.io/Hackers_D-egua/#atividade/session-id",
    );
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
