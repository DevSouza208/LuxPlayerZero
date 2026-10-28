/** Traduz classes conhecidas sem devolver SQL, parâmetros, URLs ou credenciais. */
export function vodFailure(error,stage='unknown',now=Date.now()){
 const messages=[];let cause=error;for(let i=0;cause&&i<4;i++,cause=cause.cause)messages.push(String(cause.message||''));const text=messages.join(' ');
 const retryAt=new Date(now);retryAt.setUTCHours(24,0,0,0);
 if(/(?:exceeded|reached).*(?:daily|free tier).*(?:row )?(?:write|written|read) limit|daily.*(?:write|read).*limit.*exceed/i.test(text)){
  const write=/write|written/i.test(text);return {status:429,code:write?'D1_DAILY_WRITE_LIMIT':'D1_DAILY_READ_LIMIT',stage,retryAt:retryAt.getTime(),error:`Limite diário de ${write?'gravações':'leituras'} do D1 atingido. Os lotes já salvos permanecem no banco. Aguarde a renovação da cota às 21h (São Paulo) e use Atualizar para continuar. Reconstruir também consome gravações.`};
 }
 if(/no such table|no such column/i.test(text))return {status:503,code:'VOD_SCHEMA_MISMATCH',stage,error:'A estrutura do catálogo no D1 está incompleta ou desatualizada. Confira a migração 0013 no banco usado por este servidor.'};
 if(/database.*(?:full|size limit)|SQLITE_FULL|storage.*limit/i.test(text))return {status:507,code:'D1_STORAGE_LIMIT',stage,error:'O banco D1 atingiu o limite de armazenamento. Os lotes anteriores foram preservados.'};
 if(/too many (?:sql variables|subrequests|queries)|too many api requests/i.test(text))return {status:503,code:'D1_REQUEST_LIMIT',stage,retryable:true,error:'O lote atingiu um limite de execução do D1. Os lotes anteriores estão salvos; tente Atualizar novamente.'};
 if(/timeout|timed out|SQLITE_BUSY|overloaded|temporarily unavailable|reset/i.test(text))return {status:503,code:'D1_TEMPORARY',stage,retryable:true,error:'O D1 demorou para responder ou está temporariamente ocupado. Os lotes anteriores estão salvos; tente novamente.'};
 return {status:503,code:'VOD_STORAGE_ERROR',stage,error:'Não foi possível concluir este lote no banco. Os lotes anteriores estão salvos. Não é necessário reconstruir o catálogo. Código: VOD_STORAGE_ERROR.'};
}
