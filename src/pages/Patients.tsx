"use client";

import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar, ChevronDown, Download, Edit2, FileText, Loader2, Mail, Phone, Plus, Power, Search, UserPlus, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, AlertTriangle, XCircle, ShieldCheck, Trash2, CalendarPlus, Info as InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePatients } from '@/hooks/usePatients';
import { chamarApiPost } from '@/lib/workerApi';

import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { ActionButton } from '@/components/ui/action-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PatientHistoryDrawer } from '@/components/PatientHistoryDrawer';

import { formatEmail, getAvatarColor, getInitials, isSuspiciousData, normalizarEntradaTexto, validarNomeCompleto } from '@/utils/formatters';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { useConfirm } from '@/hooks/useConfirm';
import { getOperationalErrorMessage, getErrorMessage } from '@/lib/errors';
import { formatOperationalDateTime } from '@/lib/operationalDateTime';
import { maskCPF, maskPhone, maskCEP, unmaskPhone, unmaskCPF, validateCPF, validateEmail, validatePhone, censorCPF } from '@/utils/masks';
import { extrairIntencaoNavegacao } from '@/lib/intencaoNavegacao';

// Finalidade: Identificação unívoca, contato e histórico clínico do paciente.
// Base Legal: Tutela da saúde (Art. 7º, VIII - LGPD)
interface Patient {
  id: string;
  user_id?: string | null;
  institution_id?: string | null;
  institution_name?: string | null;
  cpf: string;
  birth_date: string;
  gender: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_diseases: string | null;
  observations: string | null;
  is_active: boolean;
  full_name: string;
  email: string | null;
  phone: string | null;
  age?: number;
  has_pending_appointment?: boolean;
  pending_appointment_id?: string | null;
  pending_appointment_date?: string | null;
  pending_appointment_status?: string | null;
  pending_specialty_name?: string | null;
  pending_doctor_name?: string | null;
  tcle_accepted_at?: string | null;
  is_duplicate_cpf?: boolean;
  is_duplicate_phone?: boolean;
  is_duplicate_name_diff_cpf?: boolean;
  all_pending_appointments?: any[];
  student_class?: string | null;
}

interface InstitutionOption {
  id: string;
  name: string;
}

const emptyForm = {
  institution_id: '',
  full_name: '',
  email: '',
  phone: '',
  cpf: '',
  birth_date: '',
  gender: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  emergency_contact: '',
  emergency_phone: '',
  blood_type: '',
  allergies: '',
  chronic_diseases: '',
  observations: '',
  tcle_accepted: false,
  student_class: '',
};

import { useInstitutionsCatalog } from '@/hooks/useCatalogos';

