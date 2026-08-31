"use client";

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { doctorService } from '@/servicos/doctors';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { renderSpecialtyOption } from '@/components/ui/combobox-helpers';
import { normalizarEntradaTexto } from '@/utils/formatters';

interface OpcaoEspecialidade {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface OpcaoInstituicao {
  id: string;
  name: string;
  is_active?: boolean;
}

interface Profissional {
  id: string;
  user_id: string;
  professional_council?: string;
  crm: string;
  specialty_id: string;
  is_active: boolean;
  name: string;
  email?: string;
  phone?: string;
  specialty_name?: string;
  specialty_color?: string;
}

interface PropsCadastroProfissionalModal {
  aberto: boolean;
  aoFechar: () => void;
  aoSalvarComSucesso: () => void;
  idProfissionalEdicao?: string | null;
  profissionalEdicao?: Profissional | null;
  especialidades: OpcaoEspecialidade[];
  instituicoes: OpcaoInstituicao[];
  idInstituicaoPadrao?: string;
  podeProvisionarUsuarios: boolean;
}

const OPCOES_CONSELHO_PROFISSIONAL = [
  { value: 'CRM', label: 'CRM - Medicina' },
  { value: 'CRO', label: 'CRO - Odontologia' },
  { value: 'COREN', label: 'COREN - Enfermagem' },
  { value: 'CRESS', label: 'CRESS - Serviço Social' },
  { value: 'CREF', label: 'CREF - Educação Física' },
  { value: 'CRP', label: 'CRP - Psicologia' },
  { value: 'CREFITO', label: 'CREFITO - Fisioterapia / Terapia Ocupacional' },
  { value: 'CRN', label: 'CRN - Nutrição' },
  { value: 'CRFa', label: 'CRFa - Fonoaudiologia' },
  { value: 'CRF', label: 'CRF - Farmácia' },
  { value: 'CRBM', label: 'CRBM - Biomedicina' },
  { value: 'OUTRO', label: 'Outro conselho' },
];

export const CadastroProfissionalModal: React.FC<PropsCadastroProfissionalModal> = ({
  aberto,
  aoFechar,
  aoSalvarComSucesso,
  idProfissionalEdicao,
  profissionalEdicao,
  especialidades,
}) => {
  const [salvando, setSalvando] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [dadosFormulario, setDadosFormulario] = useState({
    nomeCompleto: '',
    email: '',
    phone: '',
    conselhoProfissional: 'CRM',
    registroProfissional: '',
    idEspecialidade: '',
  });

  useEffect(() => {
    if (aberto) {
      setErrors({});
      if (idProfissionalEdicao && profissionalEdicao) {
        setDadosFormulario({
          nomeCompleto: profissionalEdicao.name || '',
          email: profissionalEdicao.email || '',
          phone: profissionalEdicao.phone || '',
          conselhoProfissional: profissionalEdicao.professional_council || 'CRM',
          registroProfissional: profissionalEdicao.crm || '',
          idEspecialidade: profissionalEdicao.specialty_id || '',
        });
      } else {
        setDadosFormulario({
          nomeCompleto: '',
          email: '',
          phone: '',
          conselhoProfissional: 'CRM',
          registroProfissional: '',
          idEspecialidade: '',
        });
      }
    }
  }, [aberto, idProfissionalEdicao, profissionalEdicao]);

  const validarCampos = () => {
    const novosErros: Record<string, string> = {};

    if (!dadosFormulario.nomeCompleto.trim()) {
      novosErros.nomeCompleto = 'O nome completo é obrigatório.';
    }
    if (!dadosFormulario.registroProfissional.trim()) {
      novosErros.registroProfissional = 'O registro no conselho (ex: CRM) é obrigatório.';
    }
    if (!dadosFormulario.idEspecialidade) {
      novosErros.idEspecialidade = 'A especialidade é obrigatória.';
    }

    return novosErros;
  };

  const lidarComSalvar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    const novosErros = validarCampos();
    setErrors(novosErros);

    if (Object.keys(novosErros).length > 0) {
      toast.error('Corrija os campos obrigatórios.');
      return;
    }

    try {
      setSalvando(true);

      if (idProfissionalEdicao) {
        await doctorService.update(idProfissionalEdicao, {
          name: normalizarEntradaTexto(dadosFormulario.nomeCompleto),
          email: dadosFormulario.email.trim() || undefined,
          phone: dadosFormulario.phone.trim() || undefined,
          crm: dadosFormulario.registroProfissional.trim(),
          professional_council: dadosFormulario.conselhoProfissional,
          specialty_id: dadosFormulario.idEspecialidade,
        });
        toast.success('Profissional atualizado com sucesso!');
      } else {
        await doctorService.create({
          name: normalizarEntradaTexto(dadosFormulario.nomeCompleto),
          email: dadosFormulario.email.trim() || undefined,
          phone: dadosFormulario.phone.trim() || undefined,
          crm: dadosFormulario.registroProfissional.trim(),
          professional_council: dadosFormulario.conselhoProfissional,
          specialty_id: dadosFormulario.idEspecialidade,
        });
        toast.success('Profissional cadastrado com sucesso!');
      }

      aoSalvarComSucesso();
      aoFechar();
    } catch (erro: any) {
      console.error('Erro ao salvar profissional:', erro);
      toast.error(erro.message || 'Erro ao salvar profissional');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="max-w-xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col space-y-1.5">
            <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
              {idProfissionalEdicao ? 'Editar Profissional' : 'Novo Profissional'}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Preencha os dados cadastrais do médico ou especialista.
            </DialogDescription>
          </div>

          <form onSubmit={lidarComSalvar} className="flex flex-col gap-6">
            <div className="space-y-4">
              <FormSectionTitle>Dados Profissionais</FormSectionTitle>
              <FormGrid>
                <FormField label="Nome Completo" required className="md:col-span-12" error={errors.nomeCompleto}>
                  <Input
                    value={dadosFormulario.nomeCompleto}
                    onChange={(e) => {
                      setDadosFormulario({ ...dadosFormulario, nomeCompleto: e.target.value });
                      setErrors((prev) => ({ ...prev, nomeCompleto: '' }));
                    }}
                    placeholder="Ex: Dr. Carlos Eduardo Silva"
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-semibold"
                  />
                </FormField>

                <FormField label="Conselho Profissional" required className="md:col-span-6">
                  <Combobox
                    options={OPCOES_CONSELHO_PROFISSIONAL}
                    value={dadosFormulario.conselhoProfissional}
                    onSelect={(val) => setDadosFormulario({ ...dadosFormulario, conselhoProfissional: val })}
                    placeholder="Selecione o conselho"
                    searchPlaceholder="Buscar conselho..."
                    emptyMessage="Nenhum conselho encontrado."
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                  />
                </FormField>

                <FormField label="Número de Registro / CRM" required className="md:col-span-6" error={errors.registroProfissional}>
                  <Input
                    value={dadosFormulario.registroProfissional}
                    onChange={(e) => {
                      setDadosFormulario({ ...dadosFormulario, registroProfissional: e.target.value });
                      setErrors((prev) => ({ ...prev, registroProfissional: '' }));
                    }}
                    placeholder="Ex: 12345/DF"
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                  />
                </FormField>

                <FormField label="Especialidade" required className="md:col-span-12" error={errors.idEspecialidade}>
                  <Combobox
                    options={especialidades.map((s) => ({ value: s.id, label: s.name, color: s.color, icon: s.icon }))}
                    value={dadosFormulario.idEspecialidade}
                    onSelect={(val) => {
                      setDadosFormulario({ ...dadosFormulario, idEspecialidade: val });
                      setErrors((prev) => ({ ...prev, idEspecialidade: '' }));
                    }}
                    placeholder="Selecione a especialidade principal"
                    searchPlaceholder="Buscar especialidade..."
                    emptyMessage="Nenhuma especialidade cadastrada."
                    renderOption={renderSpecialtyOption}
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                  />
                </FormField>

                <FormField label="E-mail" className="md:col-span-6">
                  <Input
                    type="email"
                    value={dadosFormulario.email}
                    onChange={(e) => setDadosFormulario({ ...dadosFormulario, email: e.target.value })}
                    placeholder="medico@exemplo.com"
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                  />
                </FormField>

                <FormField label="Telefone / WhatsApp" className="md:col-span-6">
                  <Input
                    value={dadosFormulario.phone}
                    onChange={(e) => setDadosFormulario({ ...dadosFormulario, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                  />
                </FormField>
              </FormGrid>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" className="h-10 px-6 font-semibold" onClick={aoFechar} disabled={salvando}>
                Cancelar
              </Button>
              <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold" disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {idProfissionalEdicao ? 'Atualizar Profissional' : 'Cadastrar Profissional'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
