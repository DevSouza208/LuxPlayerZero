# Catálogo diário — Cloudflare Pages + Worker dedicado

## Como funciona

A playlist continua privada. O Pages é o único serviço que utiliza a chave `BRIDGE_ACCESS_KEY` existente, o D1 `DB` e o bucket privado `CATALOG_BUCKET`. A M3U é baixada inteira, validada e só então publicada em um novo objeto R2. O identificador `catalog_id` e a URL HTTPS de leitura permanecem estáveis.

**Regra diária:** a tarefa agendada **sempre publica um novo snapshot**, inclusive quando os bytes da M3U são idênticos. O conteúdo idêntico conserva o mesmo `contentVersion` para evitar download desnecessário no cliente. A importação manual, por outro lado, pode reutilizar o snapshot se nada mudou. O arquivo anterior só é excluído após a publicação da referência. Uma falha de download mantém a versão já publicada.

O Worker `lux-zero-maintenance` é um agendador mínimo: **não possui a chave original nem as URLs do fornecedor**. A função `/api/maintenance/refresh` roda dentro do Pages, usando os bindings já configurados. Os dois serviços compartilham apenas `LUX_MAINTENANCE_TOKEN` (segredo aleatório e independente). O Worker assina a tarefa e a data com HMAC-SHA256, e o Pages aceita somente a operação esperada e assinaturas com até dois minutos de diferença. A rota não exige nem expõe sessão de usuário.

| Cron (UTC) | São Paulo (UTC−3) | Trabalho |
|---|---|---|
| `0 8 * * *` | 05h00 | Buscar e publicar a M3U nova; iniciar a indexação VOD |
| `0 9 * * *` | 06h00 | Preparar os destaques, quando o índice estiver pronto |
| `* * * * *` | A cada minuto | Retomar lotes da indexação VOD e metadados; recuperar descobertas pendentes a cada 15 minutos |

## Instalação / migração

1. Preserve os bindings e secrets atuais do Pages em produção: `DB`, `CATALOG_BUCKET`, `BRIDGE_ACCESS_KEY`, `BRIDGE_ALLOWED_HOSTS` e `TMDB_API_KEY`. **Não redefina `BRIDGE_ACCESS_KEY`**, pois a origem cadastrada no D1 foi cifrada com ela.
2. Adicione **o mesmo valor aleatório** de `LUX_MAINTENANCE_TOKEN` como segredo do Pages (Production) e do Worker dedicado; nunca coloque o valor em repositórios ou logs.
3. Faça o deploy do Pages com `functions/api/maintenance/refresh.js` e de `src/maintenance-cron.js` com o arquivo `wrangler.maintenance.jsonc` para o Worker `lux-zero-maintenance`.
4. Confira os cron triggers do novo Worker e só depois remova os triggers do antigo Worker `luxplayerzero`. O `wrangler.jsonc` principal não deve reintroduzi-los.
5. Confirme a execução nos logs do Worker de agendamento (resultado HTTP 200) e as referências `catalog_sources.synced_at` / `r2_key` no D1 após a próxima atualização real. A validação de metadados fica em `vod_catalog_jobs`.

Um token ausente, erro na API, binding incompleto ou lista indisponível **não deve ser apresentado como atualização concluída**. Os serviços reportam falha para observabilidade.

## Segurança

A URL da fonte não aparece nas respostas da manutenção. A rota é POST-only, sem CORS de navegador e autenticação por HMAC; rejeita pedidos anônimos e assinaturas antigas. Os links de streaming internos não são convertidos para HTTPS. As playlists continuam autenticadas e os segredos existentes do Pages não devem ser enviados ao Worker.

## Diagnóstico de 03/11/2026

O cron `luxplayerzero` antigo disparou às 05h mas falhou com falta de `DB`, `CATALOG_BUCKET` e segredo. A manutenção de minuto também falhava sem o binding `DB`. O Pages já possuía os bindings necessários; a correção separou o agendamento da execução para evitar duplicar ou alterar a chave cifrada existente.
