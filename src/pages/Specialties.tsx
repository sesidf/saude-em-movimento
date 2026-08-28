"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet, clearApiCache } from '@/lib/workerApi';
import { cn } from '@/lib/utils';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import { 
  Palette, Plus, Search, Edit2, Power,
  Heart, Activity, Baby, Bone, Flower, Brain, Mic, Zap, Droplet, Stethoscope,
  Microscope, Cross, Syringe, Pill, Thermometer, User, Users, Clipboard, TestTube,
  Bandage, Ear, Dna, Glasses, Smile, ShieldAlert, Eye, CheckCircle, XCircle,
  HeartPulse, FileHeart, Hospital, HeartHandshake, Apple, Dumbbell, UserCheck, AlertTriangle,
  Accessibility,
  createLucideIcon,
  type LucideIcon
} from 'lucide-react';

const Tooth = createLucideIcon('Tooth', [
  ['path', { d: 'M18 6c-.9-2.5-4-3-6-1-2-2-5.1-1.5-6 1-.8 2.1-.3 4.8.8 6.5C8 14.5 8 16 8 17c0 1.5 1.5 3 3 3 1 0 1-1 1-3 .5 1.5 1.5 3 3 3 1.5 0 3-1.5 3-3 0-1 0-2.5 1.2-4.5 1.1-1.7 1.6-4.4.8-6.5z', key: '1' }]
]);
import { toast } from 'sonner';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { getAvatarColor, getInitials, normalizarEntradaTexto } from '@/utils/formatters';
import { useConfirm } from '@/hooks/useConfirm';

interface Specialty {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
}

export const SPECIALTY_ICONS: Record<string, LucideIcon> = {
  heart: Heart,
  activity: Activity,
  baby: Baby,
  bone: Bone,
  flower: Flower,
  eye: Eye,
  brain: Brain,
  mic: Mic,
  zap: Zap,
  droplet: Droplet,
  stethoscope: Stethoscope,
  microscope: Microscope,
  cross: Cross,
  syringe: Syringe,
  pill: Pill,
  thermometer: Thermometer,
  user: User,
  users: Users,
  'clipboard-heart': Clipboard,
  'test-tube': TestTube,
  bandage: Bandage,
  ear: Ear,
  dna: Dna,
  glasses: Glasses,
  smile: Smile,
  tooth: Tooth,
  'shield-alert': ShieldAlert,
  'heart-pulse': HeartPulse,
  'file-heart': FileHeart,
  hospital: Hospital,
  'heart-handshake': HeartHandshake,
  apple: Apple,
  dumbbell: Dumbbell,
  'user-check': UserCheck,
  'alert-triangle': AlertTriangle,
  accessibility: Accessibility
};

