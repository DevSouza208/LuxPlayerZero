# Evolução incremental — implementação e validação

## Estado e retomada
O controle granular é `docs/TAREFAS.csv` (255 itens do pedido original, UTF-8 com BOM, separador ponto e vírgula). `concluído` significa implementação verificada na evidência indicada, **não publicação em produção**. `em construção` inclui integração ou validação ainda incompleta. `bloqueado` explica a dependência externa ou o conflito com áreas protegidas. Itens pendentes não foram implicitamente aprovados nem implementados.

A branch parte de `20aa1fdbc07561c68780e48fe7d7ce3fdf9d90e2`, preservado em `backup/pre-streaming-evolution-20261017`. Não houve merge dos PRs #14/#15, alteração da main, migração remota ou deploy.

## Entregas em revisão
- Contas D1 em tabelas `account_*`, independentes dos snapshots e das tabelas do PR14. Bootstrap somente em banco sem contas, segredo privado com pelo menos 20 caracteres, convites aleatórios de uso único e 24 horas, usuário, senha, papéis e desativação.
- Sessões opacas com hash no banco, cookie `__Host-` HttpOnly/Secure/SameSite=Strict, sete dias, listagem e revogação por dispositivo. Troca de senha revoga todas as sessões; a desativação também.
- Limites persistentes por IP e identificador; comparação de senhas com hash PBKDF2-HMAC-SHA256 de 100 mil iterações após HMAC com pepper privado. Hash versionado. O custo atende ao limite nativo considerado do Workers; avaliação de KDF memory-hard continua uma melhoria de segurança, não se afirma equivalência a 600 mil iterações.
- 2FA TOTP de administrador, segredo cifrado com AES-GCM, verificação de replay, oito códigos de recuperação aleatórios de uso único e revogação das outras sessões ao ativar. Ativação é explícita na conta; não é obrigatória antes da primeira sessão de bootstrap.
- Até seis perfis, avatares locais, edição, exclusão e PIN de seis dígitos com hash e limitação de tentativas. Mudar PIN exige senha da conta e invalida a seleção de perfil nas sessões.
- Estado privado por perfil no D1: favoritos, histórico, progresso, preferências, temporada escolhida e assistidos. Escritas serializadas e versão otimista: conflito retorna 409, sem sobrescrever outro dispositivo silenciosamente. Preferências antigas do localStorage não são importadas, para evitar atribuir dados de outra pessoa ao perfil.
- Port seletivo do PR15: detalhes full-screen, temporadas reais, aliases e grupos de TV, tags de 256 cores. O player imersivo do PR15 NÃO foi transportado. Agrupamento preserva inclusive URLs repetidas e mantém a primeira fonte na ordem do fornecedor.
- Guia em `/guide/`: XMLTV local autorizado, horários com offset explícito, consulta por dia/canal/programa, agora, progresso, lembretes por perfil (alertas enquanto a página estiver aberta). Importações são idempotentes em lotes; falha informa quantos programas já foram salvos.
- Esportes: cadastro manual de evento com fonte HTTPS pública e canais somente com confirmação explícita. Sem feed automático, logos ou programação inventados.
- Recomendações determinísticas pelos gêneros declarados, com motivo, exclusão de assistidos e opção de desativar.
- Busca secundária D1: lê snapshots existentes do R2, 512 KiB por leitura e no máximo 40 itens por avanço, sem gravar URL de mídia no índice. Publicação de uma geração só com contagem final igual à do snapshot. Consulta paginada; Home pode usar índice de filmes em pesquisas e mantém fallback local. Tanto conta quanto sessão existente da ponte são exigidas.

## Arquivos protegidos
`tests/protected-baseline.json` e `tests/protected-baseline.test.mjs` verificam SHA256 de 13 arquivos, incluindo app.js, cinema-app.js, bridge-core.js, catalog-snapshot.js, gateway.js, direct-source.js e todas as rotas de bridge. Permanecem byte a byte iguais à main-base. O parser recebeu **apenas** a anotação `epgId`; não foram alterados seleção de URL, inferKind, downloads, codecs, protocolos, buffer ou regras de reprodução.

