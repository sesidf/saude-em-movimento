import { useEffect, useMemo, useState } from 'react';
import { chamarApiPost } from '@/lib/workerApi';

type HealthState = 'healthy' | 'degraded';

export const useSystemHealth = () => {
  const [state, setState] = useState<HealthState>('healthy');
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let failures = 0;

    const checkHealth = async () => {
      try {
        const { error } = await chamarApiPost('/api/health');
        if (error) throw new Error(error);

        failures = 0;
        const now = Date.now();
        if (!mounted) return;

        setState('healthy');
        setLastOkAt(now);
      } catch {
        failures += 1;
        if (!mounted) return;

        if (failures >= 2) {
          setState('degraded');
        }
      }
    };

    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const degradedMinutes = useMemo(() => {
    if (!lastOkAt) return null;
    const diff = Date.now() - lastOkAt;
    return Math.floor(diff / 60000);
  }, [lastOkAt]);

  return {
    state,
    isDegraded: state === 'degraded',
    lastOkAt,
    degradedMinutes,
  };
};
