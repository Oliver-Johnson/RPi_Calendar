// ── Dark mode ────────────────────────────────────────────────────────────────
function initDarkMode() {
    const saved = localStorage.getItem('pi-schedule-dark');
    if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
}
function toggleDarkMode() {
    document.documentElement.classList.add('theme-transition');
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('pi-schedule-dark', document.documentElement.classList.contains('dark'));
    lucide.createIcons();
    setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
    }, 300);
}
initDarkMode();

// ── Scheduling preferences persistence ──────────────────────────────────────
const SCHED_PREFS_KEY = 'pi-schedule-prefs';

function getSchedPrefs() {
    try {
        return JSON.parse(localStorage.getItem(SCHED_PREFS_KEY)) || {};
    } catch { return {}; }
}

function saveSchedPrefs(prefs) {
    const existing = getSchedPrefs();
    localStorage.setItem(SCHED_PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
}

// ── Mobile sidebar ───────────────────────────────────────────────────────────
function openSidebar() {
    document.getElementById('sidebar').classList.remove('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.remove('hidden');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // ── View routing ────────────────────────────────────────────────────
    const views = { tasks: 'view-tasks', calendar: 'view-calendar', insights: 'view-insights', jobs: 'view-jobs' };
    let currentView = 'tasks';

    function switchView(view) {
        Object.entries(views).forEach(([key, id]) => {
            const el = document.getElementById(id);
            el.classList.toggle('hidden', key !== view);
        });

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        currentView = view;
        if (view === 'tasks') TaskView.render();
        if (view === 'calendar') CalendarView.render();
        if (view === 'insights') InsightsView.render();
        if (view === 'jobs') JobsView.render();
        closeSidebar();
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // ── Mobile menu ──────────────────────────────────────────────────────
    document.getElementById('menu-btn').addEventListener('click', openSidebar);

    // ── Dark mode toggles ────────────────────────────────────────────────
    document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);
    document.getElementById('mobile-dark-toggle').addEventListener('click', toggleDarkMode);

    // ── Outlook calendar picker ──────────────────────────────────────────
    async function loadCalendarList() {
        try {
            const calendars = await API.getCalendars();
            const section = document.getElementById('outlook-calendars-section');
            const list = document.getElementById('calendar-list');

            if (!calendars || calendars.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');
            list.innerHTML = calendars.map(cal => `
                <label class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group">
                    <input type="checkbox"
                           data-cal-id="${cal.id}"
                           ${cal.is_enabled ? 'checked' : ''}
                           class="cal-toggle w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500 cursor-pointer shrink-0">
                    <span class="text-sm text-gray-700 dark:text-gray-300 truncate flex-1"
                          title="${escapeHtml(cal.name)}${cal.owner_name ? ' (' + escapeHtml(cal.owner_name) + ')' : ''}">
                        ${escapeHtml(cal.name)}
                    </span>
                    ${cal.is_default ? '<span class="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">Default</span>' : ''}
                    ${cal.owner_name && !cal.is_default ? '<span class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[5rem] shrink-0">' + escapeHtml(cal.owner_name) + '</span>' : ''}
                </label>
            `).join('');

            list.querySelectorAll('.cal-toggle').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    const calId = e.target.dataset.calId;
                    const enabled = e.target.checked;
                    try {
                        await API.toggleCalendar(calId, enabled);
                        showToast(enabled ? 'Calendar enabled' : 'Calendar disabled', 'info');
                        if (currentView === 'calendar') CalendarView.render();
                    } catch (err) {
                        showToast('Failed to update: ' + err.message, 'error');
                        loadCalendarList();
                    }
                });
            });

            lucide.createIcons();
        } catch (err) {
            document.getElementById('outlook-calendars-section').classList.add('hidden');
        }
    }

    // Refresh calendars button
    document.getElementById('refresh-calendars-btn').addEventListener('click', async () => {
        const btn = document.getElementById('refresh-calendars-btn');
        btn.disabled = true;
        try {
            await API.refreshCalendars();
            await loadCalendarList();
            showToast('Calendar list refreshed', 'success');
        } catch (err) {
            if (err.message.includes('401') || err.message.includes('Not authenticated')) {
                window.location.href = '/auth/login';
            } else {
                showToast('Failed to refresh: ' + err.message, 'error');
            }
        } finally {
            btn.disabled = false;
        }
    });

    // ── Sync button ─────────────────────────────────────────────────────
    document.getElementById('sync-btn').addEventListener('click', async () => {
        const btn = document.getElementById('sync-btn');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Syncing...';
        lucide.createIcons();

        try {
            const result = await API.triggerSync();
            showToast(`Synced ${result.synced} events from Outlook`, 'success');
            if (currentView === 'calendar') CalendarView.render();
            loadCalendarList();
        } catch (err) {
            if (err.message.includes('401') || err.message.includes('Not authenticated')) {
                window.location.href = '/auth/login';
            } else {
                showToast('Sync failed: ' + err.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync Outlook';
            lucide.createIcons();
        }
    });

    // ── Check for sync result in URL ────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    if (params.has('synced')) {
        showToast(`Synced ${params.get('synced')} events from Outlook`, 'success');
        window.history.replaceState({}, '', '/');
    }

    // ── Mobile floating action bar ───────────────────────────────────────
    let lastMainScrollY = 0;
    const floatBar = document.getElementById('mobile-actions-bar');
    
    document.addEventListener('scroll', (e) => {
        if (window.innerWidth >= 768 || currentView !== 'calendar' || !floatBar) {
            if (floatBar) floatBar.classList.add('-translate-y-[150%]');
            return;
        }
        
        const target = e.target;
        if (target.tagName === 'MAIN' || (target.classList && target.classList.contains('overflow-y-auto'))) {
            const currentScrollTop = target.scrollTop;
            const lastScroll = parseFloat(target.dataset.lastScroll || 0);
            
            // Allow a small buffer (5px) to prevent jittery triggering
            if (Math.abs(currentScrollTop - lastScroll) < 5) return;
            
            // If near top of main container, hide the bar because native header is visible
            if (currentScrollTop < 100 && target.tagName === 'MAIN') {
                floatBar.classList.add('-translate-y-[150%]');
            } else if (currentScrollTop < lastScroll) {
                // Scrolling up
                floatBar.classList.remove('-translate-y-[150%]');
            } else {
                // Scrolling down
                floatBar.classList.add('-translate-y-[150%]');
            }
            target.dataset.lastScroll = currentScrollTop;
        }
    }, true);

    // ── Init ─────────────────────────────────────────────────────────────
    loadCalendarList();
    switchView('calendar');

    // ── Overdue task warning on page load ─────────────────────────────────
    (async () => {
        try {
            const tasks = await API.getTasks();
            const now = new Date();
            const overdue = tasks.filter(t => t.status !== 'Completed' && t.due_date && new Date(t.due_date) < now);
            if (overdue.length > 0) {
                showToast(`⚠ You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}!`, 'error');
            }
        } catch (e) { /* silently fail */ }
    })();
});

