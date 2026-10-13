/**
 * Validações de interface do Lux Zero.
 * Nenhuma credencial é persistida, enviada ou autenticada neste módulo.
 */
export function validateLogin({ identity, password } = {}) {
  const errors = {};
  const normalizedIdentity = String(identity ?? '').trim();
  const secret = String(password ?? '');
  if (!normalizedIdentity) errors.identity = 'Informe seu Lux ID (usuário ou e-mail).';
  else if (normalizedIdentity.length < 3) errors.identity = 'Digite pelo menos 3 caracteres.';
  if (!secret) errors.password = 'Informe sua senha.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateRecoveryEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Informe o e-mail da sua conta.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Informe um endereço de e-mail válido.';
  }
  return '';
}
