/**
 * Dashboard UI Module
 * Handles Kanban and Spreadsheet views, drag and drop, and user interactions.
 */

class Dashboard {
    constructor() {
        this.currentView = 'kanban';
        this.issues = [];
        this.milestones = [];
        this.labels = [];
        this.assignees = [];
        this.isLoading = false;

        this.columns = {
            'backlog': { title: 'Backlog', id: 'backlog' },
            'todo': { title: 'To Do', id: 'todo' },
            'in-progress': { title: 'In Progress', id: 'in-progress' },
            'qa': { title: 'QA', id: 'qa' },
            'done': { title: 'Production / Done', id: 'done' }
        };

        this.init();
    }

    async init() {
        this.bindEvents();
        const user = await window.githubApi.validateToken();
        if (user) {
            this.updateUserUI(user);
            await this.refreshData();
        } else {
            this.showLoginModal();
        }
    }

    bindEvents() {
        // View switching
        document.getElementById('btn-view-kanban')?.addEventListener('click', () => this.switchView('kanban'));
        document.getElementById('btn-view-spreadsheet')?.addEventListener('click', () => this.switchView('spreadsheet'));

        // Refresh button
        document.getElementById('btn-refresh')?.addEventListener('click', () => this.refreshData());

        // Settings / Token saving
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.saveSettings());

        // Rate limit event
        window.addEventListener('github-ratelimit-update', (e) => this.updateRateLimitUI(e.detail));

