# Lux Player Zero — Quadro de pendências

> Regra do projeto: **primeiro funcionar, depois aprimorar**. O que aparece na interface não deve ser anunciado como funcional se não tiver backend ou testes comprovando. Uma tela por vez, sem herdar dependências do Lux Original e 2.0.

Atualização: 2026-10-13.

## Legenda

- ✅ Implementado e coberto por testes de código
- 🟡 Interface pronta, falta integração e/ou teste manual
- ⬜ Não iniciado
- 🔴 Bloqueio identificado

## Tela 01 — Login / identidade visual

| Estado | Item | Critério de aceite |
| --- | --- | --- |
| ✅ | Reorganizar imagens em public/assets | Assets originais preservados byte a byte, servidos pelo Worker |
| ✅ | Login como página inicial | / abre a tela de login; /player.html mantém o laboratório antigo |
| 🟡 | Login em uma tela desktop e mobile | Dimensionamento por viewport, faixa do Luxite compacta no celular; QA real pendente |
| ✅ | Campos e validação | Identificador e senha obrigatórios; mensagens acessíveis |
| ✅ | Mostrar/ocultar senha | Alternância acessível e segura, sem gravar senha |
| ✅ | Lux ID (usuário/e-mail) | Interface e validação básica do formulário |
| 🟡 | Login com Google | Botão visual e aviso de indisponibilidade; falta OAuth seguro |
| 🟡 | Login com Discord | Botão visual e aviso de indisponibilidade; falta OAuth seguro |
| ✅ | Textos de identidade restaurados | «Seu universo. Seu próximo play.» e subtítulo curto no login |
| ✅ | Painel Luxite com degradê | «Todas as suas histórias. Uma só experiência.» com fundo roxo translúcido |
| ✅ | Recuperação — interface | Tela e validação de e-mail disponíveis sem envio falso |
| ✅ | Entrada no laboratório de demonstração | Link explícito para /player.html |
| 🟡 | QA visual com imagens reais em produção | Validar 1366×768, 1920×1080, 390×844, 360×740, 320×568, teclado aberto e mensagens de erro |
| ⬜ | Autenticação de verdade | Lux ID por usuário ou e-mail, endpoint seguro, credenciais protegidas, sessão estabelecida pelo servidor |
| ⬜ | OAuth Google e Discord | Fluxos server-side com state/PKCE, callback validado, vínculo seguro à conta Lux ID |
| ⬜ | Persistência de sessão / lembrar dispositivo | Controle explícito, expiração e revogação |
| ⬜ | Esqueci senha — backend | Token de uso único, prazo, limitação de tentativas e e-mail transacional |
| ⬜ | Recuperação e validação de conta | Confirmação de e-mail, redefinição segura |
| ⬜ | Proteção de acesso às páginas internas | /player.html e APIs privadas sujeitos à autenticação após o backend |
| ⬜ | Rate limit / proteção contra força bruta | Limite por conta + origem, logs sem segredos |
| ⬜ | Segurança adicional de admin | 2FA, gerenciamento de sessões e dispositivos |
| ⬜ | Registro / convite de usuários | Decidir regras de cadastro e convites antes de expor o formulário |
| ⬜ | Política de privacidade e termos | Textos revisados e rotas reais, sem links fictícios |

**Nota:** o botão Entrar valida o formulário, mas avisa que a autenticação ainda não está conectada. Não concede uma sessão falsa. A prévia do player é propositalmente pública nesta fase.

## Tela 02 — Player laboratório (legado inicial)

| Estado | Item | Critério de aceite |
| --- | --- | --- |
| ✅ | Preservar o laboratório existente | /player.html acessível e funcional conforme limitações anteriores |
| ✅ | Importação M3U em navegador | Catálogo M3U HTTPS local de 2 mídias testado em Pages com resultado positivo |
| 🟡 | Xtream / fontes externas | API funcional em testes sintéticos; testar provedores autorizados com HTTPS/CORS ou bridge configurada |
| ✅ | HLS HTTPS | Vídeo aberto, imagem renderizada e status REPRODUZINDO em teste de navegador no Pages |
| 🟡 | MPEG-TS e HLS HTTP | Adapters implementados; testar com fonte e hospedagem autorizadas; exige gateway configurado |
| ⬜ | Integrar navegação visual com novo design | Planejar após validar login |
| ⬜ | Motor desktop / Electron | Escolher e testar MPV ou outro motor adequado |
| ⬜ | D1 e R2 | Vincular os recursos reais após testes de integração; não usar R2 como retransmissor obrigatório |
| ✅ | Identidade roxa | Paleta do laboratório alinhada ao Lux Player |


