import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import type { useAccessControl } from '../useAccessControl';
import { normalizarEntradaTexto } from '@/utils/formatters';
import { toast } from 'sonner';

const DEFAULT_PROFESSIONAL_COUNCIL = 'CRM';

const PROFESSIONAL_COUNCIL_OPTIONS = [
  { value: 'CRM', label: 'CRM - Medicina' },
  { value: 'CRO', label: 'CRO - Odontologia' },
  { value: 'COREN', label: 'COREN - Enfermagem' },
  { value: 'CREFITO', label: 'CREFITO - Fisioterapia/Terapia Ocupacional' },
  { value: 'CRP', label: 'CRP - Psicologia' },
  { value: 'CRF', label: 'CRF - Farmácia' },
  { value: 'CRN', label: 'CRN - Nutrição' },
  { value: 'CRESS', label: 'CRESS - Serviço Social' },
  { value: 'CREFONO', label: 'CREFONO - Fonoaudiologia' },
  { value: 'OUTRO', label: 'Outro Conselho Profissional' },
];

type CreateUserModalProps = {
  accessControl: ReturnType<typeof useAccessControl>;
};

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ accessControl }) => {
  const {
    createUserOpen, setCreateUserOpen,
    snapshot, userForm, setUserForm,
    assignableRoles, specialties,
    isGlobalStructuralRole, isDoctorRole,
    createUser, saving
  } = accessControl;

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const activeInstitutions = snapshot.institutions.filter(inst => inst.is_active);

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let generated = '';
    for (let i = 0; i < 10; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setUserForm((curr: any) => ({ ...curr, password: generated }));
    setErrors(prev => { const next = { ...prev }; delete next.password; return next; });
    toast.success('Senha temporária gerada com sucesso!');
  };

  const isDoctor = isDoctorRole(userForm.role_key);
  const requiresInstitution = Boolean(userForm.role_key && !isGlobalStructuralRole(userForm.role_key) && !isDoctor);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!userForm.full_name?.trim()) {
      newErrors.full_name = 'Nome completo é obrigatório.';
    }
    if (!userForm.email?.trim() || !userForm.email.includes('@')) {
      newErrors.email = 'Informe um e-mail válido para acesso.';
    }
    if (!userForm.role_key) {
      newErrors.role_key = 'Selecione o perfil do usuário.';
    }
    if (requiresInstitution && (!userForm.institution_ids || userForm.institution_ids.length === 0)) {
      newErrors.institution_ids = 'Selecione ao menos uma instituição.';
    }
    if (!userForm.password || userForm.password.length < 8) {
      newErrors.password = 'A senha temporária deve conter no mínimo 8 caracteres.';
    }
    if (isDoctor) {
      if (!userForm.professional_registration?.trim()) {
        newErrors.professional_registration = 'Informe o número do registro profissional.';
      }
      if (!userForm.specialty_id) {
        newErrors.specialty_id = 'Selecione a especialidade principal.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    await createUser(e);
  };

  return (
    <Dialog open={createUserOpen} onOpenChange={(open) => {
      setCreateUserOpen(open);
      if (open) {
        setErrors({});
        setUserForm({
          full_name: '',
          email: '',
          password: '',
          phone: '',
          role_key: '',
          primary_institution_id: '',
          institution_ids: [],
          professional_council: DEFAULT_PROFESSIONAL_COUNCIL,
          professional_registration: '',
          specialty_id: '',
        });
      }
    }}>
      <DialogContent className="max-w-2xl p-7 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col space-y-1">
            <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">Novo Usuário</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs font-medium">
              Preencha os dados essenciais de acesso para cadastrar o usuário no sistema.
            </DialogDescription>
          </div>
          
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-6">
            
            {/* SEÇÃO 1: CREDENCIAIS E DADOS DE ACESSO */}
            <div className="space-y-4">
              <h3 className="text-blue-600 font-bold uppercase text-[13px] tracking-wider border-b border-slate-100 pb-1.5">
                DADOS DE ACESSO
              </h3>
              
              <div className="grid grid-cols-12 gap-4">
                {/* Nome Completo (12 colunas) */}
                <div className="col-span-12 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                    Nome Completo <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <Input
                    value={userForm.full_name}
                    onChange={(event) => {
                      setUserForm({ ...userForm, full_name: event.target.value.toUpperCase() });
                      setErrors(prev => { const next = { ...prev }; delete next.full_name; return next; });
                    }}
                    onBlur={(event) => {
                      const normalizado = normalizarEntradaTexto(event.target.value);
                      setUserForm({ ...userForm, full_name: normalizado });
                    }}
                    required
                    placeholder="EX: JOAO DA SILVA"
                    style={{ textTransform: 'uppercase' }}
                    className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-blue-400 ${errors.full_name ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.full_name && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.full_name}</span>}
                </div>

                {/* E-mail de Login (12 colunas) */}
                <div className="col-span-12 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                    E-mail (Login de Acesso) <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <Input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => {
                      setUserForm({ ...userForm, email: e.target.value.trim().toLowerCase() });
                      setErrors(prev => { const next = { ...prev }; delete next.email; return next; });
                    }}
                    required
                    placeholder="usuario@dominio.com"
                    className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-blue-400 ${errors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.email && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.email}</span>}
                </div>

                {/* Perfil Operacional (6 colunas) */}
                <div className="col-span-12 sm:col-span-6 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                    Perfil do Usuário <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <Select
                    value={userForm.role_key || undefined}
                    onValueChange={(role_key) => {
                      setUserForm((current: any) => ({
                        ...current,
                        role_key,
                        primary_institution_id: isGlobalStructuralRole(role_key) || isDoctorRole(role_key) ? '' : current.primary_institution_id,
                        institution_ids: isGlobalStructuralRole(role_key) || isDoctorRole(role_key) ? [] : (current.primary_institution_id ? [current.primary_institution_id] : []),
                        professional_council: current.professional_council || DEFAULT_PROFESSIONAL_COUNCIL,
                        specialty_id: current.specialty_id || '',
                      }));
                      setErrors(prev => { const next = { ...prev }; delete next.role_key; return next; });
                    }}
                  >
                    <SelectTrigger className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 focus:border-blue-400 ${errors.role_key ? 'border-red-500 focus:ring-red-500' : ''}`}>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role: any) => (
                        <SelectItem key={role.id} value={role.key}>{role.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.role_key && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.role_key}</span>}
                </div>

                {/* Instituições Vinculadas (6 colunas - Condicional para operadores/recepção) */}
                <div className="col-span-12 sm:col-span-6 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                    Instituições Vinculadas {requiresInstitution && <span className="text-red-500 font-bold ml-1">*</span>}
                  </label>
                  {!requiresInstitution ? (
                    <Select disabled value="">
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus:border-blue-400 disabled:opacity-60">
                        <SelectValue placeholder={isDoctor ? "Sem vínculo institucional direto. Opera de forma global" : "Acesso amplo / global"} />
                      </SelectTrigger>
                    </Select>
                  ) : (
                    <MultiSelect
                      options={activeInstitutions.map((inst) => ({ label: inst.name, value: inst.id }))}
                      selected={userForm.institution_ids || []}
                      onChange={(institution_ids) => {
                        setUserForm((current: any) => ({
                          ...current,
                          institution_ids,
                          primary_institution_id: institution_ids.length > 0 ? institution_ids[0] : ''
                        }));
                        setErrors(prev => { const next = { ...prev }; delete next.institution_ids; return next; });
                      }}
                      placeholder="Selecione as instituições..."
                      emptyMessage="Nenhuma instituição encontrada."
                      className={`rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 focus:border-blue-400 ${errors.institution_ids ? 'border-red-500' : ''}`}
                    />
                  )}
                  {errors.institution_ids && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.institution_ids}</span>}
                  {requiresInstitution && (
                    <p className="text-[10px] text-slate-400 font-medium leading-tight pt-0.5">
                      O usuário visualizará e cadastrará apenas consultas e pacientes vinculados às instituições selecionadas. A primeira selecionada será a instituição base.
                    </p>
                  )}
                </div>

                {/* Senha Temporária (12 colunas) */}
                <div className="col-span-12 space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                      Senha Temporária <span className="text-red-500 font-bold ml-1">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Gerar senha forte
                    </button>
                  </div>
                  <PasswordInput
                    value={userForm.password}
                    onChange={(event) => {
                      setUserForm({ ...userForm, password: event.target.value });
                      setErrors(prev => { const next = { ...prev }; delete next.password; return next; });
                    }}
                    minLength={8}
                    required
                    placeholder="Mínimo 8 caracteres..."
                    className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold focus:border-blue-400 ${errors.password ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {errors.password && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.password}</span>}
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: DADOS CLÍNICOS / PROFISSIONAIS (CONDICIONAL PARA MÉDICOS) */}
            {isDoctor && (
              <div className="space-y-4">
                <h3 className="text-blue-600 font-bold uppercase text-[13px] tracking-wider border-b border-slate-100 pb-1.5">
                  DADOS PROFISSIONAIS / CLÍNICOS
                </h3>
                
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                      Conselho Profissional <span className="text-red-500 font-bold ml-1">*</span>
                    </label>
                    <Select
                      value={userForm.professional_council}
                      onValueChange={(professional_council) => setUserForm((current: any) => ({ ...current, professional_council }))}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold focus:border-blue-400">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROFESSIONAL_COUNCIL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                      Nº Registro Profissional <span className="text-red-500 font-bold ml-1">*</span>
                    </label>
                    <Input
                      value={userForm.professional_registration}
                      onChange={(event) => {
                        setUserForm((current: any) => ({ ...current, professional_registration: event.target.value }));
                        setErrors(prev => { const next = { ...prev }; delete next.professional_registration; return next; });
                      }}
                      required={isDoctor}
                      placeholder="Ex: 123456"
                      className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-blue-400 uppercase ${errors.professional_registration ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    />
                    {errors.professional_registration && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.professional_registration}</span>}
                  </div>
                  
                  <div className="col-span-12 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                      Especialidade Principal <span className="text-red-500 font-bold ml-1">*</span>
                    </label>
                    <Select
                      value={userForm.specialty_id}
                      onValueChange={(specialty_id) => {
                        setUserForm((current: any) => ({ ...current, specialty_id }));
                        setErrors(prev => { const next = { ...prev }; delete next.specialty_id; return next; });
                      }}
                    >
                      <SelectTrigger className={`h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold focus:border-blue-400 ${errors.specialty_id ? 'border-red-500 focus:ring-red-500' : ''}`}>
                        <SelectValue placeholder="Selecione a especialidade..." />
                      </SelectTrigger>
                      <SelectContent>
                        {specialties.map((specialty: any) => (
                          <SelectItem key={specialty.id} value={specialty.id}>{specialty.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.specialty_id && <span className="text-red-500 text-xs font-semibold mt-1 block">{errors.specialty_id}</span>}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="px-6 h-10 rounded-2xl text-slate-700 text-xs font-bold border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                onClick={() => setCreateUserOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="px-8 h-10 rounded-2xl bg-[#003B71] hover:bg-[#002B55] text-white text-xs font-bold shadow-md shadow-blue-950/15 transition-all cursor-pointer"
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Usuário
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
