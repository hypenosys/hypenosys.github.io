/**
 * HYPENOSYS PLAYGROUND — Kanban Module
 */

(function() {
    function renderKanban() {
        const tasks = window.sandboxDb.getTasks();
        const cols = {
            'Todo': document.querySelector('#col-todo .cards-container'),
            'In Progress': document.querySelector('#col-progress .cards-container'),
            'Done': document.querySelector('#col-done .cards-container')
        };

        Object.values(cols).forEach(c => { if(c) c.innerHTML = ''; });

        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'sandbox-card';
            card.id = `task-${task.id}`;
            card.draggable = true;
            card.ondragstart = window.drag;
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <span class="badge badge-dark text-muted font-mono">#${task.id}</span>
                    <button class="btn btn-link btn-sm p-0 text-danger" onclick="deleteTask('${task.id}')">&times;</button>
                </div>
                <div class="mt-2 text-white font-weight-bold">${task.title}</div>
            `;
            if (cols[task.status]) cols[task.status].appendChild(card);
        });
    }

    window.addSandboxTask = function() {
        const tasks = window.sandboxDb.getTasks();
        const id = Date.now().toString().slice(-4);
        const newTask = {
            id: id,
            title: `Tarea de prueba #${id}`,
            status: 'Todo',
            priority: 'Medium',
            timestamp: new Date().toISOString()
        };
        tasks.push(newTask);
        window.sandboxDb.saveTasks(tasks);
        window.sandboxDb.log(`Añadida tarea #${id}`);
    };

    window.allowDrop = function(ev) {
        ev.preventDefault();
    };

    window.drag = function(ev) {
        ev.dataTransfer.setData("taskId", ev.target.id.replace('task-', ''));
    };

    window.drop = function(ev, newStatus) {
        ev.preventDefault();
        const taskId = ev.dataTransfer.getData("taskId");
        const tasks = window.sandboxDb.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            const oldStatus = task.status;
            task.status = newStatus;
            window.sandboxDb.saveTasks(tasks);
            window.sandboxDb.log(`Tarea #${taskId} movida: ${oldStatus} -> ${newStatus}`);
        }
    };

    window.deleteTask = function(id) {
        let tasks = window.sandboxDb.getTasks();
        tasks = tasks.filter(t => t.id !== id);
        window.sandboxDb.saveTasks(tasks);
        window.sandboxDb.log(`Eliminada tarea #${id}`);
    };

    // Export render function to main playground
    window.renderSandboxKanban = renderKanban;

})();
