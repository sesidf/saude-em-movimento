import { Toaster as Sonner } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ position, ...props }: ToasterProps) => {
  let isAutenticado = false;
  let isAuthRoute = false;

  try {
    const auth = useAuth();
    isAutenticado = Boolean(auth?.user);
  } catch {
    isAutenticado = false;
  }

  try {
    const location = useLocation();
    const publicPaths = ['/reset-password', '/forgot-password', '/privacidade'];
    isAuthRoute = publicPaths.includes(location.pathname);
  } catch {
    isAuthRoute = false;
  }

  // Na tela de login ou recuperação de senha (não autenticado): "top-right"
  // Dentro do sistema operacional (autenticado): "bottom-right" (embaixo, empilhando para cima em lista)
  const posicaoPadrao = (isAutenticado && !isAuthRoute) ? "bottom-right" : "top-right";

  return (
    <Sonner
      theme="light"
      className="toaster group font-sans"
      position={position || posicaoPadrao}
      expand={true}
      visibleToasts={6}
      gap={10}
      richColors
      closeButton
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans rounded-2xl p-4 shadow-[0_16px_40px_-8px_rgba(0,66,122,0.14),0_4px_16px_rgba(0,0,0,0.06)] border text-[13px] font-medium backdrop-blur-xl transition-all duration-300 select-none",
          title: "font-bold text-[13px] text-slate-900 tracking-tight",
          description: "text-[12px] opacity-90 leading-relaxed mt-0.5",
          actionButton:
            "font-semibold text-xs rounded-xl px-3 py-1.5 bg-[#00427A] text-white shadow-sm hover:bg-[#003159] transition-all",
          cancelButton:
            "font-semibold text-xs rounded-xl px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all",
          closeButton:
            "!bg-white/80 !border-slate-200 !text-slate-400 hover:!text-slate-800 hover:!bg-white !shadow-xs transition-colors",
          error:
            "!bg-white/95 !border-red-200/90 !text-red-950 [&_[data-icon]]:!text-red-600 shadow-[0_16px_40px_-8px_rgba(220,38,38,0.18)]",
          success:
            "!bg-white/95 !border-emerald-200/90 !text-emerald-950 [&_[data-icon]]:!text-emerald-600 shadow-[0_16px_40px_-8px_rgba(16,185,129,0.18)]",
          warning:
            "!bg-white/95 !border-amber-200/90 !text-amber-950 [&_[data-icon]]:!text-amber-600 shadow-[0_16px_40px_-8px_rgba(245,158,11,0.18)]",
          info:
            "!bg-white/95 !border-sky-200/90 !text-sky-950 [&_[data-icon]]:!text-[#00427A] shadow-[0_16px_40px_-8px_rgba(0,66,122,0.18)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
