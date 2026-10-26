# Capas e identificação TMDB

Os links oficiais de poster/banner, TMDB ID e metadados ficam em `tmdb_meta_cache` no D1 por 180 dias. Não são baixados os arquivos de imagem. Títulos localizados e originais confirmados também recebem referências de cache. Reabertura e outros usuários reaproveitam o resultado; os endpoints não retornam dados de contas ou de playlists.

A busca limpa qualidade e episódios para identificar a obra. Busca em português, depois inglês e, se necessário, traduções oficiais de até dois candidatos. Cada chamada remota conta na quota global de 5000/dia; acertos de cache não contam. São no máximo quatro chamadas por título não encontrado, com timeout por chamada e concorrência de três títulos no cliente.

Correspondências exigem pelo menos 96% de similaridade textual normalizada. Esse percentual não é probabilidade de acerto. Ano informado deve coincidir, sequências numeradas não são intercambiáveis e candidatos empatados/ambíguos não recebem associação automática. A imagem do fornecedor continua como reserva.

Cache v3 tenta novamente negativos das versões anteriores; positivos v2 válidos são preservados. Um novo negativo dura seis horas. Erros de rede/provedor não são salvos como ausência de correspondência.

A leitura de EXTINF respeita vírgulas dentro de atributos entre aspas. Assim `tvg-name="A, a Estranha S1 E1"` não vira parte de um nome corrompido. O texto M3U e os endereços de mídia não são reescritos.
