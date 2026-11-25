# Revisão Pré-CTF: Linux emulado no navegador (v86)

Implementação publicada via GitHub Pages, exclusiva para o professor na seção **Administração → Revisão Pré-CTF**.

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

## Caminhos dos cinco exercícios (roteiro da Aula 07)
1. Diretórios e arquivo oculto em `/var/tmp/relatorios/.auditoria/`.
2. Grupo `alunos`, arquivo `/opt/desafio_dac/flag.txt`, uso de `ls -l` e `chmod g+r`.
3. `/var/log/auth_simulado.log`, IP de origem das tentativas: `198.51.100.44`, flag `FLAG{IP_198.51.100.44}`.
4. `dig @192.168.56.1 ctf.hackerspaidegua.local TXT`, resposta didática pré-programada em um script Linux, sem serviço DNS real.
5. **A Impressão Digital Perdida:** 50 arquivos em `/opt/evidencias/`, procurar o SHA-256 terminado em `c4e1`, extrair a flag e verificar o MD5 da flag como texto sem quebra de linha.

**Atenção:** sem publicação de pontos, módulos oficiais ou alteração de `ctf_score_events`.

## Nova experiência pedagógica — igual ao fluxo previsto para CTF oficial

A revisão exclusiva do professor agora utiliza a sequência **ler situação-problema → compreender objetivo → investigar no terminal → registrar evidência/flag → explicar o raciocínio no write-up**. São cinco casos do roteiro da Aula 07: arquivos ocultos, permissões DAC, logs SSH, DNS TXT e integridade de evidências com hashes MD5 e SHA-256.

A tela da missão apresenta o incidente e o contexto de trabalho, o objetivo, o que entregar e uma explicação da relevância para redes/segurança. A coluna lateral apresenta etapas que dizem **o que se está fazendo e por que**. O professor pode revelar comandos ilustrativos apenas quando quiser, evitando entregar a solução antes de fazer perguntas à turma. Após o envio real do comando para o Linux emulado, aparece uma explicação contextual do propósito do comando.

Na demonstração projetada, a missão e o guia de investigação permanecem visíveis ao lado do terminal. O professor mantém a possibilidade de aumentar a fonte, fechar com Esc, confirmar flags, preencher os três campos do relatório e acessar o histórico salvo no Supabase.

**Separação obrigatória:** o modo demonstrativo não atribui notas, não cria sessões de duplas, não altera o ranking e não substitui a auditoria confiável que será exigida nos CTFs oficiais. O quarto cenário continua utilizando uma resposta TXT produzida por script, e o laboratório de permissões utiliza shell root; a interface explicita essas limitações.


## Integridade: MD5 + SHA-256

MD5 e SHA-256 **são funções hash, não criptografia reversível**. No quinto desafio, foram preparados 50 arquivos de aspecto semelhante. Um único arquivo tem SHA-256 que termina em `c4e1`:

```bash
sha256sum /opt/evidencias/* | grep -E 'c4e1[[:space:]]'
```

Após localizar a evidência e obter sua FLAG no arquivo, o professor demonstra:

```bash
printf '%s' 'FLAG_ENCONTRADA' | md5sum
```

Referência MD5 da flag sem quebra de linha: `a67ac8c054f704be2673a9a7c72cffa8`. Não utilizar MD5 para segurança moderna, senhas ou prova contra adulteração maliciosa. SHA-256 é o método recomendado na comparação de integridade do arquivo.

A formatação de write-up permanece em três campos: **Comando utilizado**, **Raciocínio técnico** e **Flag obtida/evidência**. Além de salvar no Supabase, o professor pode exportar um arquivo `.md` seguindo o roteiro.

## Foco e projeção

O botão **Focar** alterna para um modo sem distrações, com o terminal maior e os demais painéis ocultos; posiciona também o teclado na entrada interna do xterm.js. Use Esc ou **Sair do foco** para restaurar. O botão **Ampliar para projeção** usa a Fullscreen API do navegador sobre todo o laboratório (problema + terminal + orientação); use Esc para sair, ou o botão correspondente. Se o navegador bloquear fullscreen (ex.: iframe sem permissão), abra o site em uma aba independente e utilize F11. A alteração de fonte é feita por A+/A−.
