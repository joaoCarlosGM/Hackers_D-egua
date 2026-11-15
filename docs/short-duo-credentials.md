# Credenciais curtas por dupla — Live Boot

A administração emite novas credenciais **individualmente**, na aba `#admin/duplas`, sem recadastrar estudantes ou apagar notas.

## Formato

- **Código da dupla:** 8 caracteres (exemplo fictício: `A7C9K2HM`).
- **Credencial privada:** 12 caracteres, aleatórios e diferentes do código público (exemplo fictício: `X7K5PM4W2H6D`).
- Alfabeto sem I, O, 0 ou 1 para evitar confusão no teclado do Kali Live Boot.
- Geradas no PostgreSQL com aleatoriedade criptográfica, com hash bcrypt e limite de tentativas de login; **não** são derivadas de nomes ou posições das duplas.
- O código e o segredo continuam válidos até a próxima redefinição ou desativação da dupla.

## Passo a passo da administração

1. Confirme a identidade dos integrantes da dupla e abra **Administração → Duplas**.
2. Filtre pela turma e localize a dupla pelo apelido ou pelos participantes.
3. Clique **Emitir nova credencial** e confirme o nome exibido na janela.
4. O cartão de código e segredo aparece **imediatamente abaixo da dupla solicitada**, sem exigir rolar até o final.
5. Clique **Copiar mensagem privada** e envie por um canal individual adequado; confira os destinatários antes de colar. A plataforma **não envia mensagens automaticamente**.
6. Clique **Ocultar credencial**. O segredo não fica armazenado em texto simples no banco e não pode ser recuperado pelo administrador depois. Se a dupla perdê-lo, gere outro.

O código antigo, o segredo antigo e as sessões anteriores **somente da dupla redefinida** deixam de funcionar. As demais duplas continuam conectadas. Notas, atividades, presenças e CTF não são apagados nem recontados.

## Ativação no Supabase

Antes de usar o botão novo, aplique no **Supabase SQL Editor**, com backup:

`supabase/migrations/202611050008_short_team_credentials.sql` (**migration 012**, depois da 011).

O código frontend usa a RPC **`issue_short_team_credential`**, que só existe após a migration 012. Portanto, se a migration não estiver instalada, a emissão falha com uma mensagem clara **sem modificar a credencial antiga**. O deploy GitHub Pages **não executa SQL**; não repita migrations anteriores.

As credenciais geradas antes da migration continuam funcionando no formato legado de 16 caracteres para o código + 48 para o segredo até a primeira emissão de credenciais curtas da respectiva dupla. Depois, o aluno usa 8 + 12 no mesmo formulário de login.

## Política de segurança

- Apenas `PAP_ADMIN`? Não: no Hackers Pai D’égua, **somente o papel `admin`** na tabela `public.admin_users` emite credenciais.
- O login com segredo de 12 caracteres oferece **60 bits** de entropia aleatória, com limitação de tentativas por equipe. O código da dupla tem **40 bits** e é um identificador, não substitui o segredo.
- Não publique o segredo em ranking, QR Code público, atividade ou grupo de WhatsApp.
- O site não pode recuperar uma credencial privada depois que o cartão é fechado: o banco guarda apenas o hash bcrypt.
- Computadores usados em Live Boot podem perder arquivos ao reiniciar. Oriente a dupla a conservar a mensagem em local privado fora do Live Boot.
- Reemissão não é necessária regularmente; use-a quando a dupla perder o segredo ou houver suspeita de exposição.

## Verificação

Em ambiente de homologação, gire a credencial de uma dupla de teste, confira o cartão de 8+12, valide login, valide rejeição do código antigo, reative/desative, e confirme o acesso de outra dupla que não foi modificada. A suíte SQL `supabase/tests/short_team_credentials.sql` executa esses cenários apenas no banco descartável do CI.
