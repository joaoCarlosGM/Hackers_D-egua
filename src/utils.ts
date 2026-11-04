export function activityLink(
  sessionId: string,
  origin = window.location.origin,
  base = import.meta.env.BASE_URL,
) {
  return `${origin}${base}#atividade/${encodeURIComponent(sessionId)}`;
}
export function csv(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? "");
            // Neutralize spreadsheet formula injection, including leading whitespace.
            if (/^[\s]*[=+\-@\t\r\n]/.test(cell)) cell = "'" + cell;
            return '"' + cell.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function download(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type DraftQuestion = {
  prompt: string;
  kind: "multiple_choice" | "true_false";
  points: number;
  options: { label: string; is_correct: boolean }[];
};
export const newQuestion = (): DraftQuestion => ({
  prompt: "",
  kind: "multiple_choice",
  points: 10,
  options: [
    { label: "", is_correct: true },
    { label: "", is_correct: false },
  ],
});
