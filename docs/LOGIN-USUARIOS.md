# Login pela tabela usuarios

A tabela existente `usuarios` passa a ser a fonte do login. Suas sete colunas são preservadas: `id`, `nome`, `usuario`, `senha`, `lista_http`, `lista_https`, `nivel_acesso`. Não aplicar o rascunho antigo de migração 0010, que usava outro formato de ID.

- Usuário é comparado sem diferença entre maiúsculas e minúsculas.
- Níveis `admin` e `administrador` são administrativos; `usuario` é comum. `bloqueado`, `inativo` e `desativado` impedem acesso.
- Para compatibilidade com o cadastro manual já feito, a senha inicial é validada e convertida em hash antes da sessão ser aberta. O formato `lux$1$...` deve ser mantido; nunca preencher o formulário de login com esse hash.
- O servidor usa `LUX_AUTH_PEPPER`, se configurado, ou o segredo privado `BRIDGE_ACCESS_KEY` já existente (mínimo de 32 caracteres). Não publicar esses valores no GitHub. Trocar o segredo usado no hash exige redefinir as senhas.
- Sessão de sete dias com cookie HttpOnly, Secure, SameSite=Strict. No D1 só fica o hash do token. Alterar `senha` no D1 invalida sessões antigas, e alterar `nivel_acesso` vale na próxima requisição.
- `usuarios_sessoes`, `usuarios_limites` e `usuarios_estado` são apoio interno, criados automaticamente pelo servidor; não alteram a tabela editável.
- Uma conta abre diretamente o Cinema com seu próprio estado. O painel de conta mantém entrada, dispositivos, troca de senha e saída; recursos de múltiplos perfis e convites do subsistema antigo não são exibidos nesse modo.
- O carregamento da biblioteca usa apenas as URLs da linha autenticada. Prioriza `lista_https`; se falhar e houver `lista_http`, tenta nova sincronização. Conectar M3U por URL na conta salva a origem e, quando o R2 retorna um snapshot, o link HTTPS fixo.
- URLs de listas só são devolvidas à própria sessão, nunca junto com a resposta pública do login. O serviço de download continua validando os fornecedores permitidos.

Instalações sem `usuarios` continuam usando o subsistema de contas anterior. Não há cópia automática de dados pessoais entre contas.
