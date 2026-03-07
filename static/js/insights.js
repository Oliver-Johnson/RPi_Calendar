// ── Insights / Analytics View ────────────────────────────────────────────────
const InsightsView = {
    container: null,

    async render() {
        this.container = document.getElementById('view-insights');
        try {
            const [tasks, blocks] = await Promise.all([
                API.getTasks(),
                API.getScheduledBlocks(
                    DateUtils.toISODate(new Date(Date.now() - 90 * 86400000)),
                    DateUtils.toISODate(new Date(Date.now() + 30 * 86400000))
                ),
            ]);

            this.container.innerHTML = `
                <div class="flex items-center gap-3 mb-8">
                    <h2 class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight flex items-center gap-3">
                        <i data-lucide="bar-chart-3" class="w-6 h-6 text-brand-500"></i>
                        Insights
                    </h2>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${this.renderTimeByPriority(tasks, blocks)}
                    ${this.renderCompletionRate(tasks)}
                    ${this.renderUpcomingDeadlines(tasks)}
                    ${this.renderEstimatedVsActual(tasks)}
                </div>
            `;
            lucide.createIcons();
        } catch (err) {
            this.container.innerHTML = `<p class="text-red-500">Failed to load insights: ${err.message}</p>`;
        }
    },

    // ── Card wrapper ─────────────────────────────────────────────────────
    card(title, icon, content) {
        return `
            <div class="bg-white dark:bg-darkpanel rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm p-6 transition-shadow hover:shadow-md">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/10 to-indigo-500/10 dark:from-brand-500/20 dark:to-indigo-500/20 flex items-center justify-center">
                        <i data-lucide="${icon}" class="w-4 h-4 text-brand-600 dark:text-brand-400"></i>
                    </div>
                    <h3 class="text-base font-bold text-gray-800 dark:text-gray-100 tracking-tight">${title}</h3>
                </div>
                ${content}
            </div>
        `;
    },

    // ── 1. Time by Priority ──────────────────────────────────────────────
    renderTimeByPriority(tasks, blocks) {
        const priorities = ['High', 'Medium', 'Low'];
        const colors = {
            High:   { bar: 'from-red-500 to-rose-500', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
            Medium: { bar: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
            Low:    { bar: 'from-emerald-500 to-green-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
        };

        // Calculate scheduled + completed minutes per priority
        const data = {};
        priorities.forEach(p => { data[p] = { scheduled: 0, completed: 0 }; });

        blocks.forEach(b => {
            const p = b.task_priority || 'Medium';
            const dur = (new Date(b.end_time) - new Date(b.start_time)) / 60000;
            if (data[p]) {
                data[p].scheduled += dur;
                if (b.is_completed) data[p].completed += dur;
            }
        });

        const maxMinutes = Math.max(...priorities.map(p => data[p].scheduled), 1);

        const bars = priorities.map(p => {
            const d = data[p];
            const schedPct = (d.scheduled / maxMinutes) * 100;
            const compPct = d.scheduled > 0 ? (d.completed / d.scheduled) * 100 : 0;
            return `
                <div class="space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-semibold ${colors[p].text}">${p}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">${formatDuration(Math.round(d.scheduled))} sched / ${formatDuration(Math.round(d.completed))} done</span>
                    </div>
                    <div class="relative h-6 rounded-lg overflow-hidden bg-gray-100 dark:bg-darkborder/50">
                        <div class="absolute inset-y-0 left-0 bg-gradient-to-r ${colors[p].bar} opacity-25 rounded-lg transition-all duration-500" style="width:${schedPct}%"></div>
                        <div class="absolute inset-y-0 left-0 bg-gradient-to-r ${colors[p].bar} rounded-lg transition-all duration-500 shadow-sm" style="width:${schedPct * compPct / 100}%"></div>
                        ${compPct > 0 ? `<span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 dark:text-gray-400">${Math.round(compPct)}%</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return this.card('Time by Priority', 'layers', `
            <div class="space-y-4">${bars}</div>
            <div class="mt-4 pt-3 border-t border-gray-100 dark:border-darkborder/50 flex gap-4 text-[11px] text-gray-400 dark:text-gray-500">
                <span class="flex items-center gap-1"><span class="w-3 h-2 rounded bg-gray-200 dark:bg-gray-600 inline-block"></span> Scheduled</span>
                <span class="flex items-center gap-1"><span class="w-3 h-2 rounded bg-gradient-to-r from-brand-500 to-indigo-500 inline-block"></span> Completed</span>
            </div>
        `);
    },

    // ── 2. Completion Rate ───────────────────────────────────────────────
    renderCompletionRate(tasks) {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === 'Completed').length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const pending = tasks.filter(t => t.status === 'Pending').length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        // SVG donut chart
        const radius = 58;
        const circumference = 2 * Math.PI * radius;
        const completedDash = (completed / Math.max(total, 1)) * circumference;
        const inProgressDash = (inProgress / Math.max(total, 1)) * circumference;
        const pendingDash = (pending / Math.max(total, 1)) * circumference;

        let offset = 0;
        const segments = [];
        if (completed > 0) {
            segments.push(`<circle cx="70" cy="70" r="${radius}" fill="none" stroke="url(#grad-completed)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${completedDash} ${circumference - completedDash}" stroke-dashoffset="-${offset}" class="transition-all duration-700" />`);
            offset += completedDash;
        }
        if (inProgress > 0) {
            segments.push(`<circle cx="70" cy="70" r="${radius}" fill="none" stroke="url(#grad-inprogress)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${inProgressDash} ${circumference - inProgressDash}" stroke-dashoffset="-${offset}" class="transition-all duration-700" />`);
            offset += inProgressDash;
        }
        if (pending > 0) {
            segments.push(`<circle cx="70" cy="70" r="${radius}" fill="none" stroke="url(#grad-pending)" stroke-width="14" stroke-dasharray="${pendingDash} ${circumference - pendingDash}" stroke-dashoffset="-${offset}" class="transition-all duration-700" />`);
        }

        const content = `
            <div class="flex items-center gap-8">
                <div class="relative shrink-0">
                    <svg width="140" height="140" viewBox="0 0 140 140" class="transform -rotate-90">
                        <defs>
                            <linearGradient id="grad-completed" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient>
                            <linearGradient id="grad-inprogress" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#60a5fa"/></linearGradient>
                            <linearGradient id="grad-pending" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#d1d5db"/><stop offset="100%" stop-color="#e5e7eb"/></linearGradient>
                        </defs>
                        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="14" class="dark:stroke-gray-800" />
                        ${segments.join('')}
                    </svg>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="text-center">
                            <div class="text-2xl font-extrabold text-gray-800 dark:text-gray-100">${pct}%</div>
                            <div class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">done</div>
                        </div>
                    </div>
                </div>
                <div class="space-y-3 flex-1">
                    <div class="flex items-center justify-between">
                        <span class="flex items-center gap-2 text-sm"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span><span class="text-gray-600 dark:text-gray-400">Completed</span></span>
                        <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${completed}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="flex items-center gap-2 text-sm"><span class="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span><span class="text-gray-600 dark:text-gray-400">In Progress</span></span>
                        <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${inProgress}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="flex items-center gap-2 text-sm"><span class="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 inline-block shadow-sm"></span><span class="text-gray-600 dark:text-gray-400">Pending</span></span>
                        <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${pending}</span>
                    </div>
                    <div class="pt-2 border-t border-gray-100 dark:border-darkborder/50 flex items-center justify-between">
                        <span class="text-xs text-gray-400 dark:text-gray-500">Total</span>
                        <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${total}</span>
                    </div>
                </div>
            </div>
        `;
        return this.card('Completion Rate', 'pie-chart', content);
    },

    // ── 3. Upcoming Deadlines ────────────────────────────────────────────
    renderUpcomingDeadlines(tasks) {
        const now = new Date();
        const upcoming = tasks
            .filter(t => t.status !== 'Completed' && t.due_date)
            .map(t => ({ ...t, _due: new Date(t.due_date) }))
            .sort((a, b) => a._due - b._due)
            .slice(0, 8);

        if (upcoming.length === 0) {
            return this.card('Upcoming Deadlines', 'clock', `
                <div class="text-sm text-gray-400 dark:text-gray-500 text-center py-8 border border-dashed border-gray-200 dark:border-darkborder rounded-xl">
                    No upcoming deadlines
                </div>
            `);
        }

        const rows = upcoming.map(t => {
            const diffMs = t._due - now;
            const diffDays = Math.ceil(diffMs / 86400000);
            const isOverdue = diffDays < 0;
            const isUrgent = diffDays >= 0 && diffDays <= 2;

            let urgencyBadge = '';
            if (isOverdue) {
                urgencyBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">${Math.abs(diffDays)}d overdue</span>`;
            } else if (isUrgent) {
                urgencyBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">${diffDays === 0 ? 'Today' : diffDays + 'd'}</span>`;
            } else {
                urgencyBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-darkborder">${diffDays}d</span>`;
            }

            const priorityDot = {
                'High': 'bg-red-500',
                'Medium': 'bg-amber-500',
                'Low': 'bg-emerald-500'
            }[t.priority] || 'bg-gray-400';

            return `
                <div class="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-darkborder/30 transition-colors ${isOverdue ? 'bg-red-50/50 dark:bg-red-500/5' : ''}">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="w-2 h-2 rounded-full ${priorityDot} shrink-0 shadow-sm"></span>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">${escapeHtml(t.title)}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 ml-3">
                        <span class="text-[11px] text-gray-400 dark:text-gray-500">${t._due.toLocaleDateString()}</span>
                        ${urgencyBadge}
                    </div>
                </div>
            `;
        }).join('');

        return this.card('Upcoming Deadlines', 'clock', `<div class="space-y-1">${rows}</div>`);
    },

    // ── 4. Estimated vs Actual ───────────────────────────────────────────
    renderEstimatedVsActual(tasks) {
        // Only tasks with both estimated and some tracked time
        const eligible = tasks.filter(t => t.estimated_duration > 0 && (t.time_completed > 0 || t.time_scheduled > 0));

        if (eligible.length === 0) {
            return this.card('Estimated vs Actual', 'git-compare', `
                <div class="text-sm text-gray-400 dark:text-gray-500 text-center py-8 border border-dashed border-gray-200 dark:border-darkborder rounded-xl">
                    No tasks with time tracking data yet
                </div>
            `);
        }

        // Summary stats
        const totalEst = eligible.reduce((s, t) => s + t.estimated_duration, 0);
        const totalActual = eligible.reduce((s, t) => s + (t.time_completed || 0), 0);
        const totalSched = eligible.reduce((s, t) => s + (t.time_scheduled || 0), 0);
        const accuracy = totalEst > 0 ? Math.round((totalActual / totalEst) * 100) : 0;

        // Per-task bars (top 6)
        const top = eligible.slice(0, 6);
        const maxMins = Math.max(...top.map(t => Math.max(t.estimated_duration, t.time_completed || 0, t.time_scheduled || 0)), 1);

        const bars = top.map(t => {
            const estPct = (t.estimated_duration / maxMins) * 100;
            const actPct = ((t.time_completed || 0) / maxMins) * 100;
            const overBudget = (t.time_completed || 0) > t.estimated_duration;

            return `
                <div class="space-y-1.5">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[60%]">${escapeHtml(t.title)}</span>
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">${formatDuration(t.time_completed || 0)} / ${formatDuration(t.estimated_duration)}</span>
                    </div>
                    <div class="relative h-4 rounded-md overflow-hidden bg-gray-100 dark:bg-darkborder/50">
                        <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 rounded-md opacity-40" style="width:${estPct}%"></div>
                        <div class="absolute inset-y-0 left-0 bg-gradient-to-r ${overBudget ? 'from-red-500 to-rose-500' : 'from-brand-500 to-indigo-500'} rounded-md shadow-sm" style="width:${actPct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        const summaryColor = accuracy <= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

        const content = `
            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="text-center p-3 bg-gray-50 dark:bg-darkbg/50 rounded-xl border border-gray-100 dark:border-darkborder/50">
                    <div class="text-lg font-extrabold text-gray-800 dark:text-gray-100">${formatDuration(totalEst)}</div>
                    <div class="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-0.5">Estimated</div>
                </div>
                <div class="text-center p-3 bg-gray-50 dark:bg-darkbg/50 rounded-xl border border-gray-100 dark:border-darkborder/50">
                    <div class="text-lg font-extrabold text-gray-800 dark:text-gray-100">${formatDuration(totalActual)}</div>
                    <div class="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-0.5">Actual</div>
                </div>
                <div class="text-center p-3 bg-gray-50 dark:bg-darkbg/50 rounded-xl border border-gray-100 dark:border-darkborder/50">
                    <div class="text-lg font-extrabold ${summaryColor}">${accuracy}%</div>
                    <div class="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-0.5">Accuracy</div>
                </div>
            </div>
            <div class="space-y-3">${bars}</div>
            <div class="mt-4 pt-3 border-t border-gray-100 dark:border-darkborder/50 flex gap-4 text-[11px] text-gray-400 dark:text-gray-500">
                <span class="flex items-center gap-1"><span class="w-3 h-2 rounded bg-gray-300 dark:bg-gray-600 inline-block"></span> Estimated</span>
                <span class="flex items-center gap-1"><span class="w-3 h-2 rounded bg-gradient-to-r from-brand-500 to-indigo-500 inline-block"></span> Actual</span>
                <span class="flex items-center gap-1"><span class="w-3 h-2 rounded bg-gradient-to-r from-red-500 to-rose-500 inline-block"></span> Over budget</span>
            </div>
        `;
        return this.card('Estimated vs Actual', 'git-compare', content);
    },
};
