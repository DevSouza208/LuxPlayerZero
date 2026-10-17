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
  const result = validateLogin({ identity: username.value, password: password.value });
  setFieldError(username, 'identity-error', result.errors.identity);
  setFieldError(password, 'password-error', result.errors.password);

  if (!result.valid) {
    announce(feedback, 'Confira os campos destacados para continuar.', 'error');
    (result.errors.identity ? username : password).focus();
    return;
  }

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  announce(feedback, 'Verificando seu acesso…');
  try {
    const invite = document.getElementById('login-invite')?.value.trim();
    const response = await fetch('/api/account/' + (invite ? 'register' : 'login'), {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: username.value.trim(), password: password.value, invite, code: document.getElementById('login-code')?.value.trim() })
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível entrar.');
    password.value = '';
    location.assign(data.profileId?'/cinema/':'/account/');
  } catch (error) { announce(feedback, error.message || 'Não foi possível conectar.', 'error'); }
  finally { submit.disabled = false; }

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
void fetch('/api/account/session', { credentials: 'same-origin', cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .then(data => { if (data?.authenticated) location.replace(data.profileId?'/cinema/':'/account/'); })
  .catch(() => {});
