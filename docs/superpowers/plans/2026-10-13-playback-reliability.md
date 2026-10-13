# Lux Zero — Gateway e Player confiável (Superpowers)

> **Para execução:** aplicar `systematic-debugging`, `test-driven-development` e `verification-before-completion`, com tarefas pequenas e commits revisados.

**Objetivo:** tornar a importação e a reprodução de fontes autorizadas verificáveis, confiáveis e compreensíveis, principalmente quando o Lux está em HTTPS e uma fonte usa HTTP.

**Arquitetura:** Pages oferece interface; Pages Functions mantém bridge isolada, protegida por cookie HttpOnly e allowlist; player não finge que HTTP vira HTTPS sem backend. Catálogo e mídia são estados distintos; gateway de vídeo permanece desligado por padrão e sujeito a direitos/termos de hospedagem.

**Tecnologia:** JS módulos ES, Cloudflare Pages Functions, node:test, GitHub Actions e teste no site Pages.

**Código atual:** `public/app.js`, `public/gateway.js`, `src/bridge-core.js`, `public/playlist.js`; `docs/GATEWAY-HTTPS.md` e `docs/PENDENCIAS.md`.

## Diagnóstico já reproduzido

- `GET /api/bridge/status` responde `configured:false, connected:false, mediaEnabled:false` no Pages; sem secrets Cloudflare nenhum HTTP pode ser importado pela bridge.
- `permittedUrl` compara literalmente `new URL(url).host`. URLs `http://dominio:80` normalizam para hostname sem porta, mas o administrador pode ter configurado allowlist `dominio:80` — falso bloqueio.
- Navegador só executa fluxo de HTTP quando possui sessão bridge. Tela atual não mostra com antecedência que o serviço não foi configurado e recomenda chave mesmo quando ela não pode funcionar.
- `/api/health` é exclusivo do Worker, não Pages; esta checagem é enganosa na página estática.
- Reproduzir URLs diretas HTTPS/m3u8 e um catálogo M3U de teste local deve funcionar independentemente do gateway.

## Escopo e prioridades

- Sem tocar no login ou no design.
- Sem inserir credenciais reais em Git, logs ou screenshots.
- Sem retransmissão indiscriminada e sem habilitar gateway de vídeo em produção; usar URLs autorizadas para testes.
- Testes red → green em feature branch, PR revisada; integração `main` só após CI verde.

### Tarefa 1 — canonicalização de host e porta

**Arquivos:** `tests/bridge.test.mjs`, `src/bridge-core.js`.

- [x] Testar que `http://origin.example:80/` é permitido com allowlist `origin.example:80`, e igualmente para HTTPS porta 443.
- [x] Testar rejeição de porta não aprovada, host parecido, localhost e redirecionamento para host externo.
- [x] Observar o teste falhar pelo motivo correto (RED).
- [x] Corrigir comparação para aceitar somente variantes canônicas explícitas que representem o mesmo destino e porta (GREEN).
- [x] Reexecutar todos os testes.

### Tarefa 2 — diagnóstico claro no player

**Arquivos:** `public/app.js`, `public/gateway.js`, `public/player.html`, `tests/...test.mjs`.

- [x] Escrever teste exigindo status do backend, estados configurado/conectado/media habilitado e mensagens específicas para ausência de secrets.
- [x] Observar RED.
- [x] Implementar indicador de status do gateway (verificação simples e explícita).
- [x] Não solicitar chave quando bridge não estiver configurada; orientar configuração no Cloudflare sem expor valores.
- [x] Substituir consulta enganosa a `/api/health` por `/api/bridge/status` no Pages.
- [x] Verificar via teste e navegador anônimo.

### Tarefa 3 — prova funcional de importação/reprodução sem credenciais

**Arquivos:** `public/demo/playlist.m3u`, `public/app.js`, `tests/playlist.test.mjs`.

- [x] Escrever teste de playlist M3U local com HTTPS HLS público de demonstração.
- [x] Observar RED (arquivo inexistente).
- [x] Incluir fixture e botão para importar pelo mesmo `request` + `parseM3u` que o usuário usa.
- [x] Integrar um link claro de teste da fonte, sem usar os servidores privados do fornecedor.
- [x] Verificar arquivo/GUI pública, HLS quando navegador suportar; anotar limites do teste.

### Tarefa 4 — verificação, documentação e conclusão (parcial)

**Arquivos:** `docs/PENDENCIAS.md`, `docs/GATEWAY-HTTPS.md`, `README.md`.

- [x] GitHub Actions `npm test` verde, sem falhas.
- [x] Cloudflare Pages deploy verde.
- [x] Consultar `GET /api/bridge/status` após publicação.
- [x] Conferir que gateway privado permanece bloqueado sem secrets e não virou proxy aberto.
- [x] Registrar claramente: implementado ≠ testado com P2PLAY. Sem configuração Cloudflare e autorização de vídeo, HTTP privado não será reproduzido.
- [ ] Integrar PR na `main` após revisão e CI verde da branch.

## Revisão de risco

1. Origens com porta explícita padrão normalizada no URL.
2. API retorna HTML 404 ao invés de JSON.
3. Mudança de fonte durante conexão e respostas tardias.
4. CORS/HTTPS para streams HLS e segmentos.
5. Falta de secrets e risco de gateway aberto indevidamente.

## Evidência de verificação

- RED porta :80: Actions 38370657502 falhou no teste `permittedUrl`, com `Host não liberado`.
- GREEN porta :80: Actions 38370746840 passou.
- RED indicador gateway: Actions 38370982785 falhou com estado `pending` em vez de `unconfigured`.
- GREEN indicador gateway: Actions 38371207013 passou.
- RED importação demo: Actions 38371341223 falhou por arquivo M3U inexistente e handler antigo.
- GREEN importação demo: Actions 38371486112 passou.
- Teste navegador, preview `c8764ae1.luxplayerzero.pages.dev/player`: playlist importada (2 entradas) e HLS reproduzido com imagem e estado `REPRODUZINDO`.
- Gate de HTTP privado: `/api/bridge/status` ainda não configurado em produção (não testar com fontes reais até configurar Secrets e confirmar permissões).