const Patients = () => {
  const queryClient = useQueryClient();
  const { hasPermission, institutionId, profile, userRole, user, isRoot } = useAuth();
  const isRootSuperadmin = isRoot;
  const { confirm, ConfirmationDialog } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: rawInstitutions = [] } = useInstitutionsCatalog();
  const institutions = useMemo(() => {
    return rawInstitutions as InstitutionOption[];
  }, [rawInstitutions]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { data: patients = [], isLoading: loading, refetch: loadPatients } = usePatients(searchTerm);
  const [formData, setFormData] = useState(emptyForm);

  const [statusFilter, setStatusFilter] = useState('ativos');
  const [warningTypeFilter, setWarningTypeFilter] = useState('all');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ field: 'name' | 'birth_date' | 'institution' | 'profile'; direction: 'asc' | 'desc' } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [existingPatientCpfMatch, setExistingPatientCpfMatch] = useState<{ id: string; full_name: string } | null>(null);
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);
  const [isClinicalExpanded, setIsClinicalExpanded] = useState(false);

  // Estado para modal de exclusão definitiva (Root)
  const [pacienteParaExcluirRaiz, setPacienteParaExcluirRaiz] = useState<Patient | null>(null);
  const [textoConfirmacaoExclusao, setTextoConfirmacaoExclusao] = useState('');
  const [excluindoPacienteRaiz, setExcluindoPacienteRaiz] = useState(false);

  /**
   * Executa a exclusão definitiva do paciente e todo seu histórico no banco de dados (Apenas Superadmin Root).
   */
  const executarExclusaoDefinitivaPaciente = async () => {
    if (!pacienteParaExcluirRaiz) return;
    if (textoConfirmacaoExclusao.trim().toUpperCase() !== 'EXCLUIR') {
      toast.error('Por favor, digite a palavra EXCLUIR para confirmar.');
      return;
    }

    setExcluindoPacienteRaiz(true);
    try {
      const { data, error } = await chamarApiPost('/api/patients/excluir_raiz', {
        paciente_id: pacienteParaExcluirRaiz.id,
        chave_idempotencia: crypto.randomUUID(),
      });

      if (error) throw new Error(error);

      const res = data as { sucesso?: boolean; mensagem?: string };
      if (res?.sucesso) {
        toast.success(res.mensagem || 'Paciente, relatórios e todo o seu histórico foram permanentemente excluídos.');
        setPacienteParaExcluirRaiz(null);
        setTextoConfirmacaoExclusao('');
        await queryClient.invalidateQueries();
        await loadPatients();
      } else {
        throw new Error(res?.mensagem || 'Falha ao excluir o paciente.');
      }
    } catch (err: any) {
      console.error('Erro ao executar exclusão definitiva de paciente pelo root:', err);
      toast.error(getErrorMessage(err, 'Erro ao tentar excluir permanentemente o paciente.'));
    } finally {
      setExcluindoPacienteRaiz(false);
    }
  };

  useEffect(() => {
    const cleanCpf = unmaskCPF(formData.cpf);
    if (cleanCpf.length !== 11 || !validateCPF(formData.cpf) || editingPatientId) {
      setExistingPatientCpfMatch(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setCheckingCpf(true);
      try {
        const { data, error } = await chamarApiPost<Array<{id: string, full_name: string, cpf: string}>>('/api/patients/check_cpf', {
          cpf: cleanCpf
        });

        if (!error && data && data.length > 0 && isMounted) {
          setExistingPatientCpfMatch({ id: data[0].id, full_name: data[0].full_name });
        } else if (isMounted) {
          setExistingPatientCpfMatch(null);
        }
      } catch {
        // Ignora erro de checagem
      } finally {
        if (isMounted) setCheckingCpf(false);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [formData.cpf, editingPatientId]);
  
  const [historyPatientIds, setHistoryPatientIds] = useState<string[]>([]);
  const [historyPatientName, setHistoryPatientName] = useState<string>('');
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const isReception = profile?.role === 'recepcao' || userRole === 'recepcao';
  const defaultUserInstitutionId = profile?.institution_id || institutionId || '';

  const defaultFormInstitution = useMemo(() => {
    if (defaultUserInstitutionId) return defaultUserInstitutionId;
    if (isReception && institutions.length > 0) return institutions[0].id;
    if (institutions.length === 1) return institutions[0].id;
    return '';
  }, [defaultUserInstitutionId, isReception, institutions]);

  const canReadPatients = hasPermission('patients', 'read', institutionId) || hasPermission('patients', 'update', institutionId);
  const canManagePatients =
    hasPermission('patients', 'create', institutionId) ||
    hasPermission('patients', 'update', institutionId) ||
    hasPermission('patients', 'manage', institutionId);

  const canDeletePatients = !isReception && (
    hasPermission('patients', 'delete', institutionId) ||
    hasPermission('patients', 'manage', institutionId) ||
    userRole === 'admin' ||
    userRole === 'superadmin'
  );

  const institutionOptions = useMemo(() => {
    return institutions.map((inst) => ({
      value: inst.id,
      label: inst.name,
    }));
  }, [institutions]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (isDialogOpen && !editingPatientId && !formData.institution_id && defaultFormInstitution) {
      setFormData((prev) => ({ ...prev, institution_id: defaultFormInstitution }));
    }
  }, [isDialogOpen, editingPatientId, formData.institution_id, defaultFormInstitution]);

  // Processa intenções de navegação vindas de outras páginas (React Router state — memória pura)
  useEffect(() => {
    const intencao = extrairIntencaoNavegacao(location.state);
    if (!intencao) return;
    // Limpa o state imediatamente preservando query params (ex: ?r= do Vite HMR)
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    if (intencao.abrirNovoPaciente && canManagePatients) {
      resetForm();
      setIsDialogOpen(true);
    } else if (intencao.buscarPaciente) {
      setSearchInput(intencao.buscarPaciente);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, canManagePatients]);

  const resetForm = useCallback(() => {
    setEditingPatientId(null);
    setFormData({ ...emptyForm, institution_id: defaultFormInstitution });
  }, [defaultFormInstitution]);

  const handleEditPatient = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setFormData({
      institution_id: patient.institution_id || institutionId || '',
      full_name: (patient.full_name || '').toUpperCase(),
      email: patient.email === '-' ? '' : (patient.email || '').toLowerCase(),
      phone: patient.phone === '-' ? '' : maskPhone(patient.phone || ''),
      cpf: maskCPF(patient.cpf || ''),
      birth_date: patient.birth_date ? patient.birth_date : '',
      gender: patient.gender,
      address: (patient.address || '').toUpperCase(),
      city: (patient.city || '').toUpperCase(),
      state: (patient.state || '').toUpperCase(),
      zip_code: patient.zip_code ? maskCEP(patient.zip_code) : '',
      emergency_contact: (patient.emergency_contact || '').toUpperCase(),
      emergency_phone: patient.emergency_phone ? maskPhone(patient.emergency_phone) : '',
      blood_type: patient.blood_type || '',
      allergies: (patient.allergies || '').toUpperCase(),
      chronic_diseases: (patient.chronic_diseases || '').toUpperCase(),
      observations: (patient.observations || '').toUpperCase(),
      tcle_accepted: patient.tcle_accepted_at ? true : false,
      student_class: patient.student_class || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmitPatient = async (event: React.FormEvent) => {
    event.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) newErrors.full_name = 'Nome completo é obrigatório.';
    else if (!validarNomeCompleto(normalizarEntradaTexto(formData.full_name))) newErrors.full_name = 'Informe o nome completo sem abreviações (nome e sobrenome).';

    if (!formData.institution_id) newErrors.institution_id = 'Selecione a instituição.';

    if (!validateCPF(formData.cpf)) newErrors.cpf = 'CPF inválido.';
    else if (existingPatientCpfMatch && !editingPatientId) {
      newErrors.cpf = `Este CPF já pertence ao paciente "${existingPatientCpfMatch.full_name}".`;
    } else {
      const cleanCpf = unmaskCPF(formData.cpf);
      if (patients.find(p => p.cpf === cleanCpf && p.id !== editingPatientId)) {
        newErrors.cpf = 'Este CPF já está cadastrado!';
      }
    }

    if (formData.email && !validateEmail(formData.email)) newErrors.email = 'E-mail inválido.';
    if (!formData.phone || !validatePhone(unmaskPhone(formData.phone))) newErrors.phone = 'Telefone principal inválido.';
    if (formData.emergency_phone && !validatePhone(unmaskPhone(formData.emergency_phone))) newErrors.emergency_phone = 'Telefone de emergência inválido.';
    if (!formData.gender) newErrors.gender = 'Sexo obrigatório.';
    if (!formData.blood_type) newErrors.blood_type = 'Perfil obrigatório.';
    
    if (!formData.birth_date) newErrors.birth_date = 'Data obrigatória.';
    else {
      const parsedBirthDate = new Date(`${formData.birth_date}T12:00:00Z`);
      if (isNaN(parsedBirthDate.getTime())) newErrors.birth_date = 'Data inválida.';
      else if (parsedBirthDate > new Date()) newErrors.birth_date = 'Não pode ser futura.';
      else if (parsedBirthDate.getFullYear() < 1900) newErrors.birth_date = 'Anterior a 1900.';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error('Corrija os campos marcados de vermelho.');
      return;
    }

    const parsedBirthDate = new Date(`${formData.birth_date}T12:00:00Z`);
    setIsSaving(true);
    try {
      const payload = {
        // Campos textuais sempre em maiúsculo, exceto e-mail (protocolo exige lowercase)
        full_name: formData.full_name?.trim().toUpperCase() || '',
        email: formData.email?.trim().toLowerCase() || null,
        phone: formData.phone ? unmaskPhone(formData.phone) : null,
        cpf: unmaskCPF(formData.cpf || ''),
        birth_date: format(parsedBirthDate, 'yyyy-MM-dd'),
        gender: formData.gender,
        address: formData.address ? formData.address.toUpperCase() : null,
        city: formData.city ? formData.city.toUpperCase() : null,
        state: formData.state ? formData.state.toUpperCase() : null,
        zip_code: formData.zip_code ? formData.zip_code.replace(/\D/g, '') : null,
        emergency_contact: formData.emergency_contact ? formData.emergency_contact.toUpperCase() : null,
        emergency_phone: formData.emergency_phone ? unmaskPhone(formData.emergency_phone) : null,
        ...(formData.blood_type === 'ALUNO' ? { student_class: formData.student_class ? formData.student_class.toUpperCase() : null } : {}),
        blood_type: formData.blood_type || null,
        allergies: formData.allergies ? formData.allergies.toUpperCase() : null,
        chronic_diseases: formData.chronic_diseases ? formData.chronic_diseases.toUpperCase() : null,
        observations: formData.observations ? formData.observations.toUpperCase() : null,
      };

      const { data: existingPatients, error: checkError } = await chamarApiPost<Array<{id: string}>>('/api/patients/check_cpf', {
        cpf: payload.cpf
      });

      if (checkError) throw new Error(checkError);
      const existingPatient = existingPatients && existingPatients.length > 0 ? existingPatients[0] : null;

      if (existingPatient && existingPatient.id !== editingPatientId) {
        toast.error('Já existe um paciente cadastrado com este CPF no sistema.');
        return;
      }

      const p_idempotency_key = await buildIdempotencyKey('upsert_patient', {
        patient_id: editingPatientId,
        institution_id: formData.institution_id || institutionId,
        ...payload,
      });

      const { error } = await chamarApiPost('/api/patients/upsert', {
        patient_id: editingPatientId,
        institution_id: formData.institution_id || institutionId,
        ...payload,
        is_active: true,
        idempotency_key: p_idempotency_key,
        tcle_accepted: true,
      });

      if (error) throw new Error(error);
      toast.success(editingPatientId ? 'Paciente atualizado com sucesso!' : 'Paciente cadastrado com sucesso!');
      setIsDialogOpen(false);
      resetForm();
      void loadPatients();
    } catch (error) {
      console.error('Erro ao salvar paciente:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao salvar dados'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePatientActive = async (id: string, isActive: boolean) => {
    // Para ativação, usa confirm normal. Para inativação, usa toast com desfazer
    if (!isActive) {
      const confirmed = await confirm('Tem certeza que deseja ativar este paciente?');
      if (!confirmed) return;
    }

    try {
      const p_idempotency_key = await buildIdempotencyKey('set_patient_active', { patient_id: id, is_active: !isActive });
      const { error } = await chamarApiPost('/api/patients/set_active', {
        patient_id: id,
        is_active: !isActive,
        idempotency_key: p_idempotency_key,
      });

      if (error) throw new Error(error);

      if (isActive) {
        // Inativação: toast com botão de desfazer por 6 segundos
        let desfeito = false;
        toast.warning('Paciente inativado.', {
          duration: 6000,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              desfeito = true;
              const chave = await buildIdempotencyKey('set_patient_active', { patient_id: id, is_active: true });
              await chamarApiPost('/api/patients/set_active', { patient_id: id, is_active: true, idempotency_key: chave });
              toast.success('Inativação desfeita.');
              void loadPatients();
            },
          },
          onDismiss: () => { if (!desfeito) void loadPatients(); },
          onAutoClose: () => { if (!desfeito) void loadPatients(); },
        });
      } else {
        toast.success('Paciente ativado com sucesso.');
        void loadPatients();
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao alterar status do paciente'));
    }
  };

  const [cepSuccess, setCepSuccess] = useState(false);

  const fetchAddressByCEP = async (cep: string) => {
    setIsSearchingCep(true);
    setCepSuccess(false);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
      if (!response.ok) return;
      const data = await response.json();
      setFormData(prev => ({
        ...prev,
        address: normalizarEntradaTexto([data.street, data.neighborhood].filter(Boolean).join(' - ')) || prev.address,
        city: normalizarEntradaTexto(data.city) || prev.city,
        state: data.state ? data.state.toUpperCase() : prev.state,
      }));
      setCepSuccess(true);
      setTimeout(() => setCepSuccess(false), 3000); // Remove o check verde após 3 segundos
    } catch {
      // Ignora erro silenciosamente
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleInputBlur = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    if (name === 'full_name' || name === 'emergency_contact') {
      const normalizado = normalizarEntradaTexto(value);
      setFormData(prev => ({ ...prev, [name]: normalizado }));
      // Valida nomes completos (sem abreviações) ao sair do campo
      if (name === 'full_name' && normalizado && !validarNomeCompleto(normalizado)) {
        setErrors(prev => ({ ...prev, full_name: 'Informe o nome completo sem abreviações.' }));
      }
      if (name === 'emergency_contact' && normalizado && !validarNomeCompleto(normalizado)) {
        setErrors(prev => ({ ...prev, emergency_contact: 'Informe o nome completo sem abreviações.' }));
      }
    } else if (name === 'city' || name === 'address' || name === 'state') {
      // Endereço, cidade e UF também em maiúsculas sem acentos
      setFormData(prev => ({ ...prev, [name]: normalizarEntradaTexto(value) }));
    } else if (name === 'email') {
      setFormData(prev => ({ ...prev, [name]: formatEmail(value) }));
    } else if (name === 'allergies' || name === 'chronic_diseases' || name === 'observations') {
      setFormData(prev => ({ ...prev, [name]: normalizarEntradaTexto(value) }));
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    
    // Limpa o erro do campo atual que está sendo modificado
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

    if (name === 'cpf') {
      const maskedCpf = maskCPF(value);
      setFormData({ ...formData, [name]: maskedCpf });
      
      const cleanCpf = unmaskCPF(maskedCpf);
      if (cleanCpf.length === 11) {
        const existe = patients.find(p => p.cpf === cleanCpf && p.id !== editingPatientId);
        if (existe) setErrors(prev => ({ ...prev, cpf: 'Este CPF já está cadastrado!' }));
        else setErrors(prev => { const newErrors = { ...prev }; delete newErrors.cpf; return newErrors; });
      } else {
        setErrors(prev => { const newErrors = { ...prev }; delete newErrors.cpf; return newErrors; });
      }
      return;
    }
    if (name === 'phone' || name === 'emergency_phone') return setFormData({ ...formData, [name]: maskPhone(value) });
    if (name === 'zip_code') {
      const masked = maskCEP(value);
      setFormData({ ...formData, [name]: masked });
      const cleanCEP = masked.replace(/\D/g, '');
      if (cleanCEP.length === 8) void fetchAddressByCEP(cleanCEP);
      return;
    }
    // Aplica maiúsculas em tempo real para campos de texto livre (exceto email, CPF, telefone, CEP)
    const camposTextoLivre = ['full_name', 'emergency_contact', 'city', 'address', 'state', 'allergies', 'chronic_diseases', 'observations'];
    if (camposTextoLivre.includes(name)) {
      setFormData({ ...formData, [name]: value.toUpperCase() });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const filteredPatients = patients.filter((patient) => {
    if (statusFilter === 'ativos' && !patient.is_active) return false;
    if (statusFilter === 'inativos' && patient.is_active) return false;
    if (statusFilter === 'avisos') {
      if (!patient.is_active) return false;
      
      const isInvalidCpf = isSuspiciousData(patient.cpf) || (patient.cpf ? !validateCPF(patient.cpf) : false);
      const isDuplicateCpf = patient.is_duplicate_cpf;
      const isInvalidBirth = isSuspiciousData(patient.birth_date);
      const isDuplicateName = patient.is_duplicate_name_diff_cpf;

      const hasCpfWarning = isInvalidCpf || isDuplicateCpf;
      const hasBirthWarning = isInvalidBirth;
      const hasNameWarning = isDuplicateName;

      if (!hasCpfWarning && !hasBirthWarning && !hasNameWarning) return false;

      if (warningTypeFilter === 'duplicate_cpf' && !isDuplicateCpf) return false;
      if (warningTypeFilter === 'invalid_cpf' && !isInvalidCpf) return false;
      if (warningTypeFilter === 'duplicate_name' && !isDuplicateName) return false;
      if (warningTypeFilter === 'invalid_birth' && !isInvalidBirth) return false;
    }
    // Filtro por instituição
    if (institutionFilter && institutionFilter !== 'all' && patient.institution_id !== institutionFilter) return false;
    return true;
  });

  const visiblePatients = useMemo(() => {
    const result = [...filteredPatients];
    if (sortConfig) {
      result.sort((a, b) => {
        if (sortConfig.field === 'name') {
          const nameA = a.full_name || '';
          const nameB = b.full_name || '';
          return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        if (sortConfig.field === 'birth_date') {
          const dateA = a.birth_date ? new Date(`${a.birth_date}T00:00:00`).getTime() : 0;
          const dateB = b.birth_date ? new Date(`${b.birth_date}T00:00:00`).getTime() : 0;
          return sortConfig.direction === 'asc' ? dateB - dateA : dateA - dateB;
        }
        if (sortConfig.field === 'institution') {
          const instA = a.institution_name || institutions.find(i => i.id === a.institution_id)?.name || '';
          const instB = b.institution_name || institutions.find(i => i.id === b.institution_id)?.name || '';
          return sortConfig.direction === 'asc' ? instA.localeCompare(instB) : instB.localeCompare(instA);
        }
        if (sortConfig.field === 'profile') {
          const profA = a.blood_type || '';
          const profB = b.blood_type || '';
          return sortConfig.direction === 'asc' ? profA.localeCompare(profB) : profB.localeCompare(profA);
        }
        return 0;
      });
    }
    return result;
  }, [filteredPatients, sortConfig, institutions]);

  const handleSort = (field: 'name' | 'birth_date' | 'institution' | 'profile') => {
    setSortConfig(current => {
      if (current?.field === field) {
        if (current.direction === 'asc') return { field, direction: 'desc' };
        return null;
      }
      return { field, direction: 'asc' };
    });
  };

  const getSortIcon = (field: 'name' | 'birth_date' | 'institution' | 'profile') => {
    if (sortConfig?.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-50 group-hover:opacity-100" />;
    return sortConfig.direction === 'asc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  const patientColumns: Array<CompactDataGridColumn<Patient>> = useMemo(() => [
    {
      key: 'patient',
      headerTitle: 'Paciente',
      header: (
        <div className="flex w-full items-center justify-between group/header">
          <div 
            className="flex items-center gap-1 cursor-pointer select-none group/sort" 
            onClick={() => handleSort('name')}
          >
            Paciente
            {getSortIcon('name')}
          </div>
        </div>
      ),
      className: 'w-[22%] min-w-[230px]',
      filterable: true,
      filterValue: (patient) => patient.full_name,
      render: (patient) => {
        const initials = getInitials(patient.full_name, 'PT');
        const colorClass = getAvatarColor(patient.full_name);
        const hasNameWarning = patient.is_duplicate_name_diff_cpf;
        
        return (
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${colorClass}`}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`truncate font-semibold ${hasNameWarning ? 'text-rose-700' : 'text-slate-900'}`} title={patient.full_name}>{patient.full_name}</p>
                {hasNameWarning && (
                  <span title="Existe outro paciente com este mesmo nome mas CPF diferente">
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">{patient.age || 0} anos - {patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Feminino' : (patient.gender || '-')}</p>
              <p className={`text-[11px] font-semibold ${patient.is_active ? 'text-green-700' : 'text-red-700'}`}>{patient.is_active ? 'Ativo' : 'Inativo'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'institution',
      headerTitle: 'Instituição',
      header: (
        <div className="flex items-center gap-1 cursor-pointer select-none group" onClick={() => handleSort('institution')}>
          Instituição
          {getSortIcon('institution')}
        </div>
      ),
      className: 'w-[28%] min-w-[200px]',
      filterable: true,
      filterValue: (patient) => {
        // Prioriza institution_name que vem direto do backend; cai na lista local como fallback
        const nome = patient.institution_name || institutions.find(i => i.id === patient.institution_id)?.name;
        return nome || 'Não vinculada';
      },
      render: (patient) => {
        // Prioriza institution_name que vem direto do backend; cai na lista local como fallback
        const nomeInstituicao = patient.institution_name || institutions.find(i => i.id === patient.institution_id)?.name;
        if (!nomeInstituicao) {
          return (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-amber-700 font-medium italic text-[11px]">Não vinculada</span>
            </div>
          );
        }
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs max-w-full overflow-hidden"
            title={nomeInstituicao}
          >
            <span className="truncate">{nomeInstituicao}</span>
          </span>
        );
      },
    },
    {
      key: 'cpf',
      header: 'CPF',
      className: 'w-[12%] min-w-[120px]',
      render: (patient) => {
        const suspicious = isSuspiciousData(patient.cpf) || (patient.cpf ? !validateCPF(patient.cpf) : false);
        const duplicated = patient.is_duplicate_cpf;
        const hasWarning = suspicious || duplicated;
        const tooltipMessage = duplicated ? 'Este CPF está cadastrado em mais de um paciente' : (suspicious ? 'CPF possivelmente inválido ou genérico' : '');

        return (
          <div className="flex items-center gap-1.5">
            {/* Exibe o CPF sem censura apenas para superadmin (LGPD - Finalidade de auditoria e gestão global) */}
            <span className={`font-mono text-[11px] ${duplicated ? 'text-rose-700 font-bold' : ''}`}>
              {userRole === 'superadmin' ? (maskCPF(patient.cpf) || '-') : (censorCPF(patient.cpf) || '-')}
            </span>
            {hasWarning && (
              <span title={tooltipMessage}>
                <AlertTriangle className={`h-4 w-4 shrink-0 ${duplicated ? 'text-rose-500' : 'text-amber-500'}`} />
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'birth',
      header: (
        <div 
          className="flex items-center gap-1 cursor-pointer select-none group" 
          onClick={() => handleSort('birth_date')}
        >
          Nascimento
          {getSortIcon('birth_date')}
        </div>
      ),
      className: 'w-[10%] min-w-[110px]',
      render: (patient) => {
        const suspicious = isSuspiciousData(patient.birth_date);
        return (
          <div className="flex items-center gap-1.5">
            <span>{patient.birth_date ? new Date(`${patient.birth_date}T00:00:00`).toLocaleDateString('pt-BR') : '-'}</span>
            {suspicious && <span title="Data possivelmente genérica ou inválida"><AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /></span>}
          </div>
        );
      },
    },

    {
      key: 'profile',
      headerTitle: 'Perfil',
      header: (
        <div className="flex items-center gap-1 cursor-pointer select-none group" onClick={() => handleSort('profile')}>
          Perfil
          {getSortIcon('profile')}
        </div>
      ),
      className: 'w-[10%] min-w-[100px]',
      filterable: true,
      filterValue: (patient) => {
        const validProfiles = ['ALUNO', 'FUNCIONARIO', 'COMUNIDADE', 'PROFESSOR', 'ESTAGIARIO', 'SERVIDOR', 'Aluno', 'Funcionário'];
        const normalizedProfile = patient.blood_type ? patient.blood_type.toUpperCase().replace('Á', 'A').replace('Ó', 'O').replace('Í', 'I') : '';
        return (patient.blood_type && (validProfiles.includes(patient.blood_type) || validProfiles.includes(normalizedProfile))) ? normalizedProfile : 'Não informado';
      },
      render: (patient) => {
        const validProfiles = ['ALUNO', 'FUNCIONARIO', 'COMUNIDADE', 'PROFESSOR', 'ESTAGIARIO', 'SERVIDOR', 'Aluno', 'Funcionário'];
        const normalizedProfile = patient.blood_type ? patient.blood_type.toUpperCase().replace('Á', 'A').replace('Ó', 'O').replace('Í', 'I') : '';
        const isProfileValid = patient.blood_type && (validProfiles.includes(patient.blood_type) || validProfiles.includes(normalizedProfile));
        return (
          <span className="font-medium text-[12px]">
            {isProfileValid ? normalizedProfile : <span className="text-slate-400 italic text-[11px]">Não informado</span>}
          </span>
        );
      },
    },

    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[10%] min-w-[160px]',
      cellClassName: '',
      sticky: 'right',
      render: (patient) => (

        <div className="flex flex-nowrap gap-1.5">
          {!isReception && (
            <ActionButton 
              onClick={() => {
                const cleanCpf = patient.cpf ? unmaskCPF(patient.cpf) : '';
                const matchingPatients = cleanCpf 
                  ? patients.filter(p => (p.cpf ? unmaskCPF(p.cpf) : '') === cleanCpf).map(p => p.id)
                  : [patient.id];
                setHistoryPatientIds(Array.from(new Set([patient.id, ...matchingPatients])));
                setHistoryPatientName(patient.full_name);
                setIsHistoryDrawerOpen(true);
              }}
              icon={<FileText className="h-4 w-4" />}
              label="Histórico"
              titleTooltip="Ver Histórico do Paciente"
              primary
            />
          )}
          {canManagePatients && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  Opções
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem
                  onClick={() => handleEditPatient(patient)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate('/consultas', {
                      state: {
                        schedulingIntent: {
                          open: true,
                          patientId: patient.id
                        }
                      }
                    });
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <CalendarPlus className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-blue-700 font-medium">Agendar Consulta</span>
                </DropdownMenuItem>
                {canDeletePatients && (
                  <DropdownMenuItem
                    onClick={() => { void handleTogglePatientActive(patient.id, patient.is_active); }}
                    className={`flex items-center gap-2 cursor-pointer ${
                      patient.is_active ? 'text-red-600 focus:text-red-700 focus:bg-red-50' : 'text-green-700 focus:text-green-800 focus:bg-green-50'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {patient.is_active ? 'Inativar' : 'Ativar'}
                  </DropdownMenuItem>
                )}
                {isRootSuperadmin && (
                  <DropdownMenuItem
                    onClick={() => {
                      setPacienteParaExcluirRaiz(patient);
                      setTextoConfirmacaoExclusao('');
                    }}
                    className="flex items-center gap-2 cursor-pointer text-red-700 font-semibold focus:text-red-800 focus:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    Excluir Permanentemente (Root)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hasPermission, canDeletePatients, isReception, isRootSuperadmin, userRole]);

  if (!canReadPatients) {
    return <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center">Acesso negado</div>;
  }


  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative">
      {isSaving && (
        <div
          className="fixed z-[9999] flex flex-col items-center justify-center backdrop-blur-md bg-white/30"
          style={{
            // Respeita a largura da sidebar para centralizar apenas na área do main
            left: 'var(--sidebar-width-offset, 0px)',
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <div className="flex flex-col items-center gap-4 bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl px-10 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-[#003B71]" />
            <div className="text-center">
              <p className="text-[#003B71] font-bold text-lg">Salvando prontuário...</p>
              <p className="text-slate-500 text-sm mt-0.5">Por favor, não feche esta tela.</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Pacientes" description="Cadastro, identificação e situação dos pacientes" className="" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar por nome ou CPF..." value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="delphi-input h-9 pl-10" />
            </div>
            {/* Filtro por instituição */}
            {institutions.length > 1 && (
              <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
                <SelectTrigger className="delphi-input h-9 w-full md:w-fit md:min-w-[150px]">
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {institutions.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Select value={statusFilter} onValueChange={(val) => {
              setStatusFilter(val);
              if (val !== 'avisos') setWarningTypeFilter('all');
            }}>
              <SelectTrigger className="delphi-input h-9 w-full md:w-[170px] whitespace-nowrap"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
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
                <SelectItem value="avisos">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-amber-500/15 text-amber-600 border-amber-500/30">
                      <AlertTriangle className="h-3 w-3" />
                    </div>
                    <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas com Avisos</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {statusFilter === 'avisos' && (
              <Select value={warningTypeFilter} onValueChange={setWarningTypeFilter}>
                <SelectTrigger className="delphi-input h-9 w-full md:w-[250px]">
                  <SelectValue placeholder="Tipo de Aviso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Avisos</SelectItem>
                  <SelectItem value="duplicate_cpf">CPF Duplicado</SelectItem>
                  <SelectItem value="invalid_cpf">CPF Inválido/Suspeito</SelectItem>
                  <SelectItem value="duplicate_name">Nomes Iguais (CPFs Diferentes)</SelectItem>
                  <SelectItem value="invalid_birth">Data de Nasc. Suspeita</SelectItem>
                </SelectContent>
              </Select>
            )}



            {canManagePatients && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="h-9">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Paciente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col space-y-1.5">
                      <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                        {editingPatientId ? 'Editar Paciente' : 'Cadastrar um Novo Paciente'}
                      </DialogTitle>
                      <DialogDescription className="text-slate-500 font-medium">Formulário para cadastro e identificação do paciente.</DialogDescription>
                    </div>
                    
                    <form onSubmit={handleSubmitPatient} className="flex flex-col gap-8">
                      <div className="space-y-4">
                        <FormSectionTitle>Dados Pessoais</FormSectionTitle>
                        
                        <FormGrid>
                          <FormField label="Instituição" required className="md:col-span-12" error={errors.institution_id}>
                            <Combobox
                              options={institutionOptions}
                              value={formData.institution_id}
                              onChange={(value) => {
                                setFormData({ ...formData, institution_id: value });
                                setErrors(prev => { const next = { ...prev }; delete next.institution_id; return next; });
                              }}
                              placeholder="Selecione a instituição..."
                              searchPlaceholder="Buscar instituição..."
                              emptyText="Nenhuma instituição encontrada."
                              className={`delphi-input bg-slate-50 border-slate-200 ${errors.institution_id ? 'border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </FormField>
                          
                          <div className="md:col-span-12 flex flex-wrap gap-4 items-start">
                            <FormField label="Nome Completo" required className="flex-1 min-w-[200px]" error={errors.full_name}>
                              <Input name="full_name" placeholder="Ex: JOAO DA SILVA" value={formData.full_name} onChange={handleInputChange} onBlur={handleInputBlur} required style={{ textTransform: 'uppercase' }} className={`delphi-input bg-slate-50 border-slate-200 ${errors.full_name ? 'border-red-500 focus-visible:ring-red-500' : ''}`} />
                            </FormField>

                            <FormField
                              label="CPF"
                              required
                              className="w-44 shrink-0"
                              error={errors.cpf || (existingPatientCpfMatch && !editingPatientId ? `Este CPF já pertence ao paciente "${existingPatientCpfMatch.full_name}".` : undefined)}
                            >
                              <div className="relative">
                                <Input
                                  name="cpf"
                                  placeholder="000.000.000-00"
                                  value={formData.cpf}
                                  onChange={handleInputChange}
                                  onBlur={handleInputBlur}
                                  required
                                  disabled={!!editingPatientId && userRole !== 'superadmin'}
                                  className={`delphi-input bg-slate-50 border-slate-200 ${(errors.cpf || (existingPatientCpfMatch && !editingPatientId)) ? 'border-red-500 focus-visible:ring-red-500 text-red-700' : ''}`}
                                />
                                {checkingCpf && (
                                  <Loader2 className="h-4 w-4 animate-spin text-slate-400 absolute right-2.5 top-2.5" />
                                )}
                              </div>
                            </FormField>

                            <FormField label="Data Nascimento" required className="w-44 shrink-0" error={errors.birth_date}>
                              <Input name="birth_date" type="date" value={formData.birth_date} onChange={handleInputChange} onBlur={handleInputBlur} required className={`delphi-input bg-slate-50 border-slate-200 ${errors.birth_date ? 'border-red-500 focus-visible:ring-red-500' : ''}`} />
                            </FormField>
                          </div>


                          <FormField label="Sexo" required className="md:col-span-4" error={errors.gender}>
                            <Select value={formData.gender} onValueChange={(value) => { setFormData({ ...formData, gender: value }); setErrors(prev => { const next = { ...prev }; delete next.gender; return next; }); }} required>
                              <SelectTrigger className={`delphi-input bg-slate-50 border-slate-200 ${errors.gender ? 'border-red-500 focus:ring-red-500' : ''}`}><SelectValue placeholder="Selecione o sexo" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="M">MASCULINO</SelectItem>
                                <SelectItem value="F">FEMININO</SelectItem>
                                <SelectItem value="O">OUTRO</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>
                          
                          <FormField label="Telefone" required className="md:col-span-4" error={errors.phone}>
                            <Input name="phone" placeholder="(00) 00000-0000" value={formData.phone} onChange={handleInputChange} onBlur={handleInputBlur} required className={`delphi-input bg-slate-50 border-slate-200 ${errors.phone ? 'border-red-500 focus-visible:ring-red-500' : ''}`} />
                          </FormField>
                          
                          <FormField label="Perfil do Usuário" required className="md:col-span-4" error={errors.blood_type}>
                            <Select value={formData.blood_type} onValueChange={(value) => { setFormData({ ...formData, blood_type: value }); setErrors(prev => { const next = { ...prev }; delete next.blood_type; return next; }); }} required>
                              <SelectTrigger className={`delphi-input bg-slate-50 border-slate-200 ${errors.blood_type ? 'border-red-500 focus:ring-red-500' : ''}`}><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALUNO">ALUNO</SelectItem>
                                <SelectItem value="FUNCIONARIO">FUNCIONARIO</SelectItem>
                                <SelectItem value="COMUNIDADE">COMUNIDADE</SelectItem>
                                <SelectItem value="PROFESSOR">PROFESSOR</SelectItem>
                                <SelectItem value="ESTAGIARIO">ESTAGIARIO</SelectItem>
                                <SelectItem value="SERVIDOR">SERVIDOR</SelectItem>
                                <SelectItem value="NAO-INFORMADO">NAO INFORMADO</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>
                          
                          {formData.blood_type === 'ALUNO' && (
                            <FormField label="Turma" className="md:col-span-6" error={errors.student_class}>
                              <Input name="student_class" placeholder="Ex: 3º Ano A" value={formData.student_class || ''} onChange={handleInputChange} onBlur={handleInputBlur} className={`delphi-input bg-slate-50 border-slate-200 ${errors.student_class ? 'border-red-500 focus-visible:ring-red-500' : ''}`} />
                            </FormField>
                          )}
                        </FormGrid>
                      </div>


                      <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-100">
                        <Button type="button" variant="outline" className="px-6 rounded-lg text-slate-700 font-semibold border-slate-300 hover:bg-slate-100" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                          Cancelar
                        </Button>
                        <Button type="submit" className="px-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20" disabled={isSaving}>
                          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {isSaving ? 'Salvando...' : (editingPatientId ? 'Atualizar Paciente' : 'Cadastrar Paciente')}
                        </Button>
                      </div>
                    </form>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </PageHeader>

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2 relative">
          <CompactDataGrid
            className="flex-1"
            columns={patientColumns}
            rows={visiblePatients}
            getRowKey={(row) => row.id}
            loading={loading}
            rowClassName={(patient) => (!patient.is_active ? 'opacity-60' : '')}
            minWidth="900px"
            pagination={true}
            itemsPerPage={15}
            resetPaginationDependency={searchTerm + statusFilter + warningTypeFilter + institutionFilter}
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-blue-50 p-4 rounded-full mb-4">
                  <UserPlus className="h-8 w-8 text-blue-400" />
                </div>
                <p className="text-lg font-bold text-slate-700">Nenhum paciente encontrado</p>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  Não encontramos pacientes com esses filtros. Tente buscar de outra forma ou cadastre um novo.
                </p>
              </div>
            }
          />
        </main>

        <div className="hidden">
          {visiblePatients.length === 0 ? (
            <Card className="border-slate-300">
              <CardContent className="py-8 text-center text-slate-500">
                <UserPlus className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p>Nenhum paciente encontrado</p>
              </CardContent>
            </Card>
          ) : (
            visiblePatients.map((patient) => (
              <Card key={patient.id} className={`hover:shadow-md transition-shadow border-slate-300 ${!patient.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-200">
                          <span className="text-blue-600 font-bold text-lg">{patient.full_name.charAt(0)}</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 text-lg">{patient.full_name}</h3>
                          <p className="text-sm text-slate-500">{patient.age || 0} anos - {patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Feminino' : patient.gender}</p>
                          <p className={`text-xs font-medium ${patient.is_active ? 'text-green-700' : 'text-red-700'}`}>{patient.is_active ? 'Ativo' : 'Inativo'}</p>
                          {patient.has_pending_appointment && patient.pending_appointment_date && (
                            <p className="text-xs font-medium text-amber-700">
                              Consulta agendada: {formatOperationalDateTime(patient.pending_appointment_date)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mb-4">
                        <Info icon={<Calendar className="h-4 w-4 text-slate-400" />} label="Data Nasc." value={new Date(`${patient.birth_date}T00:00:00`).toLocaleDateString('pt-BR')} />
                        <Info icon={<Phone className="h-4 w-4 text-slate-400" />} label="Telefone" value={patient.phone || '-'} />
                        <Info icon={<Mail className="h-4 w-4 text-slate-400" />} label="E-mail" value={patient.email || '-'} />
                        <Info icon={<UserPlus className="h-4 w-4 text-slate-400" />} label="Perfil do Usuário" value={patient.blood_type || 'N/A'} />
                      </div>

                      {(patient.allergies || patient.chronic_diseases) && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          {patient.allergies && <AlertBlock title="Alergias" text={patient.allergies} />}
                          {patient.chronic_diseases && <AlertBlock title="Doencas Cronicas" text={patient.chronic_diseases} />}
                        </div>
                      )}
                    </div>

                    {canManagePatients && (
                      <div className="flex gap-2 ml-4 border-l border-slate-200 pl-4">
                        <Button variant="outline" size="sm" onClick={() => handleEditPatient(patient)} >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { void handleTogglePatientActive(patient.id, patient.is_active); }} className={`h-8 ${patient.is_active ? 'border-red-200 hover:bg-red-50 text-red-600' : 'border-green-200 hover:bg-green-50 text-green-600'}`}>
                          <Power className="h-3 w-3 mr-1" />
                          {patient.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        {isRootSuperadmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPacienteParaExcluirRaiz(patient);
                              setTextoConfirmacaoExclusao('');
                            }}
                            className="h-8 border-red-300 hover:bg-red-50 text-red-700 font-semibold"
                          >
                            <Trash2 className="h-3 w-3 mr-1 text-red-600" />
                            Excluir (Root)
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      <ConfirmationDialog />
      <PatientHistoryDrawer
        patientIds={historyPatientIds}
        patientName={historyPatientName}
        isOpen={isHistoryDrawerOpen}
        onOpenChange={setIsHistoryDrawerOpen}
      />

      {/* Modal de Confirmação de Exclusão Definitiva (Superadmin Root) */}
      <Dialog
        open={!!pacienteParaExcluirRaiz}
        onOpenChange={(open) => {
          if (!open && !excluindoPacienteRaiz) {
            setPacienteParaExcluirRaiz(null);
            setTextoConfirmacaoExclusao('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px] border-2 border-red-500/40 bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 text-lg font-bold">
              <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
              Exclusão Definitiva de Paciente (Superadmin Root)
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2 space-y-2 text-sm">
              <span className="font-semibold text-slate-800 block">
                Você está prestes a apagar o paciente <span className="text-red-700 font-bold">{pacienteParaExcluirRaiz?.full_name}</span> (CPF: {pacienteParaExcluirRaiz?.cpf || 'Não informado'}).
              </span>
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-xs leading-relaxed space-y-1">
                <span className="font-bold block">⚠️ ATENÇÃO - AÇÃO IRREVERSÍVEL E DE EXPURGO TOTAL:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Todas as consultas e agendamentos serão excluídos.</li>
                  <li>Todos os prontuários médicos e fichas odontológicas serão eliminados.</li>
                  <li>O cadastro do paciente será removido como se NUNCA tivesse existido no sistema.</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-2">
            <label className="text-xs font-semibold text-slate-700 block">
              Para confirmar a exclusão permanente, digite <span className="font-bold text-red-600">EXCLUIR</span> abaixo:
            </label>
            <Input
              value={textoConfirmacaoExclusao}
              onChange={(e) => setTextoConfirmacaoExclusao(e.target.value)}
              placeholder="Digite EXCLUIR"
              className="border-red-300 focus-visible:ring-red-500 uppercase tracking-widest font-mono text-sm"
              disabled={excluindoPacienteRaiz}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPacienteParaExcluirRaiz(null);
                setTextoConfirmacaoExclusao('');
              }}
              disabled={excluindoPacienteRaiz}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { void executarExclusaoDefinitivaPaciente(); }}
              disabled={textoConfirmacaoExclusao.trim().toUpperCase() !== 'EXCLUIR' || excluindoPacienteRaiz}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {excluindoPacienteRaiz ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir Definitivamente'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    {icon}
    <div>
      <p className="text-slate-600">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  </div>
);

const AlertBlock = ({ title, text }: { title: string; text: string }) => (
  <div className="flex items-start gap-2 mb-2 last:mb-0">
    <FileText className="h-4 w-4 text-red-500 mt-0.5" />
    <div>
      <p className="text-sm font-bold text-red-800">{title}</p>
      <p className="text-sm text-red-700">{text}</p>
    </div>
  </div>
);

export default Patients;

