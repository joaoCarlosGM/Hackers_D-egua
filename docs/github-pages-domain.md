# Produção no domínio hackerspaidegua.com

A plataforma publica exclusivamente pelo GitHub Pages, com o domínio canônico **https://hackerspaidegua.com/**. O frontend é estático; Supabase Cloud continua responsável por Auth, RPCs, PostgreSQL e Realtime. Esta mudança não cria projeto, não altera tabelas e não aplica migrations ao banco de produção.

## Build e caminhos

- `vite.config.ts` usa explicitamente `base: "/"`, porque a aplicação fica na raiz do domínio personalizado. Não use `/Hackers_D-egua/` neste ambiente de produção.
- As rotas continuam em hash: `/#ranking`, `/#admin`, `/#atividade/UUID` e `/#admin/atividades/UUID/resultados`. Os fragmentos não são enviados ao servidor; todos usam o mesmo `index.html`, sem regras de rewrite.
- Links de atividade e QR Codes usam `window.location.origin` e `import.meta.env.BASE_URL`. No domínio publicado, apontam para `https://hackerspaidegua.com/#atividade/UUID`.
- O componente de marca usa `BASE_URL` para carregar `/assets/brand/mascote-chapeu-transparente.png`. Fontes e demais artes são servidas de `/assets/`. Não há dependência do ZIP em execução.
- O `CNAME` existente na raiz do repositório é preservado. `public/CNAME` contém o mesmo domínio e o Vite o copia para `dist/CNAME`. Se o domínio mudar, atualize os dois arquivos; o teste de build detecta divergências.

## Configuração do repositório no GitHub

1. Em **Settings → Pages**, mantenha **Source: GitHub Actions**.
2. Em **Custom domain**, configure `hackerspaidegua.com` e salve. O domínio já aparece configurado na API do Pages; confira o resultado da verificação DNS no painel.
3. Em **Settings → Secrets and variables → Actions → Variables**, confirme `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, com os valores públicos do projeto existente. Não use secret key ou `service_role`. O workflow falha explicitamente quando uma das duas variáveis estiver ausente.
4. O arquivo `.github/workflows/pages.yml` compila o site, valida os arquivos gerados e chama `actions/upload-pages-artifact` com **`path: dist`**. O job de deploy usa `actions/deploy-pages` e o environment `github-pages`.
5. O workflow executa depois de um push/merge em `main` ou por acionamento manual. Atualizar este PR não faz merge nem publica o site automaticamente. O arquivo CNAME no artefato não substitui o campo Custom domain nas configurações do Pages, especialmente quando a publicação usa Actions.
6. Após o DNS estar correto e o GitHub emitir o certificado, habilite **Enforce HTTPS**. Na inspeção de preparação, `https_enforced` ainda estava desativado; não se considera HTTPS pronto até essa etapa terminar.

A integração usada para preparar o PR conseguiu ler a configuração de Pages, mas recebeu HTTP 403 ao listar as Variables do repositório. Portanto a presença dessas duas variáveis precisa ser confirmada pelo responsável nas configurações; não foram solicitados nem exibidos valores administrativos.

## DNS do domínio

No provedor DNS, use os registros abaixo para o domínio raiz (`@`). TTL de 3600 segundos é uma opção inicial; use o equivalente oferecido pelo provedor.

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

IPv6 é opcional. Se configurado, use o conjunto completo do GitHub Pages:

| Tipo | Nome | Valor |
| --- | --- | --- |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |

Para também atender `www.hackerspaidegua.com`, adicione **CNAME `www` → `joaocarlosgm.github.io`** (somente hostname, sem protocolo ou caminho do repositório). Mantenha o domínio raiz como canônico no Pages. Revise registros A/AAAA antigos que apontem para outra hospedagem; não altere MX/TXT de e-mail ao configurar o site.

Também é possível usar ALIAS/ANAME no domínio raiz quando o provedor oferecer esse recurso, seguindo a documentação do GitHub. Não combine estratégias conflitantes. Não use CNAME wildcard para todos os subdomínios. A verificação de propriedade por TXT é feita com o nome e o token fornecidos por **GitHub → Settings → Pages → Verify domain**, sem inventar um token.

Após a propagação, confirme o domínio na verificação DNS do Pages e ative HTTPS. Nenhum registro DNS ou configuração do Pages foi modificado automaticamente durante esta preparação.

Referência oficial: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Auth e verificação após o merge

No Dashboard do Supabase existente, configure **Authentication → URL Configuration → Site URL** como `https://hackerspaidegua.com/`. Se usar convites ou recuperação de senha, revise os Redirect URLs autorizados para o domínio novo, conforme o fluxo habilitado. Isso é uma configuração externa de Auth, não uma mudança de dados ou uma migration. A preparação do PR não a executa automaticamente.

Antes do merge, execute:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db        # somente PostgreSQL descartável local
npm run build
npm run test:pages
npm run test:visual
```

`test:pages` faz requisições HTTP ao build local e verifica HTML/JS/CSS na raiz, ausência do prefixo antigo, imagem oficial, fontes, os três arquivos CNAME e as quatro rotas hash. Os testes Playwright usam somente fixtures isoladas no navegador, sem acessar dados reais no Supabase.

Depois do deploy, abra o domínio e confirme cadastro/entrada da dupla, link/QR de atividade, avaliação, ranking e login administrativo. O cadastro e as notas dependem de as migrations e autorizações já estarem presentes no projeto Supabase existente; o deploy do frontend não executa essa configuração.
