/**
 * Armazena o motivo do logout automático do usuário atual em sessionStorage e memória.
 *
 * Utiliza sessionStorage para sobreviver a redirecionamentos e reloads de página
 * durante o processo de logout do Cloudflare D1, apagando a informação assim que é lida.
 */

export type MotivoLogout = 'afk' | 'sessao_invalida';

const STORAGE_KEY = 'medco_motivo_logout';
let motivoLogoutMemoria: MotivoLogout | null = null;

/**
 * Registra o motivo do logout automático.
 * Deve ser chamado imediatamente antes do signOut().
 *
 * @param motivo - Motivo do logout ('afk' | 'sessao_invalida')
 */
export const definirMotivoLogout = (motivo: MotivoLogout): void => {
  motivoLogoutMemoria = motivo;
  try {
    sessionStorage.setItem(STORAGE_KEY, motivo);
  } catch (err) {
    // Fallback gracioso se sessionStorage estiver desabilitado no navegador
  }
};

/**
 * Lê e apaga o motivo do logout registrado (leitura destrutiva).
 * Retorna null se nenhum logout automático foi registrado.
 *
 * @returns O motivo do logout, ou null se não houver
 */
export const lerELimparMotivoLogout = (): MotivoLogout | null => {
  let motivo = motivoLogoutMemoria;
  motivoLogoutMemoria = null;

  try {
    const doStorage = sessionStorage.getItem(STORAGE_KEY);
    if (doStorage) {
      motivo = doStorage as MotivoLogout;
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    // Fallback gracioso
  }

  return motivo;
};
