import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';

interface PaginationControlProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function PaginationControl({
  currentPage,
  totalPages,
  totalItems,
  onPageChange
}: PaginationControlProps) {
  // Função para calcular quais números de página mostrar
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) {
    return (
      <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200/70 px-4 py-3 bg-transparent">
        <span className="text-[12px] font-medium text-slate-400">Nenhum registro encontrado</span>
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200/70 px-4 py-3 bg-transparent">
      <div className="text-[12px] font-medium text-slate-500 hidden sm:block">
        Total de <span className="font-bold text-slate-700">{totalItems.toLocaleString('pt-BR')}</span> {totalItems === 1 ? 'registro' : 'registros'}
      </div>
      
      <div className="flex items-center gap-1 ml-auto sm:ml-0">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Primeira página"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all mr-1 sm:mr-2"
          title="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Versão Desktop: Numeração */}
        <div className="items-center gap-1 hidden sm:flex">
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="flex h-8 w-8 items-center justify-center text-slate-400">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
              <button
                key={`page-${page}`}
                type="button"
                onClick={() => onPageChange(page as number)}
                className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-lg text-[13px] font-semibold transition-all ${
                  currentPage === page 
                    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>
        
        {/* Versão Mobile: Simplificada */}
        <div className="sm:hidden flex items-center px-3 h-8 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 mx-1">
          Pág. {currentPage} / {totalPages}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all ml-1 sm:ml-2"
          title="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Última página"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
