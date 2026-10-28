/** User-facing messages only; never include provider URLs or credentials. */
export function playbackErrorMessage(reason) {
 if(reason==='network'||reason==='timeout'||reason===2)return 'Falha na conexão com o vídeo. Confira sua internet e tente novamente. A fonte também pode estar indisponível.';
 if(reason==='decode'||reason===3)return 'Não foi possível reproduzir o vídeo. O arquivo pode estar com problema ou usar um formato incompatível.';
 if(reason==='unsupported'||reason===4)return 'Vídeo indisponível ou formato não compatível com este navegador. Tente outra fonte, se houver.';
 if(reason===1)return 'A reprodução foi interrompida. Tente novamente.';
 return 'Não foi possível abrir o vídeo. Confira sua conexão e tente novamente.';
}
