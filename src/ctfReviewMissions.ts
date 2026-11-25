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
    incident: "Uma equipe de alunos precisa consultar um arquivo, mas as permissões não concedem leitura ao grupo responsável pela investigação.",
    context: "O arquivo está em /opt/desafio_dac/flag.txt e pertence ao grupo alunos. O objetivo é compreender a configuração e corrigir apenas o acesso necessário.",
    objective: "Ler as permissões e identificar dono e grupo; adicionar leitura ao grupo, preservando a restrição para outros usuários.",
    deliverable: "Uma explicação das permissões antes e depois e a flag no arquivo flag.txt.",
    realWorld: "Permissões mal configuradas impedem o trabalho de equipes legítimas ou expõem informações indevidamente. A menor permissão necessária reduz riscos.",
    startingPoint: "Primeiro analise a saída de ls -l. Não altere permissões sem compreender cada coluna.",
    flagFormat: "FLAG{GRUPO_REVIS_...}",
    steps: [
      { title: "Inspecionar permissões", doing: "Ver quais permissões existem para dono, grupo e outros.", why: "Isso revela exatamente quem pode ler, escrever ou executar o arquivo.", example: "ls -l /opt/desafio_dac/flag.txt" },
      { title: "Aplicar o menor ajuste", doing: "Conceder leitura somente ao grupo alunos.", why: "chmod g+r modifica a leitura do grupo sem liberar acesso para qualquer usuário.", example: "chmod g+r /opt/desafio_dac/flag.txt" },
      { title: "Confirmar e analisar", doing: "Consultar as permissões novamente e ler a evidência.", why: "Uma boa alteração de segurança precisa ser verificada e documentada.", example: "ls -l /opt/desafio_dac/flag.txt && cat /opt/desafio_dac/flag.txt" }
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
    context: "O arquivo /var/log/auth_simulado.log contém eventos SSH fictícios. Existem acessos suspeitos de mais de uma origem.",
    objective: "Filtrar falhas, extrair os endereços de origem, agrupar as ocorrências e identificar o IP predominante.",
    deliverable: "O IP mais frequente, a quantidade de ocorrências e uma flag no formato FLAG{IP_endereco.ip}.",
    realWorld: "A análise de logs ajuda equipes a detectar automações suspeitas, apoiar bloqueios e justificar decisões com evidências.",
    startingPoint: "Inspecione o formato das linhas do log antes de construir um pipeline.",
    flagFormat: "FLAG{IP_endereco.ip}",
    steps: [
      { title: "Selecionar os eventos", doing: "Filtrar linhas que registram senha incorreta.", why: "Logs misturam diferentes tipos de eventos; um filtro reduz o ruído.", example: "grep 'Failed password' /var/log/auth_simulado.log" },
      { title: "Extrair e agrupar", doing: "Separar o campo do IP, ordenar e contar ocorrências.", why: "sort e uniq -c permitem descobrir repetições sem contar manualmente.", example: "grep 'Failed password' /var/log/auth_simulado.log | cut -d' ' -f6 | sort | uniq -c" },
      { title: "Priorizar a origem", doing: "Ordenar os resultados pela maior quantidade e registrar o IP.", why: "A origem mais frequente orienta a análise; frequência não é, por si só, prova de invasão.", example: "grep 'Failed password' /var/log/auth_simulado.log | cut -d' ' -f6 | sort | uniq -c | sort -nr | head" }
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
    context: "O nome investigado é ctf.hackerspaidegua.local, consultado no laboratório pelo endereço 192.168.56.1. Na revisão, um script Linux reproduz a resposta TXT, sem servidor DNS verdadeiro.",
    objective: "Compreender o propósito dos registros TXT, interpretar a estrutura de uma consulta DNS e localizar a mensagem.",
    deliverable: "A mensagem TXT obtida por dig e uma explicação do papel do DNS nesse cenário.",
    realWorld: "Registros DNS não servem apenas para localizar endereços IP. Registros TXT também transportam informações como verificações de domínio e políticas de e-mail.",
    startingPoint: "Identifique o nome consultado, o tipo de registro e o servidor solicitado no comando.",
    flagFormat: "FLAG{DNS_REVIS_...}",
    steps: [
      { title: "Definir a consulta", doing: "Identificar o domínio e o tipo de registro que podem conter a mensagem.", why: "Uma consulta DNS só faz sentido quando sabemos qual nome e qual tipo de informação queremos.", example: "cat missao.txt" },
      { title: "Consultar o TXT", doing: "Executar uma consulta didática usando dig.", why: "O parâmetro TXT pede especificamente registros de texto, não endereços IP.", example: "dig @192.168.56.1 ctf.hackerspaidegua.local TXT" },
      { title: "Interpretar a resposta", doing: "Localizar o conteúdo entre aspas e justificar a conclusão.", why: "Entender a estrutura da resposta é tão importante quanto copiar a flag.", example: "dig @192.168.56.1 ctf.hackerspaidegua.local TXT" }
    ],
    studentQuestion: "O que muda quando consultamos um registro A em vez de um TXT?",
    closing: "Explique a diferença entre resolução de nomes e consulta de dados textuais no DNS.",
    caveat: "A saída de dig desta revisão é uma simulação didática produzida por um script dentro do Linux. Não existe um servidor DNS local real nesta VM; não apresente esta etapa como teste real de rede."
  },
  {
    id: 5,
    title: "A Impressão Digital Perdida",
    subtitle: "Qual arquivo é a evidência legítima?",
    category: "Integridade · Hashes SHA-256 e MD5",
    difficulty: "Intermediário",
    incident: "Uma pasta recebeu 50 arquivos com nomes e aparências semelhantes. Apenas um é a evidência original: o SHA-256 de seu conteúdo termina exatamente com os quatro caracteres c4e1.",
    context: "O analista precisa investigar /opt/evidencias/ sem confiar no nome dos arquivos. Depois de encontrar a evidência correta, deverá ler a flag e calcular seu resumo MD5 para comparar com a referência da investigação.",
    objective: "Calcular SHA-256 dos 50 arquivos, localizar o único hash terminado em c4e1, ler a flag e verificar o MD5 do texto exato da flag, sem quebra de linha.",
    deliverable: "O caminho da evidência, o hash SHA-256 completo, a flag obtida e o MD5 da flag comparado à referência a67ac8c054f704be2673a9a7c72cffa8.",
    realWorld: "Hashes verificam integridade e ajudam a comparar evidências. SHA-256 oferece maior resistência a colisões que MD5, que não é adequado para proteger dados sensíveis nem assinaturas modernas.",
    startingPoint: "Liste os 50 registros de /opt/evidencias/. Comece pelo SHA-256 e só depois confirme a flag usando MD5.",
    flagFormat: "FLAG{MD5_SHA256_INTEGRIDADE_...}",
    steps: [
      { title: "Calcular a impressão digital", doing: "Executar sha256sum sobre todos os arquivos de evidência.", why: "Um hash identifica o conteúdo binário de cada arquivo, independentemente do nome escolhido.", example: "sha256sum /opt/evidencias/*" },
      { title: "Localizar a evidência", doing: "Filtrar o resultado para encontrar o hash terminado em c4e1 e ler a flag do arquivo correspondente.", why: "A condição c4e1 seleciona uma evidência específica entre os 50 candidatos; a flag precisa vir do conteúdo do arquivo.", example: "sha256sum /opt/evidencias/* | grep -E 'c4e1[[:space:]]'" },
      { title: "Confirmar a flag com MD5", doing: "Aplicar md5sum à flag como texto sem quebra de linha e comparar com a referência publicada.", why: "A comparação demonstra uma verificação de integridade. MD5 é hash, não criptografia reversível, e é inseguro contra colisões.", example: "printf '%s' 'COLE_AQUI_A_FLAG_ENCONTRADA' | md5sum" }
    ],
    studentQuestion: "Por que calcular hashes é diferente de criptografar, e por que hoje preferimos SHA-256 ao MD5 quando segurança importa?",
    closing: "Explique a descoberta por SHA-256, registre o MD5 correspondente à flag e destaque que MD5 é uma função hash antiga, vulnerável a colisões, não um mecanismo de criptografia. Como exercício adicional, analise o hash de senha com a wordlist paraense e compare o ataque de dicionário com a verificação de integridade.",
    caveat: "Exercício adicional: /opt/evidencias/dicionario_paraense.txt e /opt/evidencias/senha_cofre.md5. Neste Buildroot, o comando john é uma implementação didática de comparação MD5 via md5sum, NÃO o executável oficial John the Ripper. Para o CTF oficial com John real será necessária uma imagem Linux equipada com a ferramenta."
  }
];


