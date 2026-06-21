/**
 * HYPENOSYS — Error Boundary System (Vanilla JS)
 * Provides isolation and fallback UI for dashboard components.
 */

const ErrorBoundary = {
    /**
     * Safely invokes a rendering function within a try-catch block.
     * @param {string} containerId - The ID of the container element.
     * @param {string} componentName - A descriptive name of the component.
     * @param {Function} fn - The function to execute.
     */
    safeInvoke(containerId, componentName, fn) {
        try {
            fn();
        } catch (error) {
            console.error(`[ERROR BOUNDARY] Error caught in component "${componentName}":`, error);
            this.renderFallbackUI(containerId, componentName, error);
        }
    },

    /**
     * Renders a fallback UI in case of a component crash.
     * @param {string} containerId - The ID of the container element.
     * @param {string} componentName - The name of the failed component.
     * @param {Error} error - The error object.
     */
    renderFallbackUI(containerId, componentName, error) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`[ERROR BOUNDARY] Container "${containerId}" not found for fallback UI.`);
            return;
        }

        // Apply Dracula-themed fallback
        container.innerHTML = `
            <div class="bg-slate-900 border border-red-500/50 rounded-2xl p-6 text-center my-4 shadow-xl">
                <div class="text-red-500 text-4xl mb-4">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Error en ${componentName}</h3>
                <p class="text-slate-400 text-sm mb-4">Ocurrió un error inesperado al renderizar este componente.</p>
                <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-6 text-left overflow-x-auto custom-scrollbar">
                    <code class="text-[10px] text-red-400 font-mono break-all">${error.message}</code>
                </div>
                <div class="flex justify-center gap-3">
                    <button onclick="window.location.reload()" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold border border-slate-700 transition-all flex items-center gap-2">
                        <i class="fa-solid fa-rotate-right"></i> Refrescar Página
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Initializes global error listeners.
     */
    init() {
        window.addEventListener('error', (event) => {
            console.error('[GLOBAL ERROR]:', event.error);
            // Hook for external logging (Sentry, Rollbar) could be added here
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('[UNHANDLED REJECTION]:', event.reason);
            // Hook for external logging (Sentry, Rollbar) could be added here
        });

        console.log('[ERROR BOUNDARY] Initialized');
    }
};

// Initialize the boundary system
ErrorBoundary.init();

window.ErrorBoundary = ErrorBoundary;
