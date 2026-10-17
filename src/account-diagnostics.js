/** Read-only operational summary. Never serialize bindings, source URLs or R2 keys. */
const MODULES={catalog:['catalog_sources'],guide:['guide_programs','profile_reminders','sports_events'],search:['search_generations','search_heads','search_entries'],details:['detail_metadata_cache'],defaults:['account_preferences']};
export async function accountDiagnostics(env){
 const started=Date.now();
 const tables=new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(row=>row.name));
 const modules=Object.fromEntries(Object.entries(MODULES).map(([name,required])=>[name,required.every(table=>tables.has(table))?'ready':'missing_migration']));
 const [users,profiles,sessions]=await Promise.all([
  env.DB.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN disabled=0 THEN 1 ELSE 0 END) AS active FROM account_users').first(),
  env.DB.prepare('SELECT COUNT(*) AS total FROM account_profiles').first(),
  env.DB.prepare('SELECT COUNT(*) AS total FROM account_sessions WHERE expires_at>?').bind(Date.now()).first()
 ]);
 let catalogs=[],catalogCount=0,search=[];
 if(modules.catalog==='ready'){
  catalogCount=(await env.DB.prepare('SELECT COUNT(*) AS total FROM catalog_sources').first()).total;
  // Metadata only; does not read, rewrite or revalidate a private media source.
  const rows=(await env.DB.prepare('SELECT synced_at,item_count,size_bytes FROM catalog_sources ORDER BY synced_at DESC LIMIT 25').all()).results;
  catalogs=rows.map(row=>({syncedAt:Number.isFinite(Date.parse(row.synced_at))?new Date(row.synced_at).toISOString():null,items:row.item_count,bytes:row.size_bytes}));
 }
 if(modules.search==='ready')search=(await env.DB.prepare('SELECT status,COUNT(*) AS total FROM search_generations GROUP BY status').all()).results
  .filter(row=>['building','ready','failed'].includes(row.status));
 return {checkedAt:new Date().toISOString(),database:{status:'reachable',queryMs:Math.max(0,Date.now()-started)},
  r2:{configured:Boolean(env.CATALOG_BUCKET),status:env.CATALOG_BUCKET?'configured_not_probed':'not_configured'},
  tmdb:{configured:Boolean(env.TMDB_API_KEY),status:env.TMDB_API_KEY?'configured_not_probed':'not_configured'},modules,
  accounts:{total:users.total,active:users.active||0,profiles:profiles.total,sessions:sessions.total},catalogCount,catalogs,search};
}
