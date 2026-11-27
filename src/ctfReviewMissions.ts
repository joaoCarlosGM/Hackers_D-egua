/** Aula 7 — CTF 1: três desafios integrados, revisão SEM pontuação.
 * Enunciados derivados do material da aula e do provisionamento do instrutor.
 * Não reutilizar flags estáticas em CTF oficial com pontuação.
 */
export type ReviewInvestigationStep = {
 title:string;doing:string;why:string;example:string;
};
export type ReviewMission = {
 id:number;title:string;subtitle:string;category:string;difficulty:string;
 incident:string;context:string;objective:string;deliverable:string;
 realWorld:string;startingPoint:string;flagFormat:string;
 steps:ReviewInvestigationStep[];studentQuestion:string;closing:string;caveat?:string;
};
export const reviewMissions:ReviewMission[] = [
 {
 id:1,title:"O Rastro Trancado",subtitle:"O Rastro Trancado",
 category:"Linux · Arquivos ocultos e permissões DAC",difficulty:"Fundamentos",
 incident:"Um agente escondeu um relatório confidencial em arquivo oculto dentro de /var/tmp e retirou todas as permissões do arquivo antes de sair.",
 context:"Investigue o caminho real em /var/tmp/auditoria_boto/coleta_secreta/.segredo_flag.txt. A revisão executa em Linux Buildroot e demonstra os bits DAC.",
 objective:"Localizar o arquivo oculto, diagnosticar permissões 000, conceder leitura mínima e obter a primeira flag.",
 deliverable:"Caminho encontrado, permissões antes/depois, comando utilizado e flag.",
 realWorld:"Busca recursiva e princípios de menor privilégio são usados na investigação de sistemas Unix.",
 startingPoint:"Comece por /var/tmp. Procure arquivos ocultos com find, consulte ls -l e altere as permissões somente depois de diagnosticá-las.",
 flagFormat:"FLAG{r4str0_...}",
 steps:[
 {title:"Localizar arquivo oculto",doing:"Pesquisar arquivos iniciados por ponto.",why:"Arquivos ocultos não aparecem na listagem comum.",example:"find /var/tmp -type f -name '.*' 2>/dev/null"},
 {title:"Diagnosticar DAC",doing:"Ler os bits de permissão.",why:"chmod 000 remove todas as permissões comuns de leitura, escrita e execução.",example:"ls -la /var/tmp/auditoria_boto/coleta_secreta/"},
 {title:"Corrigir e ler",doing:"Conceder apenas leitura e confirmar a evidência.",why:"Documente a mudança e registre a flag.",example:"chmod u+r /var/tmp/auditoria_boto/coleta_secreta/.segredo_flag.txt && cat /var/tmp/auditoria_boto/coleta_secreta/.segredo_flag.txt"}
 ],
 studentQuestion:"Como localizar um arquivo oculto e explicar o significado de chmod 000?",
 closing:"Registre no write-up o arquivo, as permissões e por que a alteração foi necessária.",
 caveat:"O shell da revisão inicia como root. Root pode ler arquivos mesmo com modo 000; para comprovar o bloqueio de um aluno comum seria necessário executar como usuário não privilegiado."
 },
 {
 id:2,title:"O Invasor Insistente",subtitle:"O Invasor Insistente",
 category:"Redes · Logs SSH e pipelines",difficulty:"Fundamentos",
 incident:"Um servidor registrou uma tempestade de tentativas de autenticação SSH. É preciso descobrir o IP com mais falhas.",
 context:"Analise /var/log/auth_simulado.log; os registros são inteiramente fictícios e não representam acessos reais.",
 objective:"Filtrar Failed password, extrair os IPs após 'from', contabilizar e descobrir o maior agressor.",
 deliverable:"Endereço IP, total de tentativas, pipeline e flag no formato FLAG{ip}.",
 realWorld:"Triagem de logs e agrupamento ajudam a identificar padrões suspeitos sem presumir comprometimento.",
 startingPoint:"Leia algumas linhas do log antes de escolher o campo a extrair.",
 flagFormat:"FLAG{ip.do.atacante}",
 steps:[
 {title:"Filtrar falhas",doing:"Separar registros Failed password.",why:"Remova os eventos de acesso aceito.",example:"grep 'Failed password' /var/log/auth_simulado.log | head"},
 {title:"Extrair IP e contar",doing:"Obter o campo imediatamente após 'from'.",why:"O número do campo depende do formato do log; neste arquivo use awk ou cut -d' ' -f 11.",example:"grep 'Failed password' /var/log/auth_simulado.log | awk '{print $11}' | sort | uniq -c"},
 {title:"Identificar o maior",doing:"Ordenar a contagem do maior para o menor.",why:"Isso apresenta a origem mais frequente.",example:"grep 'Failed password' /var/log/auth_simulado.log | awk '{print $11}' | sort | uniq -c | sort -nr | head -n 1"}
 ],
 studentQuestion:"Qual IP aparece mais vezes, e por que isso não confirma uma invasão bem-sucedida?",
 closing:"Inclua a quantidade de falhas e o pipeline que fundamentou a resposta."
 },
 {
 id:3,title:"A Impressão Digital, Quebra de MD5 e o Cofre",subtitle:"A Impressão Digital, Quebra de MD5 e o Cofre",
 category:"Criptografia · SHA-256, MD5 e AES-256-CBC",difficulty:"Intermediário",
 incident:"Em /opt/evidencias há 50 arquivos .enc, um hash de senha MD5 e uma wordlist paraense. Somente o arquivo autêntico tem SHA-256 terminado em e4b2.",
 context:"Localize a evidência por SHA-256, recupere a senha testando o dicionário contra o MD5 e decifre o cofre AES-256-CBC com PBKDF2.",
 objective:"Localizar o arquivo .enc legítimo, descobrir a senha do cofre e recuperar a terceira flag da evidência cifrada.",
 deliverable:"Nome do .enc autêntico, SHA-256 completo, senha recuperada, comando de descriptografia e flag.",
 realWorld:"Hashes verificam integridade; dicionários demonstram o risco de senhas previsíveis; AES protege confidencialidade.",
 startingPoint:"Liste /opt/evidencias e comece pelos hashes dos arquivos .enc. A wordlist é dicionario_paraense.txt.",
 flagFormat:"FLAG{cr1pt0_...}",
 steps:[
 {title:"Identificar o arquivo",doing:"Comparar SHA-256 dos 50 arquivos cifrados.",why:"O arquivo autêntico termina em e4b2.",example:"sha256sum /opt/evidencias/*.enc | grep -E 'e4b2[[:space:]]'"},
 {title:"Descobrir a senha",doing:"Testar as 15 palavras do dicionário contra senha_cofre.md5.",why:"MD5 de senha simples é vulnerável a ataque de dicionário.",example:"john --format=raw-md5 --wordlist=/opt/evidencias/dicionario_paraense.txt /opt/evidencias/senha_cofre.md5"},
 {title:"Abrir o cofre",doing:"Decifrar o arquivo .enc identificado usando a senha recuperada.",why:"AES-256-CBC com PBKDF2 exige a senha correta.",example:"openssl enc -d -aes-256-cbc -pbkdf2 -in /opt/evidencias/evidencia_37.enc -pass pass:SENHA_RECUPERADA"}
 ],
 studentQuestion:"Qual a diferença entre obter a senha de um hash MD5 e decifrar um arquivo protegido por AES?",
 closing:"O write-up deve explicar a seleção pelo SHA-256, o teste do dicionário e a descriptografia.",
 caveat:"Nesta VM, john e hashid são utilitários didáticos, não os programas oficiais. O comando openssl aceita apenas descriptografia AES-256-CBC/PBKDF2 e usa a Web Crypto API real do navegador, não o binário OpenSSL. Para as ferramentas oficiais use o Pacote Kali em outro Linux."
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
