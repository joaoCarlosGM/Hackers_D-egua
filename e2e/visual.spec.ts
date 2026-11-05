import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Browser-only visual fixtures. Every Supabase request is intercepted; no remote writes.
const host = "https://visual-tests.supabase.co";
const classes = [
  { id: "c1", name: "Poraquê", slug: "poraque", status: "active" as const },
  { id: "c2", name: "Pitiú", slug: "pitiu", status: "active" as const },
];
const names = [
  "Boto Cor-de-Rosa",
  "Camuflados do Mangal",
  "Carimbó Hacker",
  "Tropa do Açaí",
  "Scripteiros do Ver-o-Peso",
];
const ranking = names.map((public_name, i) => ({
  team_id: `t${i}`,
  class_id: i % 2 ? "c2" : "c1",
  public_name,
  points: [950, 800, 650, 450, 300][i],
  solved_count: [7, 6, 5, 4, 2][i],
}));
const team = {
  team_id: "t0",
  class_id: "c1",
  public_name: names[0],
  access_code: "ABCDEF1234567890",
  token: "0".repeat(64),
};
const questions = [
  {
    id: "q1",
    activity_id: "a1",
    position: 1,
    prompt: "Qual comando lista os arquivos de uma pasta no Linux?",
    kind: "multiple_choice",
    points: 10,
    explanation: "O comando ls lista os arquivos do diretório.",
    options: [
      { id: "o1", label: "ls" },
      { id: "o2", label: "mkdir" },
      { id: "o3", label: "clear" },
      { id: "o4", label: "pwd" },
    ],
  },
  {
    id: "q2",
    activity_id: "a1",
    position: 2,
    prompt: "O Linux é um sistema de código aberto.",
    kind: "true_false",
    points: 5,
    explanation: "O código do kernel Linux é aberto.",
    options: [
      { id: "o5", label: "Verdadeiro" },
      { id: "o6", label: "Falso" },
    ],
  },
];
const activity = {
  id: "s1",
  title: "Primeiros passos no Linux",
  description:
    "Uma dupla, muitas descobertas. Vamos explorar o terminal juntos.",
  class_ids: ["c1", "c2"],
  closes_at: null,
  allow_backtracking: true,
  questions,
};
const sessions = [
  {
    id: "s1",
    activity_id: "a1",
    class_ids: ["c1", "c2"],
    published: true,
    status: "open",
    access_code: "AABBCCDD",
    ctf_enabled: false,
    closes_at: null,
    time_limit_seconds: 600,
    allow_backtracking: true,
    release_results: false,
  },
];
const results = {
  title: activity.title,
  registered_teams: 5,
  sessions,
  participants: [
    {
      attempt_id: "attempt1",
      team_id: "t0",
      public_name: names[0],
      class_name: "Poraquê",
      members: ["Ana da Silva", "João dos Santos"],
      started_at: "2026-11-04T18:30:00Z",
      submitted_at: "2026-11-04T18:35:00Z",
      submission_no: 1,
      retry_available: false,
      points: 15,
      max_points: 15,
      feedback: "",
      answers: [
        {
          question_id: "q1",
          prompt: questions[0].prompt,
          selected: "ls",
          correct: true,
          explanation: questions[0].explanation,
        },
      ],
    },
  ],
  question_stats: [
    { id: "q1", prompt: questions[0].prompt, responses: 1, correct: 1 },
    { id: "q2", prompt: questions[1].prompt, responses: 1, correct: 1 },
  ],
};

