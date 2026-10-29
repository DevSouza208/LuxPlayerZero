# TV: destaques da semana e categorias de canais

Em Ao vivo, o hero mostra os canais escolhidos pelo administrador para o dia atual em America/Sao_Paulo. O primeiro canal da lista é o destaque principal. Os demais ficam em botões de seleção, sem rotação ou reprodução automática.

## Configurar

Com uma conta administradora, abra Ao vivo e clique em Programar destaques. Escolha o dia da semana, busque os canais da playlist aberta, adicione até seis e ajuste a ordem. Salvar destaques grava a semana inteira. A agenda se repete até ser editada. Canais indisponíveis na playlist do usuário não são exibidos no hero nem podem ser reproduzidos por essa agenda.

## Navegação e JSON de curadoria

A TV usa public/data/tv-channel-groups.json, o JSON produzido a partir da playlist enviada: 2.289 IDs de fontes e 16 grupos, incluindo Esportes, 24h, Eventos e PPV, Religiosos e Internacionais. O arquivo não contém mídia, URLs, logos, usuário ou senha. Não adiciona canais à biblioteca: só classifica fontes já carregadas da própria playlist do usuário.

A TV funciona como um gerenciador de pastas. A tela inicial mostra cards de grupos. Ao abrir Esportes, os grupos somem e aparecem apenas os cards de subgrupos (Premiere, SporTV, ESPN, PPVs e outros presentes). Abrir Premiere substitui as pastas pelos canais. O caminho TV / Esportes / Premiere e Voltar permitem subir um nível, recuperando o foco na pasta anterior. Todos os canais é um card para abrir a grade completa do nível atual.

Somente um nível fica visível por vez. Grupos e subgrupos vazios ficam ocultos. A busca do cabeçalho, quando iniciada sobre uma tela de pastas, abre a grade de todos os canais. Navegar para outra pasta limpa a busca anterior. Contagens e cards continuam usando canais lógicos, com todas as variantes e links originais. O nível da pasta entra na chave da paginação contínua.

A correspondência usa primeiro o ID da fonte e depois somente nomes normalizados com classificação inequívoca no JSON. Canais novos sem correspondência são classificados internamente como Outros / Não mapeados e ficam ocultos da navegação. A curadoria de plataformas genéricas permanece em Eventos e PPV, sem afirmar que toda transmissão é esportiva. Entradas com visivel=false e países internacionais identificados ficam ocultos da TV, Home e agenda; a playlist e as referências pessoais continuam intactas.

O mapa é um arquivo estático baixado uma vez por instância da interface e incluído no cache do service worker. Não há consulta ao MeuGuia ou ao banco para classificar canais. Atualizações do JSON devem acompanhar uma nova versão do shell do service worker. Se o mapa falhar, a interface mantém as categorias básicas anteriores e informa a indisponibilidade; nova tentativa aguarda pelo menos 30 segundos.

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

## Integração da curadoria no app

25 testes locais de catálogo, classificação, carregamento e regressão do hero aprovados. O JSON completo é validado sem expor credenciais. A fixture tests/browser/tv-curated-catalog.html usa o JSON real e fontes de exemplo para testar o filtro sem abrir streams nem alterar a agenda. Navegador confirmou Esportes com Premiere e SporTV, seleção de Premiere, troca para 24h limpando o subgrupo anterior, Animes com Pokémon e foco preservado nos controles. A leitura completa da playlist enviada encontrou 1.089 canais lógicos visíveis e nenhuma fonte sem correspondência. A cópia pública da fixture foi removida antes do merge. Reprodução real não exercitada.

## Navegação em pastas

14 testes locais de catálogo, curadoria e regressão do hero aprovados. Navegador com JSON real e fontes sintéticas confirmou: grupos em cards sem grade de canais, Esportes somente com subpastas, Premiere somente com canais, Voltar retornando o foco à pasta Premiere e cards com altura controlada. A fixture atualizada permanece em tests/browser/tv-curated-catalog.html. A cópia pública temporária foi removida antes do merge. Reprodução real não exercitada.

## Grupos ocultos

Informações da lista, Outros e Rádios ficam ocultos da TV, Todos os canais, Home e editor de destaques. O filtro se aplica também às categorias básicas de contingência. Os registros do JSON e as fontes da playlist são preservados. 7 testes locais da curadoria aprovados.

Grupos com zero ou um subgrupo abrem diretamente todos os seus canais. Nesses grupos, Voltar retorna aos cards principais, e o caminho não oferece a etapa redundante de subpastas. Grupos com dois ou mais subgrupos mantêm a escolha de pasta.

## Capas dos grupos e subgrupos

104 ilustrações vetoriais originais em public/assets/tv-covers: 12 grupos, 91 subgrupos e Todos os canais. Todas têm arquivo próprio com paleta, composição temática e nome editorial. Não são logos oficiais das emissoras. O manifesto public/tv-folder-covers.js resolve a capa pela chave exata do grupo/subgrupo e reutiliza a capa do grupo para novas famílias desconhecidas. Nenhum stream ou dado do fornecedor é incorporado nas imagens.

Os cards carregam as capas sob demanda com lazy loading. O service worker guarda somente as capas visitadas, sem pré-carregar os 104 arquivos ou consultar o D1. Os SVGs completos somam menos de 250 KB. O gerador reproduzível é scripts/build-tv-covers.py.
