/**
 * Tradutor centralizado de mensagens de erro para Português do Brasil (PT-BR).
 * Trata erros do Cloudflare D1 Auth, PostgreSQL, PostgREST, Rede e Validações de Formulários.
 */
const traduzirErro = (msg: string, fallback = 'Ocorreu um erro na operação.'): string => {
  if (!msg || typeof msg !== 'string') return fallback;
  const text = msg.toLowerCase().trim();

  // 1. Autenticação e Credenciais (Cloudflare D1 Auth / GoTrue)
  if (
    text.includes('invalid login credentials') ||
    text.includes('invalid credentials') ||
    text.includes('invalid email or password') ||
    text.includes('invalid_grant')
  ) {
    return 'E-mail ou senha incorretos.';
  }

  if (text.includes('user not found') || text.includes('user_not_found')) {
    return 'Usuário não encontrado no sistema.';
  }

  if (text.includes('email not confirmed') || text.includes('email_not_confirmed')) {
    return 'O endereço de e-mail ainda não foi confirmado.';
  }

  if (
    text.includes('user already registered') ||
    text.includes('user with this email already exists') ||
    text.includes('user already exists') ||
    text.includes('email address is already registered')
  ) {
    return 'Este e-mail já está cadastrado no sistema.';
  }

  if (text.includes('password should be at least')) {
    return 'A senha deve conter no mínimo 8 caracteres.';
  }

  if (text.includes('signup requires a valid password') || text.includes('password is too short')) {
    return 'Informe uma senha válida com no mínimo 8 caracteres.';
  }

  if (
    text.includes('email rate limit exceeded') ||
    text.includes('over email rate limit') ||
    text.includes('over_email_send_rate_limit')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes antes de tentar novamente.';
  }

  if (text.includes('for security purposes, you can only request this once every')) {
    return 'Por segurança, aguarde alguns instantes antes de fazer uma nova solicitação.';
  }

  if (
    text.includes('email link is invalid or has expired') ||
    text.includes('token has expired') ||
    text.includes('otp expired') ||
    text.includes('bad_oauth_callback')
  ) {
    return 'O link ou código de acesso é inválido ou expirou. Solicite um novo.';
  }

  if (
    text.includes('new password should be different from the old password') ||
    text.includes('same password')
  ) {
    return 'Por segurança, a nova senha deve ser diferente da senha atual.';
  }

  if (
    text.includes('unable to validate email address') ||
    text.includes('invalid email') ||
    text.includes('invalid format')
  ) {
    return 'Formato de e-mail inválido. Verifique o endereço digitado.';
  }

  if (text.includes('anonymous sign-ins are disabled')) {
    return 'Acesso anônimo não permitido.';
  }

  if (text.includes('too many requests') || text.includes('rate limit')) {
    return 'Muitas requisições consecutivas. Aguarde alguns instantes.';
  }

  if (
    text.includes('jwt expired') ||
    text.includes('token expired') ||
    text.includes('session expired') ||
    text.includes('pgrst301')
  ) {
    return 'Sua sessão expirou. Faça login novamente para continuar.';
  }

  if (
    text.includes('invalid jwt') ||
    text.includes('invalid token') ||
    text.includes('token is invalid') ||
    text.includes('signature verification failed')
  ) {
    return 'Sessão inválida. Por favor, entre novamente com suas credenciais.';
  }

  // 2. Banco de Dados / PostgreSQL / Constraints / RLS
  if (
    text.includes('duplicate key value') ||
    text.includes('unique constraint') ||
    text.includes('already exists')
  ) {
    return 'Já existe um registro com estes dados no sistema.';
  }

  if (
    text.includes('foreign key constraint') ||
    text.includes('violates foreign key')
  ) {
    return 'Este item não pode ser excluído pois está sendo usado em outras partes do sistema.';
  }

  if (
    text.includes('violates row-level security policy') ||
    text.includes('permission denied') ||
    text.includes('access denied') ||
    text.includes('unauthorized')
  ) {
    return 'Você não possui permissão para realizar esta operação.';
  }

  if (
    text.includes('timeout') ||
    text.includes('statement timeout') ||
    text.includes('canceling statement due to statement timeout')
  ) {
    return 'O sistema demorou muito para responder. Verifique sua conexão e tente novamente.';
  }

  if (
    text.includes('network error') ||
    text.includes('networkrequestfailed') ||
    text.includes('failed to fetch') ||
    text.includes('load failed') ||
    text.includes('fetch error')
  ) {
    return 'Falha de conexão com o servidor. Verifique sua internet.';
  }

  if (
    text === 'not found' ||
    text === 'resource not found' ||
    text === 'pgrst116' ||
    text.includes('json object requested, multiple (or no) rows returned')
  ) {
    return 'O registro solicitado não foi encontrado.';
  }

  if (text.includes('null value in column') && text.includes('violates not-null constraint')) {
    return 'Preencha todos os campos obrigatórios antes de salvar.';
  }

  if (text.includes('value too long for type')) {
    return 'O texto digitado ultrapassou o limite máximo de caracteres permitido.';
  }

  // Retorna a mensagem original se não houver regra em inglês mapeada
  return msg;
};

/**
 * Versão assíncrona para extrair e traduzir erros contidos em respostas HTTP (Response context).
 */
export const getOperationalErrorMessage = async (error: unknown, fallback = 'Ocorreu um erro na operação.'): Promise<string> => {
  if (!error) return fallback;

  if (typeof error === 'string' && error.trim()) {
    return traduzirErro(error, fallback);
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;

    const context = record.context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        for (const key of ['error', 'message', 'details', 'msg', 'error_description']) {
          const value = payload?.[key];
          if (typeof value === 'string' && value.trim()) return traduzirErro(value, fallback);
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) return traduzirErro(text.slice(0, 500), fallback);
        } catch {
          // segue para outras propriedades
        }
      }
    }

    for (const key of ['message', 'error_description', 'error', 'details', 'hint', 'msg']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return traduzirErro(value, fallback);
    }
  }

  if (error instanceof Error && (error as any)?.message || error.trim()) {
    return traduzirErro((error as any)?.message || error, fallback);
  }

  return fallback;
};

/**
 * Versão síncrona imediata para uso em blocos catch e toasts.
 */
export const getErrorMessage = (error: unknown, fallback = 'Ocorreu um erro na operação.'): string => {
  if (!error) return fallback;

  if (typeof error === 'string' && error.trim()) {
    return traduzirErro(error, fallback);
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error', 'details', 'hint', 'msg']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return traduzirErro(value, fallback);
    }
  }

  if (error instanceof Error && (error as any)?.message || error.trim()) {
    return traduzirErro((error as any)?.message || error, fallback);
  }

  return fallback;
};

