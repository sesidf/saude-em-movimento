"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/servicos/auth';
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
  const { user } = useAuth();
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

    setLoading(true);

    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Senha alterada com sucesso!');
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar a senha.');
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

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Senha Atual</Label>
              <PasswordInput
                placeholder="••••••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm ${
                  errors.currentPassword ? 'border-red-500' : ''
                }`}
              />
              {errors.currentPassword && (
                <p className="text-xs text-red-500 font-semibold">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Nova Senha</Label>
              <PasswordInput
                placeholder="••••••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm ${
                  errors.newPassword ? 'border-red-500' : ''
                }`}
              />
              {errors.newPassword && (
                <p className="text-xs text-red-500 font-semibold">{errors.newPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Confirmar Nova Senha</Label>
              <PasswordInput
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm ${
                  errors.confirmPassword ? 'border-red-500' : ''
                }`}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-500 font-semibold">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-6 font-semibold"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Nova Senha
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
