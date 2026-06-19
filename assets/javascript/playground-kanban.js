/**
 * HYPENOSYS PLAYGROUND — Mini Kanban Logic
 */

(function() {
    const COLUMNS = ['Todo', 'In Progress', 'Done'];
    let tasks = JSON.parse(localStorage.getItem('sandbox_tasks') || '[]');

    function saveTasks() {
        localStorage.setItem('sandbox_tasks', JSON.stringify(tasks));
        if (window.sandboxLog) window.sandboxLog('🗂️ Kanban: Tareas sincronizadas con localStorage');
    }

    function renderBoard() {
        COLUMNS.forEach(status => {
            const id = status.toLowerCase().replace(' ', '-');
            const col = document.getElementById(`col-${id}`);
            if (!col) return;
            const container = col.querySelector('.kanban-cards');
            container.innerHTML = '';

            const colTasks = tasks.filter(t => t.status === status);
            colTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'kanban-card';
                card.draggable = true;
                card.dataset.id = task.id;
                card.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <span class="small font-weight-bold">#${task.id}</span>
                        <button class="btn btn-link btn-sm p-0 text-danger delete-task" data-id="${task.id}">&times;</button>
                    </div>
                    <div class="mt-1">${task.title}</div>
                `;

                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    card.style.opacity = '0.5';
                });

                card.addEventListener('dragend', () => {
                    card.style.opacity = '1';
                });

                container.appendChild(card);
            });

            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                container.style.background = 'rgba(189, 147, 249, 0.1)';
            });

            container.addEventListener('dragleave', () => {
                container.style.background = 'transparent';
            });

            container.addEventListener('drop', (e) => {
                e.preventDefault();
                container.style.background = 'transparent';
                const taskId = e.dataTransfer.getData('text/plain');
                moveTask(taskId, status);
            });
        });

        // Re-bind delete buttons
        document.querySelectorAll('.delete-task').forEach(btn => {
            btn.onclick = (e) => {
                const id = e.target.dataset.id;
                deleteTask(id);
            };
        });
    }

    function addTestTask() {
        const id = Math.floor(Math.random() * 9000) + 1000;
        const newTask = {
            id: id,
            title: `Tarea de prueba ${id}`,
            status: 'Todo'
        };
        tasks.push(newTask);
        saveTasks();
        renderBoard();
        if (window.sandboxLog) window.sandboxLog(`🗂️ Kanban: Añadida tarea #${id}`);
    }

    function moveTask(id, newStatus) {
        const task = tasks.find(t => String(t.id) === String(id));
        if (task && task.status !== newStatus) {
            const oldStatus = task.status;
            task.status = newStatus;
            saveTasks();
            renderBoard();
            if (window.sandboxLog) window.sandboxLog(`🗂️ Kanban: Tarea #${id} movida ${oldStatus} -> ${newStatus}`);
        }
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => String(t.id) !== String(id));
        saveTasks();
        renderBoard();
        if (window.sandboxLog) window.sandboxLog(`🗂️ Kanban: Eliminada tarea #${id}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderBoard();
        document.getElementById('add-test-task')?.addEventListener('click', addTestTask);
    });

})();
