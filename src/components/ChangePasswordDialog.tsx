import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { user, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!currentPassword) {
      newErrors.currentPassword = 'Informe sua senha atual.';
    }

    if (!newPassword || newPassword.length < 6) {
      newErrors.newPassword = 'A nova senha deve ter no mínimo 6 caracteres.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Confirme a nova senha.';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'A confirmação não coincide com a nova senha.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!user?.email) {
      toast.error('Usuário não autenticado.');
      return;
    }

    setLoading(true);

    try {
      // 1. Validar a senha atual autenticando novamente
      const { error: signInError } = await chamarApiPost('/api/auth/sign_in', {
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setErrors({ currentPassword: 'Senha atual incorreta.' });
        setLoading(false);
        return;
      }

      // 2. Atualizar a senha
      await updatePassword(newPassword);
      
      toast.success('Senha alterada com sucesso!');
      handleOpenChange(false);
    } catch (error: any) {
      toast.error((error as any)?.message || error || 'Erro ao alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[425px] p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col space-y-1.5">
            <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">Trocar Senha</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Preencha os campos abaixo para atualizar sua senha de acesso.
            </DialogDescription>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="space-y-4">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-blue-600 border-b border-slate-200 pb-2">
                Dados de Segurança
              </h3>
              
              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password" className="text-slate-700 font-semibold text-xs uppercase">Senha Atual <span className="text-red-500">*</span></Label>
                  <PasswordInput
                    id="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setErrors(prev => { const next = { ...prev }; delete next.currentPassword; return next; });
                    }}
                    placeholder="Sua senha atual"
                    required
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.currentPassword ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.currentPassword && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.currentPassword}</span>}
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-slate-700 font-semibold text-xs uppercase">Nova Senha <span className="text-red-500">*</span></Label>
                  <PasswordInput
                    id="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setErrors(prev => { const next = { ...prev }; delete next.newPassword; return next; });
                    }}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.newPassword ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.newPassword && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.newPassword}</span>}
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-slate-700 font-semibold text-xs uppercase">Confirmar Nova Senha <span className="text-red-500">*</span></Label>
                  <PasswordInput
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrors(prev => { const next = { ...prev }; delete next.confirmPassword; return next; });
                    }}
                    placeholder="Repita a nova senha"
                    required
                    minLength={6}
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.confirmPassword ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.confirmPassword && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.confirmPassword}</span>}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading} className="px-6 rounded-lg text-slate-700 font-semibold border-slate-300 hover:bg-slate-100">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="px-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {loading ? 'Salvando...' : 'Salvar Senha'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
