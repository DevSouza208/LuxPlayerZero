/** No localStorage: personal data belongs to the selected server-side profile. */
export async function createProfileStore(fetcher=fetch) {
 const response=await fetcher('/api/account/state',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('Escolha um perfil e entre novamente para carregar seus dados.');
 const initial=await response.json();let state=initial.value||{},version=initial.version,chain=Promise.resolve(),failed=false;
 return {
  read(key,fallback){return state[key]??fallback},
  write(key,value){
   const snapshot=structuredClone(value);
   const pending=chain.then(async()=>{
    if(failed)throw Error('Recarregue a página para sincronizar suas alterações.');
    const next={...state,[key]:snapshot};
    const result=await fetcher('/api/account/state',{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'content-type':'application/json'},body:JSON.stringify({profileId:initial.profileId,version,value:next})});
    const data=await result.json();if(!result.ok){failed=true;throw Error(data.error||'Não foi possível salvar.')}
    state=next;version=data.version;return true;
   });
   chain=pending.catch(()=>{});return pending;
  }
 };
}
