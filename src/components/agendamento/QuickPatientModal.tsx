import { useState, useMemo } from 'react';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormGrid } from '@/components/ui/standard-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, MapPin, Heart, ShieldCheck, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { maskCPF, maskPhone, maskCEP, validateEmail } from '@/utils/masks';
import { getOperationalErrorMessage } from '@/lib/errors';
import { PatientOption } from '@/types/appointments';
import { useInstitutionsCatalog } from '@/hooks/useCatalogos';
import { useAuth } from '@/contexts/AuthContext';
import { buildIdempotencyKey } from '@/lib/idempotency';

// Máscara para data DD/MM/AAAA
const maskDate = (value: string) =>
  value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{4})\d+?$/, '$1');

// Converte DD/MM/AAAA → Date ou null
const parseDateBR = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.length !== 10) return null;
  const [day, month, year] = dateStr.split('/');
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  return isNaN(date.getTime()) ? null : date;
};

// Validação simples de CPF (11 dígitos)
const validarCPFSimples = (cpf: string) => cpf.replace(/[^\d]/g, '').length === 11;

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface QuickPatientModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (patient: PatientOption) => void;
  initialSearch?: string;
}

type Etapa = 'pessoal' | 'endereco' | 'clinica' | 'consentimento';

const ETAPAS: { id: Etapa; rotulo: string; icone: React.ElementType }[] = [
  { id: 'pessoal',       rotulo: 'Dados Pessoais',      icone: User },
  { id: 'endereco',      rotulo: 'Endereço',             icone: MapPin },
  { id: 'clinica',       rotulo: 'Informações Clínicas', icone: Heart },
  { id: 'consentimento', rotulo: 'Consentimento',         icone: ShieldCheck },
];

