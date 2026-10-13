# Deploy Cloudflare: Lux Player Zero

## Primeiro deploy

Este repositório usa Cloudflare Workers Static Assets e não requer compilação.

1. Em Cloudflare > Workers & Pages > Worker conectado > Settings > Build, confirme repo `DevSouza208/LuxPlayerZero` e branch `main`.
2. Ajuste o nome no `wrangler.jsonc` para o **nome exato do Worker já criado**, se não for `lux-player-zero`. Caso contrário, o Wrangler poderá publicar outro Worker.
3. Root directory: raiz do repositório. Build command: vazio. Deploy command: `npx wrangler deploy`.
4. Após o deploy, abra `/api/health`; deverá responder `{"ok":true,...}`.

## Recursos D1 e R2 já criados

Não supomos o database ID ou nome do bucket. A ausência das ligações não bloqueia o primeiro deploy.

Depois de verificar os nomes reais, acrescente **no nível raiz** de `wrangler.jsonc`:

```json
"d1_databases": [{ "binding": "DB", "database_name": "SEU_BANCO", "database_id": "SEU_DATABASE_ID" }],
"r2_buckets": [{ "binding": "MEDIA_BUCKET", "bucket_name": "SEU_BUCKET" }]
```

Separe as propriedades do JSON com vírgulas. O healthcheck mostrará `d1: true` e `r2: true` quando os bindings estiverem disponíveis.

Nunca publique senhas Xtream, listas privadas, tokens ou variáveis `CLOUDFLARE_API_TOKEN`. Para segredos, use Cloudflare Secrets.

## Segurança e limitações

Não há proxy de streams nem upload de playlist para R2. A web respeita CORS e mixed content; Xtream HTTP em site HTTPS não vai funcionar via fetch direto. Um adaptador seguro, autenticado e restrito às fontes autorizadas será outra fase. Não abrir proxy arbitrário: riscos de SSRF, abuso e vazamento de credenciais.
