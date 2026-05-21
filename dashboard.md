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
        <div id="dashboard-user-info" class="d-flex align-items-center text-white">
            <!-- Secondary user info if needed -->
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

<!-- Rate Limit Indicator -->
<div id="rate-limit-info" class="rate-limit-indicator">
    <div class="status-dot"></div>
    <span class="text-muted">API:</span>
    <span class="limit-text text-white">--- / ---</span>
</div>

<!-- Load Scripts -->
<script src="{{ '/assets/javascript/dashboard.js' | relative_url }}"></script>
