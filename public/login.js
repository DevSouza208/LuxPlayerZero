import { validateLogin, validateRecoveryEmail } from './login-logic.js';

const $ = id => document.getElementById(id);
const loginView = $('login-view');
const recoveryView = $('recovery-view');
const form = $('login-form');
const username = $('login-identity');
const password = $('login-password');
const feedback = $('login-feedback');
const togglePassword = $('toggle-password');
const google = $('login-google');
const discord = $('login-discord');
const forgot = $('forgot-password');
const back = $('back-to-login');
const recoveryForm = $('recovery-form');
const recoveryEmail = $('recovery-email');
const recoveryFeedback = $('recovery-feedback');

const inviteInput = $('login-invite');
const registerName = $('register-name');
const registerNameField = $('register-name-field');
const loginSubmit = form.querySelector('[type="submit"]');
const suppliedInvite = new URLSearchParams(location.search).get('invite') || '';
if (/^[a-f0-9]{64}$/i.test(suppliedInvite)) inviteInput.value = suppliedInvite;
function updateRegisterMode() {
  const isRegistration = Boolean(inviteInput.value.trim());
  registerNameField.hidden = !isRegistration;
  registerName.required = isRegistration;
  password.autocomplete = isRegistration ? 'new-password' : 'current-password';
  loginSubmit.firstChild.textContent = isRegistration ? 'Criar minha conta ' : 'Entrar com Lux ID ';
  if (isRegistration) $('registration-details').open = true;
}
inviteInput.addEventListener('input', updateRegisterMode);
updateRegisterMode();

async function postAccount(action, payload, timeout = null) {
  const response = await fetch('/api/account/' + action, {
    method:'POST', credentials:'same-origin', cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload),
    ...(timeout ? {signal:AbortSignal.timeout(timeout)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'O serviço não concluiu a solicitação.');
  return data;
}
async function checkDailyUpdates(auth) {
  if (auth.backend !== 'usuarios') return;
  announce(feedback, 'Procurando atualizações da sua lista…');
  try {
    const response = await fetch('/api/account/daily-refresh', {
      credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'
    });
    if (!response.ok) throw Error('Não foi possível consultar a biblioteca.');
    const status = await response.json();
    if (!status.hasList || !status.needsRefresh) return;
    announce(feedback, 'Atualizando sua lista. Seus conteúdos anteriores continuam protegidos…');
    await postAccount('daily-refresh', {}, 190000);
  } catch {
    // A atualização falha de modo seguro: o catálogo anterior permanece acessível.
    announce(feedback, 'Não foi possível atualizar agora. Abrindo a última biblioteca disponível…', 'info');
  }
}


const announce = (element, text, kind = 'info') => {
  element.textContent = text;
  element.dataset.kind = kind;
  element.hidden = !text;
};

function setFieldError(input, id, message = '') {
  const slot = $(id);
  slot.textContent = message;
  slot.hidden = !message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
}

function updateMode(mode) {
  const isRecovery = mode === 'recovery';
  loginView.hidden = isRecovery;
  recoveryView.hidden = !isRecovery;
  document.title = isRecovery ? 'Recuperar acesso · Lux Player Zero' : 'Entrar · Lux Player Zero';
  announce(feedback, '');
  announce(recoveryFeedback, '');
  if (isRecovery) recoveryEmail.focus();
  else username.focus();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const result=validateLogin({identity:username.value,password:password.value});
  const registering=Boolean(inviteInput.value.trim());
  if(registering){
    if(!registerName.value.trim()||registerName.value.trim().length>80){
      announce(feedback,'Informe seu nome para concluir o cadastro.','error');
      registerName.focus();
      return;
    }
    if(password.value.length<12){
      announce(feedback,'Crie uma senha com pelo menos 12 caracteres.','error');
      password.focus();
      return;
    }
  }
  setFieldError(username,'identity-error',result.errors.identity);
  setFieldError(password,'password-error',result.errors.password);
  if(!result.valid){
    announce(feedback,'Confira os campos destacados para continuar.','error');
    (result.errors.identity?username:password).focus();
    return;
  }
  loginSubmit.disabled=true;
  announce(feedback,registering?'Criando sua conta e vinculando sua lista…':'Verificando seu acesso…');
  try {
    const identity=username.value.trim(),secret=password.value;
    if(registering){
      await postAccount('register',{identity,password:secret,name:registerName.value.trim(),invite:inviteInput.value.trim()});
      // A conta criada usa o mesmo login normal: nenhum segundo mecanismo de sessão.
    }
    const data=await postAccount('login',{identity,password:secret,code:$('login-code')?.value.trim()});
    password.value='';
    await checkDailyUpdates(data);
    location.assign(data.profileId?'/cinema/':'/account/');
  }catch(error){announce(feedback,error.message||'Não foi possível conectar.','error');}
  finally{loginSubmit.disabled=false;}
});

for (const [input, errorId] of [[username, 'identity-error'], [password, 'password-error']]) {
  input.addEventListener('input', () => {
    setFieldError(input, errorId);
    if (!feedback.hidden) announce(feedback, '');
  });
}

togglePassword.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  togglePassword.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  togglePassword.setAttribute('aria-pressed', String(!showing));
  togglePassword.setAttribute('title', showing ? 'Mostrar senha' : 'Ocultar senha');
  $('password-icon').setAttribute('href', showing ? '#icon-eye' : '#icon-eye-off');
  password.focus({ preventScroll: true });
});

// A interface está pronta, mas NÃO inicia OAuth antes do backend validar state/PKCE.
google.addEventListener('click', () => {
  announce(feedback, 'Login com Google ainda não está conectado. Nenhuma conta foi acessada.', 'info');
});
discord.addEventListener('click', () => {
  announce(feedback, 'Login com Discord ainda não está conectado. Nenhuma conta foi acessada.', 'info');
});

forgot.addEventListener('click', () => updateMode('recovery'));
back.addEventListener('click', () => updateMode('login'));

recoveryForm.addEventListener('submit', event => {
  event.preventDefault();
  const error = validateRecoveryEmail(recoveryEmail.value);
  setFieldError(recoveryEmail, 'recovery-email-error', error);
  if (error) {
    announce(recoveryFeedback, 'Confira o e-mail informado.', 'error');
    recoveryEmail.focus();
    return;
  }
  announce(
    recoveryFeedback,
    'Recuperação de senha indisponível por enquanto. Nenhum e-mail foi enviado.',
    'info'
  );
});
recoveryEmail.addEventListener('input', () => {
  setFieldError(recoveryEmail, 'recovery-email-error');
  if (!recoveryFeedback.hidden) announce(recoveryFeedback, '');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !recoveryView.hidden) updateMode('login');
});

const year = $('current-year');
if (year) year.textContent = String(new Date().getFullYear());

// Check the real server session; no browser token storage.
if (!suppliedInvite) void fetch('/api/account/session', { credentials: 'same-origin', cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .then(data => { if (data?.authenticated) location.replace(data.profileId?'/cinema/':'/account/'); })
  .catch(() => {});
