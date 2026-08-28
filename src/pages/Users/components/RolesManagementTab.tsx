import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Plus, Edit2, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { chamarApiPost } from '@/lib/workerApi';
import type { RoleRow } from '../types';

export function RolesManagementTab({ roles }: { roles: RoleRow[] }) {
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const handleEditRole = (role: RoleRow) => {
    setEditingRole(role);
    // TODO: Implementar lógica de edição
  };

  const handleBootstrap = async () => {
    try {
      setIsBootstrapping(true);
      const res = await chamarApiPost('/api/system/bootstrap-rbac', {});
      if (res.error) {
        toast.error(typeof res.error === 'string' ? res.error : res.error.message || 'Erro desconhecido');
      } else {
        toast.success('Bootstrap executado com sucesso! Atualize a página.');
        // Recarregar a página para atualizar o estado global
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar o bootstrap');
    } finally {
      setIsBootstrapping(false);
    }
  };

  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-xl bg-white/50 border-dashed border-slate-300">
        <div className="bg-amber-100 text-amber-600 p-4 rounded-full mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">Sistema de Acesso não Inicializado</h3>
        <p className="text-slate-500 max-w-md mb-6">
          Nenhum cargo foi encontrado no banco de dados. Para que o sistema funcione corretamente, 
          é necessário criar os cargos e permissões iniciais.
        </p>
        <Button onClick={handleBootstrap} disabled={isBootstrapping} className="bg-amber-600 hover:bg-amber-700">
          {isBootstrapping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Rodar Bootstrap Inicial
        </Button>
      </div>
    );
  }

  if (editingRole) {
    return (
      <Card className="border-slate-300">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Editar Permissões: {editingRole.name}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditingRole(null)}>
            Voltar
          </Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="text-sm text-slate-500">
            A gestão granular de permissões deste cargo será habilitada em breve.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Cargos do Sistema</h2>
          <p className="text-sm text-slate-500">Gerencie os cargos e defina suas permissões operacionais.</p>
        </div>
        <Button size="sm" className="h-9">
          <Plus className="h-4 w-4 mr-2" />
          Novo Cargo
        </Button>
      </div>
      
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id} className="border-slate-300 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => handleEditRole(role)}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  {role.name}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-100 rounded-full text-slate-400">
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 space-y-2">
              <div><span className="font-medium text-slate-900">Descrição:</span> {role.description || 'Nenhuma descrição fornecida.'}</div>
              <div className="flex items-center justify-between">
                <div><span className="font-medium text-slate-900">Chave:</span> <Badge variant="secondary" className="font-mono font-normal text-xs">{role.key}</Badge></div>
                {role.is_system && <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px]">Sistema</Badge>}
              </div>
              
              <div className="pt-2">
                <div className="text-xs font-semibold uppercase text-emerald-700 mb-1">Permite Acesso A</div>
                <div className="flex flex-wrap gap-1">
                  {(role.operational_summary?.allowed_summary || []).length > 0 ? (
                    (role.operational_summary?.allowed_summary || []).slice(0, 3).map((item) => (
                      <Badge key={item} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 whitespace-nowrap text-[10px]">{item}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Sem acessos definidos.</span>
                  )}
                  {(role.operational_summary?.allowed_summary || []).length > 3 && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]">+{role.operational_summary!.allowed_summary!.length - 3}</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
