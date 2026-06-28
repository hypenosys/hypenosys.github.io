/**
 * HYPENOSYS GODOT TUTORIAL — Kanban Logic
 * Isolated system for learning Godot 4.7 without affecting production data.
 */

(function() {
    const STORAGE_KEY = 'hy_godot_tasks';

    const godotDb = {
        getTasks() {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) return JSON.parse(data);

            // Seed data for Godot 4.7 Fundamentals
            const seed = [
                { id: 'GD-001', title: 'Configurar Godot 4.7 y crear primer hito de proyecto', status: 'TODO', type: 'Setup' },
                { id: 'GD-002', title: 'HDR Output: Configurar el pipeline de renderizado HDR', status: 'TODO', type: 'Rendering' },
                { id: 'GD-003', title: 'Godot Asset Store: Instalar un plugin desde la nueva tienda oficial', status: 'TODO', type: 'Assets' },
                { id: 'GD-004', title: 'VirtualJoystick: Implementar control táctil para móviles v4.7', status: 'TODO', type: 'Mobile' },
                { id: 'GD-005', title: 'AreaLight3D: Configurar iluminación volumétrica realista', status: 'TODO', type: '3D' },
                { id: 'GD-006', title: 'Drawable Textures: Implementar sistema de dibujo por GPU', status: 'TODO', type: 'VFX' },
                { id: 'GD-007', title: 'GDScript: Dominar el nuevo tipado estático y lambdas', status: 'TODO', type: 'Scripting' },
                { id: 'GD-008', title: 'Physics: Configurar colisiones de alta precisión en 4.7', status: 'TODO', type: 'Physics' },
                { id: 'GD-009', title: 'UI: Crear menús adaptables con el nuevo sistema de temas', status: 'TODO', type: 'UI' },
                { id: 'GD-010', title: 'AnimationMixer: Combinar múltiples estados de animación', status: 'TODO', type: 'Animation' },
                { id: 'GD-011', title: 'GDExtension: Conectar una librería de C++ externa', status: 'TODO', type: 'Advanced' },
                { id: 'GD-012', title: 'NavigationServer: Pathfinding dinámico en 3D', status: 'TODO', type: 'Navigation' },
                { id: 'GD-013', title: 'Optimization: Perfilado de GPU mediante Tracy integration', status: 'TODO', type: 'Tools' },
                { id: 'GD-014', title: 'Export: Build multiplataforma con One-Click Deploy', status: 'TODO', type: 'Export' }
            ];
            this.saveTasks(seed);
            return seed;
        },

        saveTasks(tasks) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
            renderGodotKanban();
        }
    };

    function renderGodotKanban() {
        const tasks = godotDb.getTasks();
        const cols = {
            'TODO': document.querySelector('#col-godot-todo .godot-cards-list'),
            'WORKING': document.querySelector('#col-godot-progress .godot-cards-list'),
            'DONE': document.querySelector('#col-godot-done .godot-cards-list')
        };

        // Clear columns
        Object.values(cols).forEach(c => { if(c) c.innerHTML = ''; });

        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'godot-task-card';
            card.id = `gtask-${task.id}`;
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
                    <span class="text-info cycle-btn" style="cursor:pointer">
                        <i class="fas fa-sync-alt"></i>
                    </span>
                </div>
            `;

            card.querySelector('.task-id').textContent = `#${task.id}`;
            card.querySelector('.task-title').textContent = task.title;
            card.querySelector('.task-type').textContent = task.type || 'Práctica';

            card.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                window.deleteGodotTask(task.id);
            };

            card.querySelector('.cycle-btn').onclick = (e) => {
                e.stopPropagation();
                window.cycleGodotStatus(task.id);
            };

            if (cols[task.status]) {
                cols[task.status].appendChild(card);
            }
        });
    }

    window.addNewGodotTask = function() {
        const title = prompt("Título del nuevo hito de aprendizaje:");
        if (!title) return;

        const tasks = godotDb.getTasks();
        const id = 'GD-' + Math.floor(100 + Math.random() * 899);
        tasks.push({
            id: id,
            title: title,
            status: 'TODO',
            type: 'Custom'
        });
        godotDb.saveTasks(tasks);
    };

    window.deleteGodotTask = function(id) {
        if (!confirm('¿Eliminar este hito de práctica?')) return;
        let tasks = godotDb.getTasks();
        tasks = tasks.filter(t => t.id !== id);
        godotDb.saveTasks(tasks);
    };

    window.cycleGodotStatus = function(id) {
        const tasks = godotDb.getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            const flow = ['TODO', 'WORKING', 'DONE'];
            const idx = flow.indexOf(task.status);
            task.status = flow[(idx + 1) % flow.length];
            godotDb.saveTasks(tasks);
        }
    };

    window.allowGodotDrop = function(ev) {
        ev.preventDefault();
    };

    window.godotDrop = function(ev, newStatus) {
        ev.preventDefault();
        const taskId = ev.dataTransfer.getData("taskId");
        const tasks = godotDb.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            godotDb.saveTasks(tasks);
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        renderGodotKanban();
    });

})();
