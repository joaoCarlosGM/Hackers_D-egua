import { describe, expect, it } from "vitest";
import { explainReviewCommand, reviewMissions } from "../src/ctfReviewMissions";

describe("revisão pré-CTF no formato do CTF oficial", () => {
  it("apresenta quatro casos pedagógicos completos e sem pontuação", () => {
    expect(reviewMissions.map(m => m.id)).toEqual([1, 2, 3, 4]);
    for (const mission of reviewMissions) {
      expect(mission.incident.length).toBeGreaterThan(60);
      expect(mission.context.length).toBeGreaterThan(60);
      expect(mission.objective.length).toBeGreaterThan(45);
      expect(mission.deliverable.length).toBeGreaterThan(25);
      expect(mission.realWorld.length).toBeGreaterThan(45);
      expect(mission.steps).toHaveLength(3);
      for (const step of mission.steps) {
        expect(step.doing.length).toBeGreaterThan(20);
        expect(step.why.length).toBeGreaterThan(35);
        expect(step.example.trim()).not.toBe("");
      }
      expect(mission.studentQuestion.includes("?")).toBe(true);
      expect(mission.closing.length).toBeGreaterThan(60);
      expect(JSON.stringify(mission).toLowerCase()).not.toContain("pontuação:");
    }
  });

  it("identifica limitações pedagógicas de permissões e DNS", () => {
    expect(reviewMissions[1].caveat).toContain("root");
    expect(reviewMissions[3].caveat).toContain("script");
    expect(reviewMissions[3].caveat).toContain("Não existe um servidor DNS local real");
  });

  it("explica comandos reais e pipelines sem afirmar êxito da execução", () => {
    const chmod = explainReviewCommand("chmod g+r /home/aluno/desafios/permissoes/segredo.txt");
    expect(chmod.what).toContain("permissões");
    expect(chmod.why).toContain("permissões necessárias");
    const pipeline = explainReviewCommand("grep 'Failed password' auth.log | cut -d' ' -f6 | sort | uniq -c");
    expect(pipeline.what).toContain("pipeline");
    expect(pipeline.why).toContain("contagem");
    expect(explainReviewCommand("dig @127.0.0.1 ctf.hackerspaidegua.local TXT").why).toContain("script");
  });
});
