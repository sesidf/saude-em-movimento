"use client";

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { renderSpecialtyOption } from '@/components/ui/combobox-helpers';

import { buildIdempotencyKey } from '@/lib/idempotency';
import { getOperationalErrorMessage } from '@/lib/errors';
import { chamarApiPostComRetry } from '@/lib/workerApi';
import { normalizarEntradaTexto, validarNomeCompleto } from '@/utils/formatters';

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
  professional_registration?: string;
  registration_label?: string;
  crm: string;
  specialty_id: string;

  is_active: boolean;
  full_name: string;
  email: string;
  phone?: string;
  specialty_name: string;
  specialty_color?: string;
  total_appointments: number;
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
  { value: 'CRM-DF', label: 'CRM-DF - Medicina' },
  { value: 'CRO-DF', label: 'CRO-DF - Odontologia' },
  { value: 'COREN-DF', label: 'COREN-DF - Enfermagem' },
  { value: 'CRESS-DF', label: 'CRESS-DF - Serviço Social (8ª Região)' },
  { value: 'CREF7', label: 'CREF7 - Educação Física' },
  { value: 'CRP-01', label: 'CRP-01 - Psicologia' },
  { value: 'CREFITO-11', label: 'CREFITO-11 - Fisioterapia / Terapia Ocupacional' },
  { value: 'CRN-1', label: 'CRN-1 - Nutrição' },
  { value: 'CRFa-5', label: 'CRFa 5 - Fonoaudiologia' },
  { value: 'CRF-DF', label: 'CRF-DF - Farmácia' },
  { value: 'CRBM-3', label: 'CRBM-3 - Biomedicina' },
  { value: 'CRTR-12', label: 'CRTR 12ª Região - Radiologia' },
  { value: 'OUTRO', label: 'Outro conselho' },
  { value: 'NAO_INFORMADO', label: 'Não informado' },
];

/**
 * Mapa inverso: código do banco → valor do Select (para popular o formulário ao editar).
 * Ex: banco retorna 'CREFONO' → Select deve mostrar 'CRFa-5'.
 */
const MAPA_BACKEND_PARA_CONSELHO: Record<string, string> = {
  'CRM':          'CRM-DF',
  'CRO':          'CRO-DF',
  'COREN':        'COREN-DF',
  'CRESS':        'CRESS-DF',
  'CREF':         'CREF-7',
  'CRP':          'CRP-01',
  'CREFITO':      'CREFITO-11',
  'CRN':          'CRN-1',
  'CREFONO':      'CRFa-5',     // Fonoaudiologia
  'CRF':          'CRF-DF',
  'CRBM':         'CRBM-3',
  'CRTR':         'CRTR-12',
  'OUTRO':        'OUTRO',
  'NAO_INFORMADO': 'NAO_INFORMADO',
};

/**
 * Normaliza o valor do conselho vindo do banco de dados para bater com as opções do Select.
 * Ex: banco retorna 'CREFONO' → Select mostra 'CRFa-5'.
 * Ex: banco retorna 'CRM' → Select mostra 'CRM-DF'.
 * @param conselhoSalvo - Valor vindo do banco (ex: 'CREFONO', 'CRM', 'NAO_INFORMADO')
 * @returns Valor da opção do Select correspondente
 */
const normalizarConselho = (conselhoSalvo?: string): string => {
  if (!conselhoSalvo) return '';
  const upper = conselhoSalvo.toUpperCase().trim();
  // 1. Busca no mapa inverso (banco → Select)
  if (MAPA_BACKEND_PARA_CONSELHO[upper]) return MAPA_BACKEND_PARA_CONSELHO[upper];
  // 2. Verifica se o valor já é uma opção válida do Select (ex: usuário salvou diretamente)
  const exato = OPCOES_CONSELHO_PROFISSIONAL.find(o => o.value.toUpperCase() === upper);
  if (exato) return exato.value;
  // 3. Fallback: qualquer coisa desconhecida → OUTRO
  return 'OUTRO';
};

/**
 * Mapa de conversão: valor do Select → código aceito pelo banco (sem sufixo regional).
 * O banco faz upper() internamente, então os valores aqui devem estar em uppercase.
 */
const MAPA_CONSELHO_PARA_BACKEND: Record<string, string> = {
  'CRM-DF':        'CRM',
  'CRO-DF':        'CRO',
  'COREN-DF':      'COREN',
  'CRESS-DF':      'CRESS',
  'CREF-7':        'CREF',
  'CRP-01':        'CRP',
  'CREFITO-11':    'CREFITO',
  'CRN-1':         'CRN',
  'CRFa-5':        'CREFONO',    // Fonoaudiologia → CREFONO
  'CRF-DF':        'CRF',
  'CRBM-3':        'CRBM',
  'CRTR-12':       'CRTR',       // Radiologia → CRTR (agora aceito pelo banco)
  'OUTRO':         'OUTRO',
  'NAO_INFORMADO': 'NAO_INFORMADO',
};

