/**
 * Task Engine - Business Logic for the Kanban system
 * Handles alerts, validations and state mapping
 */

(function() {
    const taskEngine = {
        /**
         * Validates a task object before submission
         */
        validate: (task) => {
            if (!task.titulo || task.titulo.trim().length === 0) return 'El título es obligatorio';
            if (!task.asignado_a || task.asignado_a.length === 0) return 'Al menos un asignado es necesario';
            return null;
        },

        /**
         * Computes automatic alerts for a task
         */
        computeAlerts: (task) => {
            const alerts = [];
            const now = new Date();
            const updatedAt = new Date(task.updated_at || task.created_at);
            const diffHours = (now - updatedAt) / (1000 * 60 * 60);

            // 48h WORKING check
            if (task.estado === 'WORKING' && diffHours > 48) {
                alerts.push({ type: 'BLOCKED', message: 'Bloqueada por inactividad (+48h)' });
            }

            // Due date < 24h
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                const diffDue = (dueDate - now) / (1000 * 60 * 60);
                if (diffDue > 0 && diffDue < 24) {
                    alerts.push({ type: 'URGENT', message: 'Entrega en menos de 24h' });
                }
            }

            // Jules loop waiting
            if (task.jules_loop_estado === 'esperando_validacion') {
                alerts.push({ type: 'JULES', message: 'Pendiente de validación Jules' });
            }

            return alerts;
        },

        /**
         * Syncs task between multiple tabs using storage events
         */
        initSync: (callback) => {
            window.addEventListener('storage', (e) => {
                if (e.key === 'hypenosys_tasks_updated') {
                    callback();
                }
            });
        },

        notifyUpdate: () => {
            localStorage.setItem('hypenosys_tasks_updated', Date.now().toString());
        }
    };

    window.taskEngine = taskEngine;
})();
