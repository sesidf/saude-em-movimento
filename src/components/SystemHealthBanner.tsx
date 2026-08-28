import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSystemHealth } from '@/hooks/useSystemHealth';

const SystemHealthBanner = () => {
  const { isDegraded, degradedMinutes } = useSystemHealth();
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;

    if (!isDegraded) {
      root.style.setProperty('--system-health-banner-height', '0px');
      return;
    }

    const syncHeight = () => {
      root.style.setProperty('--system-health-banner-height', `${bannerRef.current?.offsetHeight ?? 0}px`);
    };

    syncHeight();
    window.addEventListener('resize', syncHeight);

    return () => {
      window.removeEventListener('resize', syncHeight);
      root.style.setProperty('--system-health-banner-height', '0px');
    };
  }, [isDegraded]);

  if (!isDegraded) return null;

  return (
    <div 
      ref={bannerRef} 
      className="fixed z-50 bg-amber-500/90 backdrop-blur-sm border border-amber-600/20 text-white px-4 py-1.5 rounded-full shadow-lg text-xs md:text-sm font-medium transition-all duration-300 animate-in fade-in slide-in-from-top-4"
      style={{
        top: '12px',
        left: 'calc(var(--sidebar-width-offset, 0px) + 50%)',
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 animate-pulse text-amber-100" />
        <span>
          Modo degradado ativo: instabilidade parcial.
          {typeof degradedMinutes === 'number' ? ` Resposta estável há ~${degradedMinutes} min.` : ''}
        </span>
      </div>
    </div>
  );
};

export default SystemHealthBanner;
