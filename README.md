# Lux Player Zero

**Um novo começo, tela por tela.** Reprodutor de mídia independente, sem catálogo nem assinatura incluídos. O projeto não usa o código quebrado do Lux Original nem do Lux 2.0.

## Estrutura atual

| Rota | Função | Estado |
| --- | --- | --- |
| `/` | Login premium usando a identidade visual Lux | **Front funcional; autenticação pendente** |
| `/player.html` | Laboratório de reprodução da versão 0.1 | Demonstração, sem proteção de sessão |
| `/api/health` | Verifica funcionamento do Worker | Implementado |

Os arquivos fornecidos pelo criador ficam em `public/assets/`:

- `lux-logo.png` (original: `LUXPLAY.png`)
- `login-scene.png` (original: `bg_login.png`)
- `lux-icon.png` (original: `icon-bg-off.png`)
- `luxite.png` (original: `luxite-full.png`)

Os binários foram **movidos sem alteração de conteúdo**, mantendo os mesmos SHAs Git dos originais.

### Catálogo e sincronização (planejamento)

O projeto contempla um futuro Worker agendado a cada 4h para importar catálogos Xtream/M3U, guardar snapshots em R2 **privado**, indexar no D1 e servir os metadados ao player. O navegador Pages HTTPS continuará sujeito às restrições para streams HTTP; snapshot da lista não transforma vídeo HTTP em HTTPS.

Documento técnico: **[docs/SINCRONIZACAO-CATALOGO.md](docs/SINCRONIZACAO-CATALOGO.md)**.

### Login (tela 01)

O formulário faz validação de identificador/senha, alterna a visibilidade da senha, tem navegação por teclado e interface de recuperação de acesso. **Nenhum pedido de autenticação é enviado; não há sessões fictícias ou armazenamento de senhas.** O botão de demonstração dá acesso explícito ao laboratório, que continua público até que uma autenticação real seja implantada.

Acompanhe as próximas etapas em **[docs/PENDENCIAS.md](docs/PENDENCIAS.md)**. A regra é: primeiro funcionar, depois aprimorar; registrar cada etapa como código, validação, QA visual ou integração.

## Cloudflare Pages — front-end (2026-10-13)

O **front-end do Lux Zero** pode ser publicado diretamente no Cloudflare Pages, sem `wrangler deploy` e sem precisar conectar D1 ou R2 nesta fase.

Na configuração do projeto Pages:

| Campo | Valor |
| --- | --- |
| Repositório | `DevSouza208/LuxPlayerZero` |
| Branch de produção | `main` |
| Framework preset | `None` |
| Diretório raiz | `/` |
| Build command | **vazio** |
| Build output directory | `public` |

O arquivo `public/index.html` é o login. `public/player.html` contém o laboratório antigo, sem autenticação. Assets ficam em `public/assets/`.

**Importante:** Pages publica arquivos estáticos. O `src/worker.js` e o endpoint `/api/health` **não** são publicados no Pages apenas por estarem no mesmo repositório. A API, D1 e R2 entrarão depois com um Worker separado ou integração adequada. Não configure um deploy Worker com `npx wrangler deploy` dentro desse projeto Pages estático.

No login aparece o marcador **ZERO / PAGES 01** para identificar visualmente este commit depois da publicação.

## v0.1.0 — laboratório web

- Interface responsiva e instalação simples: Cloudflare Worker + Static Assets.
- Fontes por URL de vídeo/rádio, playlist M3U (.m3u, .txt ou URL) e Xtream Codes.
- Reprodução HTML5 (MP4, áudio), HLS via `hls.js` e MPEG-TS via `mpegts.js` — conforme capacidades do navegador, servidor e CORS.
- Catálogo com busca e filtro vídeo/rádio; proteção contra troca de sessões atrasadas e diagnóstico sem registrar URLs.
- Demonstração HLS pública acessível pelo botão na biblioteca.
- `GET /api/health` retorna status e presença dos bindings de D1/R2.
- Testes em `node --test` e GitHub Actions.

### Como publicar no Cloudflare

O Worker foi pensado para o repositório conectado `DevSouza208/LuxPlayerZero`, branch `main`.

1. Confirme **o nome real do Worker** que você conectou. O campo `name` de `wrangler.jsonc` começa como `lux-player-zero`; mude-o se o Worker existente tiver nome diferente.
2. No painel Cloudflare em Worker > Settings > Build, selecione a raiz do repositório (`/`); deixe o **Build command vazio** e o **Deploy command** como `npx wrangler deploy`.
3. A instalação das dependências de desenvolvimento (Wrangler) é feita pelo ambiente de build; o app não precisa de um build estático.
4. Verifique `https://SEU-WORKER.workers.dev/api/health` e a página inicial.

**D1 e R2:** já podem existir na sua conta, mas este commit não tenta adivinhar ID/bucket. A configuração de bindings está em [docs/cloudflare.md](docs/cloudflare.md). Para o primeiro deploy eles não são necessários.

### Desenvolvimento local

```bash
npm install
npm run dev
npm test
```

## Limitações conhecidas, explícitas

- No navegador HTTPS, playlists e streams HTTP podem ser bloqueados como conteúdo misto; CORS pode impedir requisições M3U/Xtream. O player não desabilita proteções e não tem proxy aberto.
- Alguns codecs não são suportados no navegador mesmo com HLS/TS. MPV desktop será avaliado em fase posterior.
- O acesso Xtream é **direto do navegador ao servidor informado**. Senhas são mantidas apenas na memória da página, não em D1, R2 ou no nosso Worker; entretanto, a própria origem Xtream recebe essas credenciais. Não use contas de terceiros sem autorização.
- Não há **autenticação real**, catálogo persistente, EPG, filmes/séries ou fallback multi-servidor nesta versão.
- Bibliotecas de playback são carregadas por CDN e precisam de conectividade.
- Código versionado e testes unitários **não equivalem a validação em dispositivo ou teste de streams reais**.

## Princípios

Uma fonte, um catálogo, um player. O reprodutor não fornece canais nem conteúdos. Priorizar simplicidade, diagnósticos úteis, proteção de credenciais, não retransmitir conteúdo em R2 e testes reproduzíveis antes de cada integração.
