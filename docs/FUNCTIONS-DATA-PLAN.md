# Planejamento de funções e uso de dados

Objetivo: manter o uso gratuito com o mínimo de operações no D1. Uma ação de apresentação não deve depender da disponibilidade do banco editorial.

| Função | Execução e armazenamento | Estado |
| --- | --- | --- |
| Parse da playlist, agrupamento por marcadores do fornecedor, ordenação, busca e filtros nos itens carregados | Front-end e índices locais | Existente |
| Identificação TMDB por título ou ID verificado | Front recebe dados de rota restrita ao TMDB com chave no servidor. Cache em memória/Cache API na borda, sem acesso ao D1 | Implementado |
| Capas, sinopse, nomes de temporadas, episódios, duração, elenco e ficha | Consulta sob demanda. Ficha e temporadas com cache no navegador, memória e borda. Capas oficiais também usam o cache PWA | Implementado |
| Classificação editorial por gênero/tag, correções, coleções e vínculos | D1, exclusivamente na manutenção administrativa ou edição explícita | Existente |
| Importação inicial e atualização diária do catálogo | Jobs em lotes com checkpoint no D1. Atualização preserva edições. Não reconstruir para atualizar | Existente |
| Distribuir classificação editorial aos filtros | Exportar índice estático de IDs/gêneros/tags já tratados para R2/CDN após alterações. O cliente reutiliza a versão recebida e filtra com os dados prontos, sem TMDB por item e sem D1 por clique | Planejado |
| Evitar reindexar snapshot diário idêntico | Comparar hash da fonte/índice antes de gerar nova versão, preservando checkpoints e evitando regravar vínculos sem alteração | Planejado |
| Resumos administrativos e contadores | Evitar scans integrais repetidos e consultas frequentes durante importação; revisar métricas de leitura antes da otimização | Planejado |
| Login, autorização e permissões | Verificação obrigatória no servidor, com D1 quando necessário. Não transferir decisões de autorização para o cliente | Existente |
| Preferências, favoritos e progresso | Visitante usa estado local. Conta autenticada usa o armazenamento de perfil já existente; revisar frequência de sincronização separadamente | Existente |

## Metadados de apresentação

As rotas públicas existentes /api/metadata/tmdb, /api/metadata/details e /api/metadata/status passam pelo módulo live-metadata. Não acessam env.DB, nem para cache, quota, configuração ou autenticação. A chave TMDB continua como Secret no servidor; essa intermediação não exige D1. URLs de origem e playlists não são enviadas ao TMDB.

O Cache API da Cloudflare é opcional. Falha, ausência ou expulsão desse cache não impede a consulta. O cache em memória é limitado a 256 entradas e 8 MiB por instância; requisições idênticas concorrentes são unidas. A ficha e temporadas também ficam no IndexedDB do navegador: temporadas por 24h, ficha por até 7 dias, ficha de coleção parcial por 5min. Falhas não são armazenadas como resultados persistentes e podem ser repetidas após 30s.

A limitação de rajada do proxy é transitória e por instância, não uma cota global durável. Nenhuma quota diária é gravada no D1 para exibição. As limitações do TMDB e os limites/contagens de requisições Workers continuam valendo; tirar o D1 não torna as requisições infinitas ou gratuitas em qualquer volume. O cache do navegador reduz também chamadas às Functions.

## Catálogo tratado

A rotina administrativa continua chamando o classificador persistente explicitamente. Ela usa D1 para guardar o vínculo TMDB/gêneros/tags e respeita sua própria cota. Não usa o fluxo de apresentação para gravar automaticamente o que o usuário está vendo.

Os filtros atuais leem catalogGenreIds/catalogTags dos itens carregados. Não está concluída a integração das tags editoriais do D1 a esse fluxo. O índice estático planejado deve fazer essa ponte por identidade estável do fornecedor/título/ano, sem reconsultar TMDB por item. O conteúdo deverá ser privado quando trouxer organização específica de conta; não publicar playlists, URLs de mídia, credenciais ou edições de um usuário em um índice público.

## Validação desta separação

259 testes locais passaram, incluindo as rotas Pages/Worker com um getter DB que lança erro em qualquer acesso, obtenção de Pokémon/Liga Índigo/episódio em resposta TMDB simulada, independência do cache da borda, segurança de origem/IDs/chave, concorrência e reaproveitamento entre clientes do navegador. Os testes administrativos existentes continuam verificando gravação explícita, autorização e preservação de edições. Consulta TMDB real em produção deve ser verificada separadamente de testes simulados.
