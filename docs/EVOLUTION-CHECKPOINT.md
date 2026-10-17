# Evolução do Lux Zero — checkpoint 01
Data: 2026-10-17. Auditoria inicial, não implementação concluída.

## Limite de trabalho
O usuário pediu blocos menores para economizar a franquia Plus e um ponto explícito de retomada. O agente não tem acesso ao saldo dessa franquia. Este checkpoint encerra somente o primeiro bloco de auditoria.

## Baseline e branch
- main inspecionada: 20aa1fdbc07561c68780e48fe7d7ce3fdf9d90e2.
- Branch de trabalho: feat/streaming-evolution-20261017, criada diretamente nesse commit.
- npm test na main: 113 testes aprovados, zero falhas.
- Nenhum código funcional alterado; nenhum merge, deploy ou migração executado.
- Esse SHA é a referência de recuperação; não se afirma que ele seja o deploy ativo.
- Branch efetivamente implantada no Cloudflare: ainda NÃO verificada. docs/cloudflare.md menciona main, mas documentação não é evidência de implantação.

## Revisão inicial dos PRs
- #14 aberto e draft: feat/zero-auth-catalog-tags-20261016; head 6d9db864936fac99732103b4efb510c82bc3d52c; base main.
- #15 aberto e draft: feat/cinema-fullscreen-tv-groups-20261017; head 02a3d2bde6eec33e8226513faf2ffe400aebd735; base da branch do #14.
- #15 depende do #14. Não incorporar os dois cegamente.
- Diff cumulativo revisado parcialmente: 48 arquivos, 1278 adições e 61 remoções.
- #14 adiciona authenticatedUser à autorização em src/bridge-core.js e trustedCron em src/catalog-snapshot.js.
- #15 introduz integração immersive em playItem de public/cinema-app.js e controles externos.
- Essas mudanças preexistentes atingem áreas agora explicitamente protegidas pelo usuário. Não incorporá-las automaticamente à nova branch.
- AGENTS.md, DESIGN.md e PRODUCT.md não estão na main examinada; foram lidos na branch do #15.

## Matriz preliminar (não substitui auditoria completa)
| Área | Evidência até agora | Próximo passo |
| --- | --- | --- |
| Reprodução e HTTPS | Baseline com testes verdes; módulos protegidos identificados | Registrar hashes e teste de imutabilidade antes de implementar |
| Login | Main contém interface; #14 contém auth D1, cookie, bootstrap e limite de tentativas | Revisar segurança, testes e integração sem tocar na ponte |
| Perfis e isolamento | Não auditados completamente | Mapear armazenamento e autorização por conta/perfil |
| Home e metadados | Main tem home-model, TMDB seguro, busca e paginação com testes | Ler implementação e comparar com 2.0 |
| Filmes/séries/TV | #15 contém módulos de detalhes, episódios e grupos | Revisar algoritmos e reaproveitar somente alterações compatíveis |
| EPG, esportes, administração, OAuth e 2FA | Não auditados | Não afirmar inexistência nem conclusão sem leitura |
| Escala | Teste existente de vitrines com 260 mil entradas passou | Investigar índices, backend e uso real de memória |
| PWA e acessibilidade | Testes estáticos existentes passaram | Navegador, screenshots e dispositivos pendentes |

## Referências
- Páginas Impeccable, Ilm-Alan/frontend-design e awesome-codex-skills consultadas inicialmente; leitura dos SKILL.md originais ainda pendente.
- A abertura web de react-best-practices falhou; tentar fonte oficial novamente.
- Clone direto do LuxPlayer2.0 falhou por exigir autenticação. Próxima tentativa deve usar o conector GitHub já disponível; isto não prova indisponibilidade pelo conector.

## Proteções obrigatórias
Não alterar src/bridge-core.js, src/catalog-snapshot.js, public/gateway.js, public/direct-source.js, public/app.js, rotas de bridge, núcleo de public/cinema-app.js ou controles diretos de mídia. Não modificar download M3U, snapshots R2, registro D1 existente, seleção de URL, protocolos, buffers ou credenciais. Toda indexação nova deve consumir snapshots em etapa independente.

## Retomada exata
1. Revalidar heads de main/#14/#15 e consultar este checkpoint.
2. Recuperar LuxPlayer2.0 pelo conector GitHub e ler referências internas do pedido.
3. Concluir auditoria do Zero, CI e configuração disponível de implantação; não inferir produção.
4. Registrar hashes do baseline protegido e checklist executável.
5. Revisar auth-core do #14 (bootstrap, limitação, sessões, revogação, isolamento) e definir incorporação seletiva sem mudanças protegidas.
6. Implementar primeiro bloco funcional com migrações não destrutivas e testes reais; atualizar esta matriz com evidências.
7. Prosseguir por blocos revisáveis e abrir PRs quando houver mudanças prontas para revisão; não mesclar nem publicar produção.

Nenhuma fase funcional foi marcada como concluída. OAuth, e-mail, EPG e esportes requerem verificar configuração/fontes reais, sem inventar credenciais ou dados.

## Atualização — execução retomada
O usuário autorizou continuar todo o prompt com acompanhamento por CSV. O checkpoint inicial acima é histórico. Consulte agora `TAREFAS.csv` e `EVOLUTION-IMPLEMENTATION.md`. A implementação não parou no planejamento; módulos de contas, perfis, catálogo, guia e recomendações foram adicionados em revisão. Nenhum deploy ou merge foi feito.