// ── Shared Helpers ──────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(minutes) {
    if (!minutes && minutes !== 0) return '';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getScheduleStatusIcon(task) {
    if (!task.scheduling_status || task.status === 'Completed') return '';
    const icons = {
        fully_scheduled: '<i data-lucide="calendar-check" class="w-3 h-3 inline-block align-text-bottom text-green-500" title="Fully scheduled"></i>',
        partially_scheduled: '<i data-lucide="calendar-clock" class="w-3 h-3 inline-block align-text-bottom text-amber-500" title="Partially scheduled"></i>',
    };
    return icons[task.scheduling_status] || '<i data-lucide="calendar-x" class="w-3 h-3 inline-block align-text-bottom text-red-400" title="Not scheduled"></i>';
}

// ── Lightweight Markdown Renderer ────────────────────────────────────────────
function renderMarkdown(text) {
    if (!text) return '';
    // Escape HTML first
    let html = escapeHtml(text);
    // Headers (must be at start of line)
    html = html.replace(/^### (.+)$/gm, '<h4 class="font-bold text-sm text-gray-800 dark:text-gray-200 mt-3 mb-1">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="font-bold text-base text-gray-800 dark:text-gray-200 mt-3 mb-1">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg text-gray-800 dark:text-gray-200 mt-3 mb-1">$1</h2>');
    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">$1</code>');
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-brand-600 dark:text-brand-400 underline hover:no-underline">$1</a>');
    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>');
    // Wrap consecutive <li> in <ul>/<ol>
    html = html.replace(/((?:<li class="ml-4 list-disc[^"]*">[^<]+<\/li>\n?)+)/g, '<ul class="space-y-1 my-2">$1</ul>');
    html = html.replace(/((?:<li class="ml-4 list-decimal[^"]*">[^<]+<\/li>\n?)+)/g, '<ol class="space-y-1 my-2">$1</ol>');
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">');
    // Single newlines to <br>
    html = html.replace(/\n/g, '<br>');
    return '<p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">' + html + '</p>';
}

// ── Loading button helper ───────────────────────────────────────────────────
function withLoading(btn, asyncFn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
    lucide.createIcons();
    return asyncFn().finally(() => {
        btn.disabled = false;
        btn.innerHTML = original;
        lucide.createIcons();
    });
}

// ── Shared Edit Task Form ────────────────────────────────────────────────────
function showEditTaskModal(task, onSaved) {
    const id = task.id;
    const dueVal = task.due_date ? task.due_date.split('T')[0] : '';
    const dueTimeRaw = task.due_date ? task.due_date.split('T')[1] : '';
    const dueTime = dueTimeRaw && dueTimeRaw !== '00:00:00' ? dueTimeRaw.substring(0, 5) : '';
    const estHours = task.estimated_duration ? Math.floor(task.estimated_duration / 60) : '';
    const estMins = task.estimated_duration ? task.estimated_duration % 60 : '';
    const minBlock = task.min_block_size || '';
    const maxBlock = task.max_block_size || '';

    showModal(`
        <div class="p-6">
            <h3 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight mb-5">Edit Task</h3>
            <form id="shared-edit-task-form" class="space-y-5">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <input type="text" name="title" value="${escapeAttr(task.title)}" required
                           class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description <span class="text-gray-400 font-normal">(markdown)</span></label>
                    <textarea name="description" rows="3" placeholder="Add notes, links, or details..."
                              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y">${task.description ? escapeHtml(task.description) : ''}</textarea>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                        <select name="priority"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <option value="High" ${task.priority === 'High' ? 'selected' : ''}>High</option>
                            <option value="Medium" ${task.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                            <option value="Low" ${task.priority === 'Low' ? 'selected' : ''}>Low</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                        <select name="status"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                        <input type="date" name="due_date" value="${dueVal}"
                               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deadline Time <span class="text-gray-400 font-normal">(optional)</span></label>
                    <input type="time" name="due_time" value="${dueTime}"
                           class="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Duration</label>
                    <div class="flex items-center gap-2">
                        <input type="number" name="est_hours" min="0" max="999" value="${estHours}"
                               class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        <span class="text-sm text-gray-500 dark:text-gray-400">hrs</span>
                        <input type="number" name="est_minutes" min="0" max="59" value="${estMins}"
                               class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        <span class="text-sm text-gray-500 dark:text-gray-400">min</span>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Block Size (for scheduling)</label>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 dark:text-gray-400">Min</span>
                        <input type="number" name="min_block" min="5" max="480" value="${minBlock}" placeholder="30"
                               class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        <span class="text-xs text-gray-500 dark:text-gray-400">Max</span>
                        <input type="number" name="max_block" min="5" max="480" value="${maxBlock}" placeholder="120"
                               class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        <span class="text-xs text-gray-500 dark:text-gray-400">min</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-darkborder">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recurrence</label>
                        <select name="recurrence_rule"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <option value="" ${!task.recurrence_rule ? 'selected' : ''}>None (One-time task)</option>
                            <option value="daily" ${task.recurrence_rule === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${task.recurrence_rule === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${task.recurrence_rule === 'monthly' ? 'selected' : ''}>Monthly</option>
                            <option value="yearly" ${task.recurrence_rule === 'yearly' ? 'selected' : ''}>Yearly</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeat Until <span class="text-gray-400 font-normal">(optional)</span></label>
                        <input type="date" name="recurrence_until" value="${task.recurrence_until ? task.recurrence_until.split('T')[0] : ''}"
                               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-darkborder">
                    <button type="button" onclick="closeModal()"
                            class="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button type="submit"
                            class="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('shared-edit-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const estH = parseInt(form.est_hours.value) || 0;
        const estM = parseInt(form.est_minutes.value) || 0;
        const totalMins = estH * 60 + estM;
        const minB = parseInt(form.min_block.value) || 0;
        const maxB = parseInt(form.max_block.value) || 0;
        const dueTimeVal = form.due_time.value || '00:00';
        const data = {
            title: form.title.value,
            priority: form.priority.value,
            status: form.status.value,
            description: form.description.value || null,
            due_date: form.due_date.value ? form.due_date.value + 'T' + dueTimeVal + ':00' : null,
            estimated_duration: totalMins > 0 ? totalMins : null,
            min_block_size: minB > 0 ? minB : null,
            max_block_size: maxB > 0 ? maxB : null,
            recurrence_rule: form.recurrence_rule.value || null,
            recurrence_until: form.recurrence_until.value ? form.recurrence_until.value + 'T23:59:00' : null,
        };
        await withLoading(btn, async () => {
            try {
                const result = await API.updateTask(id, data);
                closeModal();
                let msgs = [];
                msgs.push('Task updated.');
                if (result.cleaned_blocks > 0) {
                    msgs.push(`Removed ${result.cleaned_blocks} future block${result.cleaned_blocks > 1 ? 's' : ''}.`);
                }
                if (result.spawned_recurrence) {
                    msgs.push(`Spawned next recurring task.`);
                }
                showToast(msgs.join(' '), 'success');
                if (onSaved) onSaved();
            } catch (err) {
                showToast('Failed to update task: ' + err.message, 'error');
            }
        });
    });
    lucide.createIcons();
}

// ── Toast notifications (stacking) ──────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const colors = {
        success: 'bg-emerald-500/95 backdrop-blur-md border border-emerald-400/50 shadow-emerald-500/20',
        error: 'bg-red-500/95 backdrop-blur-md border border-red-400/50 shadow-red-500/20',
        info: 'bg-gray-900/95 dark:bg-darkpanel/95 backdrop-blur-md border border-gray-700/50 shadow-black/20',
    };
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium pointer-events-auto transition-all duration-300 opacity-0 translate-y-4 scale-95 origin-bottom ${colors[type] || colors.info}`;
    toast.innerHTML = `<i data-lucide="${icons[type] || icons.info}" class="w-4 h-4 shrink-0"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    lucide.createIcons();

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
    });

    // Limit to 5 visible toasts
    while (container.children.length > 5) {
        container.removeChild(container.firstChild);
    }

    // Auto-remove after 3s (5s for errors)
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── Modal helpers ───────────────────────────────────────────────────────────
window.modalTimeout = null;
window.modalOnCancel = null;

function showModal(html, onCancel = null) {
    window.modalOnCancel = onCancel;
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    
    // If a modal is currently closing, clear the timeout so it doesn't hide the new modal
    if (window.modalTimeout) {
        clearTimeout(window.modalTimeout);
        window.modalTimeout = null;
    }
    
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    requestAnimationFrame(() => {
        bd.classList.add('opacity-100');
        mc.classList.remove('opacity-0', 'scale-95');
        mc.classList.add('opacity-100', 'scale-100');
    });
}

function closeModal(callCancel = true) {
    if (callCancel && window.modalOnCancel) {
        window.modalOnCancel();
    }
    window.modalOnCancel = null;

    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    bd.classList.remove('opacity-100');
    mc.classList.remove('opacity-100', 'scale-100');
    mc.classList.add('opacity-0', 'scale-95');
    
    if (window.modalTimeout) clearTimeout(window.modalTimeout);
    window.modalTimeout = setTimeout(() => {
        bd.classList.add('hidden');
        window.modalTimeout = null;
    }, 300);
}

function showConfirm(message, onConfirm, { destructive = true, confirmText = 'Delete', icon = 'alert-triangle', onCancel = null } = {}) {
    const btnClass = destructive
        ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-md shadow-red-500/20'
        : 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md shadow-brand-500/20';
    showModal(`
        <div class="p-8 text-center">
            <div class="w-16 h-16 mx-auto mb-5 rounded-2xl ${destructive ? 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50' : 'bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/50'} flex items-center justify-center shadow-sm">
                <i data-lucide="${icon}" class="w-8 h-8 ${destructive ? 'text-red-500' : 'text-brand-500'}"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${destructive ? 'Are you sure?' : 'Confirm action'}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-8">${message}</p>
            <div class="flex justify-center gap-3">
                <button onclick="closeModal()"
                        class="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-all">
                    Cancel
                </button>
                <button id="confirm-action-btn"
                        class="px-5 py-2.5 text-sm font-semibold ${btnClass} rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2">
                    <i data-lucide="${destructive ? 'trash-2' : 'check'}" class="w-4 h-4"></i>
                    ${confirmText}
                </button>
            </div>
        </div>
    `, onCancel);
    document.getElementById('confirm-action-btn').addEventListener('click', () => {
        closeModal(false); // Don't trigger onCancel if confirming
        onConfirm();
    });
    lucide.createIcons();
}

document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ── Undo Toast ──────────────────────────────────────────────────────────────
function showUndoToast(message, undoCallback) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium pointer-events-auto transition-all duration-300 opacity-0 translate-y-4 scale-95 origin-bottom bg-gray-900/95 dark:bg-darkpanel/95 backdrop-blur-md border border-gray-700/50 shadow-black/20';
    
    const undoId = 'undo-' + Date.now();
    toast.innerHTML = `
        <i data-lucide="check-circle" class="w-4 h-4 shrink-0 text-emerald-400"></i>
        <span>${escapeHtml(message)}</span>
        <button id="${undoId}" class="undo-btn">Undo</button>
    `;
    container.appendChild(toast);
    lucide.createIcons();

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
    });

    let undone = false;
    document.getElementById(undoId).addEventListener('click', async () => {
        if (undone) return;
        undone = true;
        try {
            await undoCallback();
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
            showToast('Undone!', 'info');
        } catch (err) {
            showToast('Undo failed: ' + err.message, 'error');
        }
    });

    // Auto-remove after 5s
    setTimeout(() => {
        if (!undone) {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);

    while (container.children.length > 5) {
        container.removeChild(container.firstChild);
    }
}

// ── Keyboard Shortcuts ──────────────────────────────────────────────────────
function showShortcutsOverlay() {
    const existing = document.querySelector('.shortcuts-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
        <div class="shortcuts-card">
            <div class="flex items-center justify-between mb-5">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="keyboard" class="w-5 h-5 text-brand-500"></i>
                    Keyboard Shortcuts
                </h2>
                <button onclick="document.querySelector('.shortcuts-overlay').remove()" class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-darkborder transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 pt-2 pb-1">Navigation</div>
                <div class="shortcut-row"><span>Tasks view</span><div class="shortcut-keys"><kbd>1</kbd></div></div>
                <div class="shortcut-row"><span>Calendar view</span><div class="shortcut-keys"><kbd>2</kbd></div></div>
                <div class="shortcut-row"><span>Insights view</span><div class="shortcut-keys"><kbd>3</kbd></div></div>
                <div class="shortcut-row"><span>Previous period</span><div class="shortcut-keys"><kbd>←</kbd></div></div>
                <div class="shortcut-row"><span>Next period</span><div class="shortcut-keys"><kbd>→</kbd></div></div>
                <div class="shortcut-row"><span>Go to today</span><div class="shortcut-keys"><kbd>T</kbd></div></div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 pt-3 pb-1">Actions</div>
                <div class="shortcut-row"><span>New event</span><div class="shortcut-keys"><kbd>N</kbd></div></div>
                <div class="shortcut-row"><span>Schedule time block</span><div class="shortcut-keys"><kbd>S</kbd></div></div>
                <div class="shortcut-row"><span>Toggle dark mode</span><div class="shortcut-keys"><kbd>D</kbd></div></div>
                <div class="shortcut-row"><span>Show shortcuts</span><div class="shortcut-keys"><kbd>?</kbd></div></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    lucide.createIcons();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

document.addEventListener('keydown', (e) => {
    // Escape: close modal or shortcuts overlay
    if (e.key === 'Escape') {
        const shortcutsOverlay = document.querySelector('.shortcuts-overlay');
        if (shortcutsOverlay) { shortcutsOverlay.remove(); return; }
        if (!document.getElementById('modal-backdrop').classList.contains('hidden')) {
            closeModal(); return;
        }
        return;
    }

    // Skip shortcuts when typing in inputs or modal is open
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!document.getElementById('modal-backdrop').classList.contains('hidden')) return;

    switch (e.key) {
        case '1': e.preventDefault(); document.querySelector('[data-view="tasks"]')?.click(); break;
        case '2': e.preventDefault(); document.querySelector('[data-view="calendar"]')?.click(); break;
        case '3': e.preventDefault(); document.querySelector('[data-view="insights"]')?.click(); break;
        case 'ArrowLeft':
            e.preventDefault();
            if (typeof CalendarView !== 'undefined' && CalendarView.navigate) CalendarView.navigate(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (typeof CalendarView !== 'undefined' && CalendarView.navigate) CalendarView.navigate(1);
            break;
        case 't': case 'T':
            e.preventDefault();
            if (typeof CalendarView !== 'undefined' && CalendarView.goToday) CalendarView.goToday();
            break;
        case 'n': case 'N':
            e.preventDefault();
            if (typeof CalendarView !== 'undefined') CalendarView.showAddEventForm();
            break;
        case 's': case 'S':
            e.preventDefault();
            if (typeof CalendarView !== 'undefined') CalendarView.showScheduleTimeForm();
            break;
        case 'd': case 'D':
            e.preventDefault();
            toggleDarkMode();
            break;
        case '?':
            e.preventDefault();
            showShortcutsOverlay();
            break;
    }
});
