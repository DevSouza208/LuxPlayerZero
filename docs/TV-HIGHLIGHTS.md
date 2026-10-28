# TV: destaques da semana e categorias de canais

Em Ao vivo, o hero mostra os canais escolhidos pelo administrador para o dia atual em America/Sao_Paulo. O primeiro canal da lista é o destaque principal. Os demais ficam em botões de seleção, sem rotação ou reprodução automática.

## Configurar

Com uma conta administradora, abra Ao vivo e clique em Programar destaques. Escolha o dia da semana, busque os canais da playlist aberta, adicione até seis e ajuste a ordem. Salvar destaques grava a semana inteira. A agenda se repete até ser editada. Canais indisponíveis na playlist do usuário não são exibidos no hero nem podem ser reproduzidos por essa agenda.

## Navegação

Todos mostra somente os canais nacionais visíveis. A navegação usa a divisão do MeuGuia (https://meuguia.tv/), consultada em 28/10/2026: Filmes, Séries, Esportes, Infantil, Variedades, Documentários, Notícias e TV aberta. As oito páginas de categoria servem de referência para um mapa local de nomes e aliases dos canais. Canais sem correspondência ficam em Outros. Categorias vazias não aparecem. Um canal lógico aparece uma vez e conserva todas as variantes.

A classificação é de apresentação e não altera o group-title original. Prefixos de país são avaliados antes da classificação. Sufixos de qualidade são ignorados na comparação de nomes. Afiliadas com nome explícito de Globo, SBT, Record ou Band entram em TV aberta. Não se infere uma rede somente pelo nome de uma cidade. O filtro Grupo restaurado continua exibindo os grupos originais da playlist, dentro da categoria escolhida.

Internacionais ficam ocultos da página da TV, do editor de destaques e da vitrine de TV da Home, mas não são removidos da playlist. A detecção usa siglas explícitas reconhecidas e o grupo internacional do fornecedor. Prefixos de qualidade ou locais, como HD, TV e SP, não são países. LT/LA e grupos internacionais sem país reconhecível também ficam ocultos. A pesquisa do player e referências pessoais já salvas não são apagadas.

Não há consulta ao MeuGuia em tempo de execução, importação de programação, nova API ou gravação de categorias no D1. O mapa local pode precisar de atualização quando canais mudarem de nome. Os agrupamentos por EPG, variantes e URLs originais continuam intactos. Os cards de TV usam capas horizontais, com logos contidos em vez de esticados.

## Persistência e acesso

A rota existente /api/editorial/tv-highlights exige sessão. GET permite a leitura pelos usuários autenticados; POST exige admin, origem igual, JSON válido e até 20 KB. As referências persistidas contêm somente chave e título do canal. Não contêm URLs de reprodução ou credenciais.

A agenda fica no objeto editorial/tv-highlights-v1.json do CATALOG_BUCKET já utilizado pelo catálogo. Não há migração SQL nem novas gravações nas tabelas do catálogo. O navegador guarda uma cópia no IndexedDB por perfil e revalida após uma hora ao abrir/retomar a TV. Outros dispositivos podem levar até uma hora para ver uma edição. A mudança de dia usa somente o relógio local com o fuso de São Paulo, sem chamadas de rede. No modo visitante, as categorias funcionam sobre a playlist aberta, mas a agenda compartilhada e o editor ficam indisponíveis.

Se o bucket ou a rede falharem, a TV mostra uma mensagem e continua permitindo navegar nos canais da playlist. Falhas ao salvar mantêm o editor aberto com a seleção para nova tentativa. Não se usa uma agenda fictícia no app.

## Verificação

307 testes locais passaram na versão final. A suíte específica também passou após reforçar a detecção de prefixos. Cobertura: autorização e CSRF, validação de agenda, persistência R2 simulada, fuso, correspondência por chave/nome, ausência de canais e preservação de variantes e URLs. Teste da playlist enviada contou 2.235 entradas originais, 1.618 canais lógicos, 581 internacionais e 1.037 outros; essa é uma amostra antiga e não uma contagem da produção atual.

O navegador confirmou o filtro de categorias, a ocultação de internacionais, a reordenação dos destaques e o foco após salvar. O app em modo visitante abriu a TV sem erro e sem agenda fictícia. A fixture tests/browser/tv-features.html usa dados sintéticos e transporte simulado para validar os controles sem alterar a agenda real. A cópia pública usada no deploy de prévia é removida antes da publicação. A inspeção em iframe de 360px foi bloqueada pelo X-Frame-Options do site e não foi contornada. A primeira configuração real do administrador no R2 ainda precisa ser observada; nenhum canal de exemplo é salvo em produção.

## Alteração de categorias em 28/10/2026

A referência do MeuGuia substitui as abas genéricas do fornecedor. A verificação anterior acima documenta a versão com grupos do fornecedor. A nova classificação é verificada por testes de nomes, categorias, canais desconhecidos e preservação das fontes.

Validação nova: 19 testes locais aprovados. Prévia no navegador com dados sintéticos confirmou as oito categorias e Outros, filtro Infantil com Cartoon Network, Notícias com GloboNews e seleção do canal. Nenhuma fonte de exemplo é gravada em produção. A fixture permanece em tests/browser/tv-guide-categories.html e a cópia pública temporária foi removida antes do merge.
