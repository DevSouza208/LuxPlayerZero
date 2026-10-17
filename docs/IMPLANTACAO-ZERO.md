# Implantação segura do Lux Player Zero

Estado: branch de implementação, sem confirmação de deploy, bindings ou reprodução real.

## Pages: bindings e segredos

Nas configurações de Cloudflare Pages associe DB ao D1 privado e CATALOG_BUCKET ao R2 privado.

Segredos privados necessários:
- LUX_SESSION_SECRET: segredo criptográfico de pelo menos 32 caracteres.
- LUX_ADMIN_BOOTSTRAP_PASSWORD: senha temporária informada na conversa para a conta inicial admin. Remover a variável após a primeira autenticação. Alterar a senha antes de dar acesso público.
- BRIDGE_ACCESS_KEY: segredo de 24 ou mais caracteres para a referência HMAC e gateway legado.
- BRIDGE_ALLOWED_HOSTS: gefcdn.online:80 (host exato e porta permitidos para o teste).
- LUX_STARTER_M3U_URL: URL M3U completa fornecida privadamente, como Secret, jamais em Git ou documentação pública.
- TMDB_API_KEY: opcional, imagens e metadados.

O login cria a conta admin no primeiro acesso correto, usando PBKDF2 com salt aleatório no D1. A migração 0002_lux_auth.sql também está disponível. As rotas /cinema/ e /api/* exigem sessão, exceto /api/auth/*; a demonstração pública não aparece no fluxo principal.

## Restaurar e sincronizar catálogo

O backend lê a fonte HTTP autorizada, armazena a playlist intacta no R2 e o índice no D1. A Home consulta /api/library/status; se não existir snapshot, solicita /api/library/sync. URL e credenciais da fonte nunca são mostradas no status, scripts ou logs.

Para atualizar a cada quatro horas, implante também o Worker de src/worker.js com cron 0 */4 * * * e bindings DB e CATALOG_BUCKET, além dos mesmos segredos BRIDGE_ACCESS_KEY, BRIDGE_ALLOWED_HOSTS e LUX_STARTER_M3U_URL. Os bindings de Pages não se propagam automaticamente ao Worker. Sem esses bindings não há sincronização programada funcionando.

Atenção: HTTPS no endereço da playlist não faz os URLs HTTP internos dos streams, segmentos e chaves HLS se tornarem HTTPS. A compatibilidade de mídia/CORS precisa ser validada no navegador e nos dispositivos. O gateway de mídia permanece desligado por padrão.

## Checagens antes de publicar

1. Confirmar usuário admin após criar e configurar segredos em staging privado.
2. Verificar resposta de login e logout e acesso negado a /cinema/ sem sessão.
3. Comparar contagens dos itens na playlist original e na biblioteca.
4. Verificar capas, tags, categorias, busca e mapeamento TMDB.
5. Validar importação R2/D1 e falha recuperável de sincronização.
6. Testar IPTV HLS/TS e VOD HTTP/HTTPS em aparelhos reais.
7. Validar o cron no Worker separadamente e observar logs sem dados sensíveis.
8. Só então mesclar a branch à main.

Testes automatizados permanecem, sem laboratório exposto na navegação.
