# Cadastro de administradores e professores

O projeto é hospedado no GitHub Pages, mas autenticação e permissões ficam no Supabase Cloud. **Cadastrar um usuário em Authentication → Users não o torna administrador**. A conta Auth comprova a identidade; a tabela `public.admin_users` determina o papel `admin` ou `teacher`.

## Administrador já consegue entrar no site

1. No Supabase Dashboard, entre no projeto correto e crie ou convide o novo usuário em **Authentication → Users**. A conta precisa ter e-mail, senha definida e confirmação de e-mail conforme as regras do projeto.
2. Entre no site como um administrador existente: `https://joaocarlosgm.github.io/Hackers_D-egua/#admin`.
3. Abra **Usuários e permissões**, disponível apenas ao perfil Administrador.
4. Informe o **mesmo e-mail** cadastrado no Supabase Auth; escolha **Administrador** (gestão completa) ou **Professor** (avaliações/notas) e clique em **Autorizar acesso**.
5. A pessoa acessa `#admin` com a senha de sua conta. Se já estava conectada e ainda vê "não autorizada", clique em **Verificar autorização novamente**.

Você pode consultar os usuários autorizados, alterar papéis e revogar acesso nessa tela. A revogação exige digitar o e-mail correspondente e **não exclui** a conta do Supabase Auth. A proteção de cada RPC verifica a permissão atual no banco, mesmo que alguém tenha deixado uma aba antiga aberta.

## Primeiro administrador, sem ninguém autorizado

Depois que todas as migrations aplicáveis estiverem instaladas no Supabase:

1. Crie sua própria conta em **Authentication → Users**.
2. Abra `supabase/bootstrap_admin.sql` e **substitua o e-mail de exemplo** pelo e-mail da conta existente.
3. Execute o arquivo uma única vez no **SQL Editor** do projeto Supabase, como responsável pelo banco. Ele rejeita valores de exemplo e não roda se já existir um admin.
4. Entre na plataforma e cadastre os demais responsáveis pela seção **Usuários e permissões**.

O bootstrap não deve ser acionado por visitantes, novas inscrições nem scripts públicos. Ele não cria uma senha e não deve conter uma chave `sb_secret_`.

## Caso já exista um admin no banco, mas você não consiga entrar com ele

Se você é responsável pelo próprio projeto Supabase e possui acesso privilegiado ao SQL Editor, pode vincular **manualmente** uma conta Auth existente, para recuperar a administração. Confirme o endereço de e-mail antes de executar.

```sql
do $$
declare
  desired_email text := 'SUBSTITUA_PELO_EMAIL_EXISTENTE';
  target_id uuid;
begin
  if desired_email = 'SUBSTITUA_PELO_EMAIL_EXISTENTE'
    then raise exception 'Substitua o e-mail de exemplo'; end if;
  if (select count(*) from auth.users
      where lower(email) = lower(btrim(desired_email))) <> 1 then
    raise exception 'Conta não encontrada ou ambígua em Authentication > Users';
  end if;
  select id into target_id from auth.users
   where lower(email) = lower(btrim(desired_email));
  insert into public.admin_users(user_id, role)
    values(target_id, 'admin')
    on conflict(user_id) do update set role = excluded.role;
  insert into public.audit_events(actor_id, action, target_id, details)
    values(null, 'manual_admin_recovery', target_id,
      jsonb_build_object('source', 'Supabase SQL Editor'));
end $$;
```

Esta operação é **recuperação manual pelo responsável pelo banco**, não um recurso automático da aplicação. Para o uso cotidiano, prefira o painel autenticado, que valida as permissões e registra o administrador responsável pela ação.

## Segurança e implantação

- O banco exige a migration `202611050003_admin_access_management.sql`, **após** `202611050002_team_management.sql`. Não execute migrations antigas novamente.
- A nova interface no GitHub Pages depende dessas funções SQL. Execute a migration e confirme as permissões antes de mesclar o PR que publica o painel.
- Não permita criação pública de administradores: a migration só dá permissão ao RPC para usuários autenticados já autorizados como admin, conferindo `auth.uid()` no banco. Criar a conta no Supabase Auth **nunca** promove automaticamente.
- O sistema impede que um admin retire a própria autorização e impede a revogação do último admin, inclusive em alterações simultâneas. Todas as mudanças são auditadas.
- O painel nunca exige `service_role`, `sb_secret_` nem senha do banco no frontend.
- Se o Supabase estiver com CAPTCHA obrigatório no login por senha, a interface de login deve enviar o token exigido; não use desligar CAPTCHA como solução definitiva.
- Configure MFA para administradores no provedor de autenticação conforme a política institucional. A aplicação não implementa MFA por conta própria.
- Para testes com dados de alunos, use contas e cadastros autorizados; nunca execute `supabase/tests/*.sql` no projeto real.
