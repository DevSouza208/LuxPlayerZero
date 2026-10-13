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
| 🟡 | Layout desktop e mobile | Breakpoints implementados e CSS revisado; falta QA visual com imagens reais |
| ✅ | Campos e validação | Identificador e senha obrigatórios; mensagens acessíveis |
| ✅ | Mostrar/ocultar senha | Alternância acessível e segura, sem gravar senha |
| ✅ | Recuperação — interface | Tela e validação de e-mail disponíveis sem envio falso |
| ✅ | Entrada no laboratório de demonstração | Link explícito para /player.html |
| 🟡 | QA visual com imagens reais em produção | Revisão manual em computador, celular e telas pequenas; confirmar deploy estático Pages |
| ⬜ | Autenticação de verdade | Endpoint seguro, credenciais protegidas, sessão estabelecida pelo servidor |
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
| 🟡 | Playlist M3U e Xtream | Testar com fornecedores autorizados sob HTTPS/CORS |
| 🟡 | HLS e MPEG-TS | Testar em navegadores reais e registrar falhas |
| ⬜ | Integrar navegação visual com novo design | Planejar após validar login |
| ⬜ | Motor desktop / Electron | Escolher e testar MPV ou outro motor adequado |
| ⬜ | D1 e R2 | Vincular recursos reais e definir se são necessários; não usar R2 como retransmissor obrigatório |

## Regras para próximas telas

1. Adicionar todos os componentes pendentes antes de começar a tela seguinte.
2. Separar pronto / visual / testado / integrado — nunca confundir os estados.
3. Não inserir URLs de fornecedor com senha no repositório, analytics ou logs.
4. Criar testes e checagem de acessibilidade para cada etapa.
5. Publicar depois de build e validação, sem modificar serviços que já funcionam.
