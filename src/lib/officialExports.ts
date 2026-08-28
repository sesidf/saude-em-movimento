import { toast } from 'sonner';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';

export type ExportFormat = 'excel' | 'csv' | 'pdf';

export type OfficialReport = {
  report_id?: string;
  report_code?: string;
  title?: string;
  rows_count?: number;
  pdf_file_name?: string;
  snapshot?: unknown;
};

// ─── Helpers de formatação ──────────────────────────────────────────────────

const plain = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();
  return JSON.stringify(valor);
};

const FIELD_LABELS: Record<string, string> = {
  id: 'Identificador', report_id: 'Relatório', report_code: 'Código', code: 'Código',
  status: 'Situação', reason: 'Motivo', patient: 'Paciente', patient_name: 'Paciente',
  cpf: 'CPF', phone: 'Telefone', email: 'E-mail', birth_date: 'Data de nascimento', patient_birth_date: 'Data de nascimento',
  appointment_date: 'Data da consulta', operational_at: 'Data operacional', created_at: 'Criado em',
  institution: 'Instituição', institution_name: 'Instituição', specialty: 'Especialidade',
  specialty_name: 'Especialidade', professional: 'Profissional', doctor_name: 'Profissional',
  doctor_crm: 'Registro profissional', quantity: 'Quantidade', total: 'Total',
  count: 'Total', rows_count: 'Registros',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', agendado: 'Agendado', confirmed: 'Confirmado', confirmado: 'Confirmado',
  in_progress: 'Em atendimento', em_atendimento: 'Em atendimento',
  completed: 'Concluído', concluded: 'Concluído', concluido: 'Concluído',
  finalized: 'Finalizado', canceled: 'Cancelado', cancelled: 'Cancelado', cancelado: 'Cancelado',
  no_show: 'Não compareceu', nao_compareceu: 'Não compareceu', absent: 'Não compareceu',
  active: 'Ativo', inactive: 'Inativo', pending: 'Pendente', sent: 'Enviado', failed: 'Falhou',
};

/** Converte chave técnica para rótulo legível em PT-BR. */
const humanizeKey = (chave: string): string => {
  const key = chave.trim().toLowerCase();
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

/** Traduz status de inglês/interno para PT-BR. */
const traduzirStatus = (valor: unknown): string => {
  const key = plain(valor).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
  return STATUS_LABELS[key] || plain(valor);
};

/** Formata CPF no Excel: sem censura, com formatação (123.456.789-01). */
const formatarCpfCompleto = (valor: unknown): string => {
  const digitos = plain(valor).replace(/\D/g, '');
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  return plain(valor);
};

/** Formata data para formato brasileiro (dd/mm/aaaa ou dd/mm/aaaa hh:mm). */
const formatarDataPtBR = (valor: unknown, comHora = false): string => {
  const str = plain(valor).trim();
  if (!str) return '';
  try {
    const parts = str.split('-');
    if (!comHora && parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: comHora ? 'America/Sao_Paulo' : 'UTC',
      dateStyle: 'short',
      ...(comHora ? { timeStyle: 'short' } : {}),
    }).format(d);
  } catch {
    return str;
  }
};

/** Formata célula conforme a coluna: datas, status e CPF recebem tratamento especial. */
const formatarCelula = (colKey: string, valor: unknown): string => {
  const key = colKey.trim().toLowerCase();
  if (key === 'status') return traduzirStatus(valor);
  if (key === 'patient_cpf' || key === 'cpf') return formatarCpfCompleto(valor);
  if (key === 'appointment_date' || key === 'data_consulta') return formatarDataPtBR(valor, true);
  if (key === 'patient_birth_date' || key === 'birth_date' || key === 'data_nascimento') return formatarDataPtBR(valor, false);
  return plain(valor);
};

/** Colunas técnicas que não devem ir para a planilha. */
const COLUNAS_OCULTAS = new Set([
  'id', 'created_by', 'updated_by', 'deleted_at', 'deleted_by',
  'snapshot', 'payload', 'content_hash', 'signature_hash',
  'institution_id', 'specialty_id', 'doctor_id', 'patient_id', 'encounter_id', 'appointment_id',
]);

const isColunaOculta = (colKey: string): boolean => {
  const k = colKey.trim().toLowerCase();
  return COLUNAS_OCULTAS.has(k) || k.endsWith('_id');
};

