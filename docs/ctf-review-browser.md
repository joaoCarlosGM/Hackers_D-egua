# Revisão CTF 1 — Aula 7 (sem pontuação)

A tela **Administração → Revisão Pré-CTF** é um laboratório Linux demonstrativo do professor em React + v86/Buildroot. Ela foi alinhada ao PDF `Aula 7: CTF 1 – Desafio Prático de Fundamentos` e ao script `setup_ctf1.sh` do instrutor. **Não contabiliza pontos, não altera ranking, notas ou CTF oficial.**

## Três desafios

1. **O Rastro Trancado:** localizar `/var/tmp/auditoria_boto/coleta_secreta/.segredo_flag.txt`, observar permissão `000`, restaurar apenas leitura e capturar a flag. O shell Buildroot inicia como root e, por isso, leitura por root não demonstra uma negação DAC a usuário comum.
2. **O Invasor Insistente:** analisar `/var/log/auth_simulado.log`. Foram geradas 35 falhas de 10.0.2.15, 60 de 172.16.0.99 e 180 de 185.220.101.42, além de 25 logins aceitos. Extrair com `grep | awk | sort | uniq -c | sort -nr` e entregar `FLAG{ip}`.
3. **A Impressão Digital, Quebra de MD5 e o Cofre:** 50 arquivos AES-256-CBC em `/opt/evidencias/evidencia_01.enc` a `evidencia_50.enc`; o autêntico tem SHA-256 `3d3f540b1656b4f48c5db9e1fad13883c1b59ef7266c43879673ac4d332fe4b2`. A wordlist `dicionario_paraense.txt` mantém as 15 senhas originais. Comparar com `senha_cofre.md5`, descobrir a senha e decifrar o arquivo usando OpenSSL em um Linux com a ferramenta.

## Inicialização técnica

O build executa `scripts/prepare-v86.mjs`, que prepara `public/ctf-v86/aula07-evidencias.json`. Os dados AES-256-CBC são cifrados de verdade com PBKDF2 SHA-256 (10.000 iterações), salt OpenSSL de 8 bytes, e verificação do SHA-256 do arquivo 37. O browser injeta os 50 binários na máquina virtual via `base64 -d`. O provisionamento só marca laboratório pronto quando a auditoria de arquivos, logs, wordlist, dicionário e hash confere.

O botão **Pacote Kali** no terminal baixa `aula07-evidencias.tar`, contendo 50 arquivos AES, `dicionario_paraense.txt` e `senha_cofre.md5`. Após baixar no Kali, execute:

```bash
tar -xf aula07-evidencias.tar
sha256sum evidencias/*.enc | grep 'e4b2'
john --format=raw-md5 --wordlist=evidencias/dicionario_paraense.txt evidencias/senha_cofre.md5
openssl enc -d -aes-256-cbc -pbkdf2 -in evidencias/evidencia_37.enc -pass pass:SENHA_RECUPERADA
```

Troque `SENHA_RECUPERADA` pela senha encontrada, sem publicar a resposta aos alunos.

**Limites e implementação:** a imagem Linux Buildroot não inclui os executáveis oficiais OpenSSL, hashID (Python) nem John the Ripper. O `john` é uma implementação didática de dicionário MD5 com `md5sum`. O `hashid` do laboratório apenas reconhece candidatos MD5, SHA-1 e SHA-256 pelo comprimento hexadecimal — isso não prova o algoritmo. O `openssl` aceita especificamente `enc -d -aes-256-cbc -pbkdf2 -in ... -pass pass:...`: um script da VM comunica os bytes ao navegador, onde a Web Crypto API executa descriptografia AES-256-CBC com PBKDF2-SHA256 e 10.000 iterações **reais** e devolve o texto ao Linux; não é o binário OpenSSL oficial. O protocolo não envia senha nem dados para servidores externos. Outros subcomandos OpenSSL não são suportados. Para programas completos, utilize o Pacote Kali e execute em Linux separado.

## Write-up e auditoria

O write-up é aberto **somente pelo botão no topo do terminal**; não há formulário abaixo dele. O relatório tem três campos (comandos, raciocínio e evidência), validação da flag, salvamento no Supabase, exportação Markdown e edição com a sessão Linux rodando. O histórico do terminal demonstrativo está em `#admin/auditoria-ctf`.

## Separação da competição oficial

As flags e os arquivos gerados nesta revisão do professor são dados estáticos de demonstração presentes nos assets públicos do GitHub Pages. **Nunca reutilize essas flags como prova no CTF pontuado dos alunos.** O CTF real exige flags por dupla, validação e logs no servidor/sandbox seguro; o navegador não é origem confiável para pontuação.


### Comandos da terceira missão na revisão

```sh
hashid /opt/evidencias/senha_cofre.md5
hashid -m /opt/evidencias/senha_cofre.md5
john --format=raw-md5 --wordlist=/opt/evidencias/dicionario_paraense.txt /opt/evidencias/senha_cofre.md5
openssl version
openssl enc -d -aes-256-cbc -pbkdf2 -in /opt/evidencias/ARQUIVO_ENCONTRADO.enc -pass pass:SENHA_DESCOBERTA
```

Os nomes `ARQUIVO_ENCONTRADO` e `SENHA_DESCOBERTA` são substituídos pelos achados dos estudantes. Não publicar o gabarito nem reutilizar essas flags estáticas no CTF pontuado.
