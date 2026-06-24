/**
 * HYPENOSYS UNREAL TUTORIAL — Kanban Logic
 * Isolated system for learning UE5 without affecting production data.
 */

(function() {
    const STORAGE_KEY = 'hy_unreal_tasks';

    const unrealDb = {
        getTasks() {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) return JSON.parse(data);

            // Seed data from the tutorial modules
            const seed = [
                { id: 'UE-001', title: 'Configurar proyecto UE5 y jerarquía de carpetas', status: 'TODO', type: 'Setup' },
                { id: 'UE-002', title: 'Importar modelo 3D y asignar material', status: 'TODO', type: 'Assets' },
                { id: 'UE-003', title: 'Crear Blueprint Actor con Variable Pública', status: 'TODO', type: 'Blueprints' },
                { id: 'UE-004', title: 'C++: Crear clase AActor y exponer UPROPERTY', status: 'TODO', type: 'C++' },
                { id: 'UE-005', title: 'Lógica: Mover objeto al hacer clic (BP/C++)', status: 'TODO', type: 'Code' },
                { id: 'UE-006', title: 'Uso de Console Commands para Debugging', status: 'TODO', type: 'Tools' },
                { id: 'UE-007', title: 'BlueprintNativeEvent: Comunicación C++ a BP', status: 'TODO', type: 'Advanced' }
            ];
            this.saveTasks(seed);
            return seed;
        },

        saveTasks(tasks) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
            renderUnrealKanban();
        }
    };

    function renderUnrealKanban() {
        const tasks = unrealDb.getTasks();
        const cols = {
            'TODO': document.querySelector('#col-unreal-todo .unreal-cards-list'),
            'WORKING': document.querySelector('#col-unreal-progress .unreal-cards-list'),
            'DONE': document.querySelector('#col-unreal-done .unreal-cards-list')
        };

        // Clear columns
        Object.values(cols).forEach(c => { if(c) c.innerHTML = ''; });

        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'unreal-task-card';
            card.id = `utask-${task.id}`;
            card.draggable = true;
            card.ondragstart = (ev) => {
                ev.dataTransfer.setData("taskId", task.id);
            };

            // Using structured construction to avoid XSS via innerHTML
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <span class="task-id"></span>
                    <button class="btn btn-link btn-sm p-0 text-danger delete-btn" title="Eliminar">&times;</button>
                </div>
                <div class="task-title"></div>
                <div class="task-meta">
                    <span class="badge badge-dark border border-secondary text-uppercase task-type" style="font-size: 8px;"></span>
                    <span class="text-purple cycle-btn" style="cursor:pointer">
                        <i class="fas fa-redo-alt"></i>
                    </span>
                </div>
            `;

            card.querySelector('.task-id').textContent = `#${task.id}`;
            card.querySelector('.task-title').textContent = task.title;
            card.querySelector('.task-type').textContent = task.type || 'Práctica';

            card.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                window.deleteUnrealTask(task.id);
            };

            card.querySelector('.cycle-btn').onclick = (e) => {
                e.stopPropagation();
                window.cycleUnrealStatus(task.id);
            };

            if (cols[task.status]) {
                cols[task.status].appendChild(card);
            }
        });
    }

    window.addNewUnrealTask = function() {
        const title = prompt("Título de la nueva práctica:");
        if (!title) return;

        const tasks = unrealDb.getTasks();
        const id = 'UE-' + Math.floor(100 + Math.random() * 899);
        tasks.push({
            id: id,
            title: title,
            status: 'TODO',
            type: 'Custom'
        });
        unrealDb.saveTasks(tasks);
    };

    window.deleteUnrealTask = function(id) {
        if (!confirm('¿Eliminar esta tarea de práctica?')) return;
        let tasks = unrealDb.getTasks();
        tasks = tasks.filter(t => t.id !== id);
        unrealDb.saveTasks(tasks);
    };

    window.cycleUnrealStatus = function(id) {
        const tasks = unrealDb.getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            const flow = ['TODO', 'WORKING', 'DONE'];
            const idx = flow.indexOf(task.status);
            task.status = flow[(idx + 1) % flow.length];
            unrealDb.saveTasks(tasks);
        }
    };

    window.allowUnrealDrop = function(ev) {
        ev.preventDefault();
    };

    window.unrealDrop = function(ev, newStatus) {
        ev.preventDefault();
        const taskId = ev.dataTransfer.getData("taskId");
        const tasks = unrealDb.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            unrealDb.saveTasks(tasks);
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        renderUnrealKanban();
    });

})();
