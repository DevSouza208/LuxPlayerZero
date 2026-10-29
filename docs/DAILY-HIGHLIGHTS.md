# Destaques diários de filmes e séries

Admin → Publicar destaques prepara/abre a prévia do dia. Confirmar publicação troca as duas fileiras da Home e torna essa mesma seleção elegível para o hero. A preparação automática nunca publica sem confirmação. Antes da primeira publicação, as fileiras existentes continuam funcionando.

São até seis filmes e seis séries entre as tendências diárias do TMDB, em ordem do ranking. O servidor consulta no máximo três páginas de vinte candidatos por tipo (até seis chamadas TMDB no dia), parando ao completar cada seleção. Não enriquece os 40 mil títulos. Só aceita ID TMDB existente no catálogo ativo ou correspondência única de título e ano exatos, sem contradizer um ID já registrado. Títulos sem confirmação são omitidos, inclusive quando isso resulta em menos de seis. Não tenta reproduzir os vídeos para fazer essa conferência.

## Agenda e armazenamento

O Worker mantém a atualização de snapshots às 05h de São Paulo (08 UTC). Somente após sucesso grava um marcador diário no R2. Às 06h (09 UTC) prepara a prévia se os índices de todas as fontes já estiverem prontos e corresponderem aos snapshots atuais. A manutenção por minuto confere a cada quinze minutos, depois das 06h, para retomar importações demoradas. Depois de pronta, as conferências apenas leem o JSON do dia: não repetem TMDB ou consultas de correspondência. Falhas transitórias identificadas impõem intervalo de um minuto. Um HTTP 429 real do TMDB respeita Retry-After entre um minuto e uma hora. Ausência de correspondências e troca de catálogo não criam bloqueio. Registros antigos que só guardavam a espera de uma hora são ignorados, pois não permitem identificar o motivo da falha. O botão também permite preparar manualmente quando a importação já terminou, sem exigir o marcador do cron.

R2 privado: editorial/daily-highlights-v1/{refresh,draft,published,retry}.json. Nenhum objeto contém URLs de stream, credenciais ou chave TMDB. O JSON publicado guarda IDs de catálogo/TMDB e informações de apresentação já retornadas nas tendências. O D1 só é consultado na preparação, confirmação de presença e autenticação existente. Os índices filmes_tmdb/series_tmdb são declarados na migração 0014 e criados também pelo inicializador de esquema existente. Não são gravados metadados por título para produzir os destaques.

GET /api/editorial/daily-highlights requer sessão; só retorna a seleção publicada. POST exige admin e JSON de mesma origem. Prepare gera a prévia. Publish aceita apenas seu ID atual, do dia de São Paulo, e reconfere os vínculos ativos. Prévia vencida ou modificada retorna 409. Falhas preservam a publicação anterior.

O cliente mantém a seleção no IndexedDB, por perfil, por uma hora. Revalida ao abrir e ao voltar à aba quando o intervalo venceu. Publicar atualiza imediatamente a Home desse navegador. Outros dispositivos recebem a seleção na próxima revalidação; não há polling contínuo. O cliente cruza novamente os IDs com sua biblioteca local, sem inventar conteúdos e sem mudar objetos/URLs de reprodução. O hero escolhe um dos destaques disponíveis por abertura da Home, sem rotação automática, preservando o destaque fixado pelo usuário e o modo TV. Se a seleção anterior continuar publicada, o rótulo mostra sua data em vez de alegar que é de hoje.

## Verificação e limites

40 testes focados passaram: onze novos para seleção, correspondência, limite de chamadas, cache/offline, sessão, permissão, origem, confirmação, snapshots trocados e preservação em falhas, junto dos testes de catálogo e TV relacionados. Nenhum teste chamou o TMDB ou o D1 remoto.

A prévia no Chrome usou APIs e catálogo sintéticos: verificou botão no Admin, foco no título da prévia e retorno pelo teclado ao botão de abertura, 6+6 candidatos sem publicar, publicação somente após confirmar, exatamente seis cards por fileira e hero pertencente à mesma seleção. Encontrou e corrigiu uma repetição de renderização do hero quando as sinopses estavam desligadas. O código de teste fica em tests/browser/daily-highlights.html; sua cópia pública temporária é removida antes do merge. Não foram executados vídeo real, inspeção de viewport móvel real ou o ciclo agendado das 06h. O GitHub Actions verify encerrou sem iniciar etapas, como nos deploys anteriores; isso não equivale a testes locais falhando.

É necessário implantar tanto Pages quanto Worker: atualizar apenas o Pages não instala o cron. O primeiro ciclo real das 06h continua pendente de observação após a implantação. Não foram publicados destaques reais em nome do administrador durante a verificação.

## Diagnóstico de falhas

A preparação distingue resposta 429 do TMDB, chave recusada (401/403), JSON inválido, conexão/timeout, limites do D1 e falha ao salvar no R2. A resposta inclui código, etapa, status do fornecedor quando conhecido e Retry-After quando houver pausa. O painel existente mostra a mensagem segura com o código. Os logs e o marcador de retry guardam apenas esses campos, sem erro bruto, SQL, URLs ou chave.

Correção após relato em produção: a mensagem antiga não comprovava limite, pois qualquer falha recebia o mesmo bloqueio de uma hora. O motivo original não foi persistido e não pôde ser recuperado nesta sessão. Dezesseis testes focados passaram, incluindo ignorar o marcador antigo, permitir nova tentativa após nenhuma correspondência, distinguir falhas do fornecedor/D1 e preservar a publicação anterior. Não foi feita uma preparação real com a sessão privada do administrador durante essa verificação.

## Compatibilidade do transporte no Cloudflare

O relato seguinte mostrou TMDB_NETWORK. A comparação com as chamadas de detalhes e a documentação oficial do runtime identificou uma incompatibilidade concreta: Workers só aceita redirect follow/manual; redirect error lança TypeError antes de enviar a requisição. A chamada de tendências agora usa URL em texto, GET, Accept application/json e redirect manual, como os detalhes existentes. Respostas 3xx são recusadas, sem encaminhar a chave para outra origem. Referência: https://developers.cloudflare.com/workers/runtime-apis/request/ .

18 testes focados passaram, incluindo um transporte que aplica a restrição real de Workers e um teste de redirecionamento recusado. Não foram usados TMDB/D1 remotos nem a sessão privada do administrador nos testes.

## Título no hero

O hero usa o nome editorial dos destaques publicados ou, sem ele, o título da série já agrupada. O nome original do episódio continua preservado para reprodução. Títulos com mais de 25 caracteres recebem escala menor apenas no desktop (até 56 px), mantendo as regras móveis existentes. Prévia no Chrome confirmou A Noiva da Presilha Dourada sem S1 E1, em uma linha a 54,52 px na largura disponível, com os três botões do hero visíveis. Verificação visual com dados sintéticos, sem reprodução real. A página pública temporária foi removida antes do merge.