// Formulário inicial vazio
const formInicial = {
  // Seção 1 — Pessoal
  institution_id: '',
  blood_type: 'COMUNIDADE',
  full_name: '',
  cpf: '',
  birth_date: '',
  phone: '',
  email: '',
  gender: '',
  student_class: '',
  // Seção 2 — Endereço
  address: '',
  city: '',
  state: '',
  zip_code: '',
  // Seção 3 — Clínica
  emergency_contact: '',
  emergency_phone: '',
  blood_group: '',
  allergies: '',
  chronic_diseases: '',
  observations: '',
  // Seção 4 — Consentimento
  tcle_accepted: false,
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export function QuickPatientModal({
  isOpen,
  onOpenChange,
  onSuccess,
  initialSearch = '',
}: QuickPatientModalProps) {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [etapaAtual, setEtapaAtual] = useState<Etapa>('pessoal');
  const { data: rawInstitutions = [] } = useInstitutionsCatalog();

  const institutions = useMemo(() => {
    if (!profile?.institution_ids?.length) return rawInstitutions;
    return rawInstitutions.filter(inst => profile.institution_ids!.includes(inst.id));
  }, [rawInstitutions, profile?.institution_ids]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    ...formInicial,
    full_name: initialSearch.toUpperCase(),
    institution_id: profile?.institution_ids?.[0] || '',
  });

  /**
   * Reseta o formulário para o estado inicial.
   */
  const resetar = () => {
    setErrors({});
    setEtapaAtual('pessoal');
    setFormData({
      ...formInicial,
      full_name: initialSearch.toUpperCase(),
      institution_id: profile?.institution_ids?.[0] || '',
    });
  };

  /**
   * Atualiza um campo do formulário e limpa o erro correspondente.
   */
  const atualizar = (campo: string, valor: string | boolean) => {
    setFormData(prev => ({ ...prev, [campo]: valor }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  // ─── Validação por etapa ────────────────────────────────────────────────────

  /**
   * Valida os campos da etapa atual antes de avançar.
   * @param etapa - Etapa a ser validada
   * @returns true se válido, false com erros marcados se inválido
   */
  const validarEtapa = (etapa: Etapa): boolean => {
    const novosErros: Record<string, string> = {};

    if (etapa === 'pessoal') {
      if (!formData.institution_id) novosErros.institution_id = 'Selecione a instituição.';
      if (!formData.full_name || formData.full_name.trim().length < 3)
        novosErros.full_name = 'Informe o nome completo (mínimo 3 caracteres).';
      if (!validarCPFSimples(formData.cpf)) novosErros.cpf = 'CPF inválido (informe os 11 dígitos).';
      const dataParsed = parseDateBR(formData.birth_date);
      if (!formData.birth_date || !dataParsed) novosErros.birth_date = 'Data de nascimento inválida (DD/MM/AAAA).';
      else if (dataParsed > new Date()) novosErros.birth_date = 'A data não pode ser futura.';
      if (!formData.phone || formData.phone.replace(/\D/g, '').length < 10)
        novosErros.phone = 'Informe um telefone com DDD.';
      if (formData.email && !validateEmail(formData.email))
        novosErros.email = 'E-mail inválido.';
      if (!formData.gender) novosErros.gender = 'Selecione o sexo.';
      if (formData.blood_type === 'ALUNO' && !formData.student_class)
        novosErros.student_class = 'Informe a turma do aluno.';
      if (!formData.institution_id)
        novosErros.institution_id = 'Selecione a instituição.';
    }

    if (etapa === 'consentimento') {
      if (!formData.tcle_accepted) novosErros.tcle_accepted = 'O consentimento é obrigatório para prosseguir.';
    }

    if (Object.keys(novosErros).length > 0) {
      setErrors(prev => ({ ...prev, ...novosErros }));
      return false;
    }
    return true;
  };

  // ─── Navegação entre etapas ─────────────────────────────────────────────────

  const indiceAtual = ETAPAS.findIndex(e => e.id === etapaAtual);

  const avancar = () => {
    if (!validarEtapa(etapaAtual)) return;
    const proxima = ETAPAS[indiceAtual + 1];
    if (proxima) setEtapaAtual(proxima.id);
  };

  const voltar = () => {
    const anterior = ETAPAS[indiceAtual - 1];
    if (anterior) setEtapaAtual(anterior.id);
  };

  // ─── Submissão final ─────────────────────────────────────────────────────────

  /**
   * Valida todas as etapas obrigatórias e persiste o novo paciente no banco.
   * Registra evento de auditoria em `system_events` após o cadastro.
   * Finalidade dos dados: identificação, contato e histórico clínico do paciente.
   * Base Legal: Tutela da saúde (Art. 7º, VIII - LGPD)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarEtapa('pessoal')) {
      setEtapaAtual('pessoal');
      return;
    }
    if (!validarEtapa('consentimento')) {
      setEtapaAtual('consentimento');
      return;
    }

    const dataParsed = parseDateBR(formData.birth_date)!;
    setIsSaving(true);
    try {
      const idempotencyKey = await buildIdempotencyKey('quick_cadastro_paciente', {
        cpf: formData.cpf.replace(/\D/g, ''),
        institution_id: formData.institution_id,
        full_name: formData.full_name,
      });

      const { data: upsertData, error } = await chamarApiPost<{ success: boolean, id: string }>('/api/patients/upsert', {
        patient_id: null,
        institution_id: formData.institution_id,
        full_name: formData.full_name.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase() || null,
        phone: formData.phone.replace(/\D/g, '') || null,
        cpf: formData.cpf.replace(/\D/g, ''),
        birth_date: dataParsed.toISOString().split('T')[0],
        gender: formData.gender,
        address: formData.address ? formData.address.toUpperCase() : null,
        city: formData.city ? formData.city.toUpperCase() : null,
        state: formData.state ? formData.state.toUpperCase() : null,
        zip_code: formData.zip_code ? formData.zip_code.replace(/\D/g, '') : null,
        emergency_contact: formData.emergency_contact ? formData.emergency_contact.toUpperCase() : null,
        emergency_phone: formData.emergency_phone ? formData.emergency_phone.replace(/\D/g, '') : null,
        ...(formData.blood_type === 'ALUNO' ? { student_class: formData.student_class ? formData.student_class.toUpperCase() : null } : {}),
        blood_type: formData.blood_type || null,
        allergies: formData.allergies ? formData.allergies.toUpperCase() : null,
        chronic_diseases: formData.chronic_diseases ? formData.chronic_diseases.toUpperCase() : null,
        observations: formData.observations ? formData.observations.toUpperCase() : null,
        is_active: true,
        idempotency_key: idempotencyKey,
        tcle_accepted: formData.tcle_accepted,
      });

      if (error) throw error;
      if (!upsertData?.id) throw new Error('ID do paciente não retornado');

      // Busca o paciente criado para obter o ID e código gerado
      const { data: selectData, error: selectError } = await chamarApiPost<any[]>('/api/table/patients/select', {
        filters: [{ column: 'id', value: upsertData.id }]
      });

      if (selectError) throw selectError;
      if (!selectData || selectData.length === 0) throw new Error('Paciente não encontrado no banco');
      
      const patientRecord = selectData[0];

      // Registra evento de auditoria — sem expor dados pessoais no log
      // Finalidade: rastreabilidade de cadastros originados pelo fluxo de agendamento
      await chamarApiPost('/api/table/system_events/insert', {
        module: 'pacientes',
        action: 'cadastro_expresso',
        event_type: 'create',
        severity: 'info',
        description: `Novo paciente cadastrado via agendamento (código: ${patientRecord.patient_code || patientRecord.id})`,
        payload: {
          patient_id: patientRecord.id,
          patient_code: patientRecord.patient_code,
          institution_id: formData.institution_id,
          perfil: formData.blood_type,
          origem: 'modal_agendamento',
        },
      });

      toast.success('Paciente cadastrado com sucesso!');
      onSuccess(patientRecord as PatientOption);
      onOpenChange(false);
      resetar();
    } catch (error) {
      console.error('[QuickPatientModal] Erro ao salvar paciente:', error);
      toast.error(await getOperationalErrorMessage(error, 'Falha ao cadastrar paciente'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Renderização ─────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) resetar();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl p-0 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
        {/* ── Cabeçalho ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#003B71] to-[#0057a8] px-6 pt-5 pb-4">
          <DialogTitle className="text-xl font-bold text-white tracking-tight">
            Cadastro de Novo Paciente
          </DialogTitle>
          <DialogDescription className="text-blue-200 text-sm font-medium mt-0.5">
            Preencha os dados para cadastrar e agendar imediatamente.
          </DialogDescription>

          {/* Indicador de Progresso */}
          <div className="flex items-center gap-2 mt-4">
            {ETAPAS.map((etapa, idx) => {
              const Icone = etapa.icone;
              const concluida = idx < indiceAtual;
              const ativa = etapa.id === etapaAtual;
              return (
                <div key={etapa.id} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200 ${
                        concluida
                          ? 'bg-emerald-400 border-emerald-300 text-white'
                          : ativa
                          ? 'bg-white border-white text-[#003B71]'
                          : 'bg-white/20 border-white/30 text-white/60'
                      }`}
                    >
                      {concluida ? <Check className="h-4 w-4" /> : <Icone className="h-3.5 w-3.5" />}
                    </div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${
                        ativa ? 'text-white' : concluida ? 'text-emerald-300' : 'text-white/40'
                      }`}
                    >
                      {etapa.rotulo}
                    </span>
                  </div>
                  {idx < ETAPAS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mb-4 rounded-full transition-all duration-300 ${
                        concluida ? 'bg-emerald-400' : 'bg-white/20'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Corpo do Formulário ───────────────────────────────── */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-5 min-h-[340px]">

            {/* ── Etapa 1: Dados Pessoais ─────────────────────── */}
            {etapaAtual === 'pessoal' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <User className="h-4 w-4 text-[#003B71]" />
                  Dados Pessoais e de Contato
                </h3>
                <FormGrid className="gap-4 sm:grid-cols-1 md:grid-cols-12">

                  <FormField label="Instituição" required className="md:col-span-8" error={errors.institution_id}>
                    <Select
                      value={formData.institution_id}
                      onValueChange={(v) => atualizar('institution_id', v)}
                    >
                      <SelectTrigger className={`bg-white border-slate-200 ${errors.institution_id ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Perfil do Usuário" required className="md:col-span-4" error={errors.blood_type}>
                    <Select
                      value={formData.blood_type}
                      onValueChange={(v) => atualizar('blood_type', v)}
                    >
                      <SelectTrigger className={`bg-white border-slate-200 ${errors.blood_type ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALUNO">ALUNO</SelectItem>
                        <SelectItem value="FUNCIONARIO">FUNCIONÁRIO</SelectItem>
                        <SelectItem value="COMUNIDADE">COMUNIDADE</SelectItem>
                        <SelectItem value="PROFESSOR">PROFESSOR</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Nome Completo" required className="md:col-span-8" error={errors.full_name}>
                    <Input
                      placeholder="Nome completo do paciente"
                      value={formData.full_name}
                      onChange={(e) => atualizar('full_name', e.target.value.toUpperCase())}
                      className={`uppercase bg-white border-slate-200 ${errors.full_name ? 'border-red-500' : ''}`}
                      maxLength={200}
                    />
                  </FormField>

                  <FormField label="CPF" required className="md:col-span-4" error={errors.cpf}>
                    <Input
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={(e) => atualizar('cpf', maskCPF(e.target.value))}
                      className={`bg-white border-slate-200 ${errors.cpf ? 'border-red-500' : ''}`}
                      maxLength={14}
                    />
                  </FormField>

                  <FormField label="Data de Nascimento" required className="md:col-span-4" error={errors.birth_date}>
                    <Input
                      placeholder="DD/MM/AAAA"
                      value={formData.birth_date}
                      onChange={(e) => atualizar('birth_date', maskDate(e.target.value))}
                      className={`bg-white border-slate-200 ${errors.birth_date ? 'border-red-500' : ''}`}
                      maxLength={10}
                    />
                  </FormField>

                  <FormField label="Sexo" required className="md:col-span-4" error={errors.gender}>
                    <Select
                      value={formData.gender}
                      onValueChange={(v) => atualizar('gender', v)}
                    >
                      <SelectTrigger className={`bg-white border-slate-200 ${errors.gender ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">MASCULINO</SelectItem>
                        <SelectItem value="F">FEMININO</SelectItem>
                        <SelectItem value="O">OUTRO</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Telefone" required className="md:col-span-4" error={errors.phone}>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={formData.phone}
                      onChange={(e) => atualizar('phone', maskPhone(e.target.value))}
                      className={`bg-white border-slate-200 ${errors.phone ? 'border-red-500' : ''}`}
                      maxLength={15}
                    />
                  </FormField>

                  <FormField label="E-mail" className="md:col-span-8" error={errors.email}>
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={formData.email}
                      onChange={(e) => atualizar('email', e.target.value)}
                      className={`bg-white border-slate-200 ${errors.email ? 'border-red-500' : ''}`}
                      maxLength={200}
                    />
                  </FormField>

                  {formData.blood_type === 'ALUNO' && (
                    <FormField label="Turma do Aluno" className="md:col-span-4" error={errors.student_class}>
                      <Input
                        placeholder="Ex: 2025.1 / ADM-A"
                        value={formData.student_class}
                        onChange={(e) => atualizar('student_class', e.target.value.toUpperCase())}
                        className={`uppercase bg-white border-slate-200 ${errors.student_class ? 'border-red-500' : ''}`}
                        maxLength={50}
                      />
                    </FormField>
                  )}
                </FormGrid>
              </div>
            )}

            {/* ── Etapa 2: Endereço ───────────────────────────── */}
            {etapaAtual === 'endereco' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#003B71]" />
                  Endereço Residencial <span className="font-normal text-slate-400 lowercase normal-case ml-1">(opcional)</span>
                </h3>
                <FormGrid className="gap-4 sm:grid-cols-1 md:grid-cols-12">
                  <FormField label="CEP" className="md:col-span-4" error={errors.zip_code}>
                    <Input
                      placeholder="00000-000"
                      value={formData.zip_code}
                      onChange={(e) => atualizar('zip_code', maskCEP(e.target.value))}
                      className="bg-white border-slate-200"
                      maxLength={9}
                    />
                  </FormField>

                  <FormField label="Logradouro / Endereço" className="md:col-span-8" error={errors.address}>
                    <Input
                      placeholder="Rua, Av., número, complemento"
                      value={formData.address}
                      onChange={(e) => atualizar('address', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200"
                      maxLength={300}
                    />
                  </FormField>

                  <FormField label="Cidade" className="md:col-span-6" error={errors.city}>
                    <Input
                      placeholder="Cidade"
                      value={formData.city}
                      onChange={(e) => atualizar('city', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200"
                      maxLength={100}
                    />
                  </FormField>

                  <FormField label="Estado (UF)" className="md:col-span-3" error={errors.state}>
                    <Select
                      value={formData.state}
                      onValueChange={(v) => atualizar('state', v)}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </FormGrid>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 leading-relaxed">
                  💡 <strong>Dica:</strong> O endereço é opcional, mas auxilia no contato e atendimento domiciliar futuro.
                </div>
              </div>
            )}

            {/* ── Etapa 3: Informações Clínicas ───────────────── */}
            {etapaAtual === 'clinica' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-[#003B71]" />
                  Informações Clínicas <span className="font-normal text-slate-400 lowercase normal-case ml-1">(opcional)</span>
                </h3>
                <FormGrid className="gap-4 sm:grid-cols-1 md:grid-cols-12">

                  <FormField label="Contato de Emergência" className="md:col-span-8" error={errors.emergency_contact}>
                    <Input
                      placeholder="Nome do responsável / parente"
                      value={formData.emergency_contact}
                      onChange={(e) => atualizar('emergency_contact', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200"
                      maxLength={200}
                    />
                  </FormField>

                  <FormField label="Telefone de Emergência" className="md:col-span-4" error={errors.emergency_phone}>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={formData.emergency_phone}
                      onChange={(e) => atualizar('emergency_phone', maskPhone(e.target.value))}
                      className="bg-white border-slate-200"
                      maxLength={15}
                    />
                  </FormField>

                  <FormField label="Tipo Sanguíneo" className="md:col-span-4" error={errors.blood_group}>
                    <Select
                      value={formData.blood_group}
                      onValueChange={(v) => atualizar('blood_group', v)}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Alergias Conhecidas" className="md:col-span-12" error={errors.allergies}>
                    <Textarea
                      placeholder="Ex: Dipirona, Penicilina, frutos do mar..."
                      value={formData.allergies}
                      onChange={(e) => atualizar('allergies', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200 resize-none"
                      rows={2}
                      maxLength={500}
                    />
                  </FormField>

                  <FormField label="Doenças Crônicas / Condições Preexistentes" className="md:col-span-12" error={errors.chronic_diseases}>
                    <Textarea
                      placeholder="Ex: Diabetes tipo 2, hipertensão, asma..."
                      value={formData.chronic_diseases}
                      onChange={(e) => atualizar('chronic_diseases', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200 resize-none"
                      rows={2}
                      maxLength={500}
                    />
                  </FormField>

                  <FormField label="Observações Gerais" className="md:col-span-12" error={errors.observations}>
                    <Textarea
                      placeholder="Informações adicionais relevantes para o atendimento..."
                      value={formData.observations}
                      onChange={(e) => atualizar('observations', e.target.value.toUpperCase())}
                      className="uppercase bg-white border-slate-200 resize-none"
                      rows={2}
                      maxLength={1000}
                    />
                  </FormField>
                </FormGrid>
              </div>
            )}

            {/* ── Etapa 4: Consentimento (LGPD/TCLE) ─────────── */}
            {etapaAtual === 'consentimento' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#003B71]" />
                  Consentimento e Proteção de Dados (LGPD)
                </h3>

                <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-sm text-blue-900 leading-relaxed space-y-2">
                  <p className="font-bold text-[#003B71]">Termo de Consentimento Livre e Esclarecido (TCLE)</p>
                  <p>
                    Os dados pessoais e de saúde coletados neste formulário são utilizados exclusivamente para fins
                    de atendimento médico, agendamento de consultas e comunicação com o paciente, conforme o
                    Art. 7º, VIII da <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong> — tutela da saúde.
                  </p>
                  <p>
                    O paciente tem direito ao acesso, correção, portabilidade e exclusão de seus dados,
                    podendo exercer esses direitos a qualquer momento junto ao responsável pela instituição.
                  </p>
                  <p className="font-semibold text-blue-800">
                    Ao marcar a opção abaixo, o paciente declara que foi informado sobre o uso de seus dados.
                  </p>
                </div>

                <label
                  htmlFor="tcle-check"
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    formData.tcle_accepted
                      ? 'border-emerald-400 bg-emerald-50'
                      : errors.tcle_accepted
                      ? 'border-red-400 bg-red-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    id="tcle-check"
                    type="checkbox"
                    checked={formData.tcle_accepted}
                    onChange={(e) => atualizar('tcle_accepted', e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-emerald-600 shrink-0 cursor-pointer"
                  />
                  <div>
                    <p className="font-bold text-slate-800 text-sm">
                      Confirmo que o paciente foi informado e consente com a coleta e uso dos seus dados pessoais de saúde.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Este consentimento ficará registrado com data e hora para fins de rastreabilidade.
                    </p>
                  </div>
                </label>

                {errors.tcle_accepted && (
                  <p className="text-xs text-red-600 font-medium">{errors.tcle_accepted}</p>
                )}

                {formData.tcle_accepted && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    Consentimento confirmado em {new Date().toLocaleString('pt-BR')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Rodapé com Navegação ─────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <Button
              type="button"
              variant="outline"
              className="px-5 rounded-lg text-slate-700 font-semibold border-slate-300 hover:bg-slate-100"
              onClick={() => {
                if (indiceAtual === 0) {
                  resetar();
                  onOpenChange(false);
                } else {
                  voltar();
                }
              }}
              disabled={isSaving}
            >
              {indiceAtual === 0 ? (
                'Cancelar'
              ) : (
                <span className="flex items-center gap-1.5">
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </span>
              )}
            </Button>

            <div className="flex items-center gap-1.5">
              {ETAPAS.map((_, idx) => (
                <div
                  key={idx}
                  className={`rounded-full transition-all duration-200 ${
                    idx === indiceAtual
                      ? 'h-2 w-6 bg-[#003B71]'
                      : idx < indiceAtual
                      ? 'h-2 w-2 bg-emerald-400'
                      : 'h-2 w-2 bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {indiceAtual < ETAPAS.length - 1 ? (
              <Button
                type="button"
                className="px-6 rounded-lg bg-[#003B71] hover:bg-[#002a54] text-white font-bold shadow-md"
                onClick={avancar}
                disabled={isSaving}
              >
                <span className="flex items-center gap-1.5">
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Button>
            ) : (
              <Button
                type="submit"
                className="px-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isSaving ? 'Cadastrando...' : 'Cadastrar e Selecionar'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
