# Chamada de presença — Hackers Pai D'égua

A aba **Chamada** fica em `#admin/chamada`. A plataforma continua estática no GitHub Pages; a presença é persistida no **Supabase Cloud**, sem servidor próprio.

## Fluxo

1. O administrador escolhe a turma **Poraquê** ou **Pitiú** (também são aceitas outras turmas ativas cadastradas no sistema), a data e o assunto da aula. Isso cria um registro permanente de aula para chamada, separado das atividades/quiz.
2. A lista de alunos é derivada dos **dois integrantes do cadastro permanente de cada dupla** da turma. Não é necessário recadastrar os alunos.
3. Para cada aluno, o administrador escolhe **Presente**, **Faltou**, **Justificada** ou **Não marcado**.
4. Ao salvar, a RPC valida todos os estudantes e grava as marcações de forma atômica. **Não marcado não é falta**; significa que ainda não houve registro de presença.
5. A interface lista aulas em formato recolhível, apresenta contagens e permite exportar CSV privado por aula.
6. Professores autorizados podem consultar; **somente administradores** podem criar e lançar/corrigir chamadas nesta versão.

Histórico: os registros apontam para o UUID permanente de `team_members` e para a aula. Alterar a grafia do nome conserva o histórico. Quando há presença registrada, transferir ou excluir a dupla é bloqueado no banco. Uma turma arquivada ainda pode ser consultada, mas não recebe novas aulas.

## Estrutura e autorização

Migration nova: `supabase/migrations/202611050004_attendance.sql`, **depois da 007** (`202611050003_admin_access_management.sql`).

Tabelas:
- `attendance_lessons`: aula de presença, data, turma e autor.
- `attendance_marks`: vínculo por estudante e aula, estado, autor e data da marcação.

As tabelas têm RLS ativa, SELECT restrito à equipe pedagógica e nenhuma escrita direta para `anon`/`authenticated`. As RPCs `create_attendance_lesson`, `list_attendance_lessons`, `list_attendance_roster` e `save_attendance_marks` validam a permissão no servidor. Nenhum registro de presença, nome completo ou nota é exposto no ranking público.

**Não execute migrations antigas novamente, nem testes SQL em produção.** A publicação GitHub Pages **não executa** esta migration. Primeiro aplique 008 no Supabase remoto e confirme seu sucesso; só depois faça merge da interface que depende dela.

## Melhorias visuais da mesma entrega

- Formulário de nova atividade e cartões de atividades com cabeçalhos recolhíveis por `<details><summary>`, acessíveis via teclado.
- Tela de login com **mascote Boto original do repositório** à direita, sem reconstrução ou alteração da arte. O cartão é atalho para o ranking público CTF.
- Responsividade para desktop, tablet e celular, preservando as cores e a tipografia oficiais.

## Testes

No CI, `npm run test:db` executa `supabase/tests/attendance.sql` em PostgreSQL descartável, verificando permissões, presenças individuais, estados, transferências e exclusões protegidas. `npm test` verifica os componentes React; `npm run test:visual` inspeciona o login, os accordions e a chamada em Chromium com requisições Supabase interceptadas.

Para homologação no projeto real, crie **uma aula de teste** em Poraquê, lance Presente para um aluno da dupla e Falta para o outro, salve, recarregue a página e confirme o histórico. Repita na turma Pitiú e confirme que nenhum estudante aparece em turma errada. Faça o teste com um professor, que deve consultar sem conseguir editar.