// ─── Gerador de Excel Client-Side (.xlsx) ───────────────────────────────────

/**
 * Gera o arquivo Excel (.xlsx) diretamente no navegador usando SheetJS.
 * Não envia dados para servidor e aplica formatações de CPF e datas.
 * @param report - Objeto de relatório com snapshot
 * @returns Blob do arquivo xlsx
 */
const gerarExcelClienteSide = async (report: OfficialReport): Promise<Blob> => {
  const XLSX = await import('xlsx');
  const snapshot = (report.snapshot as Record<string, unknown>) || {};
  const rows = (snapshot.rows as Record<string, unknown>[]) || [];
  const allCols: string[] = Array.isArray(snapshot.columns)
    ? (snapshot.columns as string[])
    : rows.length > 0 ? Object.keys(rows[0]) : [];

  const visibleCols = allCols.filter((c) => !isColunaOculta(c));
  const cols = visibleCols.length > 0 ? visibleCols : allCols;

  const headerRow = cols.map(humanizeKey);
  const dataRows = rows.map((row) => cols.map((c) => formatarCelula(c, row[c])));

  const wsData = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = cols.map((c, colIdx) => {
    const headerLen = humanizeKey(c).length;
    const maxDataLen = dataRows.reduce((acc, r) => Math.max(acc, String(r[colIdx] || '').length), 0);
    return { wch: Math.min(Math.max(headerLen, maxDataLen, 10) + 3, 50) };
  });

  const wb = XLSX.utils.book_new();
  const sheetName = (report.title || 'Relatorio').slice(0, 31).replace(/[:\\\/\?\*\[\]]/g, '-');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

/**
 * Gera o arquivo CSV do relatório diretamente no navegador.
 * @param report - Objeto de relatório com snapshot
 * @returns Blob do arquivo csv
 */
const gerarCsvClienteSide = (report: OfficialReport): Blob => {
  const snapshot = (report.snapshot as Record<string, unknown>) || {};
  const rows = (snapshot.rows as Record<string, unknown>[]) || [];
  const allCols: string[] = Array.isArray(snapshot.columns)
    ? (snapshot.columns as string[])
    : rows.length > 0 ? Object.keys(rows[0]) : [];
  const visibleCols = allCols.filter((c) => !isColunaOculta(c));
  const cols = visibleCols.length > 0 ? visibleCols : allCols;

  const csvEscape = (valor: unknown): string => {
    const text = plain(valor).replace(/\r?\n/g, ' ');
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    cols.map(humanizeKey).join(';'),
    ...rows.map((row) => cols.map((c) => csvEscape(formatarCelula(c, row[c]))).join(';')),
  ];

  return new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
};

const triggerBrowserDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);

  window.requestAnimationFrame(() => {
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  });
};

// ─── API pública de download ────────────────────────────────────────────────

/**
 * Baixa a planilha do relatório em Excel (.xlsx) ou CSV.
 * @param report - Objeto de relatório
 * @param format - Formato desejado (excel | csv | pdf)
 */
export const downloadReportFile = async (report: OfficialReport, format: ExportFormat) => {
  if (format === 'pdf') {
    toast.info('A exportação em PDF foi desativada. As planilhas oficiais estão disponíveis em Excel (.xlsx) e CSV.');
    return;
  }

  const baseName = (report.report_code || 'relatorio-sms-medco')
    .replace(/\.(pdf|csv|xls|xlsx)$/i, '');

  if (format === 'excel') {
    const blob = await gerarExcelClienteSide(report);
    triggerBrowserDownload(blob, `${baseName}.xlsx`);
    return;
  }

  if (format === 'csv') {
    const blob = gerarCsvClienteSide(report);
    triggerBrowserDownload(blob, `${baseName}.csv`);
    return;
  }
};

/**
 * Exportação de compatibilidade para módulos.
 */
export const generateAndDownloadModuleExport = async (
  moduleName: string,
  format: ExportFormat,
  options?: any
) => {
  if (format === 'pdf') {
    toast.info('Emissão de documentos em PDF desativada. Utilize a exportação de planilha na página de Relatórios.');
    return;
  }

  toast.info('Para planilhas consolidadas e relatórios completos, utilize a página de Relatórios.');
};
