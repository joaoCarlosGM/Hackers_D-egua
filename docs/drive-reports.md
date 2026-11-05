# Relatórios privados: contrato para futura integração com Google Drive

O módulo atual produz CSV privado no navegador de um professor autorizado. Não há upload automático nem credencial Google no frontend. A pasta de destino do projeto deverá ser selecionada pelo responsável quando essa integração for habilitada.

Contrato de uma futura Edge Function autenticada:

- Entrada: `activity_id` UUID e `format: "csv"`; não aceitar notas ou nomes enviados pelo navegador como fonte de verdade.
- Validar o JWT Supabase Auth e uma linha explícita em `admin_users`. Não basta uma conta Auth existir.
- Consultar `assessment_results(activity_id)` sob a identidade autorizada e construir o mesmo conjunto de colunas da exportação atual: atividade, UUID da dupla, apelido, turma, dois integrantes, tentativa, nota, máximo, início e entrega.
- Neutralizar fórmulas CSV usando a mesma regra de `src/utils.ts`. Não publicar o CSV em bucket público, no ranking ou no repositório.
- OAuth Google e eventual refresh token ficam em armazenamento seguro do servidor/Edge Function, nunca em `VITE_*`. Usar o menor escopo possível e verificar permissão da pasta privada antes de escrever. O ID da pasta deverá ser configuração validada no servidor, não um destino arbitrário do cliente.
- Usar chave de idempotência por solicitação de exportação, registrar autor, atividade, horário e ID do arquivo no `audit_events`, sem tokens ou conteúdo privado nos logs.
- Resposta: identificador do arquivo e status; só retornar link que respeite permissões privadas. Não alterar o compartilhamento da pasta ou do arquivo para público.

Esta é uma especificação de integração futura. A exportação CSV local já funciona; a autorização Google, o destino da pasta e o upload ainda não foram implementados nem testados.