const Specialties = () => {
  const { hasPermission, institutionId } = useAuth();
  const { confirm, ConfirmationDialog } = useConfirm();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctorsCatalog, setDoctorsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'stethoscope',
    color: '#3B82F6',
  });

  const canReadSpecialties = hasPermission('specialties', 'read', institutionId) || hasPermission('specialties', 'update', institutionId);
  const canManageSpecialties =
    hasPermission('specialties', 'create', institutionId) ||
    hasPermission('specialties', 'update', institutionId) ||
    hasPermission('specialties', 'manage', institutionId);

  const fetchSpecialties = useCallback(async () => {
    try {
      const [specialtiesRes, doctorsRes] = await Promise.all([
        chamarApiPost('/api/rpc/list_specialties_catalog', {
          p_search: searchTerm.trim() || null,
          p_include_inactive: true,
        }),
        chamarApiPost('/api/rpc/list_doctors_catalog', {
          p_search: null,
          p_include_inactive: false,
        })
      ]);

      if (specialtiesRes.error) throw specialtiesRes.error;
      if (doctorsRes.error) throw doctorsRes.error;

      setSpecialties((specialtiesRes.data as unknown as Specialty[] | null) || []);
      setDoctorsCatalog((doctorsRes.data as unknown as any[] | null) || []);
    } catch (error) {
      console.error('Erro ao buscar especialidades/profissionais:', error);
      toast.error('Erro ao carregar especialidades');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (canReadSpecialties) {
      void fetchSpecialties();
    } else {
      setLoading(false);
    }
  }, [canReadSpecialties, fetchSpecialties]);

  const handleEditSpecialty = useCallback((specialty: Specialty) => {
    setEditingSpecialtyId(specialty.id);
    setErrors({});
    setFormData({
      name: specialty.name,
      description: specialty.description,
      icon: specialty.icon,
      color: specialty.color,
    });
    setIsDialogOpen(true);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Nome da especialidade é obrigatório.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      const p_idempotency_key = await buildIdempotencyKey('upsert_specialty', {
        specialty_id: editingSpecialtyId,
        ...formData,
      });

      const { error } = await chamarApiPost('/api/rpc/upsert_specialty', {
        p_specialty_id: editingSpecialtyId,
        p_name: formData.name.trim().toUpperCase(),
        p_description: formData.description || null,
        p_icon: formData.icon || null,
        p_color: formData.color || null,
        p_is_active: editingSpecialtyId ? specialties.find((item) => item.id === editingSpecialtyId)?.is_active ?? true : true,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success(editingSpecialtyId ? 'Especialidade atualizada com sucesso!' : 'Especialidade criada com sucesso!');
      setIsDialogOpen(false);
      resetForm();
      clearApiCache('/api/rpc/list_specialties_catalog');
      await fetchSpecialties();
    } catch (error: any) {
      console.error('Erro ao salvar especialidade:', error);
      let message = 'Erro ao salvar especialidade';
      
      if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
        message = 'Já existe uma especialidade com este nome.';
      } else if (error?.message) {
        message = (error as any)?.message || error;
      } else if (error instanceof Error) {
        message = (error as any)?.message || error;
      }
      
      toast.error(message);
    }
  };

  const handleToggleActive = useCallback(async (id: string, isActive: boolean) => {
    const confirmed = await confirm(
      isActive
        ? 'Confirmar desativação desta especialidade?'
        : 'Confirmar ativação desta especialidade?',
    );

    if (!confirmed) {
      return;
    }

    try {
      const p_idempotency_key = await buildIdempotencyKey('set_specialty_active', {
        specialty_id: id,
        is_active: !isActive,
      });

      const { data, error } = await chamarApiPost('/api/rpc/set_specialty_active', {
        p_specialty_id: id,
        p_is_active: !isActive,
        p_idempotency_key,
      });

      if (error) throw error;
      const payload = (data || {}) as { success?: boolean; specialty?: Specialty | null };
      if (!payload.success || !payload.specialty || payload.specialty.is_active !== !isActive) {
        throw new Error('O backend nao confirmou a mudanca real de status da especialidade.');
      }

      setSpecialties((current) => current.map((specialty) => (
        specialty.id === id
          ? { ...specialty, is_active: payload.specialty?.is_active ?? specialty.is_active }
          : specialty
      )));
      toast.success(isActive ? 'Especialidade desativada' : 'Especialidade ativada');
      clearApiCache('/api/rpc/list_specialties_catalog');
      await fetchSpecialties();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    }
  }, [fetchSpecialties]);

  const [statusFilter, setStatusFilter] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  const resetForm = () => {
    setEditingSpecialtyId(null);
    setErrors({});
    setFormData({
      name: '',
      description: '',
      icon: 'stethoscope',
      color: '#3B82F6',
    });
  };

  const filteredSpecialties = specialties.filter((specialty) => {
    if (statusFilter === 'ativos') return specialty.is_active;
    if (statusFilter === 'inativos') return !specialty.is_active;
    return true;
  });

  const specialtyColumns: Array<CompactDataGridColumn<Specialty>> = useMemo(() => [
    {
      key: 'name',
      header: 'Especialidade',
      className: 'w-[30%] min-w-[250px]',
      filterable: true,
      filterValue: (specialty) => specialty.name,
      render: (specialty) => {
        const IconComp = SPECIALTY_ICONS[specialty.icon] || Palette;
        return (
          <div className="flex min-w-[260px] items-center gap-3">
            <div 
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm" 
              style={{ backgroundColor: `${specialty.color || '#3B82F6'}15`, color: specialty.color || '#3B82F6', border: `1px solid ${specialty.color || '#3B82F6'}30` }}
            >
              <IconComp className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="truncate font-semibold text-slate-900" title={specialty.name}>{specialty.name}</p>
              <p className={`text-[11px] font-semibold ${specialty.is_active ? 'text-green-700' : 'text-red-700'}`}>{specialty.is_active ? 'Ativa' : 'Inativa'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'professionals',
      header: 'Profissionais',
      className: 'w-[50%] min-w-[300px]',
      render: (specialty) => {
        const specDocs = doctorsCatalog.filter(doc => doc.specialty_id === specialty.id);
        const total = specDocs.length;
        if (total === 0) {
          return <span className="text-xs text-slate-400 font-medium italic">Nenhum profissional vinculado</span>;
        }

        return (
          <div className="flex items-center gap-2.5">
            <div className="flex flex-wrap -space-x-2.5">
              {specDocs.map((doc, idx) => {
                const initials = getInitials(doc.full_name);
                const colorClass = getAvatarColor(doc.full_name);
                return (
                  <div
                    key={doc.id || idx}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black border-2 border-white shadow-sm shrink-0 ring-1 ring-slate-200/50 ${colorClass}`}
                    title={doc.full_name}
                  >
                    {initials}
                  </div>
                );
              })}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              ({total})
            </span>
          </div>
        );
      }
    },

    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[1%] whitespace-nowrap',
      cellClassName: '',
      sticky: 'right',
      render: (specialty) => (
        canManageSpecialties ? (
          <div className="flex flex-nowrap gap-1.5">
            <ActionButton 
              onClick={() => handleEditSpecialty(specialty)} 
              icon={<Edit2 className="h-4 w-4" />} 
              label="Editar" 
              titleTooltip="Editar Especialidade" 
            />
            <ActionButton 
              onClick={() => { void handleToggleActive(specialty.id, specialty.is_active); }} 
              icon={<Power className="h-4 w-4" />} 
              titleTooltip={specialty.is_active ? "Desativar Especialidade" : "Ativar Especialidade"} 
              danger={specialty.is_active} 
            />
          </div>
        ) : null
      ),
    },
  ], [canManageSpecialties, handleEditSpecialty, handleToggleActive, doctorsCatalog]);

  if (!canReadSpecialties) {
    return (
      <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <p>Acesso negado</p>
        </div>
      </div>
    );
  }


  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Especialidades" description="Defina as áreas de atendimento da operação clínica" className="mb-3" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>
            <div className="flex-none w-auto min-w-[165px] shrink-0">
              <Select value={statusFilter} onValueChange={(value: 'ativos' | 'inativos' | 'todos') => setStatusFilter(value)}>
                <SelectTrigger className="delphi-input h-9 w-full whitespace-nowrap">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Todos</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ativos">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                        <CheckCircle className="h-3 w-3" />
                      </div>
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Ativos</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="inativos">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-rose-500/15 text-rose-600 border-rose-500/30">
                        <XCircle className="h-3 w-3" />
                      </div>
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Inativos</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => {
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  disabled={!canManageSpecialties}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Especialidade
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col space-y-1.5">
                    <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                      {editingSpecialtyId ? 'Editar Especialidade' : 'Nova Especialidade'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-medium">Preencha os dados abaixo para cadastrar ou atualizar a especialidade.</DialogDescription>
                  </div>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                      <div className="space-y-4">
                        <FormSectionTitle>Dados da Especialidade</FormSectionTitle>
                        
                        <FormGrid>
                          <FormField label="Nome" required className="md:col-span-12" error={errors.name}>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(event) => {
                                setFormData({ ...formData, name: event.target.value.toUpperCase() });
                                setErrors(prev => { const next = { ...prev }; delete next.name; return next; });
                              }}
                              onBlur={(event) => setFormData({ ...formData, name: normalizarEntradaTexto(event.target.value) })}
                              required
                              placeholder="EX: PEDIATRIA"
                              style={{ textTransform: 'uppercase' }}
                              className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-blue-400 transition-all ${errors.name ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                          </FormField>

                          <FormField label="Ícone" className="md:col-span-6">
                            <div className="grid grid-cols-6 gap-2 h-[180px] overflow-y-auto p-2.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                              {Object.entries(SPECIALTY_ICONS).map(([iconName, IconComp]) => {
                                const isSelected = formData.icon === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, icon: iconName })}
                                    className={cn(
                                      "h-10 w-full rounded-2xl flex items-center justify-center border-2 transition-all cursor-pointer",
                                      isSelected
                                        ? "border-blue-600 bg-blue-50 text-blue-600 shadow-xs"
                                        : "border-slate-200 bg-white hover:bg-slate-100/70 text-slate-500 hover:border-slate-300"
                                    )}
                                    title={iconName}
                                  >
                                    <IconComp className="h-4 w-4" />
                                  </button>
                                );
                              })}
                            </div>
                          </FormField>

                          <FormField label="Cor de Destaque" className="md:col-span-6">
                            <div className="flex flex-col gap-2.5 h-[180px]">
                              <div className="flex items-center gap-2">
                                <input
                                  id="color"
                                  type="color"
                                  value={formData.color}
                                  onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                                  className="w-11 h-11 rounded-2xl border-2 border-slate-200 bg-white p-1 cursor-pointer transition-all shadow-xs shrink-0"
                                  title="Escolher cor personalizada"
                                />
                                <Input
                                  type="text"
                                  value={formData.color}
                                  onChange={(event) => setFormData({ ...formData, color: event.target.value.toUpperCase() })}
                                  maxLength={7}
                                  placeholder="#3B82F6"
                                  className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold font-mono text-slate-800 placeholder:text-slate-400 focus:border-blue-400 flex-1 uppercase"
                                />
                              </div>
                              <div className="grid grid-cols-8 gap-1.5 w-full p-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex-1 items-center content-center">
                                {[
                                  '#3B82F6', '#06B6D4', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6366F1', '#0EA5E9',
                                  '#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E', '#14B8A6', '#D946EF', '#F43F5E',
                                  '#0284C7', '#059669', '#4F46E5', '#BE123C', '#9A3412', '#166534', '#0F766E', '#6B21A8',
                                  '#4338CA', '#0369A1', '#15803D', '#B91C1C', '#C2410C', '#A21CAF', '#6D28D9', '#0F172A',
                                ].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, color: preset })}
                                    className={cn(
                                      "aspect-square w-full rounded-md transition-all hover:scale-115 shadow-2xs border cursor-pointer",
                                      formData.color.toUpperCase() === preset.toUpperCase() ? "ring-2 ring-blue-500 ring-offset-1 border-white scale-110" : "border-slate-200/80"
                                    )}
                                    style={{ backgroundColor: preset }}
                                    title={preset}
                                  />
                                ))}
                              </div>
                            </div>
                          </FormField>
                        </FormGrid>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 px-6 font-semibold"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={!canManageSpecialties} className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700">
                          {editingSpecialtyId ? 'Atualizar' : 'Criar'}
                        </Button>
                      </div>
                    </form>
                  </div>
              </DialogContent>
            </Dialog>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={specialtyColumns}
          rows={filteredSpecialties}
          getRowKey={(specialty) => specialty.id}
          emptyMessage="Nenhuma especialidade encontrada"
          rowClassName={(specialty) => (!specialty.is_active ? 'opacity-60' : '')}
          minWidth="900px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter}
        />

        <div className="hidden">
          {filteredSpecialties.map((specialty) => {
            const IconComp = SPECIALTY_ICONS[specialty.icon] || Palette;
            return (
            <Card key={specialty.id} className={`hover:shadow-lg transition-shadow border-slate-300 ${!specialty.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center border-2"
                    style={{ backgroundColor: `${specialty.color}20`, borderColor: specialty.color }}
                  >
                    <IconComp className="h-5 w-5" style={{ color: specialty.color }} />
                  </div>
                  <CardTitle className="text-lg">{specialty.name}</CardTitle>
                </div>
                <Badge variant={specialty.is_active ? 'default' : 'secondary'} className="border-slate-300">
                  {specialty.is_active ? 'Ativa' : 'Inativa'}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                  {specialty.description}
                </p>
                {canManageSpecialties && (
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSpecialty(specialty)}
                      className="flex-1"
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { void handleToggleActive(specialty.id, specialty.is_active); }}
                      className={!specialty.is_active ? 'text-green-600 hover:text-green-700' : 'text-red-600 hover:text-red-700'}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      </div>
      <ConfirmationDialog />
    </div>
  );
};

export default Specialties;
