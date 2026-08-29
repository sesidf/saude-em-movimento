"use client";

import { useState, useEffect } from 'react';
import { PasswordInput } from '@/components/ui/password-input';
import { useNavigate } from 'react-router-dom';
import { lerELimparMotivoLogout } from '@/lib/motivoLogout';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { Clock, X, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { user, profile, refreshAccessContext, updatePassword, signOut, signIn } = useAuth();
  const [precisaAlterarSenha, setPrecisaAlterarSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [loadingAlteracao, setLoadingAlteracao] = useState(false);
  const [motivoInatividade, setMotivoInatividade] = useState<string | null>(null);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState(0);

  useEffect(() => {
    const checkLockout = () => {
      const lockoutUntil = Number(sessionStorage.getItem('medco_lockout_until') || 0);
      const now = Date.now();
      if (lockoutUntil > now) {
        setLockoutSecondsRemaining(Math.ceil((lockoutUntil - now) / 1000));
      } else {
        setLockoutSecondsRemaining(0);
        sessionStorage.removeItem('medco_lockout_until');
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const motivo = lerELimparMotivoLogout();
    if (motivo === 'afk') {
      setMotivoInatividade('Você foi desconectado automaticamente por inatividade para manter os dados seguros.');
      toast.warning('Sessão expirada: Você foi desconectado por inatividade para manter sua conta segura.', { id: 'afk-logout-toast', duration: 7000 });
    } else if (motivo === 'sessao_invalida') {
      toast.error('Sessão inválida. Faça login novamente.', { duration: 7000 });
    }
  }, []);

  useEffect(() => {
    if (user && profile?.requires_password_change) {
      setPrecisaAlterarSenha(true);
    } else {
      setPrecisaAlterarSenha(false);
    }
  }, [user, profile?.requires_password_change]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSecondsRemaining > 0) {
      toast.error(`Muitas tentativas incorretas. Aguarde ${lockoutSecondsRemaining}s antes de tentar novamente.`);
      return;
    }

    setLoading(true);
    
    try {
      await signIn(email, senha);
      
      sessionStorage.removeItem('medco_failed_logins_count');
      sessionStorage.removeItem('medco_lockout_until');

      // Busca contexto imediato do AuthState para decidir se exibe o formulário ou se redireciona
      const { data } = await chamarApiPost('/api/auth/session', {});
      const profile = (data as any)?.profile;
      if (profile) {
        if (profile.requires_password_change) {
          setPrecisaAlterarSenha(true);
        } else {
          navigate('/');
        }
      }
    } catch (error: any) {
      console.error('Erro no login com email:', error);
      const currentAttempts = Number(sessionStorage.getItem('medco_failed_logins_count') || 0) + 1;
      sessionStorage.setItem('medco_failed_logins_count', String(currentAttempts));

      if (currentAttempts >= 5) {
        const lockoutUntil = Date.now() + 60 * 1000;
        sessionStorage.setItem('medco_lockout_until', String(lockoutUntil));
        sessionStorage.setItem('medco_failed_logins_count', '0');
        setLockoutSecondsRemaining(60);
        toast.error('Limite de 5 tentativas excedido. Por segurança, o acesso foi pausado por 60 segundos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelarAlteracao = async () => {
    try {
      await signOut();
      setPrecisaAlterarSenha(false);
      setSenha('');
      setNovaSenha('');
      setConfirmarNovaSenha('');
    } catch (error) {
      console.error('Erro ao deslogar:', error);
    }
  };

  const handleAlterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();

    if (novaSenha !== confirmarNovaSenha) {
      toast.error('A nova senha e a confirmação não coincidem.');
      return;
    }

    if (novaSenha.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres para conformidade com as diretrizes de segurança.');
      return;
    }

    setLoadingAlteracao(true);

    try {
      await updatePassword(novaSenha);
      
      await refreshAccessContext();
      navigate('/');
    } catch (error: any) {
      console.error('Erro ao atualizar senha:', error);
    } finally {
      setLoadingAlteracao(false);
    }
  };

  return (
    <>
      <section className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-[#e4effb] to-[#f4f7fc] flex flex-col items-center justify-center p-4 overflow-y-auto z-[9999]">
        {/* Grid background subtil */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none select-none opacity-40"></div>

        {/* Card Principal */}
        <div className="relative w-full max-w-[440px] bg-white/80 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,66,122,0.12)] border border-white/40 flex flex-col items-center text-center z-10">
          
          {/* Logo SESI Saúde Pill */}
          <div className="inline-flex items-center justify-center border-2 border-[#00427A] bg-white rounded-full px-8 py-3 mb-6 select-none shadow-[0_6px_20px_rgba(0,66,122,0.1)] hover:shadow-[0_8px_24px_rgba(0,66,122,0.16)] hover:-translate-y-0.5 transition-all duration-300">
            <img 
              src="/images/logo.svg" 
              alt="SESI Saúde" 
              className="h-9 sm:h-10 w-auto object-contain"
              loading="eager"
            />
          </div>
          
          <h1 className="text-[26px] sm:text-[28px] font-extrabold mb-2 tracking-tight leading-none select-none text-transparent bg-clip-text bg-gradient-to-r from-[#00427A] to-[#005a9e]">
            Saúde <span className="text-[#3CA2C8]">em Movimento</span>
          </h1>
          
          <div className="text-[10px] font-bold text-[#3CA2C8] tracking-[0.25em] uppercase mb-4 select-none">
            • PLATAFORMA DE SAÚDE INTEGRADA •
          </div>
          
          {!precisaAlterarSenha && (
            <p className="text-slate-500 text-[13px] sm:text-[14px] mb-6 leading-relaxed px-2 select-none">
              Utilize suas <span className="font-bold text-[#00427A]">credenciais de acesso</span> para entrar no sistema de saúde.
            </p>
          )}

          {precisaAlterarSenha ? (
            <form onSubmit={handleAlterarSenha} className="w-full flex flex-col gap-4">
              <p className="text-slate-500 text-[13px] mb-2 leading-relaxed select-none">
                Por segurança, você precisa <span className="font-bold text-[#00427A]">definir uma nova senha</span> antes de continuar.
              </p>
              <div className="w-full text-left space-y-2">
                <label className="block text-[13px] font-bold text-slate-700 ml-1">
                  Nova Senha
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10 text-slate-400 group-focus-within:text-[#00427A] transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <PasswordInput 
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                    minLength={8}
                    className="w-full !h-[58px] pl-12 pr-12 rounded-2xl border-2 border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 focus:bg-white text-[16px] font-medium text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#00427A]/10 focus:border-[#00427A] transition-all duration-200 placeholder:text-slate-400 shadow-xs"
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              </div>
              <div className="w-full text-left space-y-2">
                <label className="block text-[13px] font-bold text-slate-700 ml-1">
                  Confirmar Nova Senha
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10 text-slate-400 group-focus-within:text-[#00427A] transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <PasswordInput 
                    value={confirmarNovaSenha}
                    onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                    required
                    minLength={8}
                    className="w-full !h-[58px] pl-12 pr-12 rounded-2xl border-2 border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 focus:bg-white text-[16px] font-medium text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#00427A]/10 focus:border-[#00427A] transition-all duration-200 placeholder:text-slate-400 shadow-xs"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loadingAlteracao}
                className="w-full !h-[58px] mt-2 bg-gradient-to-r from-[#00427A] to-[#003159] hover:from-[#003159] hover:to-[#001f3b] text-white font-bold rounded-2xl shadow-[0_8px_20px_rgba(0,66,122,0.25)] hover:shadow-[0_12px_28px_rgba(0,66,122,0.35)] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none text-[16px] cursor-pointer"
              >
                {loadingAlteracao ? (
                  <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Atualizar Senha'
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelarAlteracao}
                disabled={loadingAlteracao}
                className="w-full text-slate-500 hover:text-slate-800 text-[13px] font-semibold transition-colors mt-2 cursor-pointer"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailLogin} className="w-full flex flex-col gap-4">
              <div className="w-full text-left space-y-2">
                <label className="block text-[13px] font-bold text-slate-700 ml-1">
                  E-mail de acesso
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10 text-slate-400 group-focus-within:text-[#00427A] transition-colors">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full !h-[58px] pl-12 pr-5 rounded-2xl border-2 border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 focus:bg-white text-[16px] font-medium text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#00427A]/10 focus:border-[#00427A] transition-all duration-200 placeholder:text-slate-400 shadow-xs"
                    placeholder="seu.email@exemplo.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="w-full text-left space-y-2">
                <label className="block text-[13px] font-bold text-slate-700 ml-1">
                  Senha
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10 text-slate-400 group-focus-within:text-[#00427A] transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <PasswordInput 
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                    className="w-full !h-[58px] pl-12 pr-12 rounded-2xl border-2 border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 focus:bg-white text-[16px] font-medium text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#00427A]/10 focus:border-[#00427A] transition-all duration-200 placeholder:text-slate-400 shadow-xs"
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || lockoutSecondsRemaining > 0}
                className="w-full !h-[58px] mt-2 bg-gradient-to-r from-[#00427A] to-[#003159] hover:from-[#003159] hover:to-[#001f3b] text-white font-bold rounded-2xl shadow-[0_8px_20px_rgba(0,66,122,0.25)] hover:shadow-[0_12px_28px_rgba(0,66,122,0.35)] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none text-[16px] cursor-pointer"
              >
                {loading ? (
                  <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Entrar no sistema'
                )}
              </button>
            </form>
          )}

          <div className="mt-12 text-[11px] text-slate-400 leading-relaxed px-4 select-none">
            Ao acessar, você compreende que este é um <span className="font-bold text-slate-500">sistema de saúde restrito</span> e aceita o tratamento de dados pessoais e sensíveis de pacientes, conforme nossa{' '}
            <button 
              type="button"
              onClick={() => navigate('/privacidade')} 
              className="text-slate-500 underline hover:text-[#00427A] outline-none transition-colors cursor-pointer"
            >
              Política de Privacidade
            </button>.
          </div>
        </div>

        {/* Footer Versions */}
        <div className="mt-8 text-center z-10 uppercase select-none">
          <p className="text-[9px] font-bold tracking-[0.15em] text-slate-400/70 mb-1">Versão 1.0.2</p>
          <p className="text-[8px] font-medium tracking-[0.2em] text-slate-400 opacity-30 hover:opacity-100 transition-opacity duration-500 cursor-default">Madebycotrim</p>
        </div>
      </section>

      {/* Tooltip de Inatividade - Canto Inferior Direito */}
      {motivoInatividade && (
        <div className="fixed bottom-6 right-6 z-[10002] max-w-[360px] bg-amber-50/95 backdrop-blur-md text-amber-900 p-4 rounded-2xl border border-amber-200/90 flex items-start gap-3 text-left leading-relaxed animate-in slide-in-from-bottom-5 fade-in duration-500 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-amber-900 text-[12px] uppercase tracking-wider mb-0.5">Sessão Encerrada por Inatividade</p>
            <p className="text-amber-800 text-[11px] leading-snug">{motivoInatividade}</p>
          </div>
          <button 
            type="button"
            onClick={() => setMotivoInatividade(null)} 
            className="text-amber-600/70 hover:text-amber-900 hover:bg-amber-100/50 p-1.5 rounded-lg shrink-0 transition-colors cursor-pointer"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};

export default Login;
