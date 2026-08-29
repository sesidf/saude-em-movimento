"use client";

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PasswordInput } from '@/components/ui/password-input';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { chamarApiPost } from '@/lib/workerApi';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Extrai o token da URL: /#/reset-password?token=...
    const searchParams = new URLSearchParams(location.search);
    const urlToken = searchParams.get('token');
    if (!urlToken) {
      toast.error("Token de recuperação ausente ou inválido.");
      navigate('/');
    } else {
      setToken(urlToken);
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) return;

    if (newPassword !== confirmPassword) {
      toast.error("A nova senha e a confirmação não coincidem.");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const res = await chamarApiPost('/api/auth/reset-password', { token, password: newPassword });
      
      if (res.error) {
        throw new Error(res.error);
      }
      
      toast.success("Senha atualizada com sucesso! Você já pode fazer login.");
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || "Erro ao redefinir a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-[#00427A] flex items-center justify-center p-4 overflow-y-auto z-[9999]">
      <div className="absolute top-1/4 left-1/4 w-[35vw] h-[35vw] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none select-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[35vw] h-[35vw] bg-sky-400/10 rounded-full blur-[120px] pointer-events-none select-none" />

      <div className="relative w-full max-w-[440px] bg-white/85 backdrop-blur-xl rounded-3xl p-8 shadow-[0_24px_64px_rgba(0,0,0,0.4)] border border-white/20">
        <div className="text-center mb-8 select-none">
          <div className="inline-flex items-center justify-center mb-6 drop-shadow-md">
            <Logo size="lg" className="h-16" />
          </div>
          
          <h1 className="text-2xl font-extrabold tracking-wider text-slate-800 uppercase flex flex-col sm:flex-row items-center justify-center gap-1.5 leading-none">
            <span className="text-[#00427A]">Redefinir Senha</span>
          </h1>
          <p className="text-slate-500 mt-3 font-semibold text-[10px] tracking-[0.2em] uppercase">
            Digite sua nova senha abaixo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#00427A] uppercase tracking-wider block">
              Nova Senha
            </label>
            <PasswordInput
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white/70 text-slate-800 placeholder:text-slate-400 focus:border-[#00427A] focus:ring-2 focus:ring-[#00427A]/10 outline-none transition-all duration-200 text-sm font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#00427A] uppercase tracking-wider block">
              Confirmar Nova Senha
            </label>
            <PasswordInput
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white/70 text-slate-800 placeholder:text-slate-400 focus:border-[#00427A] focus:ring-2 focus:ring-[#00427A]/10 outline-none transition-all duration-200 text-sm font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-[#00427A] to-[#0284C7] text-white font-bold rounded-xl shadow-lg shadow-blue-500/10 hover:opacity-95 hover:shadow-xl hover:shadow-blue-500/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none text-sm uppercase tracking-wider"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Redefinir Senha'
            )}
          </button>
        </form>
      </div>
    </section>
  );
};

export default ResetPassword;
