# Catálogo HTTP → R2 → D1 → HTTPS

A implementação copia apenas o **arquivo M3U**, sem baixar os vídeos. Mantém os endereços originais dos canais. O D1 guarda a referência do arquivo, enquanto o R2 armazena a lista; a função Pages entrega a cópia por HTTPS.

## Ativar no Cloudflare Pages

1. Abra Workers & Pages → **luxplayerzero** (projeto Pages) → Settings → Bindings.
2. Adicione um binding **R2 bucket** com o nome `CATALOG_BUCKET`, apontando para um bucket privado existente.
3. Adicione um binding **D1 database** com o nome `DB`, apontando para seu banco existente.
4. Em Settings → Variables and Secrets, configure `BRIDGE_ACCESS_KEY` com uma chave aleatória de pelo menos 24 caracteres.
5. Configure `BRIDGE_ALLOWED_HOSTS` com os domínios autorizados, incluindo a porta quando necessária, como `servidor.exemplo:8080`. Não insira URL, caminho ou senha nessa variável.
6. Salve as configurações de Production e faça novo deploy do Pages.
7. Confira `https://luxplayerzero.pages.dev/api/bridge/status`: o esperado é `configured:true` e `snapshotReady:true`. Uma sessão ainda não conectada mostra `connected:false`.
8. Abra `/player.html`, informe M3U/Xtream e a chave do catálogo. Ao conectar, a aplicação baixa a lista HTTP, salva no R2, registra a referência no D1 e a lê de volta por HTTPS.

A tabela D1 é criada automaticamente na primeira sincronização. O SQL também está em `migrations/0001_catalog_sources.sql`.

## Como funciona

- `POST /api/bridge/sync` busca a origem e grava o arquivo M3U sem alterações no R2 privado.
- O D1 mantém `source_hash`, `catalog_id`, `r2_key`, `synced_at`, `item_count` e `size_bytes`.
- `GET /api/bridge/playlist?id=...` consulta o D1 e devolve o arquivo do R2 por HTTPS somente com a sessão autenticada.
- Se a origem ficar indisponível após a primeira sincronização, a cópia anterior pode ser reutilizada.
- Arquivos são limitados a 20 MiB neste estágio; as credenciais eventualmente presentes na M3U ficam no bucket privado.
- Essa função não converte os fluxos de vídeo HTTP em HTTPS: o player continua tentando HTTPS diretamente.
- A função requer chave e servidores autorizados. O isolamento por usuário Lux ID e a atualização automática ainda são etapas futuras.

Manual de bindings do Pages: https://developers.cloudflare.com/pages/functions/bindings/