        // Modal events
        $('#settingsModal').on('shown.bs.modal', () => {
            document.getElementById('input-pat').value = localStorage.getItem('github_pat') || '';
            document.getElementById('input-repo').value = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
        });
    }

    async refreshData() {
        if (this.isLoading) return;
        this.setLoading(true);
        try {
            [this.issues, this.milestones, this.labels, this.assignees] = await Promise.all([
                window.githubApi.fetchIssues(),
                window.githubApi.fetchMilestones(),
                window.githubApi.fetchRepoLabels(),
                window.githubApi.fetchRepoAssignees()
            ]);
            this.render();
        } catch (e) {
            this.showToast('Error', e.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        const btn = document.getElementById('btn-refresh');
        if (btn) {
            if (loading) {
                btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Loading...';
                btn.disabled = true;
            } else {
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
                btn.disabled = false;
            }
        }
    }

    async saveSettings() {
        const token = document.getElementById('input-pat').value;
        const repo = document.getElementById('input-repo').value;

        window.githubApi.setToken(token);
        window.githubApi.setRepo(repo);

        const user = await window.githubApi.validateToken();
        if (user) {
            this.updateUserUI(user);
            $('#settingsModal').modal('hide');
            this.showToast('Success', 'Authentication successful', 'success');
            this.refreshData();
        } else {
            this.showToast('Error', 'Invalid token or repository access', 'error');
        }
    }

    updateUserUI(user) {
        const userEl = document.getElementById('current-user');
        if (userEl) {
            userEl.innerHTML = `
                <img src="${user.avatar_url}" width="30" height="30" class="rounded-circle mr-2 border-purple">
                <span>${user.login}</span>
            `;
        }
    }

    updateRateLimitUI(limit) {
        const el = document.getElementById('rate-limit-info');
        if (el) {
            const percent = (limit.remaining / limit.limit) * 100;
            const statusDot = el.querySelector('.status-dot');
            statusDot.className = 'status-dot';
            if (percent < 10) statusDot.classList.add('danger');
            else if (percent < 30) statusDot.classList.add('warning');

            el.querySelector('.limit-text').innerText = `${limit.remaining} / ${limit.limit}`;

            if (percent < 10) {
                this.showToast('Rate Limit Warning', `GitHub API rate limit is low: ${limit.remaining} remaining.`, 'warning');
            }
        }
    }

    switchView(view) {
        this.currentView = view;
        document.getElementById('btn-view-kanban').classList.toggle('active', view === 'kanban');
        document.getElementById('btn-view-spreadsheet').classList.toggle('active', view === 'spreadsheet');
        this.render();
    }

    render() {
        const container = document.getElementById('dashboard-view-content');
        if (!container) return;
        container.innerHTML = '';

        if (this.currentView === 'kanban') {
            this.renderKanban(container);
        } else {
            this.renderSpreadsheet(container);
        }
    }

    renderKanban(container) {
        const board = document.createElement('div');
        board.className = 'kanban-board';

        Object.values(this.columns).forEach(column => {
            const columnEl = document.createElement('div');
            columnEl.className = 'kanban-column';
            columnEl.id = `col-${column.id}`;

            const columnIssues = this.getIssuesForStatus(column.id);

            columnEl.innerHTML = `
                <h5>${column.title} <span class="badge badge-pill">${columnIssues.length}</span></h5>
                <div class="kanban-tasks" data-status="${column.id}"></div>
            `;

            const tasksContainer = columnEl.querySelector('.kanban-tasks');
            columnIssues.forEach(issue => {
                tasksContainer.appendChild(this.createTaskCard(issue));
            });

            // Drag and Drop
            tasksContainer.addEventListener('dragover', e => {
                e.preventDefault();
                tasksContainer.classList.add('drag-over');
            });

            tasksContainer.addEventListener('dragleave', () => {
                tasksContainer.classList.remove('drag-over');
            });

            tasksContainer.addEventListener('drop', async e => {
                e.preventDefault();
                tasksContainer.classList.remove('drag-over');
                const issueId = e.dataTransfer.getData('text/plain');
                const newStatus = tasksContainer.dataset.status;
                await this.moveTask(issueId, newStatus);
            });

            board.appendChild(columnEl);
        });

        container.appendChild(board);
    }

    createTaskCard(issue) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.dataset.issueId = issue.number;

        const assignee = issue.assignees[0];
        const labels = issue.labels
            .filter(l => !l.name.startsWith('status:'))
            .map(l => `<span class="badge badge-skill" style="border-color: #${l.color}; color: #${l.color}">${l.name}</span>`)
            .join('');

        card.innerHTML = `
            <div class="task-id">#${issue.number}</div>
            <div class="task-title">${issue.title}</div>
            <div class="task-meta">
                <div class="task-assignee">
                    ${assignee ? `<img src="${assignee.avatar_url}" title="${assignee.login}">` : '<button class="btn btn-sm btn-outline-purple btn-auto-assign">Assign Me</button>'}
                </div>
                <div class="task-labels">
                    ${labels}
                </div>
            </div>
        `;

        card.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', issue.number);
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        card.querySelector('.btn-auto-assign')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.autoAssign(issue.number);
        });

        return card;
    }

    renderSpreadsheet(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'spreadsheet-container table-responsive';

        const table = document.createElement('table');
        table.className = 'table table-hover table-dark';

        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 80px">#</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Milestone</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        this.issues.forEach(issue => {
            const tr = document.createElement('tr');
            const status = this.getIssueStatus(issue);
            const assignee = issue.assignees[0]?.login || 'Unassigned';
            const milestone = issue.milestone?.title || 'None';

            tr.innerHTML = `
                <td>${issue.number}</td>
                <td class="editable-cell" data-field="title" data-issue-number="${issue.number}">${issue.title}</td>
                <td class="editable-cell" data-field="status" data-issue-number="${issue.number}">${this.columns[status].title}</td>
                <td class="editable-cell" data-field="assignee" data-issue-number="${issue.number}">${assignee}</td>
                <td class="editable-cell" data-field="milestone" data-issue-number="${issue.number}">${milestone}</td>
            `;

            // Inline editing
            tr.querySelectorAll('.editable-cell').forEach(cell => {
                cell.addEventListener('dblclick', () => this.startInlineEdit(cell, issue));
            });

            tbody.appendChild(tr);
        });

        wrapper.appendChild(table);
        container.appendChild(wrapper);
    }

    startInlineEdit(cell, issue) {
        if (cell.classList.contains('editing')) return;
        cell.classList.add('editing');
        const field = cell.dataset.field;
        const originalValue = cell.innerText;
        cell.innerHTML = '';

        let input;
        if (field === 'status') {
            input = document.createElement('select');
            Object.entries(this.columns).forEach(([id, col]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.text = col.title;
                opt.selected = (id === this.getIssueStatus(issue));
                input.appendChild(opt);
            });
        } else if (field === 'assignee') {
            input = document.createElement('select');
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.text = 'Unassigned';
            input.appendChild(noneOpt);
            this.assignees.forEach(user => {
                const opt = document.createElement('option');
                opt.value = user.login;
                opt.text = user.login;
                opt.selected = (user.login === issue.assignees[0]?.login);
                input.appendChild(opt);
            });
        } else if (field === 'milestone') {
            input = document.createElement('select');
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.text = 'None';
            input.appendChild(noneOpt);
            this.milestones.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.number;
                opt.text = m.title;
                opt.selected = (m.number === issue.milestone?.number);
                input.appendChild(opt);
            });
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = originalValue;
        }

        cell.appendChild(input);
        input.focus();

        const save = async () => {
            const newValue = input.value;
            cell.classList.remove('editing');

            if (newValue === originalValue) {
                cell.innerText = originalValue;
                return;
            }

            // Optimistic update
            cell.innerText = input.options ? input.options[input.selectedIndex].text : newValue;

            try {
                if (field === 'title') await window.githubApi.updateIssue(issue.number, { title: newValue });
                else if (field === 'status') await window.githubApi.updateStatus(issue.number, newValue);
                else if (field === 'assignee') await window.githubApi.updateIssue(issue.number, { assignees: newValue ? [newValue] : [] });
                else if (field === 'milestone') await window.githubApi.updateMilestone(issue.number, newValue || null);

                this.showToast('Updated', `Issue #${issue.number} updated successfully.`, 'success');
                this.refreshData(); // Refresh to ensure state is synced
            } catch (e) {
                this.showToast('Update Failed', e.message, 'error');
                cell.innerText = originalValue;
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
                cell.classList.remove('editing');
                cell.innerText = originalValue;
            }
        });
    }

    getIssueStatus(issue) {
        if (issue.state === 'closed') return 'done';
        const statusLabel = issue.labels.find(l => l.name.startsWith('status:'));
        if (statusLabel) return statusLabel.name.split(':')[1];
        return 'backlog';
    }

    getIssuesForStatus(status) {
        return this.issues.filter(issue => this.getIssueStatus(issue) === status);
    }

    async moveTask(issueNumber, newStatus) {
        const oldStatus = this.getIssueStatus(this.issues.find(i => i.number == issueNumber));
        if (oldStatus === newStatus) return;

        // Optimistic UI update
        this.showToast('Updating...', `Moving #${issueNumber} to ${this.columns[newStatus].title}`, 'info');

        try {
            await window.githubApi.updateStatus(issueNumber, newStatus);
            this.showToast('Success', `Moved #${issueNumber} to ${this.columns[newStatus].title}`, 'success');
            this.refreshData();
        } catch (e) {
            this.showToast('Move Failed', e.message, 'error');
            this.render(); // Re-render to revert
        }
    }

    async autoAssign(issueNumber) {
        try {
            await window.githubApi.autoAssign(issueNumber);
            this.showToast('Assigned', `You have been assigned to #${issueNumber}`, 'success');
            this.refreshData();
        } catch (e) {
            this.showToast('Assignment Failed', e.message, 'error');
        }
    }

    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-header">
                <strong class="mr-auto">${title}</strong>
                <button type="button" class="ml-2 mb-1 close" data-dismiss="toast">&times;</button>
            </div>
            <div class="toast-body">${message}</div>
        `;

        container.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            $(toast).fadeOut(500, () => toast.remove());
        }, 5000);

        $(toast).find('.close').on('click', () => toast.remove());
    }

    showLoginModal() {
        $('#settingsModal').modal('show');
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});
