# TV: destaques da semana e categorias do fornecedor

Em Ao vivo, o hero mostra os canais escolhidos pelo administrador para o dia atual em America/Sao_Paulo. O primeiro canal da lista é o destaque principal. Os demais ficam em botões de seleção, sem rotação ou reprodução automática.

## Configurar

Com uma conta administradora, abra Ao vivo e clique em Programar destaques. Escolha o dia da semana, busque os canais da playlist aberta, adicione até seis e ajuste a ordem. Salvar destaques grava a semana inteira. A agenda se repete até ser editada. Canais indisponíveis na playlist do usuário não são exibidos no hero nem podem ser reproduzidos por essa agenda.

## Navegação

Todos mostra somente os canais nacionais visíveis. As demais opções usam os nomes detalhados da API do fornecedor quando há correspondência segura; na ausência desses metadados, mantêm os grupos da M3U. Quando variantes de um mesmo canal pertencem a grupos diferentes, o canal pode aparecer em cada um desses grupos, sem duplicar a contagem de Todos. Canais sem grupo ficam em Outros.

Internacionais ficam ocultos da página da TV, do editor de destaques e da vitrine de TV da Home, mas não são removidos da playlist. A detecção usa siglas explícitas reconhecidas e o grupo internacional do fornecedor. Prefixos de qualidade ou locais, como HD, TV e SP, não são países. LT/LA e grupos internacionais sem país reconhecível também ficam ocultos. A pesquisa do player e referências pessoais já salvas não são apagadas.

Não há classificação pelo MeuGuia, consulta externa de categorias ou classificação inventada pelo app. Os agrupamentos por EPG, variantes e URLs originais continuam intactos. Os cards de TV usam capas horizontais, com logos contidos em vez de esticados.

## Categorias detalhadas do fornecedor

A M3U enviada possui grupos amplos, por exemplo CANAIS COMPLETO(SD,HD,FHD,4K). O app consulta get_live_categories e get_live_streams pela ponte privada existente, sem reconstruir URLs de vídeo. A identificação vem da fonte Xtream da própria playlist; o get.php preenchido no formulário pode fornecer a origem da API quando pertence à mesma conta.

A correspondência usa primeiro stream_id; caso a M3U utilize UUIDs diferentes, usa EPG ou nome normalizado somente quando a categoria é inequívoca. Não cruza credenciais ou hosts de outra fonte. Categorias sem correspondência não são inventadas. Se duas variantes agrupadas pelo mesmo EPG tiverem categorias regionais diferentes, cada categoria aponta para a variante correspondente e o seletor de fontes começa no item escolhido.

O cache IndexedDB é separado por perfil e pela identidade da fonte usando chave SHA-256. Guarda somente IDs, nomes e categorias de metadados, sem URLs, usuário ou senha. Expira em 24 horas. Falhas temporárias mantêm os grupos da M3U e limitam novas tentativas por cinco minutos na página. Não há gravação adicional nas tabelas do catálogo. A ponte existente continua validando autenticação e allowlist de hosts.

As consultas diretas HTTP e HTTPS ao fornecedor no ambiente de execução responderam HTTP 403; o conteúdo real da API não foi confirmado por esse teste. O fluxo do app usa a ponte na Cloudflare. Os testes locais e a prévia sintética cobrem o carregamento e a associação das categorias, mas não substituem observar a resposta da fonte na sessão real do usuário.

## Persistência e acesso

A rota existente /api/editorial/tv-highlights exige sessão. GET permite a leitura pelos usuários autenticados; POST exige admin, origem igual, JSON válido e até 20 KB. As referências persistidas contêm somente chave e título do canal. Não contêm URLs de reprodução ou credenciais.

A agenda fica no objeto editorial/tv-highlights-v1.json do CATALOG_BUCKET já utilizado pelo catálogo. Não há migração SQL nem novas gravações nas tabelas do catálogo. O navegador guarda uma cópia no IndexedDB por perfil e revalida após uma hora ao abrir/retomar a TV. Outros dispositivos podem levar até uma hora para ver uma edição. A mudança de dia usa somente o relógio local com o fuso de São Paulo, sem chamadas de rede. No modo visitante, as categorias funcionam sobre a playlist aberta, mas a agenda compartilhada e o editor ficam indisponíveis.

Se o bucket ou a rede falharem, a TV mostra uma mensagem e continua permitindo navegar nos canais da playlist. Falhas ao salvar mantêm o editor aberto com a seleção para nova tentativa. Não se usa uma agenda fictícia no app.

## Verificação

307 testes locais passaram na versão final. A suíte específica também passou após reforçar a detecção de prefixos. Cobertura: autorização e CSRF, validação de agenda, persistência R2 simulada, fuso, correspondência por chave/nome, ausência de canais e preservação de variantes e URLs. Teste da playlist enviada contou 2.235 entradas originais, 1.618 canais lógicos, 581 internacionais e 1.037 outros; essa é uma amostra antiga e não uma contagem da produção atual.

O navegador confirmou o filtro de categorias, a ocultação de internacionais, a reordenação dos destaques e o foco após salvar. O app em modo visitante abriu a TV sem erro e sem agenda fictícia. A fixture tests/browser/tv-features.html usa dados sintéticos e transporte simulado para validar os controles sem alterar a agenda real. A cópia pública usada no deploy de prévia é removida antes da publicação. A inspeção em iframe de 360px foi bloqueada pelo X-Frame-Options do site e não foi contornada. A primeira configuração real do administrador no R2 ainda precisa ser observada; nenhum canal de exemplo é salvo em produção.

Verificação da correção de categorias detalhadas: 317 testes locais passaram. No navegador, a fixture com API simulada substituiu o grupo genérico pelos grupos GLOBO SUDESTE e GLOBO SUL, filtrou o canal de Porto Alegre na região Sul e preservou os canais de São Paulo/Rio no Sudeste. A cópia pública da fixture foi removida antes de publicar.
