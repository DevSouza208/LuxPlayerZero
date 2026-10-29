# Programação do TV Map na Home

A antiga fileira Destaques da TV é substituída por uma grade nativa de três horas, mantendo a ordem das demais fileiras. A seção Ao vivo continua com suas pastas e canais. A grade mostra apenas canais já presentes na biblioteca local e reconhecidos com segurança na página pública https://tvmap.com.br/Principais . O botão do canal passa o mesmo objeto original para o fluxo start existente; os programas têm links para consultar a fonte em nova aba. Não importa streams ou assinaturas do TV Map.

## Cobertura e horários

A fonte cobre os canais principais, não todos os canais da playlist. Nomes são normalizados apenas para qualidade e aliases específicos (SporTV 2, Record TV, Sony Channel, Warner). Não remove cidades ou regiões para forçar uma associação entre afiliadas. Há aviso visível de que a programação pode variar por região.

O adaptador lê somente nomes, horários e durações publicados nos elementos visíveis da grade. Usa America/Sao_Paulo, inclusive ao atravessar meia-noite. O programa atual pode ter início calculado a partir da duração publicada e do início do próximo. Quando o fim não é informado, permanece desconhecido; não inventa o último horário ou programas. Para o programa atual sem limites completos, mostra o progresso informado pela fonte e o texto de exibição na consulta. Programas anteriores sem horários não são tratados como atuais. Páginas sem grade, fora da janela ou acima de 1,5 MB são recusadas. HTML e scripts da fonte nunca são inseridos ou executados no app.

## Cache e custo

GET /api/metadata/tv-guide é intencionalmente público porque contém só programação já pública. Não recebe a lista do usuário nem devolve URLs de mídia, credenciais, dados de perfil ou favoritos. A permissão de outros endpoints de metadados não muda. Esta rota não consulta D1 nem sessão.

Quando CATALOG_BUCKET está configurado, usa dois objetos fixos: editorial/tvmap-guide-v1.json e editorial/tvmap-guide-retry-v1.json. A grade é reutilizada por quinze minutos. Sem R2, funciona com cache de borda e memória do isolate, limitada às duas chaves fixas. Há coalescência por isolate, resposta pública cacheável, cache de borda via Cache API e IndexedDB no cliente. O navegador só consulta a fonte própria quando a grade vence e a Home está ativa. A fonte externa é sempre o endereço fixo TV Map, com redirects manuais, limite de resposta e timeout. Nenhuma consulta por canal ou por título no banco.

Falhas da fonte aplicam pausa de cinco minutos e conservam a grade anterior somente enquanto a janela ainda for válida. Erros têm código/etapa seguros, sem HTML ou erros brutos. A interface mostra indisponibilidade e oferece Abrir no TV Map. Se não encontrar canais compatíveis na lista, informa isso. A grade pode rolar em ambas as direções; cabeçalhos e nomes dos canais ficam fixos. Botões e links são acessíveis por teclado. Um redraw preserva a rolagem e o foco no canal; a atualização de minuto não refaz a grade durante interação de teclado dentro da seção.

## Verificação

9 testes focados do adaptador/cache/API e 4 testes relacionados de visitante/acesso passaram. Os testes locais usam respostas sintéticas e SQLite não é consultado pelo guia. Verificam virada de dia, limpeza de links, identidade da entrada original, afiliadas não misturadas, cache/coalescência, falha/stale, fonte inválida e método público limitado a GET.

A prévia no Cloudflare leu a fonte real e exibiu 20 canais/67 programas na conferência. Na Home completa com canais sintéticos, a curadoria existente resultou em 18 canais compatíveis, e a grade ocupou o lugar da antiga fileira. Chrome confirmou foco de teclado nos programas e callback do botão AXN com o item original. Não foi executado vídeo real nem viewport móvel real. As duas páginas públicas de teste foram removidas antes do merge; as fixtures permanecem somente em tests/browser. O primeiro ambiente de prévia não tinha R2, o que motivou a alternativa de cache de borda/memória para esses dados públicos.
