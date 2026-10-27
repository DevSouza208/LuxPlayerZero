# Políticas Lux Zero — minuta v1.0

Contato indicado pelo operador: contato.luxplay@gmail.com.
Pendente antes da publicação definitiva: identificar o controlador real (razão social ou nome completo do operador; identificação empresarial aplicável). A marca Lux Player Zero não foi presumida como pessoa jurídica. Páginas permanecem sinalizadas como minuta e noindex na branch.

Documentos: termos de uso; responsabilidade por fontes e direitos; privacidade; cookies; cache/armazenamento; central de transparência. Links no login, Cinema, player, conta e guia, acessíveis sem login nas rotas /legal/. Não foi acrescentado aceite obrigatório nem registro de consentimento fictício. Cookies opcionais não foram introduzidos.

Conferência técnica:
- Login local atual: usuário/nome, verificadores de senha, sessões e user-agent. IP derivado para rate limit.
- Google e Discord não executam OAuth em public/login.js. Política descreve situação atual e condiciona futuras integrações a fluxo oficial e informação de escopos.
- Histórico, favoritos e preferências vinculados a perfil no D1 são dados pessoais, não anônimos. Fontes e credenciais podem integrar URLs e catálogos; política não promete coleta de apenas nome/e-mail.
- Sem formulários de banco, cartões, pagamentos ou documentos de identificação no cadastro analisado.
- Cookies __Host-lux_account e lux_zero_bridge: até sete dias, HttpOnly, Secure, SameSite=Strict.
- PWA: interface/imagens, não APIs privadas ou streams. Metadados em IndexedDB, catálogo visitante persistente e referência local ao R2. Preferências de visitante em memória não significam ausência de catálogo local.
- YouTube-nocookie não equivale à ausência de tratamento externo; fontes, imagens, CDNs e fontes tipográficas também fazem conexões.

Limites: não foram auditados logs/configuração do painel Cloudflare nem configurações de fornecedores. Não foi inventado prazo universal de retenção, certificação ou anonimização. Controle de exclusão de conta via suporte precisa ser operacionalmente atendido. Para concluir a operação, responsável deve definir procedimentos de retenção, atendimento a direitos e incidentes adequados ao serviço.

Referências consultadas em 27/10/2026:
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- CDC, limites de exoneração: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Guia ANPD sobre cookies: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf

Verificação local: 208/209 testes passaram; o único teste restante exige PNGs originais não disponíveis no checkout via conector, sem alteração desses ativos. Conteúdo das políticas deve receber revisão jurídica antes de ser tratado como documentação definitiva de conformidade.
