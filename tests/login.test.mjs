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
  for (const marker of ['login-form', 'login-identity', 'login-password', 'toggle-password', 'recovery-form', '/cinema/?guest=1', 'login-google', 'login-discord', 'Lux ID']) {
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
  assert.equal(/\bfetch\s*\(/.test(js), true);
  assert.ok(js.includes('/api/account/'));
  assert.equal(/localStorage|sessionStorage/.test(js), false);
  assert.ok(js.includes('if (!response.ok) throw Error'));
});

test('logins sociais continuam apenas como interface, sem autenticação simulada', () => {
  const js = readFileSync(new URL('../public/login.js', import.meta.url), 'utf8');
  assert.ok(js.includes('Google ainda não está conectado'));
  assert.ok(js.includes('Discord ainda não está conectado'));
  assert.equal(js.includes('https://discord.com/oauth2/authorize'), false);
  assert.equal(js.includes('accounts.google.com/o/oauth2'), false);
});

test('player usa identidade roxa e tela de TV ao vivo, sem o antigo laboratório', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('--accent:#b38aff'));
  const html = readFileSync(new URL('../public/player.html', import.meta.url), 'utf8');
  assert.ok(html.includes('TV ao vivo'));
  assert.ok(!html.includes('PLAYBACK LAB / 0.1.0'));
  for (const id of ['source-form', 'bridge-settings', 'channels', 'video', 'audio', 'diagnostics', 'demo']) {
    assert.ok(html.includes('id="' + id + '"'), 'Gancho do player ausente: ' + id);
  }
  assert.equal(css.includes('#a7f976'), false);
});


test('textos editoriais e degradê do Luxite aparecem sem alterar o login', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/login.css', import.meta.url), 'utf8');
  for (const snippet of ['Seu universo.', 'Seu próximo play.', 'Entre para continuar sua experiência.',
    'Todas as suas histórias.', 'Uma só experiência.', 'O SEU ESPAÇO. O SEU CONTROLE.']) {
    assert.ok(html.includes(snippet), 'Texto ausente: ' + snippet);
  }
  assert.ok(css.includes('.visual-bottom::before'));
  assert.ok(css.includes('backdrop-filter:blur(11px)'));
  assert.ok(html.includes('id="login-google"') && html.includes('id="login-discord"'));
});


test('login inclui folha de layout responsivo com regras de altura e teclado', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/login-responsive.css', import.meta.url), 'utf8');
  assert.ok(html.includes('href="/login-responsive.css"'));
  assert.ok(css.includes('height:100svh'));
  assert.ok(css.includes('overflow-y:auto'));
  assert.ok(css.includes('max-height:720px'));
  assert.ok(css.includes('orientation:landscape'));
  assert.ok(css.includes('font-size:16px'));
});
