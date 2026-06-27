/**
 * Motor de Tareas - Lógica de negocio para el sistema Kanban.
 * Gestiona alertas, validaciones y mapeo de estados.
 */

(function() {
    const taskEngine = {
        /**
         * Valida un objeto de tarea antes de su envío.
         * @param {Object} task El objeto de la tarea a validar.
         * @returns {string|null} Mensaje de error o null si es válida.
         */
        validate: (task) => {
            // Soporte para ambos esquemas de nombres (Inglés/Español)
            const title = task.title || task.titulo;
            const asignados = task.asignados || task.asignado_a;

            if (!title || title.trim().length === 0) return 'El título es obligatorio';
            if (!asignados || asignados.length === 0) return 'Al menos un asignado es necesario';
            return null;
        },

        /**
         * Calcula alertas automáticas para una tarea basadas en su estado y fechas.
         * @param {Object} task La tarea a analizar.
         * @returns {Array<Object>} Lista de alertas detectadas { type, message }.
         */
        computeAlerts: (task) => {
            const alerts = [];
            const now = new Date();
            const updatedAt = new Date(task.updated_at || task.fecha || task.created_at);
            const diffHours = (now - updatedAt) / (1000 * 60 * 60);

            // Verificación de inactividad en tareas en progreso (48h)
            const status = (task.estado || '').toUpperCase();
            if (status === 'WORKING' && diffHours > 48) {
                alerts.push({ type: 'BLOCKED', message: 'Bloqueada por inactividad (+48h)' });
            }

            // Fecha de entrega próxima (menos de 24h)
            const dueDate = task.due_date || task.limite;
            if (dueDate) {
                const due = new Date(dueDate);
                const diffDue = (due - now) / (1000 * 60 * 60);
                if (diffDue > 0 && diffDue < 24) {
                    alerts.push({ type: 'URGENT', message: 'Entrega en menos de 24h' });
                }
            }

            // Estado de loop de Jules esperando validación
            if (task.jules_loop_estado === 'esperando_validacion') {
                alerts.push({ type: 'JULES', message: 'Pendiente de validación Jules' });
            }

            return alerts;
        },

        /**
         * Inicializa la sincronización de tareas entre múltiples pestañas usando eventos de storage.
         * @param {Function} callback Función a ejecutar cuando se detecta un cambio.
         */
        initSync: (callback) => {
            window.addEventListener('storage', (e) => {
                if (e.key === 'hypenosys_tasks_updated') {
                    callback();
                }
            });
        },

        /**
         * Notifica a otras pestañas/ventanas que las tareas han cambiado.
         */
        notifyUpdate: () => {
            localStorage.setItem('hypenosys_tasks_updated', Date.now().toString());
        }
    };

    window.taskEngine = taskEngine;
})();
