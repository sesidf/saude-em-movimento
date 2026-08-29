"use client";

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordInput } from '@/components/ui/password-input';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';

const ForcePasswordChange = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, profile, refreshAccessContext, updatePassword } = useAuth();
  const navigate = useNavigate();

  const isForced = profile?.requires_password_change ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.email) {
      toast.error("Usuário não autenticado adequadamente.");
      return;
    }

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
      // Atualizar para a nova senha usando o contexto de autenticação
      await updatePassword(newPassword);

      // Atualiza o contexto para carregar a flag atualizada e redirecionar
      await refreshAccessContext();
      window.location.href = '/';
      window.location.reload();
    } catch (error: unknown) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-[#00427A] flex items-center justify-center p-4 overflow-y-auto z-[9999]">
      {/* Elementos decorativos no fundo */}
      <div className="absolute top-1/4 left-1/4 w-[35vw] h-[35vw] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none select-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[35vw] h-[35vw] bg-sky-400/10 rounded-full blur-[120px] pointer-events-none select-none" />

      <div className="relative w-full max-w-[440px] bg-white/85 backdrop-blur-xl rounded-3xl p-8 notebook:p-10 shadow-[0_24px_64px_rgba(0,0,0,0.4)] border border-white/20 transition-all duration-300 hover:shadow-[0_24px_80px_rgba(0,66,122,0.2)]">
        <div className="text-center mb-8 select-none">
          <div className="inline-flex items-center justify-center mb-6 drop-shadow-md">
            <Logo size="lg" className="h-16" />
          </div>
          
          <h1 className="text-2xl font-extrabold tracking-wider text-slate-800 uppercase flex flex-col sm:flex-row items-center justify-center gap-1.5 leading-none">
            <span className="text-[#00427A]">
              {isForced ? 'Troca Obrigatória' : 'Trocar Senha'}
            </span>
          </h1>
          <p className="text-slate-500 mt-3 font-semibold text-[10px] tracking-[0.2em] uppercase">
            {isForced ? 'Por segurança, você precisa atualizar sua senha.' : 'Mantenha sua conta segura atualizando a senha regularmente.'}
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
              minLength={6}
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
              minLength={6}
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
              'Atualizar Senha'
            )}
          </button>
          
          {!isForced && (
            <button
              type="button"
              onClick={() => navigate('/')}
              disabled={loading}
              className="w-full text-sm font-semibold text-slate-500 hover:text-slate-800 mt-4 transition-colors"
            >
              Voltar
            </button>
          )}
        </form>
      </div>
    </section>
  );
};

export default ForcePasswordChange;
