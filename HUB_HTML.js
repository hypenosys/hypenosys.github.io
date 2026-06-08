    <!-- ─── HUB VIEW ─── -->
    <div class="view" id="view-hub" style="padding: 22px 30px;">
        <div class="metrics-header" style="margin-bottom: 20px;">
            <div class="metrics-title">GitHub Hub</div>
            <div class="hactions">
                <div class="live-badge"><span class="live-dot"></span>TIEMPO REAL</div>
            </div>
        </div>

        <div class="card glass" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 600px;">
            <div class="dr-tabs" style="background: rgba(0,0,0,0.2);">
                <div class="dr-tab active" data-tab="pull-requests" onclick="switchHubTab('pull-requests', this)">
                    PRs <span class="nav-badge" id="pr-badge" style="margin-left:5px">0</span>
                </div>
                <div class="dr-tab" data-tab="issues" onclick="switchHubTab('issues', this)">
                    Issues <span class="nav-badge" id="issues-badge" style="margin-left:5px">0</span>
                </div>
                <div class="dr-tab" data-tab="branches" onclick="switchHubTab('branches', this)">Branches</div>
                <div class="dr-tab" data-tab="actions" onclick="switchHubTab('actions', this)">Actions</div>
                <div class="dr-tab" data-tab="notifications" onclick="switchHubTab('notifications', this)">
                    Notifs <span class="nav-badge" id="notif-badge-hub" style="margin-left:5px">0</span>
                </div>
            </div>

            <div class="dr-body" id="hub-content" style="background: rgba(0,0,0,0.1); flex: 1; overflow-y: auto;">
                <div id="panel-pr"       class="hub-panel"></div>
                <div id="panel-issues"   class="hub-panel" style="display:none;"></div>
                <div id="panel-branches" class="hub-panel" style="display:none;"></div>
                <div id="panel-actions"  class="hub-panel" style="display:none;"></div>
                <div id="panel-notifs"   class="hub-panel" style="display:none;"></div>
            </div>
        </div>
    </div>
