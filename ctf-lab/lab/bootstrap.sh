#!/bin/bash
set -euo pipefail
IFS= read -r FLAG1
IFS= read -r FLAG2
IFS= read -r ATTACKER
IFS= read -r FLAG4
IFS= read -r AUDIT_TAG
for value in "$FLAG1" "$FLAG2" "$FLAG4"; do
  [[ "$value" =~ ^FLAG\{[A-Z0-9_]+\}$ ]] || exit 2
done
[[ "$ATTACKER" =~ ^198\.51\.100\.[0-9]{1,3}$ ]] || exit 2
[[ "$AUDIT_TAG" =~ ^[A-F0-9]{14}$ ]] || exit 2
mkdir -p /var/tmp/arquivo/relatorios/.operacao /home/aluno/desafios/{permissoes,logs}
printf '%s\n' "$FLAG1" > /var/tmp/arquivo/relatorios/.operacao/.relatorio.txt
printf '%s\n' "$FLAG2" > /home/aluno/desafios/permissoes/segredo.txt
printf '# Token de auditoria: %s\n' "$AUDIT_TAG" > /home/aluno/desafios/logs/auth.log
for i in $(seq 1 18); do
  printf 'Nov 22 09:%02d:00 host sshd[%d]: Failed password for invalid user tester from %s port %d ssh2\n' "$i" "$((100+i))" "$ATTACKER" "$((2000+i))" >> /home/aluno/desafios/logs/auth.log
done
for i in $(seq 1 7); do
  printf 'Nov 22 09:%02d:00 host sshd[%d]: Failed password for guest from 203.0.113.18 port %d ssh2\n' "$i" "$((200+i))" "$((3000+i))" >> /home/aluno/desafios/logs/auth.log
done
cat > /home/aluno/missao.txt <<'EOF'
REVISAO PRE-CTF — SEM NOTAS E SEM PONTOS
1) Arquivo oculto dentro de /var/tmp/ (cd, ls -la, find, cat).
2) Corrija a permissao de leitura por grupo em ~/desafios/permissoes/segredo.txt (groups, chmod g+r).
3) Encontre o IP com mais falhas em ~/desafios/logs/auth.log (grep, sort, uniq).
   Componha a flag FLAG{IP_ENDERECO_TOKEN} usando o IP encontrado e o token do cabeçalho do log.
4) Consulte o TXT de ctf.hackerspaidegua.local com dig @127.0.0.1.
Envie as FLAGS no painel, documentando comandos e raciocinio tecnico.
EOF
cat > /home/aluno/.bashrc <<'EOF'
export PS1='\[\e[32m\]aluno@hackers-ctf:\w\$ \[\e[0m\]'
alias chmod='sudo /usr/bin/chmod'
alias ll='ls -la'
EOF
echo 'source ~/.bashrc' > /home/aluno/.bash_profile
chown -R aluno:aluno /home/aluno
chown root:investigadores /home/aluno/desafios/permissoes/segredo.txt
chmod 0600 /home/aluno/desafios/permissoes/segredo.txt
mkdir -p /run/ctf
cat > /run/ctf/dnsmasq.conf <<EOF
no-resolv
no-hosts
listen-address=127.0.0.1
bind-interfaces
port=53
txt-record=ctf.hackerspaidegua.local,$FLAG4
EOF
chmod 0600 /run/ctf/dnsmasq.conf
dnsmasq --user=root --group=root --conf-file=/run/ctf/dnsmasq.conf --pid-file=/run/ctf/dnsmasq.pid
echo 'Laboratorio inicializado'
