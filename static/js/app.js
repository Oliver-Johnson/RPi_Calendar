// ── Dark mode ────────────────────────────────────────────────────────────────
function initDarkMode() {
    const saved = localStorage.getItem('pi-schedule-dark');
    if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
}
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('pi-schedule-dark', document.documentElement.classList.contains('dark'));
    lucide.createIcons();
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
    const views = { tasks: 'view-tasks', calendar: 'view-calendar' };
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
                           class="cal-toggle w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer">
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

    // ── Init ─────────────────────────────────────────────────────────────
    loadCalendarList();
    switchView('tasks');
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
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Edit Task</h3>
            <form id="shared-edit-task-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <input type="text" name="title" value="${escapeAttr(task.title)}" required
                           class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
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
                <div class="flex justify-end gap-3 pt-2">
                    <button type="button" onclick="closeModal()"
                            class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
                        Save
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
            due_date: form.due_date.value ? form.due_date.value + 'T' + dueTimeVal + ':00' : null,
            estimated_duration: totalMins > 0 ? totalMins : null,
            min_block_size: minB > 0 ? minB : null,
            max_block_size: maxB > 0 ? maxB : null,
        };
        await withLoading(btn, async () => {
            try {
                const result = await API.updateTask(id, data);
                closeModal();
                const cleaned = result.cleaned_blocks || 0;
                const msg = cleaned > 0
                    ? `Task updated. Removed ${cleaned} future block${cleaned > 1 ? 's' : ''}.`
                    : 'Task updated';
                showToast(msg, 'success');
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
        success: 'bg-green-600 text-white',
        error: 'bg-red-600 text-white',
        info: 'bg-gray-800 text-white',
    };

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto transition-all duration-300 opacity-0 translate-y-2 ${colors[type] || colors.info}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
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
function showModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
}

function showConfirm(message, onConfirm, { destructive = true, confirmText = 'Delete', icon = 'alert-triangle' } = {}) {
    const btnClass = destructive
        ? 'bg-red-600 hover:bg-red-700 text-white'
        : 'bg-blue-600 hover:bg-blue-700 text-white';
    showModal(`
        <div class="p-6 text-center">
            <div class="w-12 h-12 mx-auto mb-4 rounded-full ${destructive ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'} flex items-center justify-center">
                <i data-lucide="${icon}" class="w-6 h-6 ${destructive ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}"></i>
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-6">${message}</p>
            <div class="flex justify-center gap-3">
                <button onclick="closeModal()"
                        class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    Cancel
                </button>
                <button id="confirm-action-btn"
                        class="px-4 py-2 text-sm ${btnClass} rounded-lg transition-colors flex items-center gap-2">
                    <i data-lucide="${destructive ? 'trash-2' : 'check'}" class="w-4 h-4"></i>
                    ${confirmText}
                </button>
            </div>
        </div>
    `);
    document.getElementById('confirm-action-btn').addEventListener('click', () => {
        closeModal();
        onConfirm();
    });
    lucide.createIcons();
}

document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-backdrop').classList.contains('hidden')) {
        closeModal();
    }
});
