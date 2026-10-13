# Gateway HTTPS (Cloudflare Pages) — Lux Player Zero

**Status:** implementado com bloqueio por padrão até que o administrador configure acesso. Catálogo não equivale a vídeo.

## Por que a lista HTTP falha no navegador HTTPS

A página do Lux usa HTTPS. O navegador não permite que JavaScript busque \`http://servidor/get.php\` como se fosse seguro. Trocar os caracteres da URL para \`https://\` não cria TLS onde não existe.

O Gateway é uma Cloudflare Pages Function na rota \`/api/bridge/*\`, que recebe **requisições autenticadas do front via HTTPS** e pode consultar **somente os hosts previamente autorizados** em HTTP ou HTTPS.

- \`/api/bridge/connect\` — cria sessão HttpOnly com chave privada do administrador.
- \`/api/bridge/status\` — informa se está configurado e se a sessão existe.
- \`/api/bridge/catalog\` — lê respostas de \`get.php\`, \`player_api.php\` e M3U, com limite de 20 MB.
- \`/api/bridge/sign\` — gera URL criptografada, temporária e vinculada à sessão para uma mídia permitida (somente se ativado).
- \`/api/bridge/media\` — relê manifestos HLS, reescreve URIs relativas e transmite bytes de origens autorizadas (somente se ativado).

Não é serviço público de conversão, não reproduz DRM e não remove controles de acesso. O serviço não salva senhas nem mídia no D1/R2.

## Configuração no painel Pages

1. Abra **Cloudflare → Workers & Pages → luxplayerzero (Pages)**.
2. Abra **Settings → Variables and Secrets / Environment variables** do Pages (Production).
3. Configure os três valores abaixo, sem inserir credenciais de playlist no GitHub:

| Variável | Exemplo | Uso |
| --- | --- | --- |
| \`BRIDGE_ACCESS_KEY\` | Gere uma chave aleatória de **32+ caracteres** | Protege todo o Gateway, preenchida somente no campo do player |
| \`BRIDGE_ALLOWED_HOSTS\` | \`radio.exemplo.org cdn.exemplo.org:8080\` | Lista explícita de hosts/portas cujos URLs você está autorizado a consultar |
| \`BRIDGE_MEDIA_ENABLED\` | \`false\` (padrão) | Ativa/desativa retransmissão de mídia pelo gateway |

**Atenção ao segundo valor:** use **hosts**, nunca URLs, caminhos, senhas ou \`http://\`. Separe por espaços ou vírgulas. Domínios só liberam a porta padrão; portas como \`:8080\` devem estar explícitas. Hosts recebidos por redirecionamentos, playlists de vídeo, variantes HLS, segmentos e EPG também precisam constar na allowlist.

4. Faça um novo deploy do Pages após configurar essas variáveis.
5. Verifique \`https://luxplayerzero.pages.dev/api/bridge/status\`. Em operação inicial, ele deve mostrar \`configured:true\`, \`connected:false\`, \`mediaEnabled:false\`.
6. Abra \`/player.html\`, selecione M3U ou Xtream, cole a fonte autorizada, informe a **chave do Gateway HTTPS** no painel e clique em **Conectar fonte**. A chave é enviada em HTTPS ao seu próprio Pages, trocada por cookie de sessão HttpOnly e removida do input.
7. O catálogo deve carregar. Os canais que exigirem gateway de vídeo mostrarão um aviso até a etapa de reprodução ser habilitada corretamente.

## Sobre BRIDGE_MEDIA_ENABLED

**Não ative a retransmissão de vídeo apenas para contornar bloqueios do navegador.** Ela transforma o Pages em retransmissor da mídia e requer direitos de distribuição, autorização do provedor e compatibilidade com as condições do serviço de hospedagem.

A Cloudflare restringe a entrega de vídeos hospedados fora dos produtos Cloudflare apropriados em seu CDN. Antes de utilizar \`BRIDGE_MEDIA_ENABLED=true\`, verifique que a arquitetura e o conteúdo são permitidos nos termos aplicáveis. Para vídeo não hospedado na Cloudflare, um player nativo ou streaming HTTPS fornecido pelo operador pode ser a alternativa correta.

O código implementa um adaptador de mídia **desativado por padrão** para uso experimental com streams autorizados e arquitetura aprovada. Ele ainda precisa de testes reais de HLS/MPEG-TS, buffering, limites, bitrate e compatibilidade.

## Testes, segurança e limitações

- Exige sessão com cookie \`HttpOnly; Secure; SameSite=Strict\`; chave não é salva em LocalStorage, cookies JS, D1 ou R2.
- Exige host exato previamente autorizado (e porta explícita quando não padrão).
- Revalida todos os redirecionamentos e proíbe destinos IP privados/diretos/localhost.
- Não envia \`Authorization\`, \`Cookie\` nem cabeçalhos do navegador para a origem.
- Limita o tamanho da leitura do catálogo a 20 MB, manifestos HLS a 2 MB e fetch de catálogo a 20 segundos.
- Tokens de mídia criptografados têm validade de 8 horas; sessões expiram em 8 horas. Após expiração, é necessário reconectar. Renovação contínua é pendência.
- O domínio do fornecedor pode bloquear IPs da Cloudflare, mudar formato, enviar conteúdo inválido ou não aceitar HTTPS. Nesses casos, o gateway não garante reprodução.
- Uma origem HTTP recebe as credenciais em texto claro no trecho Cloudflare → fornecedor; a conexão HTTPS usuário → Cloudflare não corrige isso.
- Ainda requer Cloudflare WAF/rate limiting e monitoramento de tráfego/quotas antes de uso compartilhado.
- HLS com extensões menos comuns, DRM, cabeçalhos personalizados de origem e URLs de mídia dinâmicas ainda precisam de validação. O gateway não contorna DRM.

**Nunca exponha um proxy que aceite URLs de qualquer destino sem autenticação e allowlist.**

## Implantação

O código da Function está em \`functions/api/bridge/\`, na **raiz do repositório**, como exigido pela plataforma Cloudflare Pages. Não mova para \`public/functions\`. O \`public/_routes.json\` limita a execução de Functions a \`/api/bridge/*\`, preservando o site estático. O diretório publicado no Pages continua \`public\`.

Os testes não usam servidores nem credenciais reais. Execute: \`npm test\`.
