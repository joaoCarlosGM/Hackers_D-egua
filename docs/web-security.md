# Segurança do Hackers Pai D’égua (GitHub Pages + Supabase)

## Por que não bloquear F12?

Não há como um site público impedir a abertura das ferramentas de desenvolvedor no navegador do visitante. Bloquear `F12`, `Ctrl+Shift+I`, clique direito ou trocar React por Angular não impede inspeção de código, acesso a recursos públicos nem reprodução de requisições HTTP. Além disso, prejudica ferramentas de acessibilidade e atividades de aprendizagem de cibersegurança.

A barreira de segurança deve estar **no Supabase**, com RLS (Row Level Security), políticas por papel e validação das RPCs. Não confie em verificações realizadas apenas no React. As notas, respostas corretas e operações de pontuação devem continuar protegidas por `app_private.require_staff()` e `app_private.require_admin()` conforme sua finalidade.

## Proteção das respostas da Aula 02

A inspeção do navegador não deve revelar nenhum valor de `is_correct` nem o campo `explanation` na resposta de `public_activity`. A função `submit_attempt` continua conferindo o gabarito no PostgreSQL. Se um estudante viu respostas pela rede, verifique imediatamente as permissões efetivas no Supabase do site publicado — a política do repositório não garante que o banco remoto esteja configurado corretamente.

Nova migration: `supabase/migrations/202611050007_quiz_answer_protection.sql` (011), aplicada **somente após a migration 010**. Ela revoga leituras anônimas das tabelas de enunciados, alternativas corretas, respostas, notas e participações; mantém SELECT restrito ao pessoal autorizado por RLS e recria `public_activity` para retornar somente alternativas sem gabarito. **Não executa limpeza nem modifica respostas históricas**.

O deploy também executa `npm run check:live-answers` com a chave publicável. O teste consulta, como visitante anônimo, as tabelas com respostas e notas, e a RPC privada de resultados. **Se qualquer consulta estiver permitida, o deploy falha**, sem revelar credenciais ou dados no log. Opcionalmente, configure a variável `SECURITY_PROBE_SESSION_ID` com o UUID de uma sessão aberta de teste; a pipeline verificará adicionalmente que `public_activity` não entrega campos de gabarito. Se a sessão estiver encerrada, o teste falhará até atualizar ou retirar esse UUID.

Se uma prova já teve respostas expostas, trate o conteúdo como comprometido e crie uma nova versão com questões diferentes; bloquear F12 depois do ocorrido não desfaz o vazamento.

## Proteções desta entrega

1. **Verificação antes do deploy:** `scripts/security/check-public.mjs env --require` valida a origem HTTPS do Supabase e impede que `VITE_SUPABASE_PUBLISHABLE_KEY` contenha `sb_secret_`, JWT `service_role` ou outro formato privilegiado. Nunca mostra o valor da chave em logs. Chaves `sb_publishable_` e JWT `anon` legados continuam aceitos.
2. **Artefatos públicos:** o processo de publicação inspeciona `dist/` e falha se encontrar chaves secretas Supabase, JWT `service_role` ou arquivos `.map`. O Vite fica explicitamente configurado para não gerar source maps.
3. **CSP:** o HTML contém uma política de segurança de conteúdo que limita scripts à própria origem, impede objetos incorporados, restringe conexões às origens Supabase e permite imagens locais/data usadas no QR Code. Na hospedagem GitHub Pages isso é uma **meta CSP**; diretivas como `frame-ancestors` exigiriam cabeçalhos HTTP de um host configurável.
4. **Testes:** `npm run test:security` cobre chaves públicas, rejeição de credenciais elevadas, origem do Supabase e inspeção de artefatos. O GitHub Actions valida essas condições antes de publicar.

## O que esta entrega não promete

- Não torna HTML, JavaScript, tráfego de rede nem chave `sb_publishable_` invisíveis — a chave publicável **deve** ser pública.
- Não substitui revisão de RLS, permissões SQL e testes de acesso anônimo no Supabase.
- Não bloqueia F12, nem tenta identificar ou punir quem abre DevTools.
- Não impede que um aluno copie manualmente enunciados exibidos durante uma atividade.
- Não corrige configuração remota de CAPTCHA, proteção contra bots ou MFA.

## Próximos controles de alto valor

Verifique no **Supabase Dashboard → Security Advisor** os alertas de políticas permissivas e funções expostas. Realize, em ambiente de teste, cenários com visitante anônimo, usuário comum, professor e administrador; confirme que respostas corretas e notas de terceiros não são acessíveis ao público. Configure proteção contra automações/bots no Auth/Edge Function quando necessário, sem publicar uma chave secreta no GitHub Pages.

Referências:
- https://supabase.com/docs/guides/database/secure-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://owasp.org/www-project-web-security-testing-guide/
