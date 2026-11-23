FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends bash coreutils findutils grep gawk sed dnsutils dnsmasq sudo procps util-linux && rm -rf /var/lib/apt/lists/*
RUN groupadd investigadores && useradd -m -s /bin/bash -G investigadores aluno && echo 'aluno ALL=(root) NOPASSWD: /usr/bin/chmod g+r /home/aluno/desafios/permissoes/segredo.txt' > /etc/sudoers.d/lab && chmod 0440 /etc/sudoers.d/lab
COPY lab/bootstrap.sh /usr/local/bin/ctf-bootstrap
RUN chmod +x /usr/local/bin/ctf-bootstrap
CMD ["sleep", "infinity"]
