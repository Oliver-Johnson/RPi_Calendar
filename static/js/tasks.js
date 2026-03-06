const TaskView = {
    container: null,

    async render() {
        this.container = document.getElementById('view-tasks');
        try {
            const tasks = await API.getTasks();
            const grouped = this.groupByPriority(tasks);
            this.container.innerHTML = `
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <h2 class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight">Priority Tasks</h2>
                    <button onclick="TaskView.showAddForm()"
                            class="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span>Add Task</span>
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
        const borderColors = { red: 'border-red-500', yellow: 'border-amber-500', green: 'border-emerald-500' };
        const badgeColors = {
            red: 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
            yellow: 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
            green: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
        };
        const textColors = { red: 'text-red-600 dark:text-red-400', yellow: 'text-amber-600 dark:text-amber-400', green: 'text-emerald-600 dark:text-emerald-400' };
        
        return `
            <div class="mb-8">
                <div class="flex items-center gap-3 mb-4 pl-1">
                    <div class="w-1.5 h-6 rounded-full ${color === 'red' ? 'bg-red-500' : color === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                    <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">${label} Priority</h3>
                    <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${badgeColors[color]} shadow-sm">${tasks.length}</span>
                </div>
                <div class="space-y-3">
                    ${tasks.length === 0
                        ? '<div class="p-6 text-center text-sm text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-darkborder rounded-xl">No tasks in this group</div>'
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
            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
            : 'bg-gradient-to-r from-brand-400 to-brand-500';
        const scheduledBarColor = 'bg-brand-200 dark:bg-brand-900/50';

        let label = '';
        if (est > 0) {
            label = `<span class="font-medium text-gray-600 dark:text-gray-300">${formatDuration(completed)}</span> / ${formatDuration(est)}`;
        } else if (completed > 0) {
            label = `<span class="font-medium text-gray-600 dark:text-gray-300">${formatDuration(completed)}</span> done`;
        } else if (scheduled > 0) {
            label = `<span class="font-medium text-gray-600 dark:text-gray-300">${formatDuration(scheduled)}</span> sched`;
        }

        return `
            <div class="flex items-center gap-3 mt-2">
                <div class="flex-1 h-2 bg-gray-100 dark:bg-darkborder rounded-full overflow-hidden relative" title="Scheduled: ${formatDuration(scheduled)} | Completed: ${formatDuration(completed)}${est ? ' | Est: ' + formatDuration(est) : ''}">
                    ${scheduledPct > 0 ? `<div class="absolute inset-y-0 left-0 ${scheduledBarColor} rounded-full" style="width:${scheduledPct}%"></div>` : ''}
                    ${progressPct > 0 ? `<div class="absolute inset-y-0 left-0 ${barColor} rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" style="width:${progressPct}%"></div>` : ''}
                </div>
                <span class="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">${label}</span>
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
        const textStyle = isCompleted ? 'line-through text-gray-400 dark:text-gray-500 decoration-gray-300 dark:decoration-gray-600' : 'text-gray-800 dark:text-gray-100';
        const dueLabel = task.due_date
            ? `<span class="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-darkborder/50 px-2 py-0.5 rounded-md border border-gray-100 dark:border-darkborder"><i data-lucide="calendar" class="w-3 h-3"></i>${this.formatDeadline(task)}</span>`
            : '';
        const statusBadge = task.status === 'In Progress'
            ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-50 text-brand-600 border border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20">In Progress</span>'
            : '';
        const estLabel = task.estimated_duration
            ? `<span class="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-darkborder/50 px-2 py-0.5 rounded-md border border-gray-100 dark:border-darkborder"><i data-lucide="clock" class="w-3 h-3"></i>${formatDuration(task.estimated_duration)}</span>`
            : '';
        const schedIcon = getScheduleStatusIcon(task);

        return `
            <div class="flex items-start sm:items-center justify-between bg-white dark:bg-darkpanel rounded-xl px-4 py-3.5 shadow-sm border border-gray-100 dark:border-darkborder hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200 group relative overflow-hidden ${isCompleted ? 'opacity-75' : ''}">
                ${isCompleted ? '<div class="absolute inset-0 bg-gray-50/50 dark:bg-darkbg/20 z-0 pointer-events-none"></div>' : ''}
                <div class="flex items-start sm:items-center gap-4 flex-1 min-w-0 relative z-10">
                    <input type="checkbox" ${checked}
                           onchange="TaskView.toggleStatus(${task.id}, this.checked)"
                           class="mt-1 sm:mt-0 w-5 h-5 rounded-md border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500 cursor-pointer shadow-sm transition-colors shrink-0">
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-[15px] font-semibold ${textStyle} truncate transition-all tracking-tight">${escapeHtml(task.title)}</span>
                        <div class="flex items-center gap-2 flex-wrap mt-1">
                            ${dueLabel}
                            ${estLabel}
                            ${schedIcon}
                            ${statusBadge}
                        </div>
                        ${this.renderTimeTracking(task)}
                    </div>
                </div>
                <div class="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4 relative z-10">
                    <button onclick="TaskView.showEditForm(${task.id})"
                            class="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-500/10 rounded-lg transition-colors"
                            title="Edit">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="showConfirm('Delete this task and all its scheduled blocks?', () => TaskView.deleteTask(${task.id}))"
                            class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
                </div>
            </div>
        `;
    },

    async toggleStatus(id, completed) {
        try {
            const result = await API.updateTask(id, { status: completed ? 'Completed' : 'Pending' });
            this.render();
            if (completed) {
                let msgs = ['Task completed!'];
                if (result.cleaned_blocks > 0) msgs.push(`Removed ${result.cleaned_blocks} future block${result.cleaned_blocks > 1 ? 's' : ''}.`);
                if (result.spawned_recurrence) msgs.push(`Spawned next recurring task.`);
                showToast(msgs.join(' '), 'success');
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
                <h3 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight mb-5">Add Task</h3>
                <form id="task-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                        <input type="text" name="title" required
                               class="w-full px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
                            <select name="priority"
                                    class="w-full px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                                <option value="High">High</option>
                                <option value="Medium" selected>Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
                            <input type="date" name="due_date"
                                   class="w-full px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Deadline Time <span class="text-gray-400 font-normal">(optional, defaults to end of day)</span></label>
                        <input type="time" name="due_time"
                               class="w-40 px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estimated Duration</label>
                        <div class="flex items-center gap-2">
                            <input type="number" name="est_hours" min="0" max="999" placeholder="0"
                                   class="w-20 px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center transition-shadow">
                            <span class="text-sm font-medium text-gray-500 dark:text-gray-400">hrs</span>
                            <input type="number" name="est_minutes" min="0" max="59" placeholder="0"
                                   class="w-20 px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center transition-shadow">
                            <span class="text-sm font-medium text-gray-500 dark:text-gray-400">min</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Block Size (for scheduling)</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Min</span>
                            <input type="number" name="min_block" min="5" max="480" placeholder="30"
                                   class="w-20 px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center transition-shadow">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-2">Max</span>
                            <input type="number" name="max_block" min="5" max="480" placeholder="120"
                                   class="w-20 px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center transition-shadow">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">min</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200/50 dark:border-darkborder/50">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Recurrence</label>
                            <select name="recurrence_rule"
                                    class="w-full px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                                <option value="">None (One-time task)</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Repeat Until <span class="text-gray-400 font-normal">(optional)</span></label>
                            <input type="date" name="recurrence_until"
                                   class="w-full px-4 py-2.5 border border-gray-300 dark:border-darkborder rounded-xl focus:ring-2 focus:ring-brand-500 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow">
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-darkborder">
                        <button type="button" onclick="closeModal()"
                                class="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
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

            if (form.recurrence_rule.value) {
                data.recurrence_rule = form.recurrence_rule.value;
                if (form.recurrence_until.value) {
                    data.recurrence_until = form.recurrence_until.value + 'T23:59:00';
                }
            }

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
