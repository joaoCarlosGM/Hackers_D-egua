# Revisão Pré-CTF integrada — teste local na plataforma

A branch feature/ctf-review-real-linux integra o catálogo de revisão, terminal xterm.js, execução Linux real com Docker, flags exclusivas, write-up e auditoria ao React/Vite da plataforma Hackers Pai D'Égua e ao Supabase existente.

**Sem pontos, sem notas e sem ranking.** As tabelas ctf_review_* são separadas de ctf_score_events.

## Pré-requisitos

Windows 11 + WSL2 Ubuntu, Docker Desktop integrado ao WSL2, Node 22+, npm e util-linux. É necessário acesso à Secret API Key do projeto Supabase, usada somente no serviço local do professor.

## Preparação no Ubuntu/WSL

    git clone --branch feature/ctf-review-real-linux --single-branch https://github.com/joaoCarlosGM/Hackers_D-egua.git ~/hackers-ctf-integrado
    cd ~/hackers-ctf-integrado
    cp .env.example .env

Preencha .env na raiz:

    VITE_SUPABASE_URL=https://oijofboslsvtvmoeleaq.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=<copie publishable key do Supabase>

No backend local:

    cp ctf-lab/.env.integration.example ctf-lab/.env.integration
    chmod 600 ctf-lab/.env.integration

Preencha ctf-lab/.env.integration:

    CTF_SUPABASE_URL=https://oijofboslsvtvmoeleaq.supabase.co
    CTF_SUPABASE_PUBLIC_KEY=<copie publishable key do Supabase>
    CTF_SUPABASE_SECRET_KEY=<copie a Secret API Key, somente no servidor local>

**NUNCA compartilhe a Secret API Key, use VITE_* para guardá-la ou faça commit do arquivo de integração.**

## Inicialização simples — um único comando

Após preparar os dois arquivos de ambiente, execute na raiz do repositório:

    bash ctf-lab/start-platform.sh

O script instala as dependências, constrói/inicia o executor Docker, valida a API local e abre o Vite na porta 5173. Acesse:

    http://127.0.0.1:5173/Hackers_D-egua/#admin/revisao-ctf

Para o acesso de uma dupla:

    http://127.0.0.1:5173/Hackers_D-egua/#ctf-revisao

Pressione Ctrl+C para encerrar os servidores locais. Antes disso, encerre as revisões no painel para remover os contêineres.

## Alternativa — dois terminais WSL

Terminal 1 — executor Docker e xterm.js:

    cd ~/hackers-ctf-integrado
    bash ctf-lab/start-local.sh

Terminal 2 — plataforma React:

    cd ~/hackers-ctf-integrado
    npm ci
    npm run dev

Acesse o endereço exibido pelo Vite (normalmente http://localhost:5173/Hackers_D-egua/).

No painel da plataforma:

- Professor: #admin/revisao-ctf, com a conta Supabase Auth já autorizada.
- Dupla: #ctf-revisao, com as credenciais permanentes existentes.

O Vite encaminha a API e o WebSocket para o serviço Docker local por /ctf-lab. A plataforma publicada no GitHub Pages não executa o Docker.

## Fluxo de verificação

1. Professor cadastra revisão com quatro desafios, turma(s), título, duração e instruções.
2. Publica e inicia a revisão.
3. Professor abre sua própria demonstração ou uma dupla entra com suas credenciais.
4. Terminal Linux real executa pwd, ls, find, cat, chmod, grep, sort, uniq e dig.
5. Dupla submete flags individuais, conclui objetivos e salva os write-ups.
6. Professor monitora 0/4 a 4/4, abre a auditoria, reproduz os frames do terminal e exporta JSON.
7. Professor encerra e remove os contêineres da revisão.

## Desafios

1. Navegação e Arquivos Ocultos: /var/tmp/.
2. Permissões e Grupos Restritos: grupo investigadores, arquivo ~/desafios/permissoes/segredo.txt e chmod g+r.
3. Mineração de Logs: ~/desafios/logs/auth.log, IP mais frequente e token individual no cabeçalho para compor a flag exclusiva.
4. Mensagem Secreta no DNS: dig @127.0.0.1 ctf.hackerspaidegua.local TXT.

O cadastro permite parametrizar dados pedagógicos, mas os quatro templates Linux são fixos e previamente testados. Executar scripts ou imagens Docker arbitrários a partir do formulário não é permitido.

## Segurança e limites

- Executor limitado ao localhost do professor. NÃO exponha a porta 4100 ou o Vite à rede de alunos.
- Um contêiner por dupla, sem rede externa, recursos limitados e filesystem principal somente leitura.
- A Secret API Key fica apenas no serviço local, nunca no browser.
- Não execute comandos diretamente no host; o executor controla as instâncias Docker.
- Replay registra frames de entrada/saída e timestamps; não comprova por si só a autoria. Não digite segredos no terminal.
- O ambiente é uma revisão demonstrativa: não atualiza avaliações, ranking ou CTF oficial.
- O funcionamento com turma remota requer infraestrutura adicional, HTTPS/WSS, isolamentos reforçados e testes de carga.

## Verificações

    node --check ctf-lab/server.mjs
    bash ctf-lab/test-schema.sh
    npm run lint
    npm run typecheck
    npm test
    npm run build

O GitHub Actions CTF Lab Local CI executa os quatro desafios em Docker e testa o esquema em PostgreSQL descartável.

No histórico anterior, o teste de banco geral tinha uma chamada obsoleta a adjust_ctf, cuja autorização foi revogada pelos CTFs oficiais por módulo. Na branch de revisão, o teste foi alinhado com record_module_ctf; a lógica de pontuação oficial não foi modificada.

**Esta versão é para testes locais na plataforma, não para implantação em produção.**
