# Carrossel do destaque da Home

O hero alterna a cada dez segundos entre os itens publicados disponíveis na biblioteca: até sete filmes e sete séries. O modo séries prioriza sua seleção, e um título fixado permanece sozinho. Sem seleção publicada usa até catorze itens disponíveis das fileiras, sem fabricar entradas ou modificar links de reprodução. O índice acompanha a identidade do item entre renderizações e reordenações.

Setas permitem avançar/voltar em ciclo, com contador e botão de pausa. As setas esquerda/direita também funcionam quando o foco está nos controles. O foco permanece no botão usado. Leitor de tela recebe a posição somente nas trocas manuais, evitando anunciar trocas automáticas. Controles têm alvos de 44 px e ficam ocultos quando há zero ou um item.

A troca automática pausa com mouse sobre o hero, foco dentro dele, aba oculta, navegação para o catálogo ou menos de 35% do hero visível. Abrir detalhes ou iniciar reprodução pausa explicitamente até Retomar destaques. A preferência de movimento reduzido começa em pausa. Retomar requer que foco/mouse saiam da área antes de recomeçar, para manter interação estável.

Título, arte, informações e as ações existentes usam o item selecionado. O motor de vídeo não muda. Mantém os caches de metadados e não prepara/publica destaques nem consulta o ranking do TMDB em cada troca. Somente os metadados de apresentação do título exibido seguem o fluxo existente. Cache do shell 88 inclui os dois módulos novos.

## Verificação

Quatro testes focados verificam ciclo completo, voltar ao início, identidade/URLs, atualização de seleção, reordenação, duplicatas, lista vazia e destaque fixado. Nenhum teste chamou fontes remotas.

Chrome na Home com catálogo e publicação simulados confirmou avanço manual, seta esquerda pelo teclado, foco preservado, pausa/retomada e avanço automático observado de 4/14 para 7/14. Ao avançar para 8/14 mostrou a primeira série da seleção e manteve Assistir agora, Mais informações e Minha lista visíveis. A pausa permaneceu em 8/14 durante a conferência seguinte. Prévia pública temporária removida antes do merge. Não houve vídeo real, publicação real, viewport móvel real ou controle remoto físico.
