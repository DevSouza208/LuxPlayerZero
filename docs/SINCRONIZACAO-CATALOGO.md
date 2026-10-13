# Lux Zero — Catálogo sincronizado a cada 4 horas (proposta)

**Estado: arquitetura aprovada para estudo; nenhum job de sincronização foi publicado.**

Objetivo: o usuário fornece uma fonte legítima Xtream/M3U; o catálogo (canais, categorias, logos, EPG e metadados) pode ser processado fora do navegador; o reprodutor recebe uma lista normalizada sem repetir o download pesado a cada abertura. Nunca incorporar listas, senhas ou acesso a conteúdos no código do aplicativo.

## PHP, M3U e mídia são camadas distintas

- `get.php?...` é um endpoint PHP **executado pelo servidor de origem**. O Lux recebe seu **resultado**, normalmente uma playlist `#EXTM3U`. Não precisamos executar PHP.
- `player_api.php` no protocolo Xtream normalmente devolve JSON de conta, TV, VOD, categorias e EPG.
- Uma playlist salva em HTTPS no R2 pode conter URLs HTTP nos seus canais. **O R2 não converte transmissões de vídeo HTTP em HTTPS por armazenar a playlist.**
- Mídia ao vivo HLS demanda manifestos e segmentos atualizados em intervalos de segundos. Repetir apenas um snapshot de mídia a cada 4 horas não reproduz TV ao vivo. MPEG-TS é fluxo contínuo, não um arquivo de catálogo.

## Fluxo recomendado

```text
Cloudflare Pages (front) ──HTTPS──> Worker autenticado ──> D1 (catálogo organizado)
                                        ↑                 └──> R2 privado (snapshots)
                              cron 0 */4 * * * (UTC)
                                        │
                                conectores de fontes
                               Xtream API / M3U / XMLTV
                                        │
                               fornecedores autorizados

O player recebe metadados e, ao apertar Play, resolve a fonte sob demanda.
Os bytes do vídeo não passam obrigatoriamente pelo R2.
```

## Papel dos serviços

| Serviço | Responsabilidade |
| --- | --- |
| Pages | HTML, CSS, JavaScript e assets; sem job cron no projeto estático |
| Worker independente | Buscar fontes, validar, normalizar, registrar atualizações e servir APIs autenticadas |
| R2 privado | Manter snapshot original do catálogo por versão e eventual EPG bruto, nunca expor credenciais |
| D1 | Catálogo indexado e normalizado, relacionamento entre fonte/canal/categoria, status da sincronização |
| Player | Receber canal e escolher engine/protocolo compatível com dispositivo |

Cloudflare Workers aceitam `scheduled(event, env, ctx)` e a configuração `triggers.crons`; R2 tem `put/get` via binding. Pages não oferece Cron Triggers nativamente.

## Rotina de quatro horas

1. Worker agendado roda com `0 */4 * * *` (horários UTC).
2. Consulta apenas fontes configuradas/autorizadas, com timeout, limites de tamanho e de concorrência.
3. Valida autenticação, status HTTP e formato. Se falhar, mantém o último catálogo válido, registra o erro e não substitui o snapshot.
4. Salva snapshot privado versionado no R2. Não publica um `get.php` com usuário/senha em bucket público.
5. Processa categorias e registros, normaliza nomes (HD/FHD/SD), preserva distinções entre canais numerados, mantém rádio/TV/VOD separados.
6. Grava no D1 em lotes, preferencialmente apenas diferenças entre as versões para evitar custos e picos de CPU. Usa identificadores estáveis por fornecedor.
7. Atualiza um ponteiro de versão do catálogo **somente após** finalizar todas as etapas. Em caso de erro, a versão anterior continua ativa.
8. Encerra o job com métricas sem URLs sigilosas: duração, quantidade de registros, versão e erro categorizado.

### Versões e descarte

- `snapshots/{sourceId}/{timestamp}.m3u` — original privado e temporário;
- `sources.active_catalog_version` — versão vigente validada no D1;
- Limpeza de snapshots antigos por regra de retenção; definir períodos e limites.
- Publicar apenas projeções de catálogo sem segredo para clientes autorizados.

## Desenho inicial D1 (a validar em migrações)

```text
sources             id, owner_id, kind, title, endpoint_ref, enabled
sync_runs           id, source_id, started_at, finished_at, state, count, error_code
catalog_versions    id, source_id, snapshot_key, item_count, created_at, status
channels            source_id, stream_id, display_name, category_id, kind, rank, active_version
categories          source_id, category_id, display_name, sort_order
epg_programs        source_id, channel_id, starts_at, ends_at, title
```

A origem/credencial privada **não deve** ser entregue na consulta do catálogo. Preferir secrets e criptografia adequada em repouso, separados das tabelas exibidas. Para múltiplos usuários, decidir arquitetura de isolamento e autorização antes de oferecer cadastro arbitrário de fonte.

## Reprodução — o que funciona e o que não resolve

- **HTTPS para o catálogo:** Worker pode entregar JSON/playlist protegida em HTTPS, inclusive se a origem do catálogo oferecer apenas HTTP (com ressalva de credenciais trafegarem em HTTP até o fornecedor).
- **HTTPS para vídeo:** só se a **origem entregar HTTPS válido** ou houver outro caminho de reprodução HTTPS permitido e compatível. Reescrever o esquema da URL não é garantia; os segmentos HLS e redirecionamentos também devem ser HTTPS/CORS quando lidos pela web.
- **Player nativo:** Electron/MPV poderá tolerar protocolos e codecs indisponíveis no navegador, após testes.
- **Gateway de vídeo:** se imprescindível para fontes autorizadas, deve ser projeto separado, autenticado e restrito, com limitação de origem/destino, tráfego, segurança contra SSRF e avaliação de custo/licença. **Não criar proxy público universal.**

## Critérios para começar a implementar

- Identificar `database_name`, `database_id` e `bucket_name` reais dos recursos do usuário, sem colocá-los em URLs adivinhadas.
- Confirmar como o Worker será publicado independentemente do Cloudflare Pages, com rota e credenciais protegidas.
- Escolher primeiro um catálogo de teste autorizado pequeno; preservar dados P2PLAY privados.
- Criar testes com respostas Xtream/M3U **fictícias** (sem credenciais reais), incluindo timeout, catálogo vazio, mudanças de versão e falhas.
- Medir tamanho/tempo de parsing e custos estimados antes de tentar sincronizar dezenas de milhares de mídias.

**Prioridade do projeto neste momento:** finalizar e aprovar a tela de login do front. A sincronização fica documentada para ser implementada em etapas.
