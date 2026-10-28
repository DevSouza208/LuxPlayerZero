# Catálogo editorial VOD

## Ativação

1. Execute `migrations/0013_vod_catalog.sql` no D1 usado pelo Lux Zero.
2. Entre com a conta cujo `usuarios.nivel_acesso` seja `administrador` ou `admin`.
3. Abra **Admin** na navegação do Cinema.
4. Use **Atualizar**. O painel atualiza fontes R2 cadastradas, importa os títulos e inicia a classificação dos pendentes. Também usa os títulos da lista aberta no navegador, sem enviar suas URLs de mídia. Mantenha o painel aberto durante essa primeira leitura local; as etapas R2/TMDB já iniciadas ficam salvas para a rotina automática.

O painel permite consultar Filmes/Séries, buscar por início do título, paginar e editar título, ano, ID do fornecedor, ID TMDB, gêneros, tags e coleções. As listas no formulário usam vírgulas; no banco são arrays JSON. Salvar um registro marca `status_metadados='manual'`.

## Estrutura e identidade

- `filmes`: um título por nome normalizado + ano; versões ficam relacionadas ao mesmo título.
- `series`: uma série por nome normalizado + ano; episódios não viram registros desta tabela.
- `nome_original` preserva a identificação de apresentação fornecida pela lista. `titulo` pode ser editado sem mudar a identidade interna.
- `id_provedor` e `fornecedor` representam uma referência válida do fornecedor. Filmes reconhecem IDs numéricos e UUIDs em caminhos `/movie/...`; séries usam apenas `series-id` declarado. Um ID do link `/series/...` identifica um episódio e jamais é promovido a ID da série.
- `tmdb_id` é preenchido somente após correspondência segura ou edição manual. Remakes sem ano e nomes ambíguos exigem revisão; o nome não substitui um ID confiável.
- `vod_catalog_items` relaciona cada catálogo aos títulos e conserva as referências alternativas do fornecedor em `ids_provedor`.
- `vod_catalog_jobs` registra snapshot, cursor e lease; `vod_catalog_state` evita classificação simultânea.

A M3U no R2 e os elementos/motores de reprodução não são alterados por esta indexação. Nenhuma URL de mídia é reconstruída usando o ID TMDB. Alterar IDs no editor não altera o endereço original do stream.

## Incremental e agendamento

O Worker mantém o cron `0 6 * * *` para baixar as fontes às 03h de São Paulo. O cron `0 7 * * *` descobre os snapshots às 04h. `* * * * *` retoma pequenos lotes de importação/classificação; também permite que o trabalho prossiga depois de fechar o painel. Cron usa UTC.

Um snapshot já concluído é ignorado se chave e data não mudaram. Os upserts preservam títulos editados, IDs editados, gêneros, tags, coleções e correspondências existentes. A rotina TMDB ignora registros com gêneros ou tags, encontrados ou manuais; resultados sem correspondência têm espera de sete dias, falhas transitórias têm espera e a cota compartilhada do TMDB é respeitada. Também há proteção contra uma edição manual feita durante uma consulta TMDB.

O primeiro preenchimento completo é progressivo. Enquanto o painel está aberto, ele continua a classificação até esgotar os pendentes elegíveis, atingir a cota ou ser fechado. Importar os nomes não equivale a ter consultado o TMDB para todos: o enriquecimento tem limite por lote e pode continuar nos dias seguintes. A consulta inicial não bloqueia a abertura do Cinema.

Se um snapshot mudar durante a leitura, o trabalho retoma a nova versão. Vínculos antigos só são descartados após validar a contagem completa do novo snapshot. Falhas preservam a versão anterior e podem ser reiniciadas pelo botão.

## Bindings e segurança

Pages/Functions e o Worker agendado precisam usar o mesmo `DB` (D1), `CATALOG_BUCKET` (R2) e `TMDB_API_KEY`. A atualização da origem reutiliza os segredos e allowlist já exigidos pela sincronização de fontes. Os IDs reais dos recursos são configurados na Cloudflare; não são inventados no `wrangler.jsonc`. Publicar no GitHub não comprova que esses bindings/cron estejam ativos no painel.

`/api/admin/vod` exige sessão válida e papel de administrador em toda leitura/escrita. POST exige JSON e origem do próprio site. O frontend não concede privilégios e o modo visitante não mostra o botão.

## Validação

A lista real de teste, com 263.582 entradas, foi percorrida em lotes usando as mesmas queries SQLite e retornou 24.556 filmes e 6.668 séries. Todos os filmes receberam uma referência reconhecida do fornecedor; nenhum ID de episódio foi colocado no campo de ID da série. Há 31.403 referências distintas de filmes preservadas. Isso é validação local, não confirmação de uma importação já executada no D1 de produção.

Validação final: 223 testes locais passaram; o painel teve smoke test de DOM (abrir, listar, editar, fechar, negar usuário comum e não interpretar HTML de títulos). O Worker compilou em dry-run. A ativação do SQL e uma execução autenticada no D1 de produção dependem da conta do administrador.

Para catálogos muito grandes, os limites de CPU do plano Cloudflare também precisam ser conferidos. Os lotes de leitura são pequenos (64 KiB), mas o tempo de CPU real e os bindings do Worker devem ser medidos na produção; o teste local não comprova o limite do plano contratado.


## Controles de importação (28/10/2026)

- **Scan rápido** percorre a lista aberta em blocos, agrupa filmes/séries por título e ano e informa os totais únicos sem escrever no D1. TV e episódios individuais não viram títulos. É uma leitura completa local, sem consultar o TMDB. Não estima a duração de consultas futuras do TMDB.
- **Atualizar** faz o scan antes do envio. Importa os registros únicos em lotes de 60 e preserva classificações, gêneros, tags e edições existentes. Mostra percentual e ETA do envio usando a velocidade observada. Nas fontes R2, o progresso é por entradas lidas do snapshot, incluindo episódios e TV, não pelo número de séries únicas. Cada etapa tem seu próprio percentual.
- **Reconstruir catálogo** faz o scan antes da confirmação destrutiva. A API exige administrador, mesma origem e confirmação explícita. A exclusão das tabelas filmes/series, vínculos e jobs é atômica e recusada enquanto houver lease de importação ou TMDB ativo. Edições manuais do catálogo são apagadas. Contas, configurações, snapshots e fontes são preservados. Em seguida o painel refaz a importação. Se a lista local for interrompida, Atualizar pode enviar novamente os títulos de forma idempotente.
- As fontes R2 são retomadas por checkpoint, até quatro trechos de 64 KiB por execução. O parser não reprocessa a playlist inteira para cada linha. A classificação agora pode rodar durante a indexação, com alternância de prioridade entre filmes e séries por minuto. Chave ausente, quota ou HTTP indisponível retornam motivo explícito ao painel. O Worker registra o último resultado de classificação em vod_catalog_state.

O front consulta tmdb_meta_cache. Isso não atualiza filmes/series diretamente. enrichVod cruza os títulos pendentes, reaproveita esse cache e persiste IDs/imagens/gêneros nas tabelas. Antes a manutenção só fazia isso quando toda a indexação ficava ociosa, atrasando o enriquecimento. A correção remove essa dependência. Ainda é necessário verificar os bindings e segredos do Worker em produção.

Validação desta alteração: 243 testes locais, incluindo reconstrução com proteção de lease, preservação de contas, progresso e persistência a partir do cache do front. Scan local da lista de 263.582 entradas: 24.556 filmes e 6.668 séries, cerca de 9 segundos neste ambiente. O desempenho de rede/D1/TMDB e CPU do plano Cloudflare não é inferido desse tempo local.
