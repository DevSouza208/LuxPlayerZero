# Catálogo e perfil no dispositivo

Escopo: grupo privado de até 20 contas e cerca de 40 dispositivos. Mantém playlist, filtros e reprodução existentes; não muda fornecedor, motores ou URLs de mídia.

## Catálogo

O IndexedDB `luxzero-private-cache` guarda a lista já preparada por perfil e origem (chave SHA-256), sem colocar credenciais no localStorage. A cópia contém os endereços originais necessários ao player e fica no dispositivo autorizado pelo usuário. Isto é cache privado do navegador, não um catálogo público em CDN.

Após validar o perfil e obter a origem da conta, a interface mostra a cópia local. Consulta somente o pequeno `/api/bridge/catalog-version?id=...`. Mesmo hash reutiliza os objetos preparados sem baixar/interpretar a M3U. A ativação de uma cópia nova acontece após download, contagem e preparação válidos; erro mantém a anterior. Uma troca descoberta enquanto um vídeo está tocando fica para a saída do player. Arquivos locais e URLs diretas também podem ser lembrados neste dispositivo; arquivos locais requerem nova importação para mudar seu conteúdo. Fontes externas sem manifesto têm revalidação de um dia.

O Worker recebe a playlist intacta em partes fixas de 8 MiB e calcula uma versão por hashes SHA-256 dessas partes. O mesmo arquivo em divisões diferentes de rede gera a mesma versão. Conteúdo idêntico não altera a referência/data do índice D1 nem gera novo download dos clientes; há apenas aquisição/liberação de lease da sincronização. Um lease por origem impede duas substituições simultâneas. O manifesto é publicado no R2 depois do arquivo e da referência; se a publicação falhar, o arquivo anterior é mantido. A rota de versão é autenticada e lê o manifesto no R2, sem consultar as tabelas de catálogo. A validação de sessão ainda usa o sistema de contas/D1 existente.

Snapshots anteriores à mudança funcionam com fallback até a primeira atualização gerar um manifesto. Acesso à lista continua privado. Não há cache público de respostas com credenciais. IndexedDB pode falhar ou faltar espaço: a lista ainda pode ser carregada pela rede com um aviso, sem fingir persistência.

## Progresso, favoritos e preferências

`profile-store.js` agora é local primeiro. `home.js` registra o progresso a cada 10 segundos. O IndexedDB guarda uma fila durável por perfil com alterações por campo/item; mudanças repetidas de progresso são consolidadas. Progresso é enviado no máximo após cerca de 5 minutos de pendência, ou ao sair do player/colocar a página em segundo plano. Favoritos, assistidos, temporada selecionada e configurações agendam envio após cerca de 30 segundos. Sem mudanças não há POST. Trocar de vídeo salva também a posição de saída válida.

Uma resposta só remove operações que ela efetivamente confirmou; alterações criadas durante o envio ficam pendentes. Web Locks coordena envios do mesmo perfil entre abas, com controle de versão do servidor como alternativa. Em HTTP 409, o cliente busca o estado atual e aplica somente as alterações locais, preservando favoritos/configurações de outros dispositivos. Progresso mais recente vence pelo horário; ações concorrentes no mesmo favorito/campo são resolvidas pelo estado atual e pela ordem de sincronização, sem prometer resolução perfeita de ações offline simultâneas. A UI com uma lista antiga não apaga itens remotos que ainda não exibiu.

Falhas preservam a fila e usam retry com backoff/jitter. HTTP 429 respeita Retry-After inclusive em novas tentativas de saída da aba. Sessão/perfil inválido suspende o envio. Outra conta não recebe essa fila; ela volta a ser usada ao entrar no mesmo perfil. A sincronização de último instante é melhor esforço. Payloads grandes usam fetch normal, pois keepalive tem limite de tamanho; a fila continua persistida se o navegador fechar antes do envio. A API aceita até 256 KiB apenas para estado, mantendo os limites existentes de campos, listas e demais endpoints.

## Agendamento

Wrangler passa a declarar `0 8 * * *`: 05:00 em America/Sao_Paulo. Essa execução atualiza snapshots primeiro e depois descobre o trabalho do índice. O cron por minuto continua retomando lotes/metadata pendentes; foram removidos os antigos disparos diários às 03h e 04h para evitar trabalhos duplicados. A mudança requer a implantação do Worker; atualizar somente o Pages não altera crons.

A execução inicial e mudanças reais do índice ainda usam D1; cache não elimina importação, classificação nem autenticação. Metadados de apresentação já têm cache IndexedDB próprio; esta mudança não publica o PR76 nem altera a rota TMDB com D1. Não foi introduzido contador D1 por navegação.

## Validação

Testes cobrem persistência, recriação do store, coalescência, isolamento, conflito, remoção, duas abas, alteração durante envio, Retry-After, eventos de saída e quota indisponível. Catálogo cobre mesmo hash, fonte/perfil distintos, arquivos locais, download incompleto, 401, falha de publicação e exclusão de contagem D1 no manifesto. Adapter IndexedDB confirma apenas no commit, rejeita abort e reabre após versionchange. `tests/browser/local-cache-smoke.html` permite verificação com IndexedDB real usando somente dados sintéticos e fetch simulado; não representa um login real ou reprodução de fornecedor.

Baseline autorizada atualizada somente em cinema-app.js (cache e flush na saída) e catalog-snapshot.js (hash/manifesto/lease). Bridge, preferência HTTPS e motores permanecem protegidos pelos hashes anteriores.

Resultado: 295 testes locais passaram. A prévia no Chrome confirmou oito verificações com IndexedDB real (progresso local sem POST, restauração da fila, envio consolidado, versão idêntica sem download/parser e isolamento). A página de teste temporária foi removida de public antes do merge; seu código fica somente em tests/browser. O teste não usou credenciais nem dados reais, nem executou um ciclo real de 05h.