## Integração e limitações reais
- **Login e ponte continuam autenticações separadas.** Fazer o cookie novo autorizar a ponte exigiria mexer no módulo protegido. Não foi feito. Após login/perfil, a fonte é conectada pelo fluxo existente.
- O frontend ainda carrega o catálogo original pelo motor atual. O índice secundário reduz trabalho de busca, mas não elimina a memória desse carregamento. Alterar isso exige uma integração adicional compatível com o contrato protegido.
- Sem IDs reais de séries no parser original, agrupamento usa marcadores explícitos e ano quando disponível; o módulo também aceita seriesId fornecido pelo chamador. Não inventa IDs nem episódios.
- Perfis infantis/classificação restritiva NÃO são oferecidos: esconder cartões não protegeria o catálogo bruto entregue pela ponte existente. É necessário resolver o contrato de autorização da fonte antes de afirmar controle parental.
- OAuth Google/Discord, verificação de e-mail e recuperação por e-mail permanecem indisponíveis: faltam configuração de aplicativos OAuth, redirects autorizados e serviço de envio. A tela informa a indisponibilidade; nada é simulado.
- EPG automático, EPG Xtream e feeds esportivos dependem de fontes autorizadas configuradas. A importação XMLTV e curadoria manual estão preparadas.
- Sem consulta real ao Cloudflare, a branch implantada e seus bindings não foram confirmados. A documentação antiga cita Workers Static Assets; os endpoints de bridge existentes usam Pages Functions. Validar qual arquitetura está realmente implantada antes de qualquer deploy. Não substituir a atual para fazer os módulos novos funcionarem.
- Contas do PR14 não são migradas automaticamente para account_users. Revisão e migração de dados existentes precisam de inventário real; não executar ambos os sistemas de login em produção por acidente.
- Enriquecimento avançado implementado para elenco, direção, trailers oficiais, certificação brasileira e nome da coleção, usando endpoint autenticado e cache de 24h. Recomendações TMDB ainda não são vinculadas ao catálogo. Próximo episódio automático, controle remoto completo, revisão de correspondências e automações continuam no CSV, sem alegação de conclusão.

## Configuração para ambiente isolado de revisão
1. Usar uma cópia de teste do D1, não o banco de produção.
2. Aplicar migrações não destrutivas novas: 0003, 0004, 0005, 0006, 0007 e 0008, em ordem. 0006 adiciona colunas e deve ser executada uma vez pelo controle de migrações. A 0001 já pertence ao mecanismo existente. Esta branch não inclui a 0002 do PR14.
3. Configurar DB e os bindings existentes de snapshot sem renomeá-los. Novos secrets: `LUX_AUTH_PEPPER` aleatório >=32 caracteres, `LUX_ADMIN_BOOTSTRAP_PASSWORD` aleatório >=20 caracteres. Não versionar valores reais.
4. Entrar como `admin` somente no ambiente privado, alterar a senha, ativar 2FA, guardar códigos de recuperação e remover o secret de bootstrap.
5. Verificar os testes, fluxos de convite, perfis e isolamento. Validar a reprodução real existente separadamente com fonte autorizada.
6. Aprovar revisão antes de qualquer merge ou publicação.

## Validação executada
- Baseline: 113 testes existentes aprovados.
- Após os módulos novos: 138 testes aprovados (atualizar este número ao adicionar testes).
- Testes usam SQLite real para SQL, transações, isolamento, convites, estado, sessões, PIN e MFA. Simulações de R2 só nos testes; nenhum stream privado utilizado.
- Teste de índice: 10 mil entradas por chunks; teste de integração de publicação/paginação com SQLite e R2 simulado.
- Smoke em scripts/browser-smoke.cjs aprovado no GitHub Actions, execução 38999412801 (commit 86142b0): login, perfil, catálogo, temporadas, persistência e foco. Captura da conta revisada. Capturas fullPage de um dialog fixo incluem áreas fora da viewport; teste reforçado para verificar geometria/modal e salvar somente a viewport na próxima execução. Reprodução real e PWA instalado ainda não testados.

## Referências usadas
- AGENTS.md, DESIGN.md e PRODUCT.md do PR15, adaptados ao estado desta branch.
- LuxPlayer2.0: constituição visual; groupChannels, channelCatalog, displayTitle; documentação de EPG, recomendações e agrupamento de TV. EPG demonstrativo do 2.0 foi deliberadamente excluído.
- Impeccable: audit/clarify/harden/adapt; preservar identidade existente, foco, erros e dados reais.
- Ilm-Alan/frontend-design: SKILL.md lido; disciplina de conteúdo aplicada. A obrigação de escolher outra estética é subordinada ao pedido de manter Lux.
- vercel-labs/agent-skills: regra js-index-maps e resumo de performance; sem introduzir React/Next.js.
- awesome-codex-skills/webapp-testing: SKILL.md lido; validação em Playwright preparada, sem executar instaladores externos de skills.
