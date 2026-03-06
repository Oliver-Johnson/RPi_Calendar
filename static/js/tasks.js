const TaskView = {
    container: null,

    async render() {
        this.container = document.getElementById('view-tasks');
        try {
            const tasks = await API.getTasks();
            const grouped = this.groupByPriority(tasks);
            this.container.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">Priority Tasks</h2>
                    <button onclick="TaskView.showAddForm()"
                            class="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Add Task</span>
                    </button>
                </div>
                ${this.renderGroup('High', grouped.High, 'red')}
                ${this.renderGroup('Medium', grouped.Medium, 'yellow')}
                ${this.renderGroup('Low', grouped.Low, 'green')}
            `;
            lucide.createIcons();
        } catch (err) {
            this.container.innerHTML = `<p class="text-red-500">Failed to load tasks: ${err.message}</p>`;
        }
    },

    groupByPriority(tasks) {
        return {
            High: tasks.filter(t => t.priority === 'High'),
            Medium: tasks.filter(t => t.priority === 'Medium'),
            Low: tasks.filter(t => t.priority === 'Low'),
        };
    },

    renderGroup(label, tasks, color) {
        const borderColors = { red: 'border-red-500', yellow: 'border-yellow-500', green: 'border-green-500' };
        const badgeColors = {
            red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
            yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
            green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        };
        return `
            <div class="mb-6">
                <div class="flex items-center gap-2 mb-3 border-l-4 ${borderColors[color]} pl-3">
                    <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200">${label} Priority</h3>
                    <span class="text-xs px-2 py-0.5 rounded-full ${badgeColors[color]}">${tasks.length}</span>
                </div>
                <div class="space-y-2">
                    ${tasks.length === 0
                        ? '<p class="text-gray-400 dark:text-gray-500 text-sm pl-6">No tasks</p>'
                        : tasks.map(t => this.renderTask(t)).join('')}
                </div>
            </div>
        `;
    },

    renderTimeTracking(task) {
        if (!task.estimated_duration && !task.time_scheduled && !task.time_completed) return '';

        const est = task.estimated_duration || 0;
        const scheduled = task.time_scheduled || 0;
        const completed = task.time_completed || 0;

        // Progress bar
        let progressPct = est > 0 ? Math.min((completed / est) * 100, 100) : 0;
        let scheduledPct = est > 0 ? Math.min((scheduled / est) * 100, 100) : 0;

        const barColor = completed >= est && est > 0
            ? 'bg-green-500'
            : 'bg-blue-500';
        const scheduledBarColor = 'bg-blue-200 dark:bg-blue-800';

        let label = '';
        if (est > 0) {
            label = `${formatDuration(completed)}/${formatDuration(est)}`;
        } else if (completed > 0) {
            label = `${formatDuration(completed)} done`;
        } else if (scheduled > 0) {
            label = `${formatDuration(scheduled)} scheduled`;
        }

        return `
            <div class="flex items-center gap-2 mt-1">
                <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative" title="Scheduled: ${formatDuration(scheduled)} | Completed: ${formatDuration(completed)}${est ? ' | Est: ' + formatDuration(est) : ''}">
                    ${scheduledPct > 0 ? `<div class="absolute inset-y-0 left-0 ${scheduledBarColor} rounded-full" style="width:${scheduledPct}%"></div>` : ''}
                    ${progressPct > 0 ? `<div class="absolute inset-y-0 left-0 ${barColor} rounded-full" style="width:${progressPct}%"></div>` : ''}
                </div>
                <span class="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">${label}</span>
            </div>
        `;
    },

    formatDeadline(task) {
        if (!task.due_date) return '';
        const d = new Date(task.due_date);
        const dateStr = d.toLocaleDateString();
        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
        const timeStr = hasTime ? ` ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
        return `${dateStr}${timeStr}`;
    },

    renderTask(task) {
        const isCompleted = task.status === 'Completed';
        const checked = isCompleted ? 'checked' : '';
        const textStyle = isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100';
        const dueLabel = task.due_date
            ? `<span class="text-xs text-gray-400 dark:text-gray-500">${this.formatDeadline(task)}</span>`
            : '';
        const statusBadge = task.status === 'In Progress'
            ? '<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">In Progress</span>'
            : '';
        const estLabel = task.estimated_duration
            ? `<span class="text-xs text-gray-400 dark:text-gray-500"><i data-lucide="clock" class="w-3 h-3 inline-block align-text-bottom mr-0.5"></i>${formatDuration(task.estimated_duration)}</span>`
            : '';
        const schedIcon = getScheduleStatusIcon(task);

        return `
            <div class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 sm:px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700 group">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <input type="checkbox" ${checked}
                           onchange="TaskView.toggleStatus(${task.id}, this.checked)"
                           class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0">
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-sm font-medium ${textStyle} truncate">${escapeHtml(task.title)}</span>
                        <div class="flex items-center gap-2 flex-wrap">
                            ${dueLabel}
                            ${estLabel}
                            ${schedIcon}
                            ${statusBadge}
                        </div>
                        ${this.renderTimeTracking(task)}
                    </div>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onclick="TaskView.showEditForm(${task.id})"
                            class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                            title="Edit">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="showConfirm('Delete this task and all its scheduled blocks?', () => TaskView.deleteTask(${task.id}))"
                            class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                            title="Delete">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
    },

    async toggleStatus(id, completed) {
        try {
            const result = await API.updateTask(id, { status: completed ? 'Completed' : 'Pending' });
            this.render();
            if (completed && result.cleaned_blocks > 0) {
                showToast(`Task completed! Removed ${result.cleaned_blocks} future block${result.cleaned_blocks > 1 ? 's' : ''}.`, 'success');
            }
        } catch (err) {
            showToast('Failed to update task', 'error');
        }
    },

    async deleteTask(id) {
        try {
            await API.deleteTask(id);
            this.render();
        } catch (err) {
            showToast('Failed to delete task', 'error');
        }
    },

    showAddForm() {
        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Add Task</h3>
                <form id="task-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <input type="text" name="title" required
                               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                            <select name="priority"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                <option value="High">High</option>
                                <option value="Medium" selected>Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                            <input type="date" name="due_date"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deadline Time <span class="text-gray-400 font-normal">(optional, defaults to end of day)</span></label>
                        <input type="time" name="due_time"
                               class="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Duration</label>
                        <div class="flex items-center gap-2">
                            <input type="number" name="est_hours" min="0" max="999" placeholder="0"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-sm text-gray-500 dark:text-gray-400">hrs</span>
                            <input type="number" name="est_minutes" min="0" max="59" placeholder="0"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-sm text-gray-500 dark:text-gray-400">min</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Block Size (for scheduling)</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Min</span>
                            <input type="number" name="min_block" min="5" max="480" placeholder="30"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Max</span>
                            <input type="number" name="max_block" min="5" max="480" placeholder="120"
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
                            Add Task
                        </button>
                    </div>
                </form>
            </div>
        `);

        document.getElementById('task-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            const data = {
                title: form.title.value,
                priority: form.priority.value,
            };
            if (form.due_date.value) {
                const timeVal = form.due_time.value || '00:00';
                data.due_date = form.due_date.value + 'T' + timeVal + ':00';
            }
            const estH = parseInt(form.est_hours.value) || 0;
            const estM = parseInt(form.est_minutes.value) || 0;
            const totalMins = estH * 60 + estM;
            if (totalMins > 0) {
                data.estimated_duration = totalMins;
            }
            const minB = parseInt(form.min_block.value) || 0;
            const maxB = parseInt(form.max_block.value) || 0;
            if (minB > 0) data.min_block_size = minB;
            if (maxB > 0) data.max_block_size = maxB;
            await withLoading(btn, async () => {
                try {
                    await API.createTask(data);
                    closeModal();
                    this.render();
                    showToast('Task created', 'success');
                } catch (err) {
                    showToast('Failed to create task: ' + err.message, 'error');
                }
            });
        });
    },

    async showEditForm(id) {
        try {
            const tasks = await API.getTasks();
            const task = tasks.find(t => t.id === id);
            if (!task) return;
            showEditTaskModal(task, () => this.render());
        } catch (err) {
            showToast('Failed to load task', 'error');
        }
    },

};
