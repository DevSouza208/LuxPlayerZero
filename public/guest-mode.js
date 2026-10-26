/** Explicit public shell mode; this grants no account or API permissions. */
export function isGuestMode(url=globalThis.location?.href){
 try{const parsed=new URL(url);return /^\/cinema\/?$/.test(parsed.pathname)&&parsed.searchParams.get('guest')==='1'}catch{return false}
}
export function createGuestStore(){
 const state={settings:{imageEngine:'tmdb',summaryEngine:'playlist'}};
 return {read(key,fallback){return state[key]===undefined?fallback:structuredClone(state[key])},async write(key,value){state[key]=structuredClone(value);return true}};
}
