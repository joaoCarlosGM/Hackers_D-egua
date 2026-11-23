#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker não encontrado. Ative Docker Desktop + integração WSL2."; exit 1; }
command -v node >/dev/null || { echo "Node.js não encontrado."; exit 1; }
command -v npm >/dev/null || { echo "npm não encontrado."; exit 1; }
command -v script >/dev/null || { echo "Instale util-linux no Ubuntu."; exit 1; }
docker info >/dev/null || { echo "Docker não está em execução ou falta permissão."; exit 1; }
mkdir -p .data
if [ ! -f .data/admin.key ]; then
  node -e 'process.stdout.write(require("node:crypto").randomBytes(28).toString("hex"))' > .data/admin.key
  chmod 600 .data/admin.key
fi
export CTF_ADMIN_KEY="$(cat .data/admin.key)"
export CTF_PORT=4100
export CTF_IMAGE=hackers-ctf-revisao:local
echo "Construindo a imagem Linux..."
docker build -t "$CTF_IMAGE" -f Dockerfile .
echo "Instalando dependências..."
npm install --no-audit --no-fund
echo
echo "ABRA: http://127.0.0.1:4100"
echo "CHAVE DO PROFESSOR: $CTF_ADMIN_KEY"
echo "AMBIENTE LOCAL — SEM PONTUAÇÃO"
echo
node server.mjs
