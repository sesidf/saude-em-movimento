import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Plus, Edit2, ShieldAlert, Loader2, KeyRound, Search, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { chamarApiPost } from '@/lib/workerApi';
import type { RoleRow } from '../types';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export function RolesManagementTab({ roles, accessControl }: { roles: RoleRow[], accessControl: any }) {
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { 
    selectedRole, 
    setSelectedRoleId, 
    permissionsByResource, 
    applyPermissionChange, 
    permissionMatrixLoading,
    saving,
    getResourceLabel,
    getActionLabel,
    getScopeLabel,
    selectedRolePermissionStats
  } = accessControl;

  const handleEditRole = (role: RoleRow) => {
    setSearchQuery('');
    setSelectedRoleId(role.id);
  };

  const handleCloseEdit = () => {
    setSelectedRoleId('');
    setSearchQuery('');
  };

  const handleBootstrap = async () => {
    try {
      setIsBootstrapping(true);
      const res = await chamarApiPost('/api/system/bootstrap-rbac', {});
      if (res.error) {
        toast.error(typeof res.error === 'string' ? res.error : (res.error as any).message || 'Erro desconhecido');
      } else {
        toast.success('Bootstrap executado com sucesso! Atualize a página.');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar o bootstrap');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const filteredPermissionsByResource = useMemo(() => {
    if (!searchQuery.trim()) return permissionsByResource;
    
    const query = searchQuery.toLowerCase().trim();
    const filtered: [string, any[]][] = [];
    
    for (const [resource, permissions] of permissionsByResource) {
      const resourceLabel = getResourceLabel({ resource, resource_label: permissions[0]?.resource_label }).toLowerCase();
      
      const matchingPermissions = permissions.filter((perm: any) => {
        const actionLabel = getActionLabel(perm).toLowerCase();
        const desc = (perm.description || '').toLowerCase();
        return resourceLabel.includes(query) || actionLabel.includes(query) || desc.includes(query);
      });
      
      if (matchingPermissions.length > 0) {
        filtered.push([resource, matchingPermissions]);
      }
    }
    
    return filtered;
  }, [permissionsByResource, searchQuery, getResourceLabel, getActionLabel]);

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

  if (selectedRole) {
    return (
      <Card className="border-slate-300 flex flex-col h-full overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b bg-slate-50/50 gap-4 shrink-0">
          <div className="flex-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
              Editar Permissões: <span className="text-blue-700">{selectedRole.name}</span>
            </CardTitle>
            <CardDescription className="mt-1.5 text-slate-500 max-w-2xl">
              Configure as permissões de acesso granulares para este perfil. As alterações são aplicadas instantaneamente a todos os usuários vinculados.
            </CardDescription>
            
            {selectedRolePermissionStats && (
              <div className="flex flex-wrap gap-3 mt-4">
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 flex items-center gap-1.5 py-1 px-2.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                  <span>Total Aplicável: <strong>{selectedRolePermissionStats.totalApplicable}</strong></span>
                </Badge>
                <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 flex items-center gap-1.5 py-1 px-2.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Concedidas: <strong>{selectedRolePermissionStats.granted}</strong></span>
                </Badge>
                {selectedRolePermissionStats.blocked > 0 && (
                  <Badge variant="outline" className="bg-rose-50 border-rose-200 text-rose-700 flex items-center gap-1.5 py-1 px-2.5">
                    <Lock className="h-3.5 w-3.5 text-rose-600" />
                    <span>Bloqueadas: <strong>{selectedRolePermissionStats.blocked}</strong></span>
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:items-end gap-3 shrink-0">
            <Button variant="outline" onClick={handleCloseEdit} disabled={saving} className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold">
              Voltar aos Cargos
            </Button>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar permissão..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 border-slate-300 bg-white shadow-sm"
                disabled={permissionMatrixLoading}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto bg-slate-50/30">
          {permissionMatrixLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
              <p className="text-slate-600 font-bold text-lg">Carregando permissões...</p>
              <p className="text-slate-400 text-sm mt-1">Isso pode levar alguns segundos.</p>
            </div>
          ) : filteredPermissionsByResource.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Search className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-lg font-semibold text-slate-700">Nenhuma permissão encontrada</p>
              <p className="text-sm mt-1">Tente ajustar os termos da busca.</p>
            </div>
          ) : (
            <div className="p-6 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
              {filteredPermissionsByResource.map(([resource, permissions]: [string, any[]]) => (
                <div key={resource} className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col">
                  <div className="bg-slate-100/70 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound className="h-4 w-4 text-blue-600 shrink-0" />
                      <h4 className="font-bold text-slate-800 text-[13px] uppercase tracking-wide truncate">
                        {getResourceLabel({ resource, resource_label: permissions[0]?.resource_label })}
                      </h4>
                    </div>
                    <Badge variant="secondary" className="bg-slate-200/50 text-slate-600 font-bold shrink-0">
                      {permissions.filter(p => p.granted).length} / {permissions.length}
                    </Badge>
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    {permissions.map((perm) => {
                      const isBlocked = perm.guardrail_status === 'denied_by_guardrail' || perm.editable === false;
                      return (
                        <div 
                          key={perm.id} 
                          className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                            isBlocked ? 'bg-slate-50 opacity-80' : 'hover:bg-blue-50/50'
                          }`}
                        >
                          <Switch
                            checked={perm.granted}
                            onCheckedChange={(checked) => applyPermissionChange(perm, checked)}
                            disabled={isBlocked || saving}
                            className="mt-0.5 data-[state=checked]:bg-emerald-500"
                          />
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-[13px] font-bold leading-tight ${perm.granted ? 'text-slate-900' : 'text-slate-600'}`}>
                                {getActionLabel(perm)}
                              </p>
                              <Badge variant="outline" className="text-[9px] uppercase font-bold text-slate-400 shrink-0 h-4 px-1.5">
                                {getScopeLabel(perm)}
                              </Badge>
                            </div>
                            {perm.description && (
                              <p className="text-xs text-slate-500 leading-snug">
                                {perm.description}
                              </p>
                            )}
                            {isBlocked && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 w-max">
                                <AlertTriangle className="h-3 w-3" />
                                {perm.guardrail_reason || 'Bloqueado por regra de sistema'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Cargos e Perfis de Acesso</h2>
          <p className="text-sm text-slate-500 font-medium">Gerencie os cargos do sistema e defina suas permissões operacionais granulares.</p>
        </div>
        <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Cargo
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id} className="border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group" onClick={() => handleEditRole(role)}>
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base font-bold flex items-center gap-2.5 text-slate-800 group-hover:text-blue-700 transition-colors">
                  <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  {role.name}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white rounded-full text-slate-400 shadow-sm border border-transparent hover:border-slate-200">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 pt-4 space-y-3">
              <p className="line-clamp-2 min-h-[40px] text-slate-500">
                {role.description || <span className="italic text-slate-400">Nenhuma descrição fornecida para este cargo.</span>}
              </p>
              
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                  <Badge variant="secondary" className="font-mono font-medium text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0">{role.key}</Badge>
                </div>
                {role.is_system && <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px] font-bold px-2">Sistema</Badge>}
              </div>
              
              <div className="pt-2">
                <div className="text-[11px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Principais Acessos</div>
                <div className="flex flex-wrap gap-1.5">
                  {(role.operational_summary?.allowed_summary || []).length > 0 ? (
                    (role.operational_summary?.allowed_summary || []).slice(0, 3).map((item: string) => (
                      <Badge key={item} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 whitespace-nowrap text-[10px] font-semibold py-0.5 px-2">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">Nenhum acesso predefinido</span>
                  )}
                  {(role.operational_summary?.allowed_summary || []).length > 3 && (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-bold py-0.5">
                      +{(role.operational_summary!.allowed_summary!.length - 3)} mais
                    </Badge>
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