## Arquitetura — Catálogo R2 + D1 (planejado)

A ideia original de sincronizar a lista PHP/M3U a cada 4 horas pode ser implementada sem precisar retransmitir vídeos. Ver [SINCRONIZACAO-CATALOGO.md](SINCRONIZACAO-CATALOGO.md).

| Estado | Item | Critério de aceite |
| --- | --- | --- |
| ✅ | Estudar arquitetura da sincronização | Separação de dados de catálogo, snapshot R2, índice D1 e reprodução |
| ⬜ | Vincular Worker agendado | Cron a cada 4h com recursos reais e Secrets |
| ⬜ | Baixar e validar catálogo | M3U/Xtream autorizados, timeout, limites e fallback para última versão válida |
| ⬜ | Snapshot privado em R2 | Guardar versão e nunca publicar credenciais em bucket público |
| ⬜ | Indexação D1 | Categorias, canais e busca, atualizações incrementais |
| 🟡 | Catálogo HTTPS ao navegador | Gateway Pages com cookie HttpOnly e host allowlist publicado; falta Secrets de produção e teste autorizado |
| ✅ | Documentar configuração do Gateway | Instruções em [GATEWAY-HTTPS.md](GATEWAY-HTTPS.md), incluindo limites, riscos e ativação |
| 🟡 | Gateway de catálogo HTTP → HTTPS | Pages Function pública verificada; corrigida allowlist da porta :80; Secrets de produção ainda não configurados |
| 🟡 | Fluxo privado de vídeo HTTPS | Adaptador HLS e MPEG-TS com token criptografado implementado; desligado por padrão, depende de direitos/termos e QA real |
| 🔴 | Origem HTTP no Pages HTTPS | Exige gateway autorizado configurado ou URL HTTPS oficial; somente R2/playlist HTTPS não transforma o vídeo |
| ⬜ | Proteção operacional para gateway | Rate limiting no Cloudflare WAF, restrição de tráfego, auditoria de quotas e teste de streams autorizados |
| 🟡 | Testes e monitoramento | Fixture de M3U e HLS validada no navegador; integração HTTP privada, desempenho/custos e reconciliação ainda pendentes |

## Testes reproduzíveis (13/10/2026)

- ✅ GitHub Actions em `main`: suíte completa de `npm test` aprovada após ciclo RED → GREEN, merge `8914be0`.
- ✅ Cloudflare Pages produção: `https://luxplayerzero.pages.dev/player`, importação da playlist local → 2 entradas → HLS abriu imagem e estado REPRODUZINDO (verificação em navegador real).
- ✅ GET `/api/bridge/status`: rota responde no Pages. Falta configurar Secrets; sem isso nenhuma fonte HTTP privada conecta.
- ⬜ Testes reais de provedores: **não realizados**, não assumir que P2PLAY ou qualquer origem HTTP funciona por conta desses testes.
- ⬜ Vídeo por gateway HTTP → HTTPS: adapter desativado em produção; requer autorização e compatibilidade com termos do serviço.
- ✅ Workers Builds em `main`: build concluído com sucesso no merge `8914be0`; os builds de prévia de PR podem ter status diferente do deploy de produção.

## Regras para próximas telas

1. Adicionar todos os componentes pendentes antes de começar a tela seguinte.
2. Separar pronto / visual / testado / integrado — nunca confundir os estados.
3. Não inserir URLs de fornecedor com senha no repositório, analytics ou logs.
4. Criar testes e checagem de acessibilidade para cada etapa.
5. Publicar depois de build e validação, sem modificar serviços que já funcionam.
