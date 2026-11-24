/** Enunciados da Revisão Pré-CTF. Conteúdo exclusivamente pedagógico, sem pontuação.
 * O CTF oficial poderá utilizar o mesmo padrão visual, mas não herda flags nem permissões.
 */
export type ReviewInvestigationStep = {
  title: string;
  doing: string;
  why: string;
  example: string;
};
export type ReviewMission = {
  id: number;
  title: string;
  subtitle: string;
  category: string;
  difficulty: string;
  incident: string;
  context: string;
  objective: string;
  deliverable: string;
  realWorld: string;
  startingPoint: string;
  flagFormat: string;
  steps: ReviewInvestigationStep[];
  studentQuestion: string;
  closing: string;
  caveat?: string;
};
export const reviewMissions: ReviewMission[] = [
  {
    id: 1,
    title: "Navegação e Arquivos Ocultos",
    subtitle: "O relatório que desapareceu",
    category: "Linux · Sistema de arquivos",
    difficulty: "Iniciante",
    incident: "Um relatório de investigação deixou de aparecer na listagem de arquivos. A equipe suspeita que a evidência ainda esteja guardada em uma pasta temporária do Linux.",
    context: "Você foi chamado para localizar a evidência sem alterar os arquivos da máquina. A única pista recebida é que o material passou por /var/tmp.",
    objective: "Inspecionar o sistema de arquivos, encontrar um arquivo oculto e ler a evidência que ele contém.",
    deliverable: "Uma flag no formato FLAG{ARQUIVO_REVIS_...}, encontrada dentro de um arquivo real.",
    realWorld: "Arquivos e diretórios iniciados por ponto não aparecem em listagens comuns. Saber procurá-los é essencial em inventários, manutenção e investigações de incidentes.",
    startingPoint: "Comece identificando o diretório em que você está. Depois explore /var/tmp.",
    flagFormat: "FLAG{ARQUIVO_REVIS_...}",
    steps: [
      { title: "Reconhecer o ambiente", doing: "Descobrir o diretório atual e listar os arquivos.", why: "Antes de investigar, você precisa saber onde está e o que pode visualizar.", example: "pwd && ls -la" },
      { title: "Procurar a evidência", doing: "Pesquisar arquivos ocultos no diretório temporário.", why: "O comando ls sem -a pode esconder pistas; find procura também em subdiretórios.", example: "find /var/tmp -type f -name '.*'" },
      { title: "Ler e registrar", doing: "Abrir o arquivo encontrado e guardar a flag.", why: "Uma conclusão deve ser sustentada pelo conteúdo encontrado, não apenas pelo nome do arquivo.", example: "cat /var/tmp/relatorios/.auditoria/.relatorio.txt" }
    ],
    studentQuestion: "Qual comando encontrou o arquivo e por que uma listagem normal poderia não mostrá-lo?",
    closing: "Explique a diferença entre localizar um arquivo e ler seu conteúdo. Mostre por que ls -la e find são úteis em uma investigação."
  },
  {
    id: 2,
    title: "Permissões e Grupos Restritos",
    subtitle: "A evidência bloqueada",
    category: "Linux · Controle de acesso",
    difficulty: "Iniciante–intermediário",
    incident: "Uma equipe de investigadores precisa consultar um arquivo, mas as permissões não concedem leitura ao grupo responsável pela investigação.",
    context: "O arquivo está em /home/aluno/desafios/permissoes/segredo.txt e pertence ao grupo investigadores. O objetivo é compreender a configuração e corrigir apenas o acesso necessário.",
    objective: "Ler as permissões e identificar dono e grupo; adicionar leitura ao grupo, preservando a restrição para outros usuários.",
    deliverable: "Uma explicação das permissões antes e depois e a flag no arquivo segredo.txt.",
    realWorld: "Permissões mal configuradas impedem o trabalho de equipes legítimas ou expõem informações indevidamente. A menor permissão necessária reduz riscos.",
    startingPoint: "Primeiro analise a saída de ls -l. Não altere permissões sem compreender cada coluna.",
    flagFormat: "FLAG{GRUPO_REVIS_...}",
    steps: [
      { title: "Inspecionar permissões", doing: "Ver quais permissões existem para dono, grupo e outros.", why: "Isso revela exatamente quem pode ler, escrever ou executar o arquivo.", example: "ls -l /home/aluno/desafios/permissoes/segredo.txt" },
      { title: "Aplicar o menor ajuste", doing: "Conceder leitura somente ao grupo investigadores.", why: "chmod g+r modifica a leitura do grupo sem liberar acesso para qualquer usuário.", example: "chmod g+r /home/aluno/desafios/permissoes/segredo.txt" },
      { title: "Confirmar e analisar", doing: "Consultar as permissões novamente e ler a evidência.", why: "Uma boa alteração de segurança precisa ser verificada e documentada.", example: "ls -l /home/aluno/desafios/permissoes/segredo.txt && cat /home/aluno/desafios/permissoes/segredo.txt" }
    ],
    studentQuestion: "Por que chmod g+r é preferível a chmod 777 nesse caso?",
    closing: "Compare rw------- com rw-r----- e explique o significado de usuário, grupo e outros.",
    caveat: "Neste laboratório demonstrativo o shell inicia como root. Portanto, conseguir executar cat antes do chmod não comprova que um usuário comum teria acesso; use a saída de ls -l para ensinar os bits de permissão."
  },
  {
    id: 3,
    title: "Mineração de Logs de Força Bruta",
    subtitle: "Quem está tentando entrar?",
    category: "Segurança · Logs de autenticação",
    difficulty: "Intermediário",
    incident: "O sistema de autenticação registrou várias tentativas de senha incorreta. A equipe precisa identificar qual endereço IP aparece mais vezes nas falhas.",
    context: "O arquivo /home/aluno/desafios/logs/auth.log contém eventos SSH fictícios. Existem acessos suspeitos de mais de uma origem.",
    objective: "Filtrar falhas, extrair os endereços de origem, agrupar as ocorrências e identificar o IP predominante.",
    deliverable: "O IP mais frequente, a quantidade de ocorrências e uma flag no formato FLAG{IP_endereco.ip}.",
    realWorld: "A análise de logs ajuda equipes a detectar automações suspeitas, apoiar bloqueios e justificar decisões com evidências.",
    startingPoint: "Inspecione o formato das linhas do log antes de construir um pipeline.",
    flagFormat: "FLAG{IP_endereco.ip}",
    steps: [
      { title: "Selecionar os eventos", doing: "Filtrar linhas que registram senha incorreta.", why: "Logs misturam diferentes tipos de eventos; um filtro reduz o ruído.", example: "grep 'Failed password' /home/aluno/desafios/logs/auth.log" },
      { title: "Extrair e agrupar", doing: "Separar o campo do IP, ordenar e contar ocorrências.", why: "sort e uniq -c permitem descobrir repetições sem contar manualmente.", example: "grep 'Failed password' /home/aluno/desafios/logs/auth.log | cut -d' ' -f6 | sort | uniq -c" },
      { title: "Priorizar a origem", doing: "Ordenar os resultados pela maior quantidade e registrar o IP.", why: "A origem mais frequente orienta a análise; frequência não é, por si só, prova de invasão.", example: "grep 'Failed password' /home/aluno/desafios/logs/auth.log | cut -d' ' -f6 | sort | uniq -c | sort -nr | head" }
    ],
    studentQuestion: "Qual é a diferença entre uma tentativa de acesso falha e a confirmação de uma invasão?",
    closing: "Mostre como grep, cut, sort, uniq -c e head colaboram para transformar um log bruto em uma hipótese verificável."
  },
  {
    id: 4,
    title: "Mensagem Secreta no DNS",
    subtitle: "O recado no registro TXT",
    category: "Redes · Resolução de nomes",
    difficulty: "Intermediário",
    incident: "A equipe recebeu a indicação de que uma mensagem técnica foi armazenada em um registro DNS do tipo TXT, mas ninguém sabe como consultar esse registro.",
    context: "O nome investigado é ctf.hackerspaidegua.local. Para a revisão, a resposta TXT é reproduzida por um script Linux preparado dentro da máquina virtual.",
    objective: "Compreender o propósito dos registros TXT, interpretar a estrutura de uma consulta DNS e localizar a mensagem.",
    deliverable: "A mensagem TXT obtida por dig e uma explicação do papel do DNS nesse cenário.",
    realWorld: "Registros DNS não servem apenas para localizar endereços IP. Registros TXT também transportam informações como verificações de domínio e políticas de e-mail.",
    startingPoint: "Identifique o nome consultado, o tipo de registro e o servidor solicitado no comando.",
    flagFormat: "FLAG{DNS_REVIS_...}",
    steps: [
      { title: "Definir a consulta", doing: "Identificar o domínio e o tipo de registro que podem conter a mensagem.", why: "Uma consulta DNS só faz sentido quando sabemos qual nome e qual tipo de informação queremos.", example: "cat missao.txt" },
      { title: "Consultar o TXT", doing: "Executar uma consulta didática usando dig.", why: "O parâmetro TXT pede especificamente registros de texto, não endereços IP.", example: "dig @127.0.0.1 ctf.hackerspaidegua.local TXT" },
      { title: "Interpretar a resposta", doing: "Localizar o conteúdo entre aspas e justificar a conclusão.", why: "Entender a estrutura da resposta é tão importante quanto copiar a flag.", example: "dig @127.0.0.1 ctf.hackerspaidegua.local TXT" }
    ],
    studentQuestion: "O que muda quando consultamos um registro A em vez de um TXT?",
    closing: "Explique a diferença entre resolução de nomes e consulta de dados textuais no DNS.",
    caveat: "A saída de dig desta revisão é uma simulação didática produzida por um script dentro do Linux. Não existe um servidor DNS local real nesta VM; não apresente esta etapa como teste real de rede."
  }
];