async function fixtures(
  page: Page,
  role: "guest" | "team" | "staff" | "admin",
) {
  await page.addInitScript(
    ({ role, team }) => {
      sessionStorage.clear();
      localStorage.clear();
      if (role === "team")
        sessionStorage.setItem("hpde:team", JSON.stringify(team));
      if (role === "staff" || role === "admin") {
        const user = {
          id: "staff1",
          aud: "authenticated",
          role: "authenticated",
          email: "professor@example.test",
          app_metadata: { provider: "email" },
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, role: "authenticated", exp }))}.visual-test-only`;
        localStorage.setItem(
          "sb-visual-tests-auth-token",
          JSON.stringify({
            access_token: jwt,
            refresh_token: "visual-only",
            expires_in: 3600,
            expires_at: exp,
            token_type: "bearer",
            user,
          }),
        );
      }
    },
    { role, team },
  );
  await page.route(`${host}/**`, async (route) => {
    const url = new URL(route.request().url());
    const resource = url.pathname.split("/").pop()!;
    const tables: Record<string, unknown> = {
      classes,
      public_leaderboard: ranking,
      admin_users:
        role === "staff" || role === "admin"
          ? [
              {
                user_id: "staff1",
                role: role === "admin" ? "admin" : "teacher",
              },
            ]
          : [],
      activities: [
        {
          id: "a1",
          title: activity.title,
          description: activity.description,
          locked_at: "2026-11-04T18:00:00Z",
          revision: 1,
          revision_of: null,
        },
      ],
      activity_sessions: sessions,
      attempts: [
        {
          id: "attempt1",
          team_id: "t0",
          activity_session_id: "s1",
          submission_no: 1,
          submitted_at: "2026-11-04T18:35:00Z",
          retry_available: false,
        },
      ],
      grades: [
        {
          id: "g1",
          attempt_id: "attempt1",
          points: 15,
          max_points: 15,
          feedback: "Ótimo trabalho em dupla!",
        },
      ],
      teams: ranking.map((t) => ({
        ...t,
        id: t.team_id,
        access_code: "ABCDEF1234567890",
      })),
      team_members: [
        { id: "m1", team_id: "t0", position: 1, full_name: "Ana da Silva" },
        { id: "m2", team_id: "t0", position: 2, full_name: "João dos Santos" },
      ],
      questions: questions.map((q) => ({ ...q, options: undefined })),
      question_options: questions.flatMap((q) =>
        q.options.map((o, i) => ({
          ...o,
          question_id: q.id,
          position: i + 1,
          is_correct: i === 0,
        })),
      ),
      answers: [
        {
          id: "ans1",
          attempt_id: "attempt1",
          question_id: "q1",
          option_id: "o1",
        },
      ],
    };
    const rpc: Record<string, unknown> = {
      public_activity: activity,
      team_history: { team, attempts: [] },
      join_activity: {
        attempt_id: "attempt1",
        submitted: false,
        deadline: null,
        progress: { answers: {}, current_question: 0 },
      },
      save_attempt_progress: null,
      assessment_results: results,
      list_classes_admin: [
        ...classes.map((c) => ({
          ...c,
          team_count: ranking.filter((t) => t.class_id === c.id).length,
          attempt_count: 1,
          activity_count: 1,
          can_delete: false,
        })),
        ...(role === "admin"
          ? [
              {
                id: "c-empty",
                name: "Turma sem vínculos",
                slug: "sem-vinculos",
                status: "archived",
                team_count: 0,
                attempt_count: 0,
                activity_count: 0,
                can_delete: true,
              },
            ]
          : []),
      ],
    };
    if (url.pathname.includes("/rpc/") && Object.hasOwn(rpc, resource))
      return route.fulfill({ json: rpc[resource] });
    if (url.pathname.startsWith("/rest/v1/") && Object.hasOwn(tables, resource))
      return route.fulfill({ json: tables[resource] });
    if (url.pathname === "/auth/v1/user")
      return route.fulfill({
        json: {
          id: "staff1",
          email: "professor@example.test",
          role: "authenticated",
        },
      });
    throw new Error(
      `Unexpected external request in isolated visual test: ${url.pathname}`,
    );
  });
  await page.routeWebSocket("wss://visual-tests.supabase.co/**", (socket) => {
    socket.onMessage((message) => {
      const data = JSON.parse(String(message));
      if (Array.isArray(data) && ["phx_join", "heartbeat"].includes(data[3]))
        socket.send(
          JSON.stringify([
            data[0],
            data[1],
            data[2],
            "phx_reply",
            {
              status: "ok",
              response: {
                postgres_changes: (data[4]?.config?.postgres_changes ?? []).map(
                  (c: Record<string, unknown>, i: number) => ({ ...c, id: i }),
                ),
              },
            },
          ]),
        );
    });
  });
}
async function identity(page: Page) {
  expect(
    await page.evaluate(() => document.fonts.check('16px "Courier Prime"')),
  ).toBe(true);
  const mascot = page.locator("header .brand-mascot");
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveJSProperty("naturalWidth", 1728);
  await expect(mascot).toHaveAttribute(
    "src",
    "/Hackers_D-egua/assets/brand/mascote-chapeu-transparente.png",
  );
  const shape = await mascot.evaluate((img: HTMLImageElement) => ({
    original: img.naturalWidth / img.naturalHeight,
    display:
      img.getBoundingClientRect().width / img.getBoundingClientRect().height,
    loaded: img.complete && img.naturalWidth > 0,
  }));
  expect(shape.loaded).toBe(true);
  expect(Math.abs(shape.original - shape.display)).toBeLessThan(0.005);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const tokens = await page.evaluate(() =>
    ["--pink", "--white", "--blue", "--green", "--void", "--purple"].map((k) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(k)
        .trim()
        .toUpperCase(),
    ),
  );
  expect(tokens).toEqual([
    "#EE66A6",
    "#E0E8F0",
    "#5588FF",
    "#44AA88",
    "#222233",
    "#4B2E83",
  ]);
}
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await identity(page);
  await page.screenshot({
    path: `artifacts/visual/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
for (const viewport of [
  { name: "desktop", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.beforeEach(async () => {
      await mkdir("artifacts/visual", { recursive: true });
    });
    test("home and permanent registration", async ({ page }) => {
      await fixtures(page, "guest");
      await page.goto("./");
      await expect(
        page.getByRole("heading", { name: "Sua dupla, uma só vez." }),
      ).toBeVisible();
      await shot(page, `${viewport.name}-home`);
      await page.getByRole("button", { name: "Cadastrar minha dupla" }).click();
      await expect(page.getByRole("option", { name: "Pitiú" })).toBeAttached();
      await shot(page, `${viewport.name}-registration`);
    });
    test("quiz keeps the official header and color system", async ({
      page,
    }) => {
      await fixtures(page, "team");
      await page.goto("./#atividade/s1");
      await page
        .getByRole("button", { name: "Participar desta atividade" })
        .click();
      await expect(
        page.getByRole("region", { name: "Avaliação em andamento" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "ls" }).click();
      await shot(page, `${viewport.name}-quiz`);
    });
    test("ranking follows the supplied podium and table", async ({ page }) => {
      await fixtures(page, "guest");
      if (viewport.name === "desktop")
        await page.setViewportSize({ width: 919, height: 900 });
      await page.goto("./#ranking");
      await expect(page.locator(".podium .card")).toHaveCount(3);
      await expect(page.locator(".ranking-board tbody tr")).toHaveCount(5);
      const borders = await page
        .locator(".podium .card")
        .evaluateAll((cards) =>
          cards.map((card) => getComputedStyle(card).borderTopColor),
        );
      expect(borders).toEqual([
        "rgb(238, 102, 166)",
        "rgb(85, 136, 255)",
        "rgb(75, 46, 131)",
      ]);
      const headers = await page
        .locator(".ranking-board th")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({ client: n.clientWidth, scroll: n.scrollWidth })),
        );
      expect(headers.every((h) => h.scroll <= h.client)).toBe(true);
      await shot(page, `${viewport.name}-ranking`);
      await page
        .locator(viewport.name === "desktop" ? "main" : ".ranking-board")
        .screenshot({
          path: `artifacts/visual/${viewport.name}-ranking-board.png`,
          animations: "disabled",
        });
      if (viewport.name === "desktop") {
        const reference = await readFile(
          "public/assets/references/ranking-referencia.png",
        );
        const actual = await readFile(
          "artifacts/visual/desktop-ranking-board.png",
        );
        const comparison = await page.context().newPage();
        await comparison.setViewportSize({ width: 1740, height: 1100 });
        await comparison.setContent(
          `<html lang="pt-BR"><body style="margin:0;padding:24px;background:#222233;color:#E0E8F0;font:16px monospace;display:grid;grid-template-columns:1fr 1fr;gap:24px"><section><h2>Referência fornecida</h2><img style="width:100%;height:auto" src="data:image/png;base64,${reference.toString("base64")}"/></section><section><h2>Implementação · fixtures isoladas</h2><img style="width:100%;height:auto" src="data:image/png;base64,${actual.toString("base64")}"/></section></body></html>`,
        );
        await comparison.screenshot({
          path: "artifacts/visual/ranking-comparison.png",
          fullPage: true,
        });
        await comparison.close();
      }
    });
    test("administrative login uses the same identity", async ({ page }) => {
      await fixtures(page, "guest");
      await page.goto("./#admin");
      await expect(
        page.getByRole("heading", { name: "Acesso com Supabase Auth" }),
      ).toBeVisible();
      await shot(page, `${viewport.name}-admin-login`);
    });
    test("teacher dashboard and activity editor", async ({ page }) => {
      await fixtures(page, "staff");
      await page.goto("./#admin");
      await expect(
        page.getByRole("heading", { name: "Nova atividade" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Encerrar atividade" }),
      ).toBeVisible();
      await shot(page, `${viewport.name}-admin`);
    });
    test("class management preserves official identity and requires explicit deletion confirmation", async ({
      page,
    }) => {
      await fixtures(page, "admin");
      await page.goto("./#admin");
      const manager = page.getByRole("region", { name: "Gerenciar turmas" });
      await expect(
        manager.getByRole("heading", { name: "Nova turma" }),
      ).toBeVisible();
      const empty = manager.getByRole("row", { name: /Turma sem vínculos/ });
      await empty.getByRole("button", { name: "Excluir turma" }).click();
      const confirmation = page.getByRole("region", {
        name: "Confirmar exclusão definitiva",
      });
      await expect(
        confirmation.getByRole("button", { name: "Excluir definitivamente" }),
      ).toBeDisabled();
      await confirmation
        .getByLabel("Digite EXCLUIR sem-vinculos")
        .fill("EXCLUIR sem-vinculos");
      await expect(
        confirmation.getByRole("button", { name: "Excluir definitivamente" }),
      ).toBeEnabled();
      await shot(page, `${viewport.name}-class-management`);
      await confirmation
        .getByRole("button", { name: "Cancelar exclusão" })
        .click();
      await expect(empty).toBeVisible();
    });
    test("private results use the same identity", async ({ page }) => {
      await fixtures(page, "staff");
      await page.goto("./#admin/atividades/a1/resultados");
      await expect(
        page.getByRole("heading", {
          name: "Primeiros passos no Linux · Resultados",
        }),
      ).toBeVisible();
      await shot(page, `${viewport.name}-results`);
    });
  });
}
test("public artwork matches the copied originals and never needs the ZIP at runtime", async ({
  request,
}) => {
  const manifest = JSON.parse(
    await readFile("public/assets/manifest.json", "utf8"),
  );
  for (const asset of manifest.assets) {
    const response = await request.get(`/Hackers_D-egua/assets/${asset.file}`);
    expect(response.status()).toBe(200);
    expect(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
    ).toBe(asset.sha256);
  }
});
