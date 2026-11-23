# Hackers Pai D'Égua — Revisão Pré-CTF com Linux real

**Implementação local isolada.** Não foi implantada no GitHub Pages nem alterou o Supabase. Nenhum ponto, nota ou evento CTF oficial é produzido.

## Como iniciar no Windows 11 + WSL2 Ubuntu

Requisitos: Docker Desktop com integração WSL2, Node.js 22+, npm e o utilitário script (util-linux).

Na raiz do repositório, dentro do terminal WSL Ubuntu, execute:

    bash ctf-lab/start-local.sh

Abra no navegador: http://127.0.0.1:4100

A chave administrativa local aparecerá no terminal. Cole essa chave na aba **Professor · Cadastro**.

## Demonstração

1. A revisão padrão já existe em estado **rascunho**. Clique em **Publicar** e depois **Iniciar revisão**.
2. Gere um convite para **Dupla Demonstrativa**.
3. Copie o código de acesso e abra **Terminal da dupla**.
4. Entre com esse código e conecte o terminal xterm.js.
5. Execute comandos como: pwd, cat ~/missao.txt, ls -la /var/tmp/, find /var/tmp -name ".*".
6. Resolva os quatro desafios, envie as flags, escreva os write-ups e abra o replay na auditoria.

O xterm.js é carregado de CDN e necessita de internet. **Os comandos NÃO são simulados**: são executados no Linux do contêiner Docker.

## Quatro desafios

1. Arquivo oculto na árvore /var/tmp/; use cd, ls, find e cat.
2. Permissões do grupo investigadores em ~/desafios/permissoes/segredo.txt; use groups, ls -l, chmod g+r, cat. O comando chmod no shell é alias para sudo chmod restrito ao único arquivo de laboratório; é o executável chmod real.
3. Arquivo ~/desafios/logs/auth.log com registros falsos de força bruta; identifique o IP mais frequente. A flag utiliza o formato FLAG{IP_198.51.100.X_TOKEN}, com o token individual no cabeçalho do log.
4. Consulta real a DNS TXT pelo comando dig @127.0.0.1 ctf.hackerspaidegua.local TXT (dnsmasq dentro do contêiner).

## Segurança e limites desta primeira versão

- Executor vinculado somente a 127.0.0.1:4100. NÃO abrir a porta na internet.
- Um contêiner por dupla/sessão, network none, CPU, memória e PIDs limitados, filesystem raiz somente leitura.
- O serviço controlador usa Docker do host. Um acesso remoto a esse processo seria de alto risco; utilize **somente no computador local**.
- Autenticação local por chave administrativa e convite. **Não integrada ainda ao login da plataforma nem ao Supabase.**
- Cadastro cria revisões a partir de quatro templates aprovados. Ainda não suporta scripts arbitrários, importação de novos templates ou edição de desafios na interface.
- Eventos do PTY são gravados como frames de entrada e saída com timestamps. O replay é fiel aos frames registrados, mas não equivale a auditoria de todos os processos Linux. Não digitar segredos durante os testes.
- Os dados ficam em ctf-lab/.data/state.json e não atualizam notas, ranking, ctf_score_events ou outras tabelas.
- A versão de demonstração não está preparada para implantação institucional: faltam autenticação integrada, HTTPS/WSS, isolamento reforçado do controlador Docker, persistência pós-reinicialização e testes de concorrência/segurança.

## Encerramento

Na aba Professor, clique em Encerrar. Em caso de processo órfão no laboratório local:

    docker ps --filter name=hpde-lab-
    docker ps -q --filter name=hpde-lab- | xargs -r docker rm -f

## Checagens

    cd ctf-lab
    node --check server.mjs
    docker build -t hackers-ctf-revisao:local .
    bash start-local.sh

Ainda são necessários testes reais no Docker para confirmar inicialização, DNS, chmod, WebSocket, recuperação e replay. Não declare o laboratório pronto para produção antes desses testes.
