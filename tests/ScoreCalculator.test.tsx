// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ScoreCalculator from "../src/ScoreCalculator";

afterEach(cleanup);

describe("student point calculator", () => {
  it("uses consistent activity names and shows one makeup assessment", () => {
    render(<ScoreCalculator />);
    expect(screen.getByLabelText("Nota Atividade 02")).toBeTruthy();
    expect(screen.getByLabelText("Nota Atividade 03")).toBeTruthy();
    expect(screen.getByLabelText("Nota Atividade 04")).toBeTruthy();
    expect(screen.getAllByText("Recuperação de nota")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Exibir todas as 16 atividades" }));
    expect(screen.getByLabelText("Nota Atividade 05")).toBeTruthy();
    expect(screen.getByLabelText("Nota Atividade 01")).toBeTruthy();
    expect(screen.getByLabelText("Nota Atividade 16")).toBeTruthy();
    expect(screen.queryByLabelText("Nota Atividade 17")).toBeNull();
    expect(screen.queryByLabelText("Nota Atividade 18")).toBeNull();
  });

  it("shows one makeup grade without adding it to the ranking automatically", () => {
    render(<ScoreCalculator />);
    fireEvent.change(screen.getByLabelText("Nota Atividade 02"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Nota Atividade 03"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Nota da recuperação"), { target: { value: "9" } });
    expect(screen.getByText("90%", { exact: false })).toBeTruthy();
    expect(screen.getByText("9/10", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("100", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Atividade substituída pela reposição")).toBeNull();
  });

  it("validates the single makeup grade independently of other activity results", () => {
    render(<ScoreCalculator />);
    fireEvent.change(screen.getByLabelText("Nota da recuperação"), { target: { value: "11" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nota da recuperação"), { target: { value: "10" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
