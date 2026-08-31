"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { specialtyService, Specialty } from '@/servicos/specialties';
import { doctorService, Doctor } from '@/servicos/doctors';
import { cn } from '@/lib/utils';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
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
import { getAvatarColor, getInitials, normalizarEntradaTexto } from '@/utils/formatters';
import { useConfirm } from '@/hooks/useConfirm';

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
  const { hasRole } = useAuth();
  const { confirm, ConfirmationDialog } = useConfirm();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctorsCatalog, setDoctorsCatalog] = useState<Doctor[]>([]);
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

  const canManageSpecialties = hasRole(['admin', 'root']);

  const fetchSpecialties = useCallback(async () => {
    try {
      setLoading(true);
      const [specs, docs] = await Promise.all([
        specialtyService.list(true),
        doctorService.list({ showAll: true }),
      ]);
      setSpecialties(specs || []);
      setDoctorsCatalog(docs || []);
    } catch (error) {
      console.error('Erro ao buscar especialidades/profissionais:', error);
      toast.error('Erro ao carregar especialidades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpecialties();
  }, [fetchSpecialties]);

  const handleEditSpecialty = useCallback((specialty: Specialty) => {
    setEditingSpecialtyId(specialty.id);
    setErrors({});
    setFormData({
      name: specialty.name,
      description: specialty.description || '',
      icon: specialty.icon || 'stethoscope',
      color: specialty.color || '#3B82F6',
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
      if (editingSpecialtyId) {
        await specialtyService.update(editingSpecialtyId, {
          name: formData.name.trim().toUpperCase(),
          description: formData.description || null,
          icon: formData.icon || null,
          color: formData.color || null,
        });
        toast.success('Especialidade atualizada com sucesso!');
      } else {
        await specialtyService.create({
          name: formData.name.trim().toUpperCase(),
          description: formData.description || null,
          icon: formData.icon || null,
          color: formData.color || null,
        });
        toast.success('Especialidade criada com sucesso!');
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchSpecialties();
    } catch (error: any) {
      console.error('Erro ao salvar especialidade:', error);
      toast.error(error.message || 'Erro ao salvar especialidade');
    }
  };

  const handleToggleActive = useCallback(async (id: string, isActive: number | boolean) => {
    const activeBool = Boolean(isActive);
    const confirmed = await confirm(
      activeBool
        ? 'Confirmar desativação desta especialidade?'
        : 'Confirmar ativação desta especialidade?',
    );

    if (!confirmed) return;

    try {
      await specialtyService.update(id, { is_active: !activeBool });
      setSpecialties((current) =>
        current.map((s) => (s.id === id ? { ...s, is_active: !activeBool } : s))
      );
      toast.success(activeBool ? 'Especialidade desativada' : 'Especialidade ativada');
    } catch (error: any) {
      console.error('Erro ao alterar status:', error);
      toast.error(error.message || 'Erro ao alterar status');
    }
  }, [confirm]);

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
    const matchesSearch = specialty.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    const isAct = Boolean(specialty.is_active);
    if (statusFilter === 'ativos') return isAct;
    if (statusFilter === 'inativos') return !isAct;
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
        const IconComp = SPECIALTY_ICONS[specialty.icon || ''] || Palette;
        const isAct = Boolean(specialty.is_active);
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
              <p className={`text-[11px] font-semibold ${isAct ? 'text-green-700' : 'text-red-700'}`}>{isAct ? 'Ativa' : 'Inativa'}</p>
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
                const initials = getInitials(doc.name);
                const colorClass = getAvatarColor(doc.name);
                return (
                  <div
                    key={doc.id || idx}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black border-2 border-white shadow-sm shrink-0 ring-1 ring-slate-200/50 ${colorClass}`}
                    title={doc.name}
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
              danger={Boolean(specialty.is_active)} 
            />
          </div>
        ) : null
      ),
    },
  ], [canManageSpecialties, handleEditSpecialty, handleToggleActive, doctorsCatalog]);

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
      </div>
      <ConfirmationDialog />
    </div>
  );
};

export default Specialties;
