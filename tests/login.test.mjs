import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateLogin, validateRecoveryEmail } from '../public/login-logic.js';

test('login exige identificador e senha, sem regras artificiais na senha antiga', () => {
  assert.equal(validateLogin({ identity: '', password: '' }).valid, false);
  assert.ok(validateLogin({ identity: '', password: '' }).errors.identity);
  assert.ok(validateLogin({ identity: 'ab', password: 'x' }).errors.identity);
  assert.equal(validateLogin({ identity: 'reginaldo', password: 'x' }).valid, true);
});

test('identificador aceita usuário e e-mail', () => {
  assert.equal(validateLogin({ identity: ' conta@exemplo.com  ', password: '123' }).valid, true);
  assert.equal(validateLogin({ identity: 'user-01', password: '123' }).valid, true);
});

test('recuperação valida e-mail', () => {
  assert.ok(validateRecoveryEmail(''));
  assert.ok(validateRecoveryEmail('sem-arroba'));
  assert.equal(validateRecoveryEmail('conta@exemplo.com'), '');
});

test('tela inicial aponta para ativos e mantém laboratório de demonstração', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const marker of ['login-form', 'login-identity', 'login-password', 'toggle-password', 'recovery-form', '/player.html', 'login-google', 'login-discord', 'Lux ID']) {
    assert.ok(html.includes(marker), 'Elemento ausente: ' + marker);
  }
  for (const name of ['lux-logo.png','lux-icon.png','login-scene.png','luxite.png']) {
    assert.ok(html.includes('/assets/' + name), 'Asset não referenciado: ' + name);
    assert.equal(existsSync(new URL('../public/assets/' + name, import.meta.url)), true, 'Asset inexistente: ' + name);
  }
  assert.equal(existsSync(new URL('../public/player.html', import.meta.url)), true);
});

test('login não faz autenticação falsa nem armazena segredos', () => {
  const js = readFileSync(new URL('../public/login.js', import.meta.url), 'utf8');
  assert.equal(/\bfetch\s*\(/.test(js), false);
  assert.equal(/localStorage|sessionStorage/.test(js), false);
  assert.ok(js.includes('nenhuma credencial foi enviada'.replace(/^n/, 'N')) || js.includes('Nenhuma credencial foi enviada'));
});

test('logins sociais continuam apenas como interface, sem autenticação simulada', () => {
  const js = readFileSync(new URL('../public/login.js', import.meta.url), 'utf8');
  assert.ok(js.includes('Google ainda não está conectado'));
  assert.ok(js.includes('Discord ainda não está conectado'));
  assert.equal(js.includes('https://discord.com/oauth2/authorize'), false);
  assert.equal(js.includes('accounts.google.com/o/oauth2'), false);
});

test('laboratório usa identidade roxa, sem o antigo verde fluorescente', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('--accent:#b493ff'));
  assert.equal(css.includes('#a7f976'), false);
});
