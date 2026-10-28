# Abertura e restauração progressivas

A abertura mantém o mínimo de 2500ms e a transição de seções de 400ms. O splash agora termina independentemente da restauração inteira. Se a playlist ainda não estiver pronta, o shell mostra Preparando sua biblioteca com placeholders e estado aria-busy, sem apresentar um catálogo vazio como se estivesse concluído. O fade do splash continua por 300ms. A marca de desempenho lux:boot-revealed é local ao navegador.

O perfil não bloqueia mais a avaliação dos módulos. A interface inicia as consultas de perfil, status da ponte e origem da conta em paralelo. A vitrine continua sendo criada somente após o perfil correto estar pronto; as mesmas rotas e permissões do servidor são preservadas.

Parser M3U, IDs TMDB explícitos e campos de apresentação são executados no Web Worker do próprio navegador. O resultado marcado evita calcular apresentação duas vezes na interface. Os marcadores de geração continuam descartando resultados de uma fonte anterior. Navegadores sem suporte a Worker conservam o caminho local anterior. Categorias/grupos repetidos usam um cache de até 512 combinações, com cópias dos arrays retornados para evitar contaminação entre itens.

Não houve alterações no backend, D1 ou mecanismo de vídeo. Mudanças na baseline protegida de cinema-app.js se restringem à inicialização e preparação assíncrona do catálogo; URLs, protocolos, cookies, gateway, HLS e Mpegts permanecem no fluxo existente.

Validação: 257 testes locais, incluindo saída automática do splash sem restore, inicialização paralela, Worker e fallback, igualdade com parser existente e arrays independentes. A lista privada completa de 263582 itens gerou o mesmo hash de todos os objetos serializados antes/depois, incluindo URLs e metadados. No teste local de Node o preparo anterior levou 3354ms e o Worker com transferência levou 3315ms; o ganho principal do Worker é liberar a tarefa principal, que executou 581 heartbeats durante a preparação. Isso não mede a rede ou o tempo final de renderização no dispositivo do usuário e não significa que todos os 263582 títulos estejam prontos em 2.5 segundos.
