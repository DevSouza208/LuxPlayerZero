# Cache de apresentação no navegador

O cliente reutiliza fichas e temporadas por ID TMDB e número de temporada. Resultados válidos ficam no IndexedDB local e em memória. Temporadas valem 24h, fichas até 7 dias e fichas parciais de coleção por 5min. Falhas são repetíveis após 30s e não são persistidas como sucesso. Consultas simultâneas idênticas são unidas e não há mais de 128 entradas em memória por cliente.

A API pública, o D1, a classificação administrativa e os filtros não são alterados nesta mudança. Os filtros continuam usando os atributos dos itens da playlist. A primeira consulta não armazenada continua usando a rota TMDB atual; o cache do front reduz consultas posteriores, mas não elimina sozinho a dependência atual do servidor na primeira busca. O trabalho de separação dessa rota foi preparado em outro branch e permanece sem merge por orientação de foco exclusivo no front-end.

O teste de cache entre duas instâncias do cliente verifica reutilização local e validade. Sem IndexedDB ou com quota local indisponível, a tela continua utilizando a API existente e os nomes do fornecedor como reserva. Nenhuma URL de mídia é enviada ou alterada por este cache.