/**
 * Converte o valor do Select para o código aceito pelo banco.
 * @param valorSelect - Valor selecionado no dropdown (ex: 'CRFa-5', 'CRM-DF')
 * @returns Código normalizado aceito pela RPC (ex: 'CREFONO', 'CRM')
 */
const normalizarConselhoParaBackend = (valorSelect: string): string => {
  return MAPA_CONSELHO_PARA_BACKEND[valorSelect] ?? valorSelect;
};

/**
 * Invoca a nova API de cadastro de profissional isolado (v2) com suporte a tentativas.
 * @param dados - Payload com informações para criação
 */
const invocarCriacaoUsuarioAdmin = async (dados: Record<string, unknown>) => {
  const resultado = await chamarApiPostComRetry('/api/admin-create-user', dados);

  if (resultado.error) {
    throw new Error(resultado.error);
  }

  return { data: resultado.data, error: null };
};

export const CadastroProfissionalModal: React.FC<PropsCadastroProfissionalModal> = ({
  aberto,
  aoFechar,
  aoSalvarComSucesso,
  idProfissionalEdicao,
  profissionalEdicao,
  especialidades,
  instituicoes,
  idInstituicaoPadrao,
  podeProvisionarUsuarios,
}) => {
  const [salvando, setSalvando] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [dadosFormulario, setDadosFormulario] = useState({
    nomeCompleto: '',
    email: '',
    senhaInicial: '',
    conselhoProfissional: '',
    registroProfissional: '',
    idEspecialidade: '',
  });

  useEffect(() => {
    if (aberto) {
      setErrors({});
      if (idProfissionalEdicao && profissionalEdicao) {
        setDadosFormulario({
          nomeCompleto: profissionalEdicao.full_name,
          email: profissionalEdicao.email,
          senhaInicial: '',
          conselhoProfissional: normalizarConselho(profissionalEdicao.professional_council),
          registroProfissional:
            normalizarConselho(profissionalEdicao.professional_council) === 'NAO_INFORMADO'
              ? '00'
              : (profissionalEdicao.crm === '00' ? '' : profissionalEdicao.crm),
          idEspecialidade: profissionalEdicao.specialty_id,
        });
      } else {
        setDadosFormulario({
          nomeCompleto: '',
          email: '',
          senhaInicial: Math.random().toString(36).substring(2, 12).padEnd(10, 'x'),
          conselhoProfissional: '',
          registroProfissional: '',
          idEspecialidade: '',
        });
      }
    }
  }, [aberto, idProfissionalEdicao, profissionalEdicao, instituicoes, idInstituicaoPadrao]);

  const validarCampos = () => {
    const novosErros: Record<string, string> = {};

    if (!dadosFormulario.conselhoProfissional) {
      novosErros.conselhoProfissional = 'Selecione um Conselho Profissional.';
    }
    if (!dadosFormulario.idEspecialidade) {
      novosErros.idEspecialidade = 'A especialidade é obrigatória.';
    }
    if (dadosFormulario.conselhoProfissional !== 'NAO_INFORMADO' && !dadosFormulario.registroProfissional.trim()) {
      novosErros.registroProfissional = 'O registro profissional (CRM/CRO) é obrigatório.';
    }
    
    const nomeCompletoLimpo = normalizarEntradaTexto(dadosFormulario.nomeCompleto);
    if (!nomeCompletoLimpo) {
      novosErros.nomeCompleto = 'O nome completo é obrigatório.';
    } else if (!validarNomeCompleto(nomeCompletoLimpo)) {
      novosErros.nomeCompleto = 'Informe o nome completo sem abreviações (nome e sobrenome).';
    }
    
    if (!idProfissionalEdicao) {
      if (!dadosFormulario.email.trim() || !dadosFormulario.email.includes('@')) {
        novosErros.email = 'Informe um e-mail válido.';
      }
      if (!dadosFormulario.senhaInicial.trim() || dadosFormulario.senhaInicial.length < 6) {
        novosErros.senhaInicial = 'A senha temporária deve ter pelo menos 6 caracteres.';
      }
    }

    return novosErros;
  };

  const lidarComSalvar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    const novosErros = validarCampos();
    setErrors(novosErros);

    if (Object.keys(novosErros).length > 0) {
      toast.error('Corrija os campos marcados de vermelho.');
      return;
    }

    try {
      setSalvando(true);

      if (idProfissionalEdicao) {
        if (dadosFormulario.nomeCompleto !== profissionalEdicao?.full_name && profissionalEdicao?.user_id) {
          const { error: userError } = await chamarApiPost('/api/table/users/update', {});
          if (userError) throw new Error('Erro ao atualizar o nome do usuário.');

          await chamarApiPost('/api/table/doctors/update', {});
        }

        const chaveIdempotencia = await buildIdempotencyKey('update_doctor', {
          doctor_id: idProfissionalEdicao,
          specialty: dadosFormulario.idEspecialidade,
          crm: dadosFormulario.registroProfissional,
          council: dadosFormulario.conselhoProfissional,
        });

        const { data, error } = await chamarApiPost('/api/rpc/upsert_doctor', {
          p_user_id: profissionalEdicao!.user_id,
          p_doctor_id: idProfissionalEdicao,
          p_specialty_id: dadosFormulario.idEspecialidade,
          p_professional_council: normalizarConselhoParaBackend(dadosFormulario.conselhoProfissional),
          // '00' já está garantido no estado quando NAO_INFORMADO
          p_crm: dadosFormulario.registroProfissional || '00',
          p_idempotency_key: chaveIdempotencia,
        });

        if (error) throw error;
        const resposta = (data || {}) as { success?: boolean; doctor?: Profissional | null };
        if (!resposta.success) {
          throw new Error('O servidor não confirmou a atualização do profissional.');
        }
        toast.success('Dados do profissional atualizados com sucesso!');
      } else {
        const chaveIdempotencia = await buildIdempotencyKey('create_doctor_user', {
          full_name: dadosFormulario.nomeCompleto,
          email: dadosFormulario.email,
          professional_council: dadosFormulario.conselhoProfissional,
          crm: dadosFormulario.registroProfissional,
          specialty_id: dadosFormulario.idEspecialidade,
        });

        await invocarCriacaoUsuarioAdmin({
          full_name: dadosFormulario.nomeCompleto,
          email: dadosFormulario.email,
          password: dadosFormulario.senhaInicial,
          role: 'medico',
          institution_id: idInstituicaoPadrao || (instituicoes.length > 0 ? instituicoes[0].id : null),
          institution_ids: [],
          professional_council: normalizarConselhoParaBackend(dadosFormulario.conselhoProfissional),
          crm: dadosFormulario.registroProfissional || '00',
          specialty_id: dadosFormulario.idEspecialidade,
          idempotency_key: chaveIdempotencia,
        });

        toast.success(`Profissional cadastrado! Senha temporária: ${dadosFormulario.senhaInicial}`, { duration: 8000 });
      }

      aoSalvarComSucesso();
      aoFechar();
    } catch (erro) {
      console.error('Erro ao salvar profissional:', erro);
      toast.error(await getOperationalErrorMessage(erro, 'Erro ao salvar dados do profissional'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(novoEstado) => !novoEstado && aoFechar()}>
      <DialogContent className="max-w-2xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col space-y-1.5">
            <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
              {idProfissionalEdicao ? 'Editar Profissional' : 'Novo Profissional'}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Preencha os dados abaixo para cadastrar um médico ou especialista no sistema.
            </DialogDescription>
          </div>

          <form onSubmit={lidarComSalvar} className="flex flex-col gap-8">
            {/* Seção: Identificação Pessoal */}
            <div className="space-y-4">
              <FormSectionTitle>Identificação Pessoal</FormSectionTitle>
              <FormGrid>
                <FormField label="Nome Completo" required className={idProfissionalEdicao ? "md:col-span-6" : "md:col-span-12"} error={errors.nomeCompleto}>
                  <Input
                    value={dadosFormulario.nomeCompleto}
                    onChange={(evento) => {
                      setDadosFormulario({ ...dadosFormulario, nomeCompleto: evento.target.value.toUpperCase() });
                      setErrors(prev => { const next = { ...prev }; delete next.nomeCompleto; return next; });
                    }}
                    onBlur={(evento) => {
                      const normalizado = normalizarEntradaTexto(evento.target.value);
                      setDadosFormulario({ ...dadosFormulario, nomeCompleto: normalizado });
                      if (normalizado && !validarNomeCompleto(normalizado)) {
                        setErrors(prev => ({ ...prev, nomeCompleto: 'Informe o nome completo sem abreviações.' }));
                      }
                    }}
                    required
                    style={{ textTransform: 'uppercase' }}
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.nomeCompleto ? 'border-red-500' : ''}`}
                    placeholder="Digite o nome e sobrenome"
                  />
                </FormField>
                <FormField label="E-mail Institucional" required className="md:col-span-6" error={errors.email}>
                  <Input
                    type="email"
                    value={dadosFormulario.email}
                    onChange={(evento) => {
                      setDadosFormulario({ ...dadosFormulario, email: evento.target.value });
                      setErrors(prev => { const next = { ...prev }; delete next.email; return next; });
                    }}
                    required
                    disabled={!!idProfissionalEdicao}
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.email ? 'border-red-500' : ''}`}
                    placeholder="exemplo@clinica.com"
                  />
                </FormField>
                {!idProfissionalEdicao && (
                  <FormField label="Senha Temporária" required className="md:col-span-6" error={errors.senhaInicial}>
                    <Input
                      value={dadosFormulario.senhaInicial}
                      onChange={(evento) => {
                        setDadosFormulario({ ...dadosFormulario, senhaInicial: evento.target.value });
                        setErrors(prev => { const next = { ...prev }; delete next.senhaInicial; return next; });
                      }}
                      required
                      className={`delphi-input bg-slate-50 border-slate-200 font-mono text-blue-700 ${errors.senhaInicial ? 'border-red-500' : ''}`}
                    />
                  </FormField>
                )}
              </FormGrid>
            </div>

            {/* Seção: Atuação Profissional */}
            <div className="space-y-4">
              <FormSectionTitle>Atuação Profissional</FormSectionTitle>
              <FormGrid>


                <FormField label="Conselho Profissional" required className="md:col-span-6" error={errors.conselhoProfissional}>
                  <Combobox
                    options={OPCOES_CONSELHO_PROFISSIONAL.map((c) => ({ value: c.value, label: c.label }))}
                    value={dadosFormulario.conselhoProfissional}
                    onChange={(valor) => {
                      setDadosFormulario({
                        ...dadosFormulario,
                        conselhoProfissional: valor,
                        // NAO_INFORMADO → injeta '00' no estado (vai para o backend como NULL)
                        // Qualquer outro conselho selecionado → limpa para o usuário digitar
                        // Deselecionar (valor='') → limpa também
                        registroProfissional: valor === 'NAO_INFORMADO' ? '00' : '',
                      });
                      setErrors(prev => { const next = { ...prev }; delete next.conselhoProfissional; return next; });
                    }}
                    placeholder="Selecione o conselho..."
                    searchPlaceholder="Buscar conselho..."
                    emptyText="Nenhum conselho encontrado."
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.conselhoProfissional ? 'border-red-500' : ''}`}
                  />
                </FormField>

                {/* Campo oculto quando NAO_INFORMADO: não há registro a informar */}
                {dadosFormulario.conselhoProfissional !== 'NAO_INFORMADO' && (
                  <FormField label="Registro Profissional" required className="md:col-span-6" error={errors.registroProfissional}>
                    <Input
                      value={dadosFormulario.registroProfissional}
                      onChange={(evento) => {
                        setDadosFormulario({ ...dadosFormulario, registroProfissional: evento.target.value });
                        setErrors(prev => { const next = { ...prev }; delete next.registroProfissional; return next; });
                      }}
                      required
                      className={`delphi-input bg-slate-50 border-slate-200 ${errors.registroProfissional ? 'border-red-500' : ''}`}
                      placeholder="Ex: 12345"
                    />
                  </FormField>
                )}

                {/* Quando NAO_INFORMADO (sem campo de registro), especialidade fica ao lado (col-6). Caso contrário, linha toda (col-12). */}
                <FormField
                  label="Especialidade Principal"
                  required
                  className={dadosFormulario.conselhoProfissional === 'NAO_INFORMADO' ? 'md:col-span-6' : 'md:col-span-12'}
                  error={errors.idEspecialidade}
                >
                  <Combobox
                    options={especialidades.map(renderSpecialtyOption)}
                    value={dadosFormulario.idEspecialidade}
                    onChange={(valor) => {
                      setDadosFormulario({ ...dadosFormulario, idEspecialidade: valor });
                      setErrors(prev => { const next = { ...prev }; delete next.idEspecialidade; return next; });
                    }}
                    placeholder="Selecione a especialidade..."
                    searchPlaceholder="Buscar especialidade..."
                    emptyText="Nenhuma especialidade encontrada."
                    className={`delphi-input bg-slate-50 border-slate-200 ${errors.idEspecialidade ? 'border-red-500' : ''}`}
                  />
                </FormField>

              </FormGrid>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="px-6 rounded-lg text-slate-700 font-semibold border-slate-300 hover:bg-slate-100"
                onClick={aoFechar}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="px-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20"
                disabled={salvando || (!idProfissionalEdicao && !podeProvisionarUsuarios)}
              >
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {idProfissionalEdicao ? 'Atualizar Profissional' : 'Cadastrar Profissional'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
