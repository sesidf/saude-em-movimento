import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { maskCNPJ, maskPhone, validateCNPJ } from '@/utils/masks';
import { normalizarEntradaTexto } from '@/utils/formatters';
import type { useAccessControl } from '../useAccessControl';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { toast } from 'sonner';
import { getOperationalErrorMessage } from '@/lib/errors';

type CreateInstitutionModalProps = {
  accessControl: ReturnType<typeof useAccessControl>;
};

export const CreateInstitutionModal: React.FC<CreateInstitutionModalProps> = ({ accessControl }) => {
  const {
    institutionOpen, setInstitutionOpen,
    institutionForm, setInstitutionForm,
    saveInstitution, saving
  } = accessControl;

  const fetchInstitutionByCNPJ = async (cnpj: string) => {
    try {
      const { data, error } = await chamarApiPost('/api/functions/fetch-cnpj', {
        body: { cnpj }
      });
      if (error) throw error;
      if (data && data.status === 'OK') {
        setInstitutionForm((current: any) => ({
          ...current,
          name: data.nome || data.fantasia || current.name,
          email: data.email || current.email,
          phone: data.telefone || current.phone,
          address: data.logradouro ? `${data.logradouro}, ${data.numero}${data.complemento ? ' - ' + data.complemento : ''}, ${data.bairro}, ${data.cep}` : current.address,
          city: data.municipio || current.city,
          state: data.uf || current.state,
        }));
        toast.success('Dados importados da Receita Federal');
      }
    } catch (error) {
      console.error('Error fetching CNPJ:', error);
      toast.error(getOperationalErrorMessage(error, 'Erro ao consultar CNPJ'));
    }
  };

  return (
    <Dialog open={institutionOpen} onOpenChange={setInstitutionOpen}>
      <DialogContent className="max-w-2xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col space-y-1.5">
            <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">Nova instituição</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">Formulário para cadastrar uma nova instituição de saúde.</DialogDescription>
          </div>
          
          <form onSubmit={saveInstitution} className="flex flex-col gap-8">
            <div className="space-y-4">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-blue-600 border-b border-slate-200 pb-2">
                Dados Institucionais
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col sm:flex-row gap-5 sm:col-span-2">
                  <div className="space-y-2 flex-1">
                    <Label className="text-slate-700 font-semibold text-xs uppercase">Nome <span className="text-red-500">*</span></Label>
                    <Input
                      value={institutionForm.name}
                      onChange={(event) => setInstitutionForm({ ...institutionForm, name: event.target.value.toUpperCase() })}
                      onBlur={(event) => setInstitutionForm({ ...institutionForm, name: normalizarEntradaTexto(event.target.value) })}
                      required
                      placeholder="Ex: CLINICA MUNICIPAL DE SAUDE"
                      style={{ textTransform: 'uppercase' }}
                      className="delphi-input bg-slate-50 border-slate-200"
                    />
                  </div>
                  
                  <div className="space-y-2 w-full sm:w-[180px] shrink-0">
                    <Label className="text-slate-700 font-semibold text-xs uppercase">CNPJ</Label>
                    <Input 
                      value={institutionForm.cnpj} 
                      onChange={(event) => {
                        const masked = maskCNPJ(event.target.value);
                        setInstitutionForm({ ...institutionForm, cnpj: masked });
                        const cleanCNPJ = masked.replace(/\D/g, '');
                        if (cleanCNPJ.length === 14 && validateCNPJ(cleanCNPJ)) {
                          void fetchInstitutionByCNPJ(cleanCNPJ);
                        }
                      }}
                      placeholder="00.000.000/0000-00"
                      className="delphi-input bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs uppercase">E-mail</Label>
                  <Input type="email" value={institutionForm.email} onChange={(event) => setInstitutionForm({ ...institutionForm, email: event.target.value })} className="delphi-input bg-slate-50 border-slate-200" />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs uppercase">Telefone</Label>
                  <Input value={institutionForm.phone} onChange={(event) => setInstitutionForm({ ...institutionForm, phone: maskPhone(event.target.value) })} placeholder="(00) 0000-0000" className="delphi-input bg-slate-50 border-slate-200" />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs uppercase">Cidade</Label>
                  <Input
                    value={institutionForm.city}
                    onChange={(event) => setInstitutionForm({ ...institutionForm, city: event.target.value.toUpperCase() })}
                    onBlur={(event) => setInstitutionForm({ ...institutionForm, city: normalizarEntradaTexto(event.target.value) })}
                    style={{ textTransform: 'uppercase' }}
                    className="delphi-input bg-slate-50 border-slate-200"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs uppercase">Estado</Label>
                  <Input
                    value={institutionForm.state}
                    onChange={(event) => setInstitutionForm({ ...institutionForm, state: event.target.value.toUpperCase() })}
                    style={{ textTransform: 'uppercase' }}
                    className="delphi-input bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-700 font-semibold text-xs uppercase">Endereço</Label>
                  <Input
                    value={institutionForm.address}
                    onChange={(event) => setInstitutionForm({ ...institutionForm, address: event.target.value.toUpperCase() })}
                    onBlur={(event) => setInstitutionForm({ ...institutionForm, address: normalizarEntradaTexto(event.target.value) })}
                    style={{ textTransform: 'uppercase' }}
                    className="delphi-input bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-100">
              <Button type="button" variant="outline" className="px-6 rounded-2xl text-slate-700 font-semibold border-slate-300 hover:bg-slate-100" onClick={() => setInstitutionOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Instituição
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

