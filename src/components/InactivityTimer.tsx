import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { definirMotivoLogout } from '@/lib/motivoLogout';

// Tempo padrão de inatividade: 15 minutos (900.000 milissegundos)
const TEMPO_LIMITE_INATIVIDADE = 15 * 60 * 1000;

/**
 * Componente de segurança para encerrar sessão por inatividade física.
 * Protege prontuários expostos em computadores de clínicas.
 */
export function InactivityTimer() {
  const { session, signOut } = useAuth();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Se não houver sessão ativa, não monitora
    if (!session) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      return;
    }

    const reiniciarTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Se a aba estiver em segundo plano / oculta, não roda o timer de inatividade AFK
      if (document.hidden) {
        return;
      }

      timerRef.current = setTimeout(async () => {
        try {
          definirMotivoLogout('afk');
          await signOut(true);
        } catch (erro) {
          console.error('[InactivityTimer] Erro ao encerrar sessão:', erro);
        }
      }, TEMPO_LIMITE_INATIVIDADE);
    };

    const aoMudarVisibilidade = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      } else {
        reiniciarTimer();
      }
    };

    // Eventos que indicam atividade do usuário
    const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    // Inicializa o monitoramento e escuta eventos
    reiniciarTimer();
    eventos.forEach((evento) => {
      window.addEventListener(evento, reiniciarTimer);
    });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    // Limpeza ao desmontar ou mudar de sessão
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      eventos.forEach((evento) => {
        window.removeEventListener(evento, reiniciarTimer);
      });
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [session, signOut]);

  return null;
}
