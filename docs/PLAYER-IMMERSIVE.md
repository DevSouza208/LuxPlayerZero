# Player imersivo

O vídeo ocupa toda a área do modal. Voltar, guia e controles são sobreposições, sem reservar faixas na altura do vídeo. Status informativos não são exibidos no modal; erros mantêm aviso compacto.

Controles e cursor somem após 2,8 segundos de reprodução sem interação. Mouse/toque os revelam. O foco deixado por um clique não bloqueia a ocultação; teclado mantém os controles visíveis enquanto o foco estiver em um comando. Pausa, menu aberto e arraste da barra preservam a interface. Fechar o player cancela o temporizador.

Motor de mídia, autenticação, listas e URLs não foram alterados. O mesmo elemento video permanece dentro do modal.

Verificações:
- 15 testes direcionados passaram (temporizador, pause/idle, menus, seeking, fullscreen, modal, PWA e baseline do motor).
- 228/229 testes gerais passaram; a única falha depende dos PNGs originais ausentes no checkout do conector.
- Navegador: um MP4 de padrões gerado com FFmpeg reproduziu de fato. Tempo avançou, duração 18s, play/pause e saltos de +/-10s funcionaram.
- Após inatividade: controles e cabeçalho com opacidade 0, mensagem informativa com display none; vídeo ocupando 1363x936, igual à viewport.
- Menu de episódios abre, Escape fecha somente o menu. Entrada de tela cheia acionada e estado do botão atualizado.
- Quadros de teste estreito (318x698 úteis) e paisagem (842x388 úteis): vídeo ocupa toda a área, todos os botões dentro da viewport, sem overflow horizontal. Não equivale a teste em aparelho físico.
- Fixture pública de QA com vídeo próprio removida antes do merge.

Conferência final do menu em paisagem: o topo ficava em -15px; após ajuste, o menu ocupa y=75..288 em viewport de 388px, com cabeçalho e opções dentro da tela. Foco de teclado preservado durante reprodução real e retorno ao botão de abertura ao fechar também confirmados.
