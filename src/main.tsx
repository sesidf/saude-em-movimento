import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./globals.css";

// Inicializa o Sentry para captura de exceções em produção
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // 10%: suficiente para monitoramento sem overhead em 100% das requests
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1, 
  replaysOnErrorSampleRate: 1.0,
});


const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element not found");
}

let deslogandoEmAndamento = false;

const renderFatalScreen = (title: string, description: string, detail?: string) => {
	root.innerHTML = `
		<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
			<div style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;color:#0f172a;box-shadow:0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02);text-align:center;">
				<div style="width:48px;height:48px;background:#eff6ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
				</div>
				<h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h1>
				<p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.5;">${description}</p>
				${detail ? `<pre style="margin:0 0 24px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;white-space:pre-wrap;font-size:11px;color:#475569;text-align:left;max-height:140px;overflow:auto;">${detail}</pre>` : ""}
				<button onclick="try{localStorage.clear();sessionStorage.clear();}catch(e){};window.location.href=window.location.origin+'/?r='+Date.now();" style="background:#00427A;color:#ffffff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
					Atualizar Sistema
				</button>
			</div>
		</div>
	`;
};

/**
 * Recarrega a aplicação com cache buster de forma segura quando um chunk ou CSS antigo é rejeitado.
 * Se múltiplas falhas ocorrerem em menos de 15 segundos, exibe a tela de atualização.
 */
const tratarErroDeAssetERecarregar = async () => {
	if (deslogandoEmAndamento) return;

	const agora = Date.now();
	const ultimoReloadStr = sessionStorage.getItem("ultimo_reload_auto_chunk");
	const ultimoReload = ultimoReloadStr ? Number(ultimoReloadStr) : 0;

	if (agora - ultimoReload < 15000) {
		console.warn("Segunda falha de chunk/asset detectada em menos de 15s. Exibindo tela de reinicialização.");
		renderFatalScreen(
			"Nova versão disponível",
			"O sistema foi atualizado no servidor. Clique no botão abaixo para recarregar a versão mais recente com os novos arquivos.",
			"Os arquivos do sistema foram atualizados para garantir a estabilidade das operações."
		);
		return;
	}

	deslogandoEmAndamento = true;
	sessionStorage.setItem("ultimo_reload_auto_chunk", agora.toString());

	if ('caches' in window) {
		try {
			const names = await caches.keys();
			await Promise.all(names.map(name => caches.delete(name)));
		} catch (e) {
			console.error("Erro ao limpar cache:", e);
		}
	}

	// Recarrega a página atual com cache-buster preservando a rota e a sessão
	const separador = window.location.search ? '&' : '?';
	const novaUrl = window.location.pathname + window.location.search + separador + 'r=' + agora + window.location.hash;
	window.location.replace(novaUrl);
};

window.addEventListener(
	"error",
	(event) => {
		const target = event.target as HTMLElement;
		// Se o erro originou-se do carregamento falho de uma tag script ou link (como stylesheets),
		// significa que um asset do build não pôde ser carregado (comum em transições de deploys).
		if (target && (target.nodeName === "SCRIPT" || target.nodeName === "LINK")) {
			const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href;
			// Apenas assets do build em /assets/ disparam recarregar
			if (src && src.includes("/assets/")) {
				console.warn("Falha ao carregar recurso estático do build (chunk/style):", src);
				event.preventDefault();
				void tratarErroDeAssetERecarregar();
			}
		}
	},
	true // Habilita a fase de captura para registrar erros de carregamento que não borbulham
);

window.addEventListener("error", (event) => {
	// ResizeObserver loop é um aviso benigno do browser gerado por componentes
	// que redimensionam elementos durante animações (Combobox, Popover, etc).
	// Não representa um crash real — ignorar para não exibir a tela de erro.
	const mensagem = String(event.message || '');
	if (mensagem.includes('ResizeObserver loop')) {
		event.preventDefault();
		event.stopImmediatePropagation();
		return;
	}

	renderFatalScreen(
		"Falha ao iniciar o sistema",
		"O frontend encontrou um erro de execucao antes de concluir a renderizacao.",
		event.error instanceof Error ? event.error.stack || event.error.message : String(event.message || "Erro desconhecido"),
	);
});

window.addEventListener("unhandledrejection", (event) => {
	const reason =
		event.reason instanceof Error
			? event.reason.stack || event.reason.message
			: String(event.reason || "Promessa rejeitada sem detalhe");

	// Corrige o problema do Cloudflare quando a aplicação é atualizada e o browser tenta baixar um chunk antigo (404)
	if (
		reason.includes("Failed to fetch dynamically imported module") ||
		reason.includes("Importing a module script failed") ||
		reason.includes("net::ERR_ABORTED 404")
	) {
		event.preventDefault();
		void tratarErroDeAssetERecarregar();
		return;
	}

	renderFatalScreen(
		"Falha ao iniciar o sistema",
		"O frontend recebeu uma promessa rejeitada sem tratamento durante o bootstrap.",
		reason,
	);
});

window.addEventListener("vite:preloadError", () => {
	void tratarErroDeAssetERecarregar();
});

const bootstrap = async () => {
	try {
		const { default: App } = await import("./App.tsx");
		createRoot(root).render(<App />);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (
			errorMessage.includes("Failed to fetch dynamically imported module") ||
			errorMessage.includes("Importing a module script failed") ||
			errorMessage.includes("error loading dynamically imported module")
		) {
			console.warn("Falha no bootstrap devido a chunk obsoleto, recarregando com cache-buster...");
			void tratarErroDeAssetERecarregar();
			return;
		}

		renderFatalScreen(
			"Falha ao iniciar o sistema",
			"O bootstrap do frontend falhou antes da primeira renderizacao.",
			error instanceof Error ? error.stack || error.message : String(error),
		);
	}
};

void bootstrap();