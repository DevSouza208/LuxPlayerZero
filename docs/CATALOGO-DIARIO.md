# Catálogo diário com entrega HTTPS fixa

A importação autenticada baixa a M3U inteira por streaming, valida o arquivo e grava no R2. O D1 aponta o identificador estável `catalog_id` para a versão atual. A URL de entrega é `/api/bridge/playlist?id=<catalog_id>`; não muda na atualização diária.

A origem é cifrada com AES-GCM usando o segredo `BRIDGE_ACCESS_KEY` e registrada em `catalog_refresh_sources`. Ela não é enviada ao cron em texto aberto nem registrada nos logs. Uma nova conexão bem-sucedida cadastra a origem para as próximas atualizações. Listas sincronizadas antes desta mudança precisam de uma reconexão para cadastrar a origem: o hash antigo não permite recuperar a URL.

O Worker usa `scheduled()` com `0 6 * * *`: diariamente às 03h em São Paulo (06h UTC). A rotina usa o mesmo download/validação da importação manual, mantém o ID e só troca a referência depois do arquivo completo. Downloads que falham preservam a última versão íntegra. A antiga versão do objeto é removida após a troca.

## Configuração necessária

O Worker que executa o cron precisa dos mesmos recursos do Pages:

- `DB`: o MESMO D1 de `catalog_sources` do Pages.
- `CATALOG_BUCKET`: o MESMO bucket R2 privado do Pages.
- `BRIDGE_ACCESS_KEY`: o MESMO segredo usado pelo Pages, necessário para decifrar a origem.
- `BRIDGE_ALLOWED_HOSTS`: os mesmos fornecedores autorizados.

Não adivinhar IDs de bindings nem copiar segredos para o Git. A tabela é criada automaticamente na primeira conexão; também há a migração `0011_catalog_daily_refresh.sql`.

A entrega continua autenticada. Não é um endpoint público de playlists privadas. O HTTPS é do arquivo M3U; URLs HTTP dentro dele permanecem intactas e ainda dependem da compatibilidade do reprodutor.

## Validação

Testes confirmam que a atualização diária baixa novamente a origem, substitui a M3U completa, mantém a mesma entrega, protege a URL de origem no D1 e preserva o arquivo anterior em falhas. A ativação real do cron depende de conferir os bindings no painel Cloudflare; não considerar essa etapa concluída apenas pelo merge ou pelos testes locais.
