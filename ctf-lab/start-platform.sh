#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for required in .env ctf-lab/.env.integration; do
  if [[ ! -f "$required" ]]; then
    echo "Configuração ausente: $required"
    echo "Leia docs/ctf-review-integrated.md e configure primeiro as chaves públicas e privadas nos arquivos corretos."
    exit 1
  fi
done
if grep -Eq 'SUBSTITUA|SUBSTITUIR|<copi|sb_secret_SUBSTITUIR|sb_publishable_SUBSTITUIR' .env ctf-lab/.env.integration; then
 echo "Há chaves de exemplo não preenchidas. Configure os dois arquivos antes de iniciar."
 exit 1
fi
command -v curl >/dev/null || { echo "Instale curl no WSL2";exit 1; }
echo "Verificando dependências da plataforma..."
npm ci --no-audit --no-fund
echo "Preparando o executor Linux e o xterm.js..."
bash ctf-lab/start-local.sh > /tmp/hpde-ctf-lab-start.log 2>&1 &
EXECUTOR_PID=$!
cleanup() {
 kill "$EXECUTOR_PID" 2>/dev/null || true
 wait "$EXECUTOR_PID" 2>/dev/null || true
 echo "Serviços de desenvolvimento encerrados. Encerre as revisões no painel para remover os contêineres."
}
trap cleanup EXIT INT TERM
ready=0
for i in $(seq 1 180); do
 if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1; then ready=1; break;fi
 if ! kill -0 "$EXECUTOR_PID" 2>/dev/null; then
  echo "Falha ao iniciar executor (linhas finais):"
  tail -n 15 /tmp/hpde-ctf-lab-start.log | sed -E 's/(sb_secret_|service_role)[A-Za-z0-9_-]+/[SEGREDO]/g'
  exit 1
 fi
 sleep 1
done
if [[ "$ready" != 1 ]]; then
 echo "Executor não ficou disponível; consulte /tmp/hpde-ctf-lab-start.log localmente."
 exit 1
fi
if ! curl -fsS http://127.0.0.1:4100/api/platform/health >/dev/null 2>&1; then
 echo "Integração Supabase não configurada ou chave inválida no executor."
 echo "Confira ctf-lab/.env.integration. Não envie chaves por mensagem."
 exit 1
fi
echo
echo "PLATAFORMA DE TESTE: http://127.0.0.1:5173/Hackers_D-egua/"
echo "PROFESSOR: #admin/revisao-ctf"
echo "DUPLAS: #ctf-revisao"
echo "SEM PONTUAÇÃO | Sem deploy | Execução local no Docker"
echo
npm run dev -- --host 127.0.0.1
