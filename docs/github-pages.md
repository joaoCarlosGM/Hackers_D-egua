# Publicação no endereço gratuito do GitHub Pages

Endereço de produção: **https://joaocarlosgm.github.io/Hackers_D-egua/**.

Esta configuração não utiliza domínio personalizado, DNS próprio ou arquivos CNAME. O frontend continua estático no GitHub Pages; Supabase Cloud permanece responsável por Auth, RPCs, PostgreSQL e Realtime. Nenhuma migration, tabela, credencial ou dado de aluno é alterado por esta correção.

## Base, assets e rotas

- `vite.config.ts` usa `base: "/Hackers_D-egua/"`, incluindo as duas barras. Não use `base: "/"` para este endereço de projeto.
- `src/Brand.tsx` usa `import.meta.env.BASE_URL` para o mascote e as logos. Os arquivos são carregados de `/Hackers_D-egua/assets/brand/`, sem modificar as artes oficiais.
- Os caminhos das fontes em CSS são reescritos pelo Vite conforme a base. HTML, CSS e JavaScript compilados também usam `/Hackers_D-egua/assets/`.
- Links de atividade e QR Codes usam `window.location.origin` e `import.meta.env.BASE_URL`, produzindo `https://joaocarlosgm.github.io/Hackers_D-egua/#atividade/UUID`.
- Cadastro permanente, avaliações, ranking e administração mantêm a navegação por hash. Exemplos: `/Hackers_D-egua/#ranking`, `/Hackers_D-egua/#admin` e `/Hackers_D-egua/#admin/atividades/UUID/resultados`.
- Fragmentos hash não são enviados ao servidor. Todas essas rotas usam o mesmo `index.html` do subdiretório e não exigem rewrites ou um backend Node.
- Não devem existir `CNAME`, `public/CNAME` ou `dist/CNAME`. O build limpa os outputs anteriores, e o smoke test verifica a ausência desses arquivos.

## Configuração no GitHub

1. Em **Settings → Pages**, mantenha **Source: GitHub Actions**.
2. Deixe **Custom domain vazio**. Se uma configuração anterior ainda aparecer, remova-a no painel; apenas apagar o arquivo CNAME não remove uma configuração mantida pelo Pages com Actions. A inspeção desta correção confirmou `cname: null`.
3. Em **Settings → Secrets and variables → Actions → Variables**, mantenha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto existente. São configurações públicas de cliente; não use secret key ou `service_role` no frontend.
4. O workflow `.github/workflows/pages.yml` compila, valida e publica o diretório **`dist`**, por `actions/upload-pages-artifact` e `actions/deploy-pages`.
5. Faça merge do PR em `main` para disparar a publicação, ou execute manualmente o workflow GitHub Pages. Abrir o PR executa validação, sem fazer merge ou deploy por conta própria.
6. Abra `https://joaocarlosgm.github.io/Hackers_D-egua/` após a conclusão do workflow. Não é necessário comprar/configurar um domínio nem criar outro repositório.

## Validação local e em CI

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:pages
npm run test:visual
```

`test:pages` inicia somente um preview local de `dist` e valida:

- HTML/JS/CSS e URLs de fontes/imagens no subdiretório correto;
- carregamento do mascote original e das fontes locais;
- ausência de referências ao domínio personalizado nos assets compilados;
- quatro rotas hash usando a mesma entrada estática do projeto;
- ausência dos arquivos CNAME no código e no artefato final.

O Playwright testa início, cadastro, quiz, ranking, login, administração e resultados em desktop/celular, sob o mesmo prefixo. As requisições Supabase são interceptadas com fixtures isoladas do navegador; nenhum dado real é lido ou gravado nesses testes.

## Verificação após o deploy

Confira logo, fontes e cores oficiais, abra um link/QR Code de atividade e teste a navegação hash e o retorno à página inicial. Cadastro permanente, notas privadas e ranking continuam usando as mesmas RPCs e os mesmos UUIDs no Supabase existente.

Caso utilize convites ou recuperação de senha, o responsável pode revisar o Site URL/Redirect URLs no Dashboard do Supabase para o endereço gratuito completo. Esta correção apenas documenta esse passo: não altera configurações, migrations ou dados do Supabase.
