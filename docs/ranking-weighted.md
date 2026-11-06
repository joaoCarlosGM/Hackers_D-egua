# Ranking geral: CTF 80% + Avaliações 20%

O projeto passa a ter um **ranking geral de até 1.000 pontos**. CTF é o componente principal; as atividades de sala complementam a classificação. A equipe desativada fica **oculta do ranking público** e retorna com os mesmos dados e pontuação após reativação.

## Fórmula exibida

- **CTF — 800 pontos possíveis:** pontos CTF não negativos de uma dupla, divididos pela maior pontuação CTF não negativa entre as duplas ativas (todas as turmas), multiplicados por 800. Se ninguém conquistou pontos CTF, o componente CTF de todos é zero. Penalidades permanecem armazenadas, mas o componente exibido não fica negativo.
- **Avaliações — 200 pontos possíveis:** até 200 pontos conforme a média do aproveitamento nas atividades elegíveis da turma. O Supabase publica **apenas um agregado arredondado em faixas de 5 pontos percentuais**, não a nota por questão, prova, aluno ou tentativa.
- **Pontuação geral:** CTF normalizado (0–800) + complemento pedagógico (0–200), arredondado ao inteiro mais próximo.

Exemplo: a dupla com 600 pontos CTF, quando a líder tem 1.000, recebe 480 dos 800 possíveis. Com média arredondada de 80% nas avaliações, ganha outros 160, totalizando **640 pontos gerais**.

**Observação:** como os 800 pontos CTF são normalizados pela maior pontuação atual, a pontuação geral de outras equipes pode mudar quando uma equipe obtém novos pontos CTF ou quando a líder é desativada. O histórico bruto de CTF não é alterado.

## Regras pedagógicas

1. Apenas avaliações **abertas, encerradas ou arquivadas** entram no denominador. Rascunhos ou atividades publicadas, ainda não iniciadas, não entram.
2. Cada atividade conta uma única vez por equipe. Se o professor autorizar novas tentativas, é considerada a **melhor nota efetivamente entregue** para a mesma atividade.
3. A atividade elegível não respondida contribui com 0% para a média, evitando elevar a nota só porque uma equipe escolheu responder apenas as avaliações fáceis.
4. A avaliação começa a afetar o ranking após a confirmação da entrega. Uma correção de nota também atualiza o agregado; isso **não** cria eventos de pontuação CTF.
5. Notas detalhadas, respostas e nomes dos alunos continuam em tabelas protegidas; somente o agregado arredondado da **dupla** entra na tabela pública.
6. Uma dupla desativada não participa do ranking público, mas **não perde** CTF, avaliações, presenças ou histórico. Reativar restaura sua elegibilidade e seus pontos.

## Implantação segura (sem servidor)

O GitHub Pages hospeda somente o frontend e **não aplica SQL automaticamente**. A nova interface requer **as duas migrations abaixo, nesta ordem**:

1. `202611050005_hide_inactive_ranking.sql` — oculta equipes inativas no banco e publica um evento de atualização em tempo real sem informações pessoais.
2. `202611050006_weighted_rank.sql` — calcula e mantém o agregado das avaliações por gatilhos de banco, incluindo histórico anterior. Ambos exigem que a migration 008 de chamada já esteja aplicada.

Faça backup, confira as migrations efetivamente instaladas, execute apenas as pendentes em transações e **só depois** publique o frontend. Nunca execute `supabase/tests/*.sql` no projeto remoto.

Para validar em ambiente de teste, faça uma entrega com nota parcial, corrija sua nota, autorize uma segunda tentativa, desative a dupla e reative. Verifique a pontuação geral, a ausência de pontuação CTF duplicada e a invisibilidade da dupla desativada.

O ajuste manual de pontos CTF permanece reservado ao administrador. O peso 80/20 fica fixo nesta versão; futuras revisões devem considerar o efeito de rankings relativos na avaliação pedagógica.
