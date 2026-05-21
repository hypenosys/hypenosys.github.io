---
layout: default
title: Production Dashboard
---

<div class="dashboard-container">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="mb-0 text-purple">PRODUCTION DASHBOARD</h1>
            <p class="text-muted mb-0">High-efficiency task management system</p>
        </div>
        <div id="current-user" class="d-flex align-items-center text-white">
            <!-- User info will be injected here -->
        </div>
    </div>

    <div class="row mb-4">
        <div class="col-md-6">
            <div class="view-switcher btn-group shadow-sm" role="group">
                <button id="btn-view-kanban" type="button" class="btn btn-outline-purple active">
                    <i class="fas fa-columns mr-2"></i> Kanban Board
                </button>
                <button id="btn-view-spreadsheet" type="button" class="btn btn-outline-purple">
                    <i class="fas fa-table mr-2"></i> Spreadsheet View
                </button>
            </div>
        </div>
        <div class="col-md-6 text-right">
            <button id="btn-refresh" class="btn btn-dark border-purple mr-2">
                <i class="fas fa-sync-alt"></i> Refresh Data
            </button>
            <button class="btn btn-dark border-purple" data-toggle="modal" data-target="#settingsModal">
                <i class="fas fa-cog"></i> Settings
            </button>
        </div>
    </div>

    <!-- Dashboard Content -->
    <div id="dashboard-view-content">
        <div class="text-center py-5">
            <div class="spinner-border text-purple" role="status">
                <span class="sr-only">Loading...</span>
            </div>
            <p class="mt-3">Initializing dashboard...</p>
        </div>
    </div>
</div>

<!-- Settings Modal -->
<div class="modal fade" id="settingsModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content shadow-lg">
            <div class="modal-header">
                <h5 class="modal-title text-purple font-weight-bold">
                    <i class="fas fa-terminal mr-2"></i> SYSTEM CONFIGURATION
                </h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <div class="alert alert-info bg-dark border-purple text-white-50 small mb-4">
                    <i class="fas fa-info-circle mr-2"></i>
                    Your credentials are stored locally in your browser's <code>localStorage</code>.
                    Ensure your PAT has <code>repo</code> permissions.
                </div>
                <div class="form-group">
                    <label for="input-pat" class="text-purple small font-weight-bold">GITHUB PERSONAL ACCESS TOKEN</label>
                    <input type="password" class="form-control" id="input-pat" placeholder="ghp_xxxxxxxxxxxx">
                </div>
                <div class="form-group">
                    <label for="input-repo" class="text-purple small font-weight-bold">TARGET REPOSITORY</label>
                    <input type="text" class="form-control" id="input-repo" placeholder="owner/repo">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
                <button type="button" id="btn-save-settings" class="btn btn-primary">Save & Connect</button>
            </div>
        </div>
    </div>
</div>

<!-- Toast Notifications Container -->
<div id="toast-container" class="toast-container"></div>

<!-- Rate Limit Indicator -->
<div id="rate-limit-info" class="rate-limit-indicator">
    <div class="status-dot"></div>
    <span class="text-muted">API:</span>
    <span class="limit-text text-white">--- / ---</span>
</div>

<!-- Load Scripts -->
<script src="{{ '/assets/javascript/github-api.js' | relative_url }}"></script>
<script src="{{ '/assets/javascript/dashboard.js' | relative_url }}"></script>
