/**
 * God Mode Tool Definitions for Claude Chat
 */

(function() {
    const godModeTools = {
        /**
         * Get Kanban context for the prompt
         */
        getKanbanContext: async () => {
            const tasks = await window.taskOps.getAllTasks();
            const counts = {
                BACKLOG: 0, TODO: 0, WORKING: 0, REVIEW: 0, DONE: 0, BLOCKED: 0
            };
            const blocked = [];
            const urgent = [];
            const now = new Date();

            tasks.forEach(t => {
                counts[t.estado]++;
                const alerts = window.taskEngine.computeAlerts(t);
                if (alerts.some(a => a.type === 'BLOCKED')) blocked.push(t);
                if (alerts.some(a => a.type === 'URGENT')) urgent.push(t);
            });

            return {
                summary: counts,
                blocked_tasks: blocked.map(t => ({ id: t.id, title: t.titulo, assigned: t.asignado_a })),
                urgent_tasks: urgent.map(t => ({ id: t.id, title: t.titulo, due: t.due_date })),
                total_active: tasks.length
            };
        },

        /**
         * Get GitHub Context
         */
        getGitHubContext: async (repoName) => {
            if (!repoName) return null;
            return await window.githubContext.getRepoContext(repoName);
        },

        /**
         * System Prompt Extension for God Mode
         */
        getGodModeSystemPrompt: async (activeRepo) => {
            const kanban = await godModeTools.getKanbanContext();
            const gh = activeRepo ? await godModeTools.getGitHubContext(activeRepo) : null;

            return `
### CONTEXTO DE PROYECTO (HYPENOSYS GOD MODE)
ESTADO KANBAN:
${JSON.stringify(kanban.summary)}
Tareas Bloqueadas: ${kanban.blocked_tasks.length}
Tareas Urgentes: ${kanban.urgent_tasks.length}

${gh ? `REPO ACTUAL: ${activeRepo}
Ramas: ${gh.branches.length}
PRs Abiertos: ${gh.prs.length}` : 'No hay repo seleccionado.'}

### CAPACIDADES (HERRAMIENTAS JS DISPONIBLES)
- Crear/Actualizar tareas via taskOps.
- Consultar GitHub via githubContext.
- Gestionar sesiones de Jules via julesApi.

Responde siempre en español. Si vas a realizar una acción (crear tarea, mover estado), presenta el JSON primero para confirmación.
`;
        }
    };

    window.godModeTools = godModeTools;
})();
