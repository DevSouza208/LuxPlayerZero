# TV: destaques da semana e países

Em Ao vivo, o hero mostra os canais escolhidos pelo administrador para o dia atual em America/Sao_Paulo. O primeiro canal da lista é o destaque principal. Os demais ficam em botões de seleção, sem rotação ou reprodução automática.

## Configurar

Com uma conta administradora, abra Ao vivo e clique em Programar destaques. Escolha o dia da semana, busque os canais da playlist aberta, adicione até seis e ajuste a ordem. Salvar destaques grava a semana inteira. A agenda se repete até ser editada. Canais indisponíveis na playlist do usuário não são exibidos no hero nem podem ser reproduzidos por essa agenda.

## Navegação

Todos mostra somente os canais nacionais visíveis. As demais opções são as categorias originais da playlist, com os rótulos e a ordem do fornecedor. Quando variantes de um mesmo canal pertencem a grupos diferentes, o canal pode aparecer em cada um desses grupos, sem duplicar a contagem de Todos. Canais sem grupo ficam em Outros.

Internacionais ficam ocultos da página da TV, do editor de destaques e da vitrine de TV da Home, mas não são removidos da playlist. A detecção usa siglas explícitas reconhecidas e o grupo internacional do fornecedor. Prefixos de qualidade ou locais, como HD, TV e SP, não são países. LT/LA e grupos internacionais sem país reconhecível também ficam ocultos. A pesquisa do player e referências pessoais já salvas não são apagadas.

Não há classificação pelo MeuGuia, consulta externa de categorias ou classificação inventada pelo app. Os agrupamentos por EPG, variantes e URLs originais continuam intactos. Os cards de TV usam capas horizontais, com logos contidos em vez de esticados.

## Persistência e acesso

A rota existente /api/editorial/tv-highlights exige sessão. GET permite a leitura pelos usuários autenticados; POST exige admin, origem igual, JSON válido e até 20 KB. As referências persistidas contêm somente chave e título do canal. Não contêm URLs de reprodução ou credenciais.

A agenda fica no objeto editorial/tv-highlights-v1.json do CATALOG_BUCKET já utilizado pelo catálogo. Não há migração SQL nem novas gravações nas tabelas do catálogo. O navegador guarda uma cópia no IndexedDB por perfil e revalida após uma hora ao abrir/retomar a TV. Outros dispositivos podem levar até uma hora para ver uma edição. A mudança de dia usa somente o relógio local com o fuso de São Paulo, sem chamadas de rede. No modo visitante, as categorias funcionam sobre a playlist aberta, mas a agenda compartilhada e o editor ficam indisponíveis.

Se o bucket ou a rede falharem, a TV mostra uma mensagem e continua permitindo navegar nos canais da playlist. Falhas ao salvar mantêm o editor aberto com a seleção para nova tentativa. Não se usa uma agenda fictícia no app.

## Verificação

306 testes locais passaram antes da revisão visual e a suíte foi ampliada para cobrir as categorias originais do fornecedor. A suíte específica também passou após reforçar a detecção de prefixos. Cobertura: autorização e CSRF, validação de agenda, persistência R2 simulada, fuso, correspondência por chave/nome, ausência de canais e preservação de variantes e URLs. Teste da playlist enviada contou 2.235 entradas originais, 1.618 canais lógicos, 581 internacionais e 1.037 outros; essa é uma amostra antiga e não uma contagem da produção atual.

A fixture tests/browser/tv-features.html usa dados sintéticos e transporte simulado para validar os controles sem alterar a agenda real. A cópia pública usada no deploy de prévia é removida antes da publicação. A inspeção em iframe de 360px foi bloqueada pelo X-Frame-Options do site e não foi contornada. A primeira configuração real do administrador no R2 ainda precisa ser observada; nenhum canal de exemplo é salvo em produção.
