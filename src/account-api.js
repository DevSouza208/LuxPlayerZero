import {checkRequestBudget} from './request-budget.js';
import {usuariosApi} from './usuarios-auth.js';
import { accountDiagnostics } from './account-diagnostics.js';
import { verifyMfa, mfaAction } from './account-mfa.js';
import { HttpError, reply, requireConfig, randomToken, digest, equal, validPassword, hashPassword,
  bodyJson, cookie, session, requiredSession, limit, audit, SESSION_SECONDS } from './account-security.js';
const usernameOf = raw => typeof raw==='string'?raw.trim().toLowerCase():'';
const nameOf = raw => typeof raw==='string'?raw.trim().slice(0,40):'';
const validUsername = name => /^[a-z0-9][a-z0-9_.-]{2,39}$/.test(name);
const avatars = new Set(['luxite','violet','moon','star']);
const results = async query => (await query.all()).results;
function requireAdmin(user) {if(user.role!=='admin')throw new HttpError(403,'Ação exclusiva do administrador.');}
async function openSession(request,env,user) {
  const token=randomToken(),now=Date.now();
  // Resolve the unprotected default in the INSERT so a concurrent PIN change cannot be bypassed.
  const sessionId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO account_sessions(token_hash,id,user_id,profile_id,device,created_at,expires_at)
    VALUES (?,?,?,(SELECT p.id FROM account_preferences a JOIN account_profiles p
      ON p.id=a.default_profile_id AND p.user_id=a.user_id WHERE a.user_id=? AND p.pin_hash IS NULL),?,?,?)`)
    .bind(await digest(token),sessionId,user.id,user.id,(request.headers.get('user-agent')||'Dispositivo').slice(0,180),now,now+SESSION_SECONDS*1000).run();
  const selected=await env.DB.prepare('SELECT profile_id FROM account_sessions WHERE id=?').bind(sessionId).first();
  return cookie(reply({authenticated:true,username:user.username,role:user.role,profileId:selected?.profile_id||null,luxId:'LUX:'+user.id}),token);
}
function validateState(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Estado inválido.');
  const output={settings:{},favorites:[],recent:[]};
  // Settings are a strict presentation-only allowlist; never preserve private media URLs.
  const settings=value.settings||{};
  const strings=['heroTitle','heroSubtitle','tvTitle','moviesTitle','seriesTitle','continueTitle','favoritesTitle',
    'tvKeywords','moviesKeywords','seriesKeywords','heroMode','pinnedName','railOrder','density','imageEngine','summaryEngine'];
  for(const key of strings)if(typeof settings[key]==='string')output.settings[key]=settings[key].slice(0,220);
  for(const key of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty','personalization','autoNext'])
    if(typeof settings[key]==='boolean')output.settings[key]=settings[key];
  for(const key of ['favorites','recent']){
    if(!Array.isArray(value[key]||[]))throw new HttpError(400,'Lista inválida.');
    output[key]=(value[key]||[]).slice(0,key==='favorites'?60:30).map(row=>{
      if(!row||!/^[a-z0-9:_-]{1,80}$/i.test(row.key)||typeof row.name!=='string'||typeof row.group!=='string')
        throw new HttpError(400,'Item inválido.');
      return {key:row.key,name:row.name.slice(0,130),group:row.group.slice(0,130),
        at:Math.max(0,Math.min(Date.now(),Number(row.at)||0)),
        position:Math.max(0,Math.min(604800,Number(row.position)||0)),
        duration:Math.max(0,Math.min(604800,Number(row.duration)||0))};
    });
  }
  output.seasons = {};
  if(value.seasons && typeof value.seasons==='object') for(const [key,season] of Object.entries(value.seasons).slice(0,100)) {
    if(key.length<=200 && Number.isSafeInteger(season) && season>=0 && season<=99) output.seasons[key]=season;
  }
  output.watched = Array.isArray(value.watched) ? [...new Set(value.watched.filter(key=>typeof key==='string'&&/^[a-z0-9:_-]{1,80}$/i.test(key)))].slice(0,500) : [];
  return output;
}
export async function accountApi(request,env) {
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  try {
    const usuarioResponse=await usuariosApi(request,env,validateState);
    if(usuarioResponse)return usuarioResponse;
    requireConfig(env);
    if(request.method==='GET'&&path==='/api/account/session'){
      const user=await session(request,env);
      return reply(user?{authenticated:true,username:user.username,role:user.role,profileId:user.profile_id,luxId:'LUX:'+user.user_id}:{authenticated:false});
    }
    if(request.method==='POST'&&['/api/account/login','/api/account/register'].includes(path)){
      const body=await bodyJson(request,4096),username=usernameOf(body.identity),password=body.password;
      const ipKey=await digest('ip:'+ (request.headers.get('cf-connecting-ip')||'unknown'));
      await limit(env,ipKey,30);
      const luxId=/^lux:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(username)?.[1];
      if((!validUsername(username)&&!luxId)||typeof password!=='string'||password.length>256)throw new HttpError(400,'Confira usuário ou Lux ID e senha.');
      if(path.endsWith('/register')&&luxId)throw new HttpError(400,'Escolha um nome de usuário para criar sua conta.');
      let user=path.endsWith('/register')?null:await env.DB.prepare(luxId?'SELECT * FROM account_users WHERE id=?':'SELECT * FROM account_users WHERE username=?').bind(luxId||username).first();
      // Both aliases share one attempt counter for an existing account.
      const key=await digest('login:'+(user?.id||username));await limit(env,key,8);
      if(path.endsWith('/register')){
        if(!validPassword(password)||!/^[a-f0-9]{64}$/.test(body.invite||''))throw new HttpError(400,'Use convite válido e senha de 12 a 256 caracteres.');
        const inviteHash=await digest(body.invite),now=Date.now(),id=crypto.randomUUID(),salt=randomToken();
        const hash=await hashPassword(password,salt,env);
        // INSERT SELECT claims the invite in the same atomic D1 batch; race losers insert no user.
        const batch=await env.DB.batch([
          env.DB.prepare(`INSERT INTO account_users(id,username,password_hash,salt,created_at)
            SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_invites WHERE token_hash=? AND claimed_by IS NULL AND expires_at>?)`)
            .bind(id,username,hash,salt,now,inviteHash,now),
          env.DB.prepare(`UPDATE account_invites SET claimed_by=? WHERE token_hash=? AND claimed_by IS NULL
            AND EXISTS(SELECT 1 FROM account_users WHERE id=?)`).bind(id,inviteHash,id)
        ]);
        if(!batch[0].meta.changes)throw new HttpError(400,'Convite inválido ou já utilizado.');
        return await openSession(request,env,{id,username,role:'user'});
      }
      // One-time bootstrap is possible only on an empty installation, with a strong private secret.
      if(!user&&username==='admin'&&validPassword(env.LUX_ADMIN_BOOTSTRAP_PASSWORD)&&env.LUX_ADMIN_BOOTSTRAP_PASSWORD.length>=20&&equal(password,env.LUX_ADMIN_BOOTSTRAP_PASSWORD)){
        const salt=randomToken(),hash=await hashPassword(password,salt,env);
        await env.DB.prepare(`INSERT INTO account_users(id,username,password_hash,salt,role,created_at)
          SELECT ?,'admin',?,?,'admin',? WHERE NOT EXISTS(SELECT 1 FROM account_users)`)
          .bind(crypto.randomUUID(),hash,salt,Date.now()).run();
        user=await env.DB.prepare('SELECT * FROM account_users WHERE username=?').bind(username).first();
      }
      const hash=await hashPassword(password,user?.salt||'00000000000000000000000000000000',env);
      if(!user||user.disabled||!equal(hash,user.password_hash))throw new HttpError(401,'Usuário ou senha inválidos.');
      if(!await verifyMfa(env,user.id,body.code))throw new HttpError(401,'Informe o código de autenticação ou recuperação.');
      await env.DB.prepare('DELETE FROM account_limits WHERE key=?').bind(key).run();
      return await openSession(request,env,user);
    }
    const user=await requiredSession(request,env);
    if(path!=='/api/account/logout'){
      const blocked=await checkRequestBudget(env,user.user_id,path==='/api/account/state'&&request.method==='POST'?'sync':'account');
      if(blocked)return blocked;
    }
    if(request.method==='GET') {
      if(path==='/api/account/profiles')return reply({profiles:await results(env.DB.prepare(`SELECT p.id,p.name,p.avatar,(p.pin_hash IS NOT NULL) AS protected,
        COALESCE(a.default_profile_id=p.id,0) AS is_default FROM account_profiles p
        LEFT JOIN account_preferences a ON a.user_id=p.user_id WHERE p.user_id=? ORDER BY is_default DESC,p.created_at,p.id`).bind(user.user_id))});
      if(path==='/api/account/devices')return reply({devices:await results(env.DB.prepare('SELECT id,device,created_at,expires_at FROM account_sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC').bind(user.user_id,Date.now())),current:user.session_id});
      if(path==='/api/account/state'){
        if(!user.profile_id)throw new HttpError(409,'Escolha um perfil.');
        const row=await env.DB.prepare(`SELECT s.value,s.version FROM account_profile_state s
          JOIN account_profiles p ON p.id=s.profile_id WHERE p.id=? AND p.user_id=?`).bind(user.profile_id,user.user_id).first();
        return reply({profileId:user.profile_id,value:row?JSON.parse(row.value):{},version:row?.version||0});
      }
      if(path==='/api/account/diagnostics'){requireAdmin(user);await limit(env,'diagnostics:'+user.user_id,20);return reply(await accountDiagnostics(env));}
      if(path==='/api/account/admin'){
        requireAdmin(user);
        const [users,events]=await Promise.all([
          results(env.DB.prepare('SELECT id,username,role,disabled,created_at FROM account_users ORDER BY created_at DESC LIMIT 200')),
          results(env.DB.prepare('SELECT actor,action,target,created_at FROM account_audit ORDER BY created_at DESC LIMIT 100'))]);
        return reply({users,events});
      }
      throw new HttpError(404,'Recurso não encontrado.');
    }
    if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
    const body=await bodyJson(request);
    if(path==='/api/account/mfa'){
      await limit(env,await digest('mfa:'+user.user_id),10);
      return reply(await mfaAction(env,user,body));
    }
    if(path==='/api/account/logout'){
      await env.DB.prepare('DELETE FROM account_sessions WHERE id=? AND user_id=?').bind(user.session_id,user.user_id).run();
      return cookie(reply({authenticated:false}));
    }
    if(path==='/api/account/revoke'){
      if(body.all===true)await env.DB.prepare('DELETE FROM account_sessions WHERE user_id=?').bind(user.user_id).run();
      else await env.DB.prepare('DELETE FROM account_sessions WHERE id=? AND user_id=?').bind(String(body.id||''),user.user_id).run();
      return reply({ok:true});
    }
    if(path==='/api/account/password'){
      await limit(env,await digest('password:'+user.user_id),5);
      const row=await env.DB.prepare('SELECT * FROM account_users WHERE id=?').bind(user.user_id).first();
      if(typeof body.current!=='string'||body.current.length>256||!validPassword(body.password))throw new HttpError(400,'Confira as senhas. A nova deve ter 12 a 256 caracteres.');
      if(!equal(await hashPassword(body.current,row.salt,env),row.password_hash))throw new HttpError(403,'Senha atual incorreta.');
      const salt=randomToken(),hash=await hashPassword(body.password,salt,env);
      await env.DB.batch([env.DB.prepare('UPDATE account_users SET salt=?,password_hash=? WHERE id=?').bind(salt,hash,user.user_id),
        env.DB.prepare('DELETE FROM account_sessions WHERE user_id=?').bind(user.user_id),audit(env,user.user_id,'password.change',user.user_id)]);
      return cookie(reply({ok:true}));
    }
    if(path==='/api/account/profiles'){
      const name=nameOf(body.name);if(!name||!avatars.has(body.avatar))throw new HttpError(400,'Escolha nome e avatar válidos.');
      if(body.id){
        const result=await env.DB.prepare('UPDATE account_profiles SET name=?,avatar=? WHERE id=? AND user_id=?').bind(name,body.avatar,String(body.id),user.user_id).run();
        if(!result.meta.changes)throw new HttpError(404,'Perfil não encontrado.');
      }else{
        const result=await env.DB.prepare(`INSERT INTO account_profiles(id,user_id,name,avatar,created_at)
          SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM account_profiles WHERE user_id=?)<6`)
          .bind(crypto.randomUUID(),user.user_id,name,body.avatar,Date.now(),user.user_id).run();
        if(!result.meta.changes)throw new HttpError(409,'Limite de seis perfis por conta.');
      }
      return reply({ok:true});
    }
    if(path==='/api/account/profile/default'){
      const id=body.id===null?null:String(body.id||'');
      if(id!==null&&!await env.DB.prepare('SELECT id FROM account_profiles WHERE id=? AND user_id=?').bind(id,user.user_id).first())throw new HttpError(404,'Perfil não encontrado.');
      await env.DB.prepare(`INSERT INTO account_preferences(user_id,default_profile_id) VALUES (?,?)
        ON CONFLICT(user_id) DO UPDATE SET default_profile_id=excluded.default_profile_id`).bind(user.user_id,id).run();
      return reply({ok:true});
    }
    if(path==='/api/account/profile/pin'){
      await limit(env,await digest('pin-setting:'+user.user_id),5);
      const account=await env.DB.prepare('SELECT * FROM account_users WHERE id=?').bind(user.user_id).first();
      if(typeof body.password!=='string'||body.password.length>256||!equal(await hashPassword(body.password,account.salt,env),account.password_hash))throw new HttpError(403,'Confirme a senha da conta.');
      if(body.pin!==''&&!/^\d{6}$/.test(body.pin||''))throw new HttpError(400,'Use PIN de seis números ou deixe vazio para remover.');
      const salt=body.pin?randomToken():null,hash=body.pin?await hashPassword(body.pin,salt,env):null;
      const changed=await env.DB.prepare('UPDATE account_profiles SET pin_hash=?,pin_salt=? WHERE id=? AND user_id=?').bind(hash,salt,String(body.id||''),user.user_id).run();
      if(!changed.meta.changes)throw new HttpError(404,'Perfil não encontrado.');
      await env.DB.prepare('UPDATE account_sessions SET profile_id=NULL WHERE profile_id=? AND user_id=?').bind(body.id,user.user_id).run();
      return reply({ok:true});
    }
    if(path==='/api/account/profile/delete'){
      const result=await env.DB.prepare('DELETE FROM account_profiles WHERE id=? AND user_id=?').bind(String(body.id||''),user.user_id).run();
      if(!result.meta.changes)throw new HttpError(404,'Perfil não encontrado.');return reply({ok:true});
    }
    if(path==='/api/account/profile/select'){
      const row=await env.DB.prepare('SELECT id,pin_hash,pin_salt FROM account_profiles WHERE id=? AND user_id=?').bind(String(body.id||''),user.user_id).first();
      if(!row)throw new HttpError(404,'Perfil não encontrado.');
      if(row.pin_hash){
        await limit(env,await digest('pin:'+user.user_id+':'+row.id),5);
        if(!/^\d{6}$/.test(body.pin||'')||!equal(await hashPassword(body.pin,row.pin_salt,env),row.pin_hash))throw new HttpError(403,'PIN inválido.');
        await env.DB.prepare('DELETE FROM account_limits WHERE key=?').bind(await digest('pin:'+user.user_id+':'+row.id)).run();
      }
      const selection=await env.DB.prepare(`UPDATE account_sessions SET profile_id=? WHERE id=? AND user_id=?
        AND EXISTS(SELECT 1 FROM account_profiles WHERE id=? AND user_id=? AND pin_hash IS ?)`)
        .bind(row.id,user.session_id,user.user_id,row.id,user.user_id,row.pin_hash).run();
      if(!selection.meta.changes)throw new HttpError(409,'A proteção do perfil mudou. Tente novamente.');
      return reply({ok:true});
    }
    if(path==='/api/account/state'){
      if(!user.profile_id||body.profileId!==user.profile_id)throw new HttpError(409,'O perfil mudou. Recarregue esta página.');
      if(!Number.isSafeInteger(body.version)||body.version<0)throw new HttpError(400,'Versão inválida.');
      const value=JSON.stringify(validateState(body.value));
      const result=await env.DB.prepare(`INSERT INTO account_profile_state(profile_id,value,version)
        SELECT ?,?,1 WHERE ?=0 AND EXISTS(SELECT 1 FROM account_profiles WHERE id=? AND user_id=?)
        ON CONFLICT(profile_id) DO UPDATE SET value=excluded.value,version=account_profile_state.version+1
        WHERE account_profile_state.version=?`).bind(user.profile_id,value,body.version,user.profile_id,user.user_id,body.version).run();
      // Existing rows need an UPDATE for versions > 0 (INSERT SELECT is empty in that case).
      let changed=result.meta.changes;
      if(body.version>0){const updated=await env.DB.prepare(`UPDATE account_profile_state SET value=?,version=version+1
        WHERE profile_id=? AND version=? AND EXISTS(SELECT 1 FROM account_profiles WHERE id=? AND user_id=?)`)
        .bind(value,user.profile_id,body.version,user.profile_id,user.user_id).run();changed=updated.meta.changes;}
      if(!changed)throw new HttpError(409,'Há alterações em outro dispositivo. Recarregue antes de salvar.');
      return reply({version:body.version+1});
    }
    if(path==='/api/account/invite'){
      requireAdmin(user);const token=randomToken();
      await env.DB.batch([env.DB.prepare('INSERT INTO account_invites(token_hash,created_by,expires_at) VALUES (?,?,?)')
        .bind(await digest(token),user.user_id,Date.now()+86400000),audit(env,user.user_id,'invite.create','one-use')]);
      return reply({token,expiresIn:86400});
    }
    if(path==='/api/account/disable'){
      requireAdmin(user);if(body.id===user.user_id)throw new HttpError(400,'Não desative a própria conta administrativa.');
      const target=await env.DB.prepare('SELECT id FROM account_users WHERE id=? AND role=?').bind(String(body.id||''),'user').first();
      if(!target)throw new HttpError(404,'Conta não encontrada.');
      await env.DB.batch([env.DB.prepare('UPDATE account_users SET disabled=? WHERE id=?').bind(body.disabled===false?0:1,target.id),
        env.DB.prepare('DELETE FROM account_sessions WHERE user_id=?').bind(target.id),audit(env,user.user_id,'account.disable',target.id)]);
      return reply({ok:true});
    }
    throw new HttpError(404,'Recurso não encontrado.');
  } catch(error) {
    // Never include SQLite messages, request bodies, cookies or credentials in responses.
    return reply({error:error instanceof HttpError?error.message:'Serviço indisponível. Verifique a configuração e as migrações.'},error instanceof HttpError?error.status:503);
  }
}
