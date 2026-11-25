import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { reviewHashFixture } from "../src/ctfReviewHashFixture";
import { explainReviewCommand, reviewMissions } from "../src/ctfReviewMissions";

describe("revisão pré-CTF no formato do CTF oficial", () => {
  it("apresenta os cinco casos do roteiro sem pontuação", () => {
    expect(reviewMissions.map(m => m.id)).toEqual([1, 2, 3, 4, 5]);
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

  it("usa os diretórios do roteiro UFPA e demonstra MD5 mais SHA-256 com hashes consistentes", () => {
    expect(reviewMissions[0].context).toContain("/var/tmp");
    expect(reviewMissions[1].context).toContain("/opt/desafio_dac/flag.txt");
    expect(reviewMissions[1].context).toContain("alunos");
    expect(reviewMissions[2].context).toContain("/var/log/auth_simulado.log");
    expect(reviewMissions[3].context).toContain("192.168.56.1");
    expect(reviewMissions[4].context).toContain("/opt/evidencias");
    expect(reviewMissions[4].objective).toContain("MD5");
    expect(reviewMissions[4].objective).toContain("SHA-256");
    const content=reviewHashFixture.fileHeader+"\n"+reviewHashFixture.flag+"\n";
    expect(createHash("sha256").update(content).digest("hex")).toBe(reviewHashFixture.sha256File);
    expect(reviewHashFixture.sha256File.endsWith(reviewHashFixture.sha256Suffix)).toBe(true);
    expect(createHash("md5").update(reviewHashFixture.flag).digest("hex")).toBe(reviewHashFixture.md5Flag);
  });

  it("explica comandos reais e pipelines sem afirmar êxito da execução", () => {
    const chmod = explainReviewCommand("chmod g+r /home/aluno/desafios/permissoes/segredo.txt");
    expect(chmod.what).toContain("permissões");
    expect(chmod.why).toContain("permissões necessárias");
    const pipeline = explainReviewCommand("grep 'Failed password' auth.log | cut -d' ' -f6 | sort | uniq -c");
    expect(pipeline.what).toContain("pipeline");
    expect(pipeline.why).toContain("contagem");
    expect(explainReviewCommand("dig @192.168.56.1 ctf.hackerspaidegua.local TXT").why).toContain("script");
    expect(explainReviewCommand("sha256sum /opt/evidencias/*").what).toContain("SHA-256");
    expect(explainReviewCommand("md5sum /opt/evidencias/registro_27.txt").why).toContain("não é criptografia");
  });
});
