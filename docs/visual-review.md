# Revisão da identidade visual oficial

## Arquivos interpretados

Foram inspecionados `ranking_referencia.png`, `paleta_oficial.png`, as quatro PNGs de propostas de logo e todas as quatro páginas de `identidade_visual_origem.pdf`. O PDF contém imagens, sem texto extraível; as renderizações fornecidas e os objetos de imagem permitiram interpretar todas as propostas. Nenhum arquivo ficou sem interpretação.

`public/assets/manifest.json` registra a origem e o checksum de cada arte. As PNGs foram copiadas intactas. Da página 2 do PDF, foram extraídos o mascote e a logo completa com as máscaras de transparência originais, sem recorte, recoloração, redesenho ou mudança de proporções. O mascote com chapéu é a variante usada na referência principal do ranking.

## Comparação pelo Playwright

Comando: `npm run test:visual`. Chromium, desktop de 1024×900, ranking na largura de referência de 919 px, celular de 390×844 e preferência por movimento reduzido. Os screenshots são páginas completas. O comparativo coloca a referência e a implementação lado a lado, mantendo as proporções de ambas as imagens.

Foram revisadas as sete telas: início, cadastro, avaliação, ranking, login administrativo, administração/editor de atividade e resultados privados. Os testes usam dados isolados no navegador, sem conexão ou escrita no Supabase real. Os nomes e números que reproduzem o ranking de referência aparecem somente nas fixtures de teste.

Arquivos gerados em `artifacts/visual/`:

- `ranking-comparison.png`: referência e ranking implementado, lado a lado.
- `desktop-ranking.png` e `mobile-ranking.png`: composição completa e adaptação ao celular.
- `desktop-home.png`, `desktop-registration.png`, `desktop-quiz.png`, `desktop-admin-login.png`, `desktop-admin.png`, `desktop-results.png`, e suas versões `mobile-*`. O gerenciamento de turmas e a confirmação de exclusão têm ainda `desktop-class-management.png` e `mobile-class-management.png`.
- `desktop-ranking-board.png` e `mobile-ranking-board.png`: recortes feitos pelo próprio Playwright para facilitar a inspeção do ranking.

## Diferenças identificadas e corrigidas

1. Cabeçalhos anteriores não mostravam a arte oficial em todas as rotas. Agora o componente global usa a imagem original, inclusive no login, editor, quiz e resultados.
2. O mascote era uma página renderizada com fundo branco. Foi substituído pela imagem transparente original incorporada ao PDF, usando a máscara fornecida, sem remoção artificial de fundo.
3. Cartões do pódio eram altos e tinham sublinhados decorativos ausentes da referência. Foram compactados; os sublinhados e textos repetidos de resoluções foram retirados do pódio. Permanecem as três medalhas, as bordas rosa/azul/roxo e sombras deslocadas.
4. O nome longo do segundo colocado quebrava linha. As proporções das colunas e a escala tipográfica foram ajustadas para a composição da referência.
5. O texto “Posição” se sobrepunha à coluna seguinte no celular. O cabeçalho passou a usar `#`, como a referência, mantendo “Posição” como nome acessível. Um teste verifica que os cabeçalhos não transbordam.
6. A turma adicionava uma linha visual e aumentava a altura de cada registro. Ela permanece disponível para leitores de tela e no filtro, com tabela compacta de quatro colunas como a referência.
7. A fonte dependia do sistema operacional. Courier Prime regular e negrito são servidas localmente, com a licença OFL, para manter a estética de máquina de escrever no Linux Live Boot.
8. Os controles de turma/projeção deslocavam todo o pódio. Em desktop foram posicionados no espaço superior lateral; no celular continuam no fluxo da página, sem sobreposição.

## Adaptações funcionais preservadas

O mascote aparece inteiro; o corte do topo presente na captura de referência não foi reproduzido. A tela real conserva filtro de turma, modo projetor, cabeçalho de navegação e aviso de privacidade das notas. O fundo usa Deep Void, da paleta obrigatória. Não se replicam o rótulo estático “MODO TESTE”, o horário da captura ou pontuações de exemplo na aplicação real. No celular, o pódio se empilha e os textos se ajustam à largura disponível.

Os 15 cenários verificam cores exatas, carregamento e proporção do mascote, ausência de overflow horizontal, integridade das artes por SHA-256 e caminhos sob `/Hackers_D-egua/` no endereço gratuito do GitHub Pages. A inspeção humana dos screenshots complementa essas verificações; não se afirma equivalência pixel a pixel com uma captura de dimensões e controles diferentes.