/** Contextual explanation shown to the instructor after a real shell command.
 * This describes the tool's purpose, not whether the command actually succeeded.
 */
export function explainReviewCommand(raw: string): { what: string; why: string } {
  const command = raw.trim().toLowerCase();
  if (command.includes("|") && /grep|sort|uniq|cut|head/.test(command)) return {
    what: "Executou um pipeline: a saída de um comando alimenta o próximo.",
    why: "Combinar filtros, extração de campos e contagem transforma muitas linhas de log em um resultado verificável."
  };
  const executable = command.split(/\s+/)[0];
  switch (executable) {
    case "pwd": return { what: "Mostrou o diretório de trabalho atual.", why: "É importante conhecer o ponto de partida antes de navegar entre pastas e arquivos." };
    case "ls": return { what: "Solicitou uma listagem de arquivos e diretórios.", why: "A opção -a inclui arquivos ocultos; -l mostra permissões, proprietário e grupo." };
    case "cd": return { what: "Solicitou uma mudança de diretório.", why: "Navegar corretamente permite investigar uma pasta sem confundir caminhos relativos e absolutos." };
    case "find": return { what: "Procurou arquivos ou diretórios segundo critérios.", why: "É mais completo que consultar apenas a pasta atual, pois pode investigar subdiretórios." };
    case "cat": return { what: "Pediu o conteúdo de um arquivo.", why: "A leitura fornece a evidência necessária para confirmar ou descartar uma hipótese." };
    case "chmod": return { what: "Tentou modificar permissões de acesso.", why: "É essencial conceder apenas as permissões necessárias e verificar o resultado com ls -l." };
    case "groups": return { what: "Consultou os grupos associados ao usuário.", why: "O grupo do usuário pode determinar quais arquivos estão acessíveis em um Linux real." };
    case "grep": return { what: "Filtrou linhas que correspondem a uma expressão.", why: "Ajuda a isolar eventos relevantes em logs extensos." };
    case "cut": return { what: "Extraiu campos de cada linha de texto.", why: "Separar o campo do IP permite contar as origens sem repetir o restante do log." };
    case "sort": return { what: "Ordenou os registros.", why: "A ordenação prepara os dados para contagem ou para destacar as maiores ocorrências." };
    case "uniq": return { what: "Agrupou linhas iguais consecutivas.", why: "Com -c, conta as ocorrências; por isso é comum utilizá-lo depois de sort." };
    case "head": return { what: "Mostrou as primeiras linhas do resultado.", why: "Ajuda a observar os registros mais relevantes após ordenar os dados." };
    case "dig": return { what: "Solicitou uma consulta de registro DNS.", why: "O tipo TXT é usado para consultar dados textuais; nesta revisão a saída é reproduzida por um script." };
    case "sha256sum": return { what: "Calculou a impressão digital SHA-256 do conteúdo de um ou vários arquivos.", why: "Localiza a evidência legítima por seu resumo criptográfico e permite comparar integridade sem confiar no nome do arquivo." };
    case "md5sum": return { what: "Calculou um resumo MD5 do conteúdo informado.", why: "Demonstra verificação por hash. MD5 não é criptografia reversível e não é recomendado para integridade contra adulteração maliciosa." };
    case "printf": return { what: "Formatou e escreveu texto sem adicionar necessariamente uma quebra de linha.", why: "Para comparar o MD5 de uma flag, cada byte importa. printf '%s' evita a quebra de linha adicionada por echo." };
    case "whoami": return { what: "Consultou o usuário atual.", why: "Identificar a identidade de execução ajuda a interpretar as permissões de acesso." };
    default: return { what: "O comando foi enviado ao Linux emulado.", why: "Observe a saída e explique como ela ajuda, ou não, a investigar a situação-problema." };
  }
}
