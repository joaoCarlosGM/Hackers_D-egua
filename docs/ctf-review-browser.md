# Revisão Pré-CTF: Linux emulado no navegador (v86)

Implementação em branch separada, exclusiva para o professor na seção **Administração → Revisão Pré-CTF**.

## Arquitetura
- **React/Vite/GitHub Pages**: carrega o emulador x86 v86 + imagem Buildroot Linux, tudo dentro do navegador.
- **Supabase existente**: autenticação dos professores (Supabase Auth + `admin_users`), histórico, comandos registrados pelo aplicativo, saídas de terminal e write-ups.
- **Sem VPS, Render ou Docker**: cada demonstração usa a CPU/RAM do navegador. Sem alterações no sistema de avaliação ou ranking.

## Limitações honestas
- O terminal mostrado é a porta serial de um **Linux real emulado**, não o shell do computador nem um simulador JavaScript de respostas.
- A imagem Buildroot mínima pode não ter todos os utilitários das distribuições completas. Em especial, o exercício 4 usa **um script dentro do Linux que reproduz a resposta TXT**; não é um servidor DNS de verdade.
- Os desafios são provisionados por comandos executados ao inicializar a VM, e por isso a preparação exige um boot bem-sucedido.
- Os logs são **declarados pelo navegador**: podem ser adulterados por quem controla o navegador, e não oferecem prova pericial. CTF oficial com pontuação deve utilizar sandbox remoto seguro e auditoria de servidor.
- A revisão não atribui notas nem pontos e só aparece a professor/admin.
- Não existe ambiente Linux de cada dupla aqui. É exclusivamente apresentação do professor.

## Preparar os arquivos estáticos
Execute `node scripts/prepare-v86.mjs` antes da compilação. O script baixa a biblioteca, WASM, BIOS e kernel Buildroot a partir das fontes definidas; esses arquivos não devem ser editados manualmente. O comando `npm run build` faz isso automaticamente.

```bash
npm ci
npm run build
npm run dev
```

O emulador é servido no caminho `/Hackers_D-egua/ctf-v86/` do próprio site. Na primeira carga o download leva alguns segundos. Para usar a seção, entre com uma conta de professor ou administrador já cadastrada.

## Persistência no Supabase
Migração preparada em `supabase/migrations/202611230002_ctf_teacher_browser_review.sql`. Ela cria `ctf_review_teacher_runs`, `ctf_review_teacher_events` e RPCs restritas que verificam `admin_users`.

Não aplicar automaticamente na produção durante testes de build. O professor inicia a revisão, faz comandos, escreve o write-up e encerra; as mensagens são salvas em lotes e o histórico pode ser consultado depois.

## Caminho dos quatro exercícios
1. Diretórios e arquivo oculto em `/var/tmp/relatorios/.auditoria/`.
2. Grupo `investigadores`, arquivo `/home/aluno/desafios/permissoes/segredo.txt`, uso de `chmod g+r`.
3. `/home/aluno/desafios/logs/auth.log`, IP de origem das tentativas: `198.51.100.44`, flag `FLAG{IP_198.51.100.44}`.
4. `dig @127.0.0.1 ctf.hackerspaidegua.local TXT`, via zona TXT didática pré-programada em um script Linux.

**Atenção:** sem publicação de pontos, módulos oficiais ou alteração de `ctf_score_events`.

## Nova experiência pedagógica — igual ao fluxo previsto para CTF oficial

A revisão exclusiva do professor agora utiliza a sequência **ler situação-problema → compreender objetivo → investigar no terminal → registrar evidência/flag → explicar o raciocínio no write-up**. São quatro casos baseados nos cenários existentes: arquivos ocultos, permissões, logs SSH e DNS TXT.

A tela da missão apresenta o incidente e o contexto de trabalho, o objetivo, o que entregar e uma explicação da relevância para redes/segurança. A coluna lateral apresenta etapas que dizem **o que se está fazendo e por que**. O professor pode revelar comandos ilustrativos apenas quando quiser, evitando entregar a solução antes de fazer perguntas à turma. Após o envio real do comando para o Linux emulado, aparece uma explicação contextual do propósito do comando.

Na demonstração projetada, a missão e o guia de investigação permanecem visíveis ao lado do terminal. O professor mantém a possibilidade de aumentar a fonte, fechar com Esc, confirmar flags, preencher os três campos do relatório e acessar o histórico salvo no Supabase.

**Separação obrigatória:** o modo demonstrativo não atribui notas, não cria sessões de duplas, não altera o ranking e não substitui a auditoria confiável que será exigida nos CTFs oficiais. O quarto cenário continua utilizando uma resposta TXT produzida por script, e o laboratório de permissões utiliza shell root; a interface explicita essas limitações.
