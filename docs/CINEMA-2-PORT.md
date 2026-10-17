# Lux Player Zero — Cine Fullscreen e Lux TV (port do 2.0)

## Referências verificadas no repositório LuxPlayer2.0

- src/pages/DetailPage.tsx e src/styles/detail.css: detalhes imersivos, hero editorial, poster, metadados, ações, temporadas e episódios.
- src/pages/SeriesExperiencePage.tsx e docs/series-progress-3d.md: reprodução e retomada por episódio.
- src/experience/video/VideoStage.tsx, src/styles/video-player-immersive.css e docs/lux-video-controls-3d.md: vídeo ocupa a viewport; HUD por cima; controles separados do motor.
- src/providers/m3u/groupChannels.ts e src/tv/channelCatalog.ts: tvg-id prioritário, aliases canônicos, qualidade e variantes sem eliminar fontes.
- docs/tv-grouping-quality-controller.md: distinguir variantes independentes de canais do adaptive bitrate (ABR) dentro de um manifest HLS.
- docs/visual-design-constitution.md: conteúdo protagonista, cores por gênero, botões sólidos, fundo de preto profundo.

O port não copia React, Supabase, identidade de usuários do 2.0 nem seus gateways. Os modelos foram adaptados a JS puro, Cloudflare Pages/D1/R2 e ao Hls.js / Mpegts.js já existentes no Zero.

## Entrega no Zero

### Detalhes de filmes e séries

- Pagina fullscreen, não modal estreito (cinema-detail-page.js/css).
- Backdrop e poster por metadados TMDB confiáveis; fallback imagem do fornecedor.
- Títulos originais da M3U não são modificados; a apresentação usa displayName.
- Episódios estruturados via S01E01, T1:E2, 1x03, Temporada N Episódio M.
- Apenas episódios realmente existentes no catálogo. Temporadas são ordenadas por número.
- Ao iniciar um episódio, a interface de detalhe é suspensa. Ao voltar do player, os detalhes retomam, com a temporada selecionada.
- Sem marcador estrutural, a entrada permanece individual; não inventar episódios nem títulos.

### Player

- Video ocupa a viewport, tela de preparação com poster quando disponível, topbar e HUD que se oculta automaticamente durante a reprodução.
- Usa o elemento video existente, evitando mudar URLs, source plan, HLS.js, Mpegts.js ou o cache R2.
- Timeline, play/pausa, seek ±10s, volume/mute, velocidade, tela cheia, PiP quando disponível, legendas nativas/Hls.js quando expostas, seleção de fonte externa de TV.
- O seletor de fontes de TV NÃO é a mesma coisa que a qualidade adaptativa interna do HLS.
- Nem todos os fornecedores disponibilizam legendas, várias faixas de áudio ou outras velocidades; ausência de opções não autoriza inventá-las.
- Navegador HTTPS ainda não reproduz automaticamente vídeos HTTP; depende de HTTPS real/CORS ou alternativa compatível/autorizada.

### TV

- M3U parser preserva tvg-id como campo adicional epgId; preserva todas as entradas e URLs.
- Quando presente, tvg-id diferencia canais concretos. Sem EPG, identidade usa nome normalizado e aliases.
- Agrupa variantes HD/FHD/4K por canal, ordena qualidade e privilegia HTTPS quando disponível na mesma faixa.
- Exibe apenas uma entrada lógica por canal na vitrine e no catálogo, mas permite selecionar a fonte original.
- Exibe categorias estruturais (24h, internacional, esportes, infantil, notícias, documentários, TV aberta, etc).
- Sem EPG, homônimos legítimos podem necessitar exceções; não colapsar canais distintos sem conferência.
- Ainda sem failover automático entre fontes. Esta etapa deve usar um controlador separado, com retries limitados e telemetria.

## Validação pendente em navegador

1. Validar altura/hero de filme e série em desktop, mobile e PWA.
2. Usar um catálogo autorizado com episódios reais em diferentes formatos de títulos e temporadas.
3. Verificar fidelidade das contagens e canais com EPG de SP e demais regiões.
4. Testar seleção entre variantes HD/FHD/4K, incluindo falha de origem.
5. Testar video HTML, HLS e MPEG-TS em canais e VOD.
6. Validar poster/sinopse TMDB e fallback de sem imagem.
7. Testar controles, volume, subtitles HLS, fullscreen, PiP, gesto de play e voltar à temporada.
8. Confirmar que importação HTTPS da playlist não muda as URLs internas.
9. Verificar uso de RAM em playlist grande; series e TV são índices por referência construídos após importação.

**Deploy não foi realizado nesta branch e testes de browser/end-to-end não foram afirmados.**
