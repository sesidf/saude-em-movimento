import { Component, ErrorInfo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logger } from '@/utils/logger';

interface Props {
  children?: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Indica que um reload automático foi acionado — evita loop infinito */
  reloadAttempted: boolean;
}

/**
 * Chave usada no sessionStorage para registrar quantas vezes um reload de chunk foi feito.
 * Isso evita que a aplicação entre em loop infinito ao tentar recarregar módulos
 * inexistentes (ex: deploy desatualizado com chunks 404 no Cloudflare).
 */
const CHUNK_RELOAD_KEY = 'sms_chunk_reload_count';

/**
 * Máximo de reloads automáticos antes de exibir a tela de erro para o usuário.
 */
const MAX_RELOADS = 3;

/**
 * Verifica se o erro é uma falha de carregamento dinâmico de módulo (chunk 404).
 * Isso acontece quando o Cloudflare serve um deploy desatualizado e o index.html
 * referencia chunks JS que já não existem mais no servidor.
 */
function erroDeChunk(erro: Error): boolean {
  return (
    erro.message.includes('Failed to fetch dynamically imported module') ||
    erro.message.includes('Importing a module script failed') ||
    erro.message.includes('Loading chunk') ||
    erro.message.includes('Loading CSS chunk')
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    reloadAttempted: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  private recarregarComCacheBuster = () => {
    window.location.href = window.location.pathname + '?r=' + Date.now();
  };

  private limparCachesERecarregar = () => {
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      }).finally(() => {
        this.recarregarComCacheBuster();
      });
    } else {
      this.recarregarComCacheBuster();
    }
  };

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Logger.error('Erro não capturado capturado pelo ErrorBoundary:', error, errorInfo);

    // Auto-reload com cache-buster para erros de chunk
    if (erroDeChunk(error)) {
      const tentativasStr = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      const tentativas = tentativasStr ? parseInt(tentativasStr, 10) : 0;

      if (tentativas < MAX_RELOADS) {
        Logger.warn(`Chunk 404 detectado — tentativa ${tentativas + 1}/${MAX_RELOADS} de reload.`);
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(tentativas + 1));
        
        // Limpa caches do Service Worker e do browser antes de recarregar
        this.limparCachesERecarregar();
        return;
      } else {
        Logger.error(`Chunk 404 persiste após ${MAX_RELOADS} tentativas — exibindo tela de erro.`, error);
        this.setState({ reloadAttempted: true });
      }
    }
  }

  public handleRetry = () => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    this.setState({ hasError: false, error: null, reloadAttempted: false });
    // Limpa caches antes de recarregar manualmente
    this.limparCachesERecarregar();
  };

  public render() {
    if (this.state.hasError) {
      const ehErroChunk = this.state.error ? erroDeChunk(this.state.error) : false;
      
      // Detecta se é erro real de falta de internet / rede (excluindo falhas de chunk)
      const semInternet = !window.navigator.onLine;
      const ehErroConexao = !ehErroChunk && (semInternet || (this.state.error && (
        this.state.error.message.includes('net::ERR_') ||
        this.state.error.message.includes('ERR_NAME_NOT_RESOLVED')
      )));

      const fallbackUI = (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-3xl p-10 shadow-2xl text-center flex flex-col items-center gap-6 transform animate-in zoom-in-95 duration-300">
            
            {/* Ícone com animação sutil de pulso */}
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shadow-md relative overflow-hidden animate-pulse duration-2000 ${
              ehErroChunk 
                ? "bg-blue-50 border border-blue-100 text-blue-600 shadow-blue-100/50" 
                : ehErroConexao 
                  ? "bg-amber-50 border border-amber-100 text-amber-600 shadow-amber-100/50"
                  : "bg-rose-50 border border-rose-100 text-rose-600 shadow-rose-100/50"
            }`}>
              {ehErroChunk ? (
                <RefreshCw className="h-7 w-7 animate-spin [animation-duration:8s]" />
              ) : (
                <AlertTriangle className="h-7 w-7" />
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                {ehErroChunk 
                  ? 'Nova versão do sistema disponível' 
                  : ehErroConexao 
                    ? 'Sem conexão com a internet' 
                    : 'Ocorreu uma falha ao carregar o módulo'}
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
                {ehErroChunk
                  ? 'O sistema foi atualizado em nossa nuvem. Clique abaixo para carregar a versão mais recente e ativa.'
                  : ehErroConexao
                    ? 'Verifique sua conexão de rede local e tente novamente.'
                    : (this.props.fallbackMessage || 'Não foi possível carregar os dados desta tela. Tente novamente.')}
              </p>
            </div>

            {!ehErroChunk && !ehErroConexao && this.state.error?.message && (
              <div className="w-full bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-[11px] text-slate-600 font-mono text-left max-h-24 overflow-y-auto break-all">
                {this.state.error.message}
              </div>
            )}

            <Button
              onClick={this.handleRetry}
              className={`w-full text-white font-extrabold h-11 px-6 rounded-2xl text-xs gap-2 active:scale-98 transition-all shadow-md cursor-pointer ${
                ehErroChunk
                  ? "bg-[#003B71] hover:bg-[#002B55] shadow-[#003B71]/10"
                  : "bg-slate-800 hover:bg-slate-950 shadow-slate-800/10"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              {ehErroChunk ? 'Atualizar Sistema Agora' : 'Tentar Novamente'}
            </Button>
          </div>
        </div>
      );

      return createPortal(fallbackUI, document.body);
    }

    return this.props.children;
  }
}
