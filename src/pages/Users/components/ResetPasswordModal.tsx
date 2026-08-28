import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Copy, Check, Sparkles, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from 'sonner';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface ResetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    email: string;
    role_name?: string;
  } | null;
  onSuccess?: () => void;
}

/**
 * Gera uma senha aleatória forte e legível com letras maiúsculas, minúsculas, números e símbolo.
 */
const gerarSenhaAleatoria = (): string => {
  const charsMinusculas = 'abcdefghjkmnpqrstuvwxyz';
  const charsMaiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const simbolos = '!@#$%&*';

  let senha = '';
  senha += charsMaiusculas[Math.floor(Math.random() * charsMaiusculas.length)];
  senha += charsMinusculas[Math.floor(Math.random() * charsMinusculas.length)];
  senha += numeros[Math.floor(Math.random() * numeros.length)];
  senha += simbolos[Math.floor(Math.random() * simbolos.length)];

  const todos = charsMinusculas + charsMaiusculas + numeros + simbolos;
  for (let i = 0; i < 6; i++) {
    senha += todos[Math.floor(Math.random() * todos.length)];
  }

  // Embaralhar
  return senha.split('').sort(() => Math.random() - 0.5).join('');
};

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  open,
  onOpenChange,
  user,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Inicializa com uma senha forte sugerida quando o modal abre
  useEffect(() => {
    if (open) {
      setPassword(gerarSenhaAleatoria());
      setCopied(false);
    }
  }, [open]);

  const handleGenerateNew = useCallback(() => {
    const nova = gerarSenhaAleatoria();
    setPassword(nova);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Senha copiada para a área de transferência!');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  }, [password]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!password || password.length < 8) {
      toast.error('A senha deve conter no mínimo 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await chamarApiGet('/api/auth/session');
      const token = sessionData?.token;
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const resposta = await fetch('/api/admin-reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          password: password,
        }),
      });

      if (!resposta.ok) {
        const errorData = await resposta.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao redefinir a senha.');
      }

      toast.success(
        `Senha de ${user.full_name} redefinida com sucesso! O usuário deverá alterá-la no primeiro acesso.`,
        { duration: 10000 }
      );

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Erro ao redefinir senha:', error);
      toast.error(getErrorMessage(error, 'Erro ao redefinir senha.'));
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const initials = getInitials(user.full_name);
  const colorClass = getAvatarColor(user.full_name);
  const isLengthValid = password.length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden" aria-describedby={undefined}>
        {/* Cabeçalho */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-[#003B71] flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 tracking-tight">
                Redefinir Senha
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Defina uma nova senha temporária para o usuário.
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Card do Usuário Selecionado */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className={cn("flex items-center justify-center w-10 h-10 rounded-full shrink-0 shadow-xs border-2 border-white ring-1 ring-slate-200/50 cursor-default select-none", colorClass)}>
              <span className="font-extrabold text-[12px] tracking-wider text-slate-700">
                {initials}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate uppercase">
                {user.full_name}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {user.email}
              </p>
            </div>
          </div>

          {/* Campo de Senha Personalizável / Automática */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nova Senha Temporária
              </label>
              <button
                type="button"
                onClick={handleGenerateNew}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#003B71] hover:text-blue-800 transition-colors"
                title="Gerar outra senha aleatória segura"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Gerar outra
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <PasswordInput
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setCopied(false);
                  }}
                  placeholder="Digite ou gere a senha..."
                  required
                  minLength={8}
                  className="h-11 bg-slate-50 border-slate-200 text-sm font-mono tracking-wide rounded-xl focus:border-blue-400"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                disabled={!password}
                className="h-11 px-3.5 rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold gap-1.5 shrink-0"
                title="Copiar senha"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs text-emerald-700 font-bold">Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-slate-600" />
                    <span className="text-xs">Copiar</span>
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className={`text-[11px] font-medium flex items-center gap-1 ${isLengthValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isLengthValid ? (
                  <>
                    <Check className="h-3 w-3" /> Mínimo de 8 caracteres atingido ({password.length})
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" /> Mínimo 8 caracteres (atual: {password.length})
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Aviso de Conformidade LGPD & Segurança */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#003B71]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#003B71]" />
              <span>Privacidade & Segurança (LGPD Art. 46)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Esta é uma <strong>senha provisória</strong>. No primeiro acesso, o usuário será <strong>obrigatoriamente direcionado a cadastrar sua senha definitiva e confidencial</strong>, assegurando a privacidade do titular.
            </p>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-10 px-5 rounded-xl text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-100"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !isLengthValid}
              className="h-10 px-6 rounded-xl bg-[#003B71] hover:bg-[#002B55] text-white text-xs font-bold shadow-md shadow-blue-900/10 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                'Salvar e Redefinir Senha'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
