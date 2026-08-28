import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { censorCPF } from '@/utils/masks';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { criarEstadoNavegacao } from '@/lib/intencaoNavegacao';

interface SearchResult {
  id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
}

export const GlobalSearch = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchPatients = async () => {
      if (query.trim().length < 3) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await chamarApiPost('/api/rpc/list_patients_catalog', {
          p_search: query.trim(),
          p_include_inactive: false,
          p_limit: 5,
        });
        if (error) throw error;
        setResults((data as SearchResult[]) || []);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchPatients, 400);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = (patient: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    // Usa criarEstadoNavegacao para garantir tipagem segura e padrão centralizado
    // chaveUnica é gerado automaticamente por criarEstadoNavegacao para forçar re-processamento
    navigate('/patients', { state: criarEstadoNavegacao({ buscarPaciente: patient.full_name }) });
  };

  return (
    <div ref={wrapperRef} className="relative z-50 w-[320px] shrink-0 ml-3 mr-4 hidden md:block">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Busca global (Nome ou CPF)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full h-9 pl-9 pr-4 rounded-full bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm transition-all shadow-inner outline-none placeholder:text-slate-400"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />}
      </div>

      {isOpen && query.trim().length >= 3 && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          {results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto">
              <li className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">Pacientes Encontrados</li>
              {results.map((patient) => (
                <li
                  key={patient.id}
                  onClick={() => handleSelect(patient)}
                  className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors"
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-bold ${getAvatarColor(patient.full_name)}`}>
                    {getInitials(patient.full_name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-slate-800 truncate">{patient.full_name}</span>
                    <span className="text-xs text-slate-500">
                      {patient.cpf ? censorCPF(patient.cpf) : 'CPF não informado'}
                      {patient.birth_date ? ` • ${new Date(patient.birth_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : !loading ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Nenhum paciente encontrado para "{query}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
