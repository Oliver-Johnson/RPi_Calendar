const HOUR_PX = 56; // pixels per hour in time grids

const CalendarView = {
    mode: 'month',
    currentDate: new Date(),
    events: [],
    tasks: [],
    blocks: [],
    container: null,

    async render(preserveScroll = false) {
        const savedScroll = preserveScroll ? this._getScrollTop() : null;
        this.container = document.getElementById('view-calendar');
        await this.fetchEvents();

        this.container.innerHTML = `
            <div class="flex flex-col lg:flex-row gap-6 lg:h-full">
                <div class="flex-1 flex flex-col min-w-0">
                    ${this.renderHeader()}
                    <div id="cal-body" class="flex-1 overflow-y-auto min-h-0 relative"></div>
                </div>
                <!-- Unscheduled Tray (Side panel on Desktop, stacked on Mobile) -->
                ${this.renderUnscheduledTray()}
            </div>
        `;

        this.renderBody();
        this._updateMobileModeButtons();
        lucide.createIcons();
        this._applyScroll(savedScroll);
    },

    _updateMobileModeButtons() {
        document.querySelectorAll('.mobile-mode-btn').forEach(btn => {
            if (btn.dataset.mode === this.mode) {
                btn.className = 'mobile-mode-btn flex-1 py-1 rounded-md text-xs font-bold shadow-sm bg-white dark:bg-darkpanel text-brand-600 dark:text-brand-400 border-gray-200 dark:border-darkborder';
            } else {
                btn.className = 'mobile-mode-btn flex-1 py-1 rounded-md text-xs font-semibold border-transparent text-gray-500 dark:text-gray-400 bg-transparent';
            }
        });
    },

    async fetchEvents() {
        try {
            const range = this.getRange();
            const [events, tasks, blocks] = await Promise.all([
                API.getEvents(range.start, range.end),
                API.getTasks(),
                API.getScheduledBlocks(range.start, range.end),
            ]);
            this.events = events;
            this.tasks = tasks;
            this.blocks = blocks;
        } catch (err) {
            this.events = [];
            this.tasks = [];
            this.blocks = [];
        }
    },

    getRange() {
        const d = this.currentDate;
        if (this.mode === 'month') return DateUtils.getMonthRange(d.getFullYear(), d.getMonth());
        if (this.mode === 'week') return DateUtils.getWeekRange(d);
        return DateUtils.getDayRange(d);
    },

    getLabel() {
        const d = this.currentDate;
        if (this.mode === 'month') return DateUtils.formatMonthYear(d.getFullYear(), d.getMonth());
        if (this.mode === 'week') return DateUtils.formatWeekRange(d);
        return DateUtils.formatFullDate(d);
    },

    renderHeader() {
        const modes = ['month', 'week', 'day'];
        return `
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div class="flex items-center gap-2 sm:gap-3 bg-white/50 dark:bg-darkpanel/50 backdrop-blur-md p-1 rounded-2xl border border-gray-200/50 dark:border-darkborder/50 shadow-sm">
                    <button onclick="CalendarView.navigate(-1)"
                            class="p-2 hover:bg-white dark:hover:bg-darkborder rounded-xl transition-all hover:shadow-sm">
                        <i data-lucide="chevron-left" class="w-5 h-5 text-gray-600 dark:text-gray-300"></i>
                    </button>
                    <h2 class="text-lg sm:text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight min-w-36 sm:min-w-48 text-center">${this.getLabel()}</h2>
                    <button onclick="CalendarView.navigate(1)"
                            class="p-2 hover:bg-white dark:hover:bg-darkborder rounded-xl transition-all hover:shadow-sm">
                        <i data-lucide="chevron-right" class="w-5 h-5 text-gray-600 dark:text-gray-300"></i>
                    </button>
                    <button onclick="CalendarView.goToday()"
                            class="px-4 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-all hover:shadow-sm ml-1">
                        Today
                    </button>
                </div>
                <div class="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 sm:mt-0">
                    <button onclick="CalendarView.showScheduleTimeForm()"
                            class="px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-400 hover:to-fuchsia-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            title="Schedule work time for a task">
                        <i data-lucide="timer" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Schedule</span>
                    </button>
                    <button onclick="CalendarView.showRescheduleAllModal()"
                            class="px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            title="Reschedule all tasks">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Reschedule All</span>
                    </button>
                    <button onclick="CalendarView.showAddEventForm()"
                            class="px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Add Event</span>
                    </button>
                    <div class="flex bg-gray-100 dark:bg-darkbg rounded-xl p-1 shadow-inner ml-0 sm:ml-2 border border-gray-200/50 dark:border-darkborder/50">
                        ${modes.map(m => `
                            <button onclick="CalendarView.setMode('${m}')"
                                    class="px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${this.mode === m ? 'bg-white dark:bg-darkpanel shadow-sm text-brand-600 dark:text-brand-400 border border-gray-200 dark:border-darkborder' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-transparent'}">
                                ${m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    renderUnscheduledTray() {
        const unscheduled = this.tasks.filter(t => 
            t.status !== 'Completed' && 
            t.scheduling_status !== 'fully_scheduled' &&
            t.estimated_duration > 0
        );

        // Hide tray entirely when empty so the calendar fills the space
        if (unscheduled.length === 0) return '';

        // Sort by priority then due date
        const priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
        unscheduled.sort((a, b) => {
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
            if (a.due_date) return -1;
            if (b.due_date) return 1;
            return 0;
        });

        const taskHTML = unscheduled.map(t => {
            const timeInfo = t.time_scheduled > 0 
                ? `${formatDuration(t.time_scheduled)} / ${formatDuration(t.estimated_duration)} sched`
                : `${formatDuration(t.estimated_duration)} est`;
            const priorityColors = {
                'High': 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
                'Medium': 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
                'Low': 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
            };
            const pClass = priorityColors[t.priority] || priorityColors['Medium'];

            return `
                <div draggable="true" 
                     ondragstart="CalendarView.onDragStartTask(event, ${t.id})"
                     class="p-3 mb-2 rounded-xl border-l-4 border-y border-r border-gray-200 dark:border-darkborder bg-white dark:bg-darkpanel shadow-sm cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing ${pClass}">
                    <div class="font-semibold text-sm truncate tracking-tight text-gray-800 dark:text-gray-100">${escapeHtml(t.title)}</div>
                    <div class="flex justify-between items-center mt-1 text-[11px] font-medium opacity-80">
                        <span>${timeInfo}</span>
                        ${t.due_date ? `<span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i>${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="w-full lg:w-72 flex-shrink-0 flex flex-col bg-gray-50/50 dark:bg-darkbg/50 border border-gray-200/50 dark:border-darkborder/50 rounded-2xl p-4 lg:h-full lg:overflow-hidden backdrop-blur-sm">
                <h3 class="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-4 tracking-tight">
                    <i data-lucide="list-todo" class="w-4 h-4 text-brand-500"></i>
                    Unscheduled Tasks
                </h3>
                <div class="flex-1 lg:overflow-y-auto pr-1 space-y-2">
                    ${unscheduled.length === 0 
                        ? '<div class="text-sm text-gray-400 dark:text-gray-500 text-center py-6 border border-dashed border-gray-200 dark:border-darkborder rounded-xl">All specific tasks are fully scheduled!</div>' 
                        : taskHTML}
                </div>
                <div class="mt-4 pt-3 border-t border-gray-200/50 dark:border-darkborder/50 text-[11px] text-gray-400 dark:text-gray-500 text-center">
                    Drag tasks onto the calendar grid to schedule them.
                </div>
            </div>
        `;
    },

    renderBody() {
        const body = document.getElementById('cal-body');
        if (this.mode === 'month') body.innerHTML = this.renderMonth();
        else if (this.mode === 'week') body.innerHTML = this.renderWeek();
        else body.innerHTML = this.renderDay();
        lucide.createIcons();
    },

    // ── Helpers ──────────────────────────────────────────────────────────
    getTasksForDate(date) {
        return this.tasks.filter(t => {
            if (!t.due_date) return false;
            const due = new Date(t.due_date);
            return DateUtils.isSameDay(due, date);
        });
    },

    getBlocksForDate(date) {
        return this.blocks.filter(b => {
            const s = new Date(b.start_time);
            return DateUtils.isSameDay(s, date);
        });
    },

    getTaskColorClasses(priority) {
        const colors = {
            High:   { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-700 dark:text-red-300', border: 'border-red-500' },
            Medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-500' },
            Low:    { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-300', border: 'border-green-500' },
        };
        return colors[priority] || colors.Medium;
    },

    splitEvents(events) {
        const allDay = [];
        const timed = [];
        events.forEach(e => {
            if (e.is_all_day || e._isVirtualAllDay) {
                allDay.push(e);
            } else {
                timed.push(e);
            }
        });
        return { allDay, timed };
    },

    formatDTLocal(isoStr) {
        const d = new Date(isoStr);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${mo}-${da}T${h}:${mi}`;
    },

    // ── Scroll management ────────────────────────────────────────────────
    _getScrollTop() {
        if (!this.container) return null;
        const el = document.getElementById('time-grid-scroll');
        return el ? el.scrollTop : null;
    },

    _applyScroll(savedScroll) {
        if (this.mode === 'month') return;
        const el = document.getElementById('time-grid-scroll');
        if (!el) return;

        // If a drop handler set a pending scroll target, use it and center it
        if (this._pendingScrollHour != null) {
            const hour = this._pendingScrollHour;
            this._pendingScrollHour = null;
            const viewportH = el.clientHeight;
            const targetPx = Math.max(0, (hour * HOUR_PX) - (viewportH / 2));
            el.scrollTop = targetPx;
        } else if (savedScroll !== null && savedScroll !== undefined) {
            el.scrollTop = savedScroll;
        } else {
            // Default: scroll to 1 hour before current time
            const now = new Date();
            const targetHour = Math.max(0, now.getHours() - 1);
            el.scrollTop = targetHour * HOUR_PX;
        }
    },

    // ── Overlap layout ──────────────────────────────────────────────────
    layoutOverlaps(items) {
        if (!items.length) return items;
        // Sort by start time, then longest first for tie-breaking
        items.sort((a, b) => a.startHour - b.startHour || (b.endHour - b.startHour) - (a.endHour - a.startHour));
        // Greedy column assignment
        const columns = [];
        items.forEach(item => {
            let placed = false;
            for (let c = 0; c < columns.length; c++) {
                if (item.startHour >= columns[c]) {
                    columns[c] = item.endHour;
                    item.colIndex = c;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                item.colIndex = columns.length;
                columns.push(item.endHour);
            }
        });
        // Build overlap groups and assign totalCols per group
        const groups = [];
        let currentGroup = [];
        let groupEnd = -Infinity;
        items.forEach(item => {
            if (item.startHour >= groupEnd && currentGroup.length > 0) {
                groups.push(currentGroup);
                currentGroup = [];
                groupEnd = -Infinity;
            }
            currentGroup.push(item);
            groupEnd = Math.max(groupEnd, item.endHour);
        });
        if (currentGroup.length > 0) groups.push(currentGroup);
        groups.forEach(group => {
            const maxCol = Math.max(...group.map(i => i.colIndex));
            group.forEach(item => { item.totalCols = maxCol + 1; });
        });
        return items;
    },

    // ── Month View ──────────────────────────────────────────────────────
    renderMonth() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = DateUtils.getFirstDayOfMonth(year, month);
        const daysInMonth = DateUtils.getDaysInMonth(year, month);
        const today = new Date();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const shortDayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        let html = '<div class="bg-white/95 dark:bg-darkpanel/95 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-darkborder/50 overflow-hidden">';
        html += '<div class="grid grid-cols-7 cal-month-grid">';

        dayNames.forEach((d, i) => {
            html += `<div class="py-3 sm:py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200/50 dark:border-darkborder/50 bg-gray-50/50 dark:bg-darkbg/50">
                <span class="hidden sm:inline">${d}</span><span class="sm:hidden">${shortDayNames[i]}</span>
            </div>`;
        });

        for (let i = 0; i < firstDay; i++) {
            html += '<div class="min-h-16 sm:min-h-28 p-1 sm:p-2 border-b border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = DateUtils.isSameDay(date, today);
            const dayEvents = this.getEventsForDate(date);
            const dayTasks = this.getTasksForDate(date);
            // No scheduled blocks in month view per requirements
            const allItems = [...dayEvents, ...dayTasks.map(t => ({ _isTask: true, ...t }))];
            const isLastCol = (firstDay + day) % 7 === 0;

            html += `
                <div class="min-h-20 sm:min-h-32 p-1.5 sm:p-2.5 border-b ${isLastCol ? '' : 'border-r'} border-gray-100 dark:border-darkborder/80 cal-day cursor-pointer relative"
                     onclick="CalendarView.onDayClick(${year}, ${month}, ${day})">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-xs sm:text-sm font-semibold ${isToday ? 'bg-gradient-to-br from-brand-500 to-indigo-600 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shadow-md' : 'text-gray-700 dark:text-gray-300 px-1'}">${day}</span>
                    </div>
                    <div class="space-y-1">
                        ${allItems.slice(0, 3).map(item => {
                            if (item._isTask) {
                                const tc = this.getTaskColorClasses(item.priority);
                                return `<div class="text-[10px] sm:text-xs font-medium truncate px-1.5 sm:px-2 py-0.5 rounded-md cursor-pointer ${tc.bg} ${tc.text} border-l-2 ${tc.border} transition-transform hover:scale-[1.02]"
                                             onclick="event.stopPropagation(); CalendarView.showTaskDetail(${item.id})"
                                             title="Task: ${escapeAttr(item.title)} (${item.priority})">
                                    <i data-lucide="check-square" class="w-3 h-3 inline-block mr-1 align-text-bottom"></i>${escapeHtml(item.title)}
                                </div>`;
                            }
                            const e = item;
                            const isOutlook = e.source === 'Outlook';
                            return `<div class="text-[10px] sm:text-xs font-medium truncate px-1.5 sm:px-2 py-0.5 rounded-md cursor-pointer ${isOutlook ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20' : 'bg-emerald-50/80 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'} transition-transform hover:scale-[1.02]"
                                         onclick="event.stopPropagation(); CalendarView.showEventDetail(${e.id})"
                                         title="${escapeAttr(e.title)}${e.calendar_name ? ' [' + escapeAttr(e.calendar_name) + ']' : ''}">
                                    ${escapeHtml(e.title)}
                                </div>`;
                        }).join('')}
                        ${allItems.length > 3 ? `<div class="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-gray-500 pl-1 mt-1">+${allItems.length - 3} more</div>` : ''}
                    </div>
                </div>
            `;
        }

        const totalCells = firstDay + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 0; i < remaining; i++) {
            html += '<div class="min-h-16 sm:min-h-28 p-1 sm:p-2 border-b border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"></div>';
        }

        html += '</div></div>';
        return html;
    },

    // ── Week View ───────────────────────────────────────────────────────
    renderWeek() {
        const startOfWeek = new Date(this.currentDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const today = new Date();
        const startHour = 0, endHour = 24;
        const totalHours = endHour - startHour;
        const gridH = totalHours * HOUR_PX;

        const weekAllDay = [];
        const weekTasks = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            const dayEvents = this.getEventsForDate(d);
            const { allDay } = this.splitEvents(dayEvents);
            const dayTasks = this.getTasksForDate(d);
            weekAllDay.push(allDay);
            weekTasks.push(dayTasks);
        }
        const hasAllDayRow = weekAllDay.some(a => a.length > 0) || weekTasks.some(t => t.length > 0);

        let html = '<div class="bg-white/95 dark:bg-darkpanel/95 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-darkborder/50 overflow-hidden">';

        // Header row
        html += '<div class="flex border-b border-gray-200/50 dark:border-darkborder/50 bg-gray-50/50 dark:bg-darkbg/50">';
        html += '<div class="py-2 sm:py-3 px-1 sm:px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-200/50 dark:border-darkborder/50 w-12 sm:w-16 shrink-0"></div>';
        html += '<div class="flex-1 grid grid-cols-7">';
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            const isToday = DateUtils.isSameDay(d, today);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dayLetter = dayName[0];
            const dayNum = d.getDate();
            html += `
                <div class="py-2 sm:py-3 text-center border-r border-gray-200/50 dark:border-darkborder/50 last:border-r-0 ${isToday ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''}">
                    <div class="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                        <span class="hidden sm:inline">${dayName}</span><span class="sm:hidden">${dayLetter}</span>
                    </div>
                    <div class="text-sm sm:text-lg font-bold ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'}">${dayNum}</div>
                </div>
            `;
        }
        html += '</div></div>';

        // All-day / Task row
        if (hasAllDayRow) {
            html += '<div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">';
            html += '<div class="py-1 px-1 sm:px-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 w-12 sm:w-16 shrink-0 flex items-center justify-end pr-1 sm:pr-2">All day</div>';
            html += '<div class="flex-1 grid grid-cols-7">';
            for (let i = 0; i < 7; i++) {
                html += `<div class="py-1 px-0.5 border-r border-gray-200 dark:border-gray-700 last:border-r-0 space-y-0.5">`;
                weekAllDay[i].forEach(e => {
                    html += `<div class="text-[10px] sm:text-xs truncate px-1 py-0.5 rounded cursor-pointer ${e.source === 'Outlook' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}"
                                  onclick="CalendarView.showEventDetail(${e.id})"
                                  title="${escapeAttr(e.title)}">${escapeHtml(e.title)}</div>`;
                });
                weekTasks[i].forEach(t => {
                    const tc = this.getTaskColorClasses(t.priority);
                    const si = getScheduleStatusIcon(t);
                    html += `<div class="text-[10px] sm:text-xs truncate px-1 py-0.5 rounded cursor-pointer border-l-2 ${tc.border} ${tc.bg} ${tc.text}"
                                  onclick="CalendarView.showTaskDetail(${t.id})"
                                  title="Task: ${escapeAttr(t.title)} (${t.priority})">
                        <i data-lucide="check-square" class="w-2.5 h-2.5 inline-block mr-0.5 align-text-bottom"></i>${escapeHtml(t.title)}${si}
                    </div>`;
                });
                if (weekAllDay[i].length === 0 && weekTasks[i].length === 0) {
                    html += '&nbsp;';
                }
                html += '</div>';
            }
            html += '</div></div>';
        }

        // Time grid
        html += `<div id="time-grid-scroll" class="overflow-y-auto overflow-x-hidden" style="max-height: 600px;">`;
        html += `<div class="flex" style="min-height:${gridH}px">`;

        // Time labels
        html += '<div class="border-r border-gray-200 dark:border-gray-700 w-12 sm:w-16 shrink-0 relative">';
        for (let h = startHour; h < endHour; h++) {
            const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            const top = (h - startHour) * HOUR_PX;
            html += `<div class="absolute right-1 sm:right-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500" style="top:${top}px;transform:translateY(-50%)">${label}</div>`;
        }
        html += '</div>';

        // Day columns wrapper
        html += '<div class="flex-1 grid grid-cols-7">';

        // Day columns
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            const isToday = DateUtils.isSameDay(d, today);
            const dayEvents = this.getEventsForDate(d);
            const { timed } = this.splitEvents(dayEvents);
            const dayBlocks = this.getBlocksForDate(d);

            html += `<div class="border-r border-gray-100 dark:border-gray-700 last:border-r-0 time-grid-col ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}"
                          onclick="CalendarView.showAddEventForm('${DateUtils.toISODate(d)}')"
                          ondragenter="CalendarView.onDragEnterGrid(event)"
                          ondragover="CalendarView.onDragOverGrid(event)"
                          ondragleave="CalendarView.onDragLeaveGrid(event)"
                          ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(d)}')"
                          style="min-height:${gridH}px">`;

            for (let h = startHour; h < endHour; h++) {
                const top = (h - startHour) * HOUR_PX;
                html += `<div class="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700/50" style="top:${top}px"></div>`;
            }

            // Combine events and blocks for overlap layout
            const dayItems = [];
            timed.forEach(e => {
                const s = new Date(e._displayStart || e.start_time);
                const en = new Date(e._displayEnd || e.end_time);
                dayItems.push({ type: 'event', data: e, startHour: s.getHours() + s.getMinutes() / 60, endHour: (en.getHours() + en.getMinutes() / 60) || 24 });
            });
            dayBlocks.forEach(b => {
                const s = new Date(b.start_time);
                const en = new Date(b.end_time);
                dayItems.push({ type: 'block', data: b, startHour: s.getHours() + s.getMinutes() / 60, endHour: (en.getHours() + en.getMinutes() / 60) || 24 });
            });
            this.layoutOverlaps(dayItems);

            dayItems.forEach(item => {
                const clampStart = Math.max(item.startHour, startHour);
                const clampEnd = Math.min(item.endHour, endHour);
                if (clampEnd <= clampStart) return;
                const top = (clampStart - startHour) * HOUR_PX;
                const height = Math.max((clampEnd - clampStart) * HOUR_PX, 18);
                const isShort = (clampEnd - clampStart) < 0.75;
                const leftPct = (item.colIndex / item.totalCols) * 100;
                const widthPct = (1 / item.totalCols) * 100;
                const posStyle = `top:${top}px;height:${height}px;left:calc(${leftPct}% + 1px);width:calc(${widthPct}% - 2px)`;

                if (item.type === 'event') {
                    const e = item.data;
                    const s = new Date(e._displayStart || e.start_time);
                    const en = new Date(e._displayEnd || e.end_time);
                    const cls = e.source === 'Outlook' ? 'outlook' : 'manual';
                    const excludedCls = e.excluded_from_schedule ? 'excluded-event' : '';
                    html += `<div class="time-event ${cls} ${excludedCls} ${isShort ? 'short' : ''}" style="${posStyle}"
                                  draggable="true" ondragstart="CalendarView.onDragStartEvent(event, ${e.id})"
                                  ondragover="event.preventDefault()" ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(d)}')"
                                  onclick="event.stopPropagation(); CalendarView.showEventDetail(${e.id})">
                        <div class="ev-title">${e.excluded_from_schedule ? '<i data-lucide="eye-off" class="w-3 h-3 inline-block mr-0.5 align-text-bottom opacity-50"></i>' : ''}${escapeHtml(e.title)}</div>
                        <div class="ev-time">${DateUtils.formatTime(s)} – ${DateUtils.formatTime(en)}</div>
                    </div>`;
                } else {
                    const block = item.data;
                    const s = new Date(block.start_time);
                    const en = new Date(block.end_time);
                    const priorityCls = `sched-${(block.task_priority || 'Medium').toLowerCase()}`;
                    const completedCls = block.is_completed ? 'completed' : '';
                    const pinnedCls = block.is_pinned ? 'pinned' : '';
                    const timeLabel = `${DateUtils.formatTime(s)} - ${DateUtils.formatTime(en)}`;
                    const pinIcon = block.is_pinned ? '<i data-lucide="pin" class="w-2.5 h-2.5 pin-icon"></i>' : '';
                    html += `<div class="time-event scheduled-block ${priorityCls} ${completedCls} ${pinnedCls} ${isShort ? 'short' : ''}" style="${posStyle}"
                                  draggable="true" ondragstart="CalendarView.onDragStartBlock(event, ${block.id})"
                                  ondragover="event.preventDefault()" ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(d)}')"
                                  onclick="event.stopPropagation(); CalendarView.showBlockDetail(${block.id})">
                        ${pinIcon}
                        <div class="ev-title">${block.is_completed ? '<i data-lucide="check-circle" class="w-3 h-3 inline-block mr-0.5 align-text-bottom"></i>' : '<i data-lucide="timer" class="w-3 h-3 inline-block mr-0.5 align-text-bottom"></i>'}${escapeHtml(block.task_title || 'Task')}</div>
                        <div class="ev-time">${timeLabel}</div>
                    </div>`;
                }
            });

            html += '</div>';
        }

        html += '</div></div></div>';
        return html;
    },

    // ── Day View ────────────────────────────────────────────────────────
    renderDay() {
        const today = new Date();
        const isToday = DateUtils.isSameDay(this.currentDate, today);
        const startHour = 0, endHour = 24;
        const totalHours = endHour - startHour;
        const gridH = totalHours * HOUR_PX;
        const dayEvents = this.getEventsForDate(this.currentDate);
        const { allDay, timed } = this.splitEvents(dayEvents);
        const dayTasks = this.getTasksForDate(this.currentDate);
        const dayBlocks = this.getBlocksForDate(this.currentDate);
        const hasAllDayRow = allDay.length > 0 || dayTasks.length > 0;

        let html = '<div class="bg-white/95 dark:bg-darkpanel/95 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-darkborder/50 overflow-hidden">';

        if (isToday) {
            html += '<div class="px-5 py-2.5 bg-gradient-to-r from-brand-50 to-indigo-50 dark:from-brand-900/20 dark:to-indigo-900/20 text-brand-700 dark:text-brand-300 text-sm font-semibold border-b border-brand-100 dark:border-brand-800">Today</div>';
        }

        // All-day / task header
        if (hasAllDayRow) {
            html += '<div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">';
            html += '<div class="w-16 sm:w-20 border-r border-gray-200 dark:border-gray-700 shrink-0 py-2 px-2 sm:px-3 text-xs text-gray-400 dark:text-gray-500 text-right">All day</div>';
            html += '<div class="flex-1 py-1.5 px-2 space-y-1">';
            allDay.forEach(e => {
                html += `<div class="text-xs sm:text-sm truncate px-2 py-1 rounded cursor-pointer ${e.source === 'Outlook' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}"
                              onclick="CalendarView.showEventDetail(${e.id})"
                              title="${escapeAttr(e.title)}${e.calendar_name ? ' [' + escapeAttr(e.calendar_name) + ']' : ''}">
                    ${escapeHtml(e.title)}${e.calendar_name ? ` <span class="opacity-60 text-[10px]">| ${escapeHtml(e.calendar_name)}</span>` : ''}
                </div>`;
            });
            dayTasks.forEach(t => {
                const tc = this.getTaskColorClasses(t.priority);
                const si = getScheduleStatusIcon(t);
                html += `<div class="text-xs sm:text-sm truncate px-2 py-1 rounded cursor-pointer border-l-3 ${tc.border} ${tc.bg} ${tc.text}"
                              onclick="CalendarView.showTaskDetail(${t.id})"
                              title="Task: ${escapeAttr(t.title)} (${t.priority})">
                    <i data-lucide="check-square" class="w-3 h-3 inline-block mr-1 align-text-bottom"></i>${escapeHtml(t.title)}${si}
                    <span class="text-[10px] opacity-70">(${t.priority})</span>
                </div>`;
            });
            html += '</div></div>';
        }

        html += `<div id="time-grid-scroll" class="overflow-y-auto" style="max-height: 650px;">`;
        html += `<div class="flex" style="min-height:${gridH}px">`;

        // Time labels
        html += '<div class="w-16 sm:w-20 border-r border-gray-200 dark:border-gray-700 shrink-0 relative">';
        for (let h = startHour; h < endHour; h++) {
            const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            const top = (h - startHour) * HOUR_PX;
            html += `<div class="absolute right-2 sm:right-3 text-xs sm:text-sm text-gray-400 dark:text-gray-500" style="top:${top}px;transform:translateY(-50%)">${label}</div>`;
        }
        html += '</div>';

        // Event column
        html += `<div class="flex-1 time-grid-col relative"
                      onclick="CalendarView.showAddEventForm('${DateUtils.toISODate(this.currentDate)}')"
                      ondragenter="CalendarView.onDragEnterGrid(event)"
                      ondragover="CalendarView.onDragOverGrid(event)"
                      ondragleave="CalendarView.onDragLeaveGrid(event)"
                      ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(this.currentDate)}')"
                      style="min-height:${gridH}px">`;

        for (let h = startHour; h < endHour; h++) {
            const top = (h - startHour) * HOUR_PX;
            html += `<div class="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700/50" style="top:${top}px"></div>`;
        }

        // Combine events and blocks for overlap layout
        const allDayItems = [];
        timed.forEach(e => {
            const s = new Date(e._displayStart || e.start_time);
            const en = new Date(e._displayEnd || e.end_time);
            allDayItems.push({ type: 'event', data: e, startHour: s.getHours() + s.getMinutes() / 60, endHour: (en.getHours() + en.getMinutes() / 60) || 24 });
        });
        dayBlocks.forEach(b => {
            const s = new Date(b.start_time);
            const en = new Date(b.end_time);
            allDayItems.push({ type: 'block', data: b, startHour: s.getHours() + s.getMinutes() / 60, endHour: (en.getHours() + en.getMinutes() / 60) || 24 });
        });
        this.layoutOverlaps(allDayItems);

        allDayItems.forEach(item => {
            const clampStart = Math.max(item.startHour, startHour);
            const clampEnd = Math.min(item.endHour, endHour);
            if (clampEnd <= clampStart) return;
            const top = (clampStart - startHour) * HOUR_PX;
            const height = Math.max((clampEnd - clampStart) * HOUR_PX, 22);
            const isShort = (clampEnd - clampStart) < 0.75;
            const leftPct = (item.colIndex / item.totalCols) * 100;
            const widthPct = (1 / item.totalCols) * 100;
            const posStyle = `top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px)`;

            if (item.type === 'event') {
                const e = item.data;
                const s = new Date(e._displayStart || e.start_time);
                const en = new Date(e._displayEnd || e.end_time);
                const cls = e.source === 'Outlook' ? 'outlook' : 'manual';
                const excludedCls = e.excluded_from_schedule ? 'excluded-event' : '';
                const calLabel = e.calendar_name ? `<span class="ev-time ml-1 opacity-60">| ${escapeHtml(e.calendar_name)}</span>` : '';
                html += `<div class="time-event ${cls} ${excludedCls} ${isShort ? 'short' : ''}" style="${posStyle}"
                              draggable="true" ondragstart="CalendarView.onDragStartEvent(event, ${e.id})"
                              ondragover="event.preventDefault()" ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(this.currentDate)}')"
                              onclick="event.stopPropagation(); CalendarView.showEventDetail(${e.id})">
                    <div class="ev-title">${e.excluded_from_schedule ? '<i data-lucide="eye-off" class="w-3 h-3 inline-block mr-0.5 align-text-bottom opacity-50"></i>' : ''}${escapeHtml(e.title)}</div>
                    <div class="ev-time">${DateUtils.formatTime(s)} – ${DateUtils.formatTime(en)}${calLabel}</div>
                </div>`;
            } else {
                const block = item.data;
                const s = new Date(block.start_time);
                const en = new Date(block.end_time);
                const priorityCls = `sched-${(block.task_priority || 'Medium').toLowerCase()}`;
                const completedCls = block.is_completed ? 'completed' : '';
                const pinnedCls = block.is_pinned ? 'pinned' : '';
                const timeLabel = `${DateUtils.formatTime(s)} - ${DateUtils.formatTime(en)}`;
                const pinIcon = block.is_pinned ? '<i data-lucide="pin" class="w-2.5 h-2.5 pin-icon"></i>' : '';
                html += `<div class="time-event scheduled-block ${priorityCls} ${completedCls} ${pinnedCls} ${isShort ? 'short' : ''}" style="${posStyle}"
                              draggable="true" ondragstart="CalendarView.onDragStartBlock(event, ${block.id})"
                              ondragover="event.preventDefault()" ondrop="CalendarView.onDropGrid(event, '${DateUtils.toISODate(this.currentDate)}')"
                              onclick="event.stopPropagation(); CalendarView.showBlockDetail(${block.id})">
                    ${pinIcon}
                    <div class="ev-title">${block.is_completed ? '<i data-lucide="check-circle" class="w-3 h-3 inline-block mr-0.5 align-text-bottom"></i>' : '<i data-lucide="timer" class="w-3 h-3 inline-block mr-0.5 align-text-bottom"></i>'}${escapeHtml(block.task_title || 'Task')}</div>
                    <div class="ev-time">${timeLabel}</div>
                </div>`;
            }
        });

        html += '</div>';
        html += '</div></div></div>';
        return html;
    },

    // ── Drag and Drop Handlers ──────────────────────────────────────────

    onDragStartEvent(event, eventId) {
        console.log('[DnD] dragstart event', eventId);
        event.stopPropagation();
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'event', id: eventId }));
        event.dataTransfer.effectAllowed = 'move';
        const el = event.currentTarget;
        setTimeout(() => el.classList.add('drag-source'), 0);
        el.addEventListener('dragend', () => {
            console.log('[DnD] dragend event', eventId);
            el.classList.remove('drag-source');
        }, { once: true });
    },

    onDragStartTask(event, taskId) {
        console.log('[DnD] dragstart task', taskId);
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'task', id: taskId }));
        event.dataTransfer.effectAllowed = 'copyMove';
    },

    onDragStartBlock(event, blockId) {
        console.log('[DnD] dragstart block', blockId);
        event.stopPropagation(); // Don't trigger parent column's click
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'block', id: blockId }));
        event.dataTransfer.effectAllowed = 'move';
        const el = event.currentTarget;
        setTimeout(() => el.classList.add('drag-source'), 0);
        el.addEventListener('dragend', () => {
            console.log('[DnD] dragend block', blockId);
            el.classList.remove('drag-source');
        }, { once: true });
    },

    onDragEnterGrid(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    },

    onDragOverGrid(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    },

    onDragLeaveGrid(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.classList.remove('drag-over');
        }
    },

    async onDropGrid(event, dateStr) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[DnD] drop on', dateStr);

        // Clean up any drag-over highlights
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

        // Find the time-grid-col (event may have fired on a child element)
        let col = event.currentTarget;
        if (!col.classList.contains('time-grid-col')) {
            col = col.closest('.time-grid-col');
        }

        // Calculate Y position accounting for scroll
        let y;
        if (col) {
            const scrollEl = document.getElementById('time-grid-scroll');
            const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
            const refRect = scrollEl ? scrollEl.getBoundingClientRect() : col.getBoundingClientRect();
            y = (event.clientY - refRect.top) + scrollTop;
        } else {
            // Fallback: use the drop target's own position
            const rect = event.currentTarget.getBoundingClientRect();
            y = event.clientY - rect.top;
        }

        // Snap to 15-minute intervals
        const hours = Math.max(0, Math.min(y / HOUR_PX, 23.75));
        const h = Math.floor(hours);
        let m = Math.round((hours - h) * 60 / 15) * 15;
        let exactH = h;
        let exactM = m;
        if (exactM >= 60) { exactH += 1; exactM = 0; }
        console.log('[DnD] computed time', exactH + ':' + String(exactM).padStart(2, '0'));

        const startDt = new Date(dateStr + 'T00:00:00');
        startDt.setHours(exactH, exactM, 0, 0);

        try {
            const dataStr = event.dataTransfer.getData('text/plain');
            console.log('[DnD] transfer data:', dataStr);
            if (!dataStr) { console.warn('[DnD] No transfer data!'); return; }
            const data = JSON.parse(dataStr);

            if (data.type === 'task') {
                const task = this.tasks.find(t => t.id === data.id);
                if (!task) { console.warn('[DnD] Task not found:', data.id); return; }

                let durationMins = 60;
                if (task.estimated_duration && task.time_scheduled != null) {
                    const remaining = task.estimated_duration - task.time_scheduled;
                    if (remaining > 0) durationMins = remaining;
                }
                if (task.max_block_size && durationMins > task.max_block_size) durationMins = task.max_block_size;
                if (durationMins > 120) durationMins = 120;

                const endDt = new Date(startDt.getTime() + durationMins * 60000);
                console.log('[DnD] Creating block:', DateUtils.toISODateTime(startDt), '->', DateUtils.toISODateTime(endDt));
                await API.createScheduledBlock({
                    task_id: task.id,
                    start_time: DateUtils.toISODateTime(startDt),
                    end_time: DateUtils.toISODateTime(endDt),
                    is_pinned: true
                });
                this._pendingScrollHour = exactH;
                await this.render();
                showToast('Task scheduled!', 'success');

            } else if (data.type === 'block') {
                const block = this.blocks.find(b => b.id === data.id);
                if (!block) { console.warn('[DnD] Block not found:', data.id); return; }

                const oldStart = new Date(block.start_time);
                const oldEnd = new Date(block.end_time);
                const durationMins = (oldEnd - oldStart) / 60000;
                const endDt = new Date(startDt.getTime() + durationMins * 60000);

                console.log('[DnD] Moving block', block.id, 'to', DateUtils.toISODateTime(startDt), '->', DateUtils.toISODateTime(endDt));
                await API.updateScheduledBlock(block.id, {
                    start_time: DateUtils.toISODateTime(startDt),
                    end_time: DateUtils.toISODateTime(endDt),
                    is_pinned: true
                });
                this._pendingScrollHour = exactH;
                await this.render();
                showToast('Block moved!', 'success');

            } else if (data.type === 'event') {
                const ev = this.events.find(e => e.id === data.id);
                if (!ev) { console.warn('[DnD] Event not found:', data.id); return; }

                const oldStart = new Date(ev.start_time);
                const oldEnd = new Date(ev.end_time);
                const durationMins = (oldEnd - oldStart) / 60000;
                const endDt = new Date(startDt.getTime() + durationMins * 60000);

                console.log('[DnD] Moving event', ev.id, 'to', DateUtils.toISODateTime(startDt), '->', DateUtils.toISODateTime(endDt));
                await API.updateEvent(ev.id, {
                    start_time: DateUtils.toISODateTime(startDt),
                    end_time: DateUtils.toISODateTime(endDt),
                });
                this._pendingScrollHour = exactH;
                await this.render();
                const label = ev.source === 'Outlook' ? 'Event moved & synced to Outlook!' : 'Event moved!';
                showToast(label, 'success');
            }
        } catch (err) {
            console.error('[DnD] Drop error:', err);
            showToast('Failed to drop item: ' + err.message, 'error');
        }
    },


    // ── Event helpers ───────────────────────────────────────────────────
    getEventsForDate(date) {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);

        return this.events
            .filter(e => {
                const start = new Date(e.start_time);
                const end = new Date(e.end_time);
                // Event overlaps this day if it starts before day ends AND ends after day starts
                return start < nextDay && end > dayStart;
            })
            .map(e => {
                const start = new Date(e.start_time);
                const end = new Date(e.end_time);
                const startsToday = DateUtils.isSameDay(start, date);
                const endsToday = DateUtils.isSameDay(end, date);

                // Same-day event or already all-day — return as-is
                if ((startsToday && endsToday) || e.is_all_day) return e;

                // Multi-day timed event — create virtual copy with display adjustments
                const virtual = { ...e, _isMultiDay: true };
                if (startsToday) {
                    // Start day: timed from original start to end-of-day
                    virtual._displayEnd = nextDay.toISOString();
                } else if (endsToday) {
                    // End day: timed from start-of-day to original end
                    virtual._displayStart = dayStart.toISOString();
                } else {
                    // Intermediate day: show as all-day
                    virtual._isVirtualAllDay = true;
                }
                return virtual;
            });
    },

    // ── Navigation ──────────────────────────────────────────────────────
    navigate(dir) {
        const d = this.currentDate;
        if (this.mode === 'month') {
            this.currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
        } else if (this.mode === 'week') {
            this.currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir * 7);
        } else {
            this.currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir);
        }
        this.render();
    },

    goToday() {
        this.currentDate = new Date();
        this.render();
    },

    setMode(mode) {
        this.mode = mode;
        this.render();
    },

    onDayClick(year, month, day) {
        this.currentDate = new Date(year, month, day);
        this.mode = 'day';
        this.render();
    },

    // ── Scheduled Block Detail Modal ────────────────────────────────────
    showBlockDetail(id) {
        const block = this.blocks.find(b => b.id === id);
        if (!block) return;

        const s = new Date(block.start_time);
        const en = new Date(block.end_time);
        const dateStr = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const timeStr = `${DateUtils.formatTime(s)} – ${DateUtils.formatTime(en)}`;
        const scheduledMins = block.scheduled_minutes || 0;
        const priorityCls = this.getTaskColorClasses(block.task_priority || 'Medium');

        showModal(`
            <div class="p-8">
                <div class="flex items-start justify-between mb-6">
                    <div>
                        <h3 class="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-fuchsia-600 dark:from-purple-400 dark:to-fuchsia-400 tracking-tight flex items-center gap-2">
                            <i data-lucide="timer" class="w-6 h-6 text-purple-500"></i>
                            Scheduled Work
                        </h3>
                        <p class="text-[15px] font-medium text-gray-600 dark:text-gray-300 mt-1">${escapeHtml(block.task_title || 'Task')}</p>
                    </div>
                    <button onclick="closeModal()" class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder rounded-lg transition-colors">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>

                <div class="space-y-3 text-sm">
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="calendar" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${dateStr}</span>
                    </div>
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="clock" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${timeStr} (${formatDuration(scheduledMins)})</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <i data-lucide="flag" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span class="text-xs px-2 py-0.5 rounded-full ${priorityCls.bg} ${priorityCls.text}">${block.task_priority || 'Medium'} Priority</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <i data-lucide="${block.is_completed ? 'check-circle' : 'circle'}" class="w-4 h-4 ${block.is_completed ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'} shrink-0"></i>
                        <span class="${block.is_completed ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-600 dark:text-gray-300'}">${block.is_completed ? `Completed (${formatDuration(block.actual_duration)} actual)` : 'Not completed'}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <i data-lucide="pin" class="w-4 h-4 ${block.is_pinned ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'} shrink-0"></i>
                        <span class="${block.is_pinned ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-600 dark:text-gray-300'}">${block.is_pinned ? 'Pinned (survives reschedule)' : 'Not pinned'}</span>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mt-8 pt-5 border-t border-gray-100 dark:border-darkborder">
                    <div class="flex flex-1 sm:flex-none gap-2.5">
                        <button onclick="closeModal(); showConfirm('Delete this scheduled block?', () => CalendarView.deleteBlock(${block.id}));"
                                class="flex-1 sm:flex-none justify-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl flex items-center gap-2 transition-all">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            Delete
                        </button>
                        <button onclick="CalendarView.togglePinBlock(${block.id}, ${!block.is_pinned})"
                                class="flex-1 sm:flex-none justify-center px-4 py-2 text-sm font-medium ${block.is_pinned ? 'text-amber-600 dark:text-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/10 dark:hover:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30' : 'text-gray-600 dark:text-gray-400 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder'} rounded-xl flex items-center gap-2 transition-all">
                            <i data-lucide="pin" class="w-4 h-4"></i>
                            ${block.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                    </div>
                    <div class="flex flex-1 sm:flex-none gap-2.5">
                        ${!block.is_completed ? `
                        <button onclick="closeModal(); CalendarView.showCompleteBlockForm(${block.id});"
                                class="flex-1 sm:flex-none justify-center px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            Complete
                        </button>` : ''}
                        <button onclick="closeModal(); CalendarView.showEditBlockForm(${block.id});"
                                class="flex-1 sm:flex-none justify-center px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md shadow-brand-500/20 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                            Edit
                        </button>
                    </div>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    // ── Complete Block Form ──────────────────────────────────────────────
    showCompleteBlockForm(id) {
        const block = this.blocks.find(b => b.id === id);
        if (!block) return;

        const scheduledMins = block.scheduled_minutes || 0;
        const defH = Math.floor(scheduledMins / 60);
        const defM = scheduledMins % 60;

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Complete Scheduled Block</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">${escapeHtml(block.task_title || 'Task')} &mdash; Scheduled: ${formatDuration(scheduledMins)}</p>
                <form id="complete-block-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Actual time spent</label>
                        <div class="flex items-center gap-2">
                            <input type="number" name="actual_hours" min="0" max="99" value="${defH}"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-sm text-gray-500 dark:text-gray-400">hrs</span>
                            <input type="number" name="actual_minutes" min="0" max="59" value="${defM}"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-sm text-gray-500 dark:text-gray-400">min</span>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" onclick="closeModal()"
                                class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                            Mark Complete
                        </button>
                    </div>
                </form>
            </div>
        `);

        document.getElementById('complete-block-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            const h = parseInt(form.actual_hours.value) || 0;
            const m = parseInt(form.actual_minutes.value) || 0;
            const totalMins = h * 60 + m;

            await withLoading(btn, async () => {
                try {
                    const result = await API.completeScheduledBlock(id, totalMins > 0 ? totalMins : null);
                    closeModal();

                    // Check if we should prompt about task completion
                    if (result.prompt_completion) {
                        this.showTaskCompletionPrompt(result.task_id, result.task_title, result.completed_minutes, result.estimated_minutes);
                    } else {
                        this.render(true);
                        showToast('Block marked complete', 'success');
                    }
                } catch (err) {
                    showToast('Failed to complete block: ' + err.message, 'error');
                }
            });
        });
    },

    // ── Task Completion Prompt ───────────────────────────────────────────
    showTaskCompletionPrompt(taskId, taskTitle, completedMins, estimatedMins) {
        showModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                        <i data-lucide="check-circle" class="w-5 h-5 text-green-600 dark:text-green-400"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Task Complete?</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(taskTitle)}</p>
                    </div>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    You've logged <strong>${formatDuration(completedMins)}</strong> of work, which meets or exceeds the
                    estimated <strong>${formatDuration(estimatedMins)}</strong>. Is this task complete?
                </p>
                <div class="flex justify-end gap-3">
                    <button onclick="closeModal(); CalendarView.render(true);"
                            class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Not Yet
                    </button>
                    <button onclick="CalendarView.markTaskComplete(${taskId})"
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        Yes, Complete
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    async markTaskComplete(taskId) {
        try {
            const result = await API.updateTask(taskId, { status: 'Completed' });
            closeModal();
            this.render(true);
            const cleaned = result.cleaned_blocks || 0;
            const msg = cleaned > 0
                ? `Task marked complete! Removed ${cleaned} future block${cleaned > 1 ? 's' : ''}.`
                : 'Task marked complete!';
            showToast(msg, 'success');
        } catch (err) {
            showToast('Failed to update task: ' + err.message, 'error');
        }
    },

    // ── Edit Block Form ─────────────────────────────────────────────────
    showEditBlockForm(id) {
        const block = this.blocks.find(b => b.id === id);
        if (!block) return;

        const startVal = this.formatDTLocal(block.start_time);
        const endVal = this.formatDTLocal(block.end_time);

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Edit Scheduled Block</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">${escapeHtml(block.task_title || 'Task')}</p>
                <form id="edit-block-form" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start</label>
                            <input type="datetime-local" name="start_time" required value="${startVal}"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End</label>
                            <input type="datetime-local" name="end_time" required value="${endVal}"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="is_pinned" ${block.is_pinned ? 'checked' : ''}
                               class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500">
                        <i data-lucide="pin" class="w-3.5 h-3.5 text-amber-500"></i>
                        Pin this block (survives Reschedule All)
                    </label>
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

        document.getElementById('edit-block-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            await withLoading(btn, async () => {
                try {
                    await API.updateScheduledBlock(id, {
                        start_time: form.start_time.value + ':00',
                        end_time: form.end_time.value + ':00',
                        is_pinned: form.is_pinned.checked,
                    });
                    closeModal();
                    this.render(true);
                    showToast('Block updated', 'success');
                } catch (err) {
                    showToast('Failed to update block: ' + err.message, 'error');
                }
            });
        });
    },

    // ── Delete Block ────────────────────────────────────────────────────
    async deleteBlock(id) {
        try {
            await API.deleteScheduledBlock(id);
            this.render(true);
            showToast('Block deleted', 'success');
        } catch (err) {
            showToast('Failed to delete block: ' + err.message, 'error');
        }
    },

    // ── Schedule Time Form (Manual) ─────────────────────────────────────
    async showScheduleTimeForm(dateStr, preselectedTaskId) {
        const defaultDate = dateStr || DateUtils.toISODate(this.currentDate);

        // Get tasks that are not completed
        let availableTasks = [];
        try {
            const allTasks = await API.getTasks();
            availableTasks = allTasks.filter(t => t.status !== 'Completed');
        } catch (err) {
            showToast('Failed to load tasks', 'error');
            return;
        }

        if (availableTasks.length === 0) {
            showToast('No active tasks to schedule', 'info');
            return;
        }

        const taskOptions = availableTasks.map(t => {
            const estLabel = t.estimated_duration ? ` (Est: ${formatDuration(t.estimated_duration)})` : '';
            const schedLabel = t.time_scheduled ? ` [${formatDuration(t.time_scheduled)} scheduled]` : '';
            const selected = preselectedTaskId && t.id === preselectedTaskId ? ' selected' : '';
            return `<option value="${t.id}"${selected}>${escapeHtml(t.title)}${estLabel}${schedLabel}</option>`;
        }).join('');

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <i data-lucide="timer" class="w-5 h-5 text-purple-500"></i>
                    Schedule Work Time
                </h3>
                <form id="schedule-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task</label>
                        <select name="task_id" required
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            ${taskOptions}
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start</label>
                            <input type="datetime-local" name="start_time" required
                                   value="${defaultDate}T09:00"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End</label>
                            <input type="datetime-local" name="end_time" required
                                   value="${defaultDate}T10:00"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="is_pinned"
                               class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500">
                        <i data-lucide="pin" class="w-3.5 h-3.5 text-amber-500"></i>
                        Pin this block (survives Reschedule All)
                    </label>
                    <div class="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-darkborder">
                        <button type="button" onclick="closeModal()"
                                class="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-400 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-md shadow-purple-500/20 py-2.5 rounded-xl transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]">
                            Schedule
                        </button>
                    </div>
                </form>
            </div>
        `);
        lucide.createIcons();

        document.getElementById('schedule-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            await withLoading(btn, async () => {
                try {
                    await API.createScheduledBlock({
                        task_id: parseInt(form.task_id.value, 10),
                        start_time: form.start_time.value + ':00',
                        end_time: form.end_time.value + ':00',
                        is_pinned: form.is_pinned.checked,
                    });
                    closeModal();
                    this.render(true);
                    showToast('Time scheduled', 'success');
                } catch (err) {
                    showToast('Failed to schedule: ' + err.message, 'error');
                }
            });
        });
    },

    // ── Auto-Schedule Form ──────────────────────────────────────────────
    async showAutoScheduleForm(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        if (!task.estimated_duration) {
            showToast('Set an estimated duration first before auto-scheduling', 'error');
            return;
        }

        if (!task.due_date) {
            showToast('Set a due date first — auto-schedule uses the deadline to plan blocks', 'error');
            return;
        }

        const remaining = Math.max(0, task.estimated_duration - (task.time_scheduled || 0));
        if (remaining <= 0) {
            showToast('All time is already scheduled for this task', 'info');
            return;
        }

        const deadlineStr = new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const taskMinBlock = task.min_block_size || '';
        const taskMaxBlock = task.max_block_size || '';
        const sp = getSchedPrefs();

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <i data-lucide="wand-2" class="w-5 h-5 text-purple-500"></i>
                    Auto-Schedule
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    ${escapeHtml(task.title)} &mdash; ${formatDuration(remaining)} remaining to schedule
                </p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    Deadline: ${deadlineStr}${taskMinBlock || taskMaxBlock ? ` &bull; Task block size: ${taskMinBlock || '?'}–${taskMaxBlock || '?'} min` : ''}
                </p>
                <form id="auto-schedule-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Block Size (fallback when task has none set)</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Min</span>
                            <input type="number" name="min_block_size" value="${sp.min_block_size || 30}" min="5" max="480"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Max</span>
                            <input type="number" name="max_block_size" value="${sp.max_block_size || 120}" min="5" max="480"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-xs text-gray-500 dark:text-gray-400">min</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Start Hour</label>
                            <input type="number" name="work_start" value="${sp.work_start ?? 9}" min="0" max="23"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work End Hour</label>
                            <input type="number" name="work_end" value="${sp.work_end ?? 17}" min="1" max="24"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_weekends" ${sp.include_weekends ? 'checked' : ''}
                               class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500">
                        Include weekends
                    </label>
                    <div id="auto-schedule-warning" class="hidden p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                        <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0 mt-0.5"></i>
                        <span id="auto-schedule-warning-text"></span>
                    </div>
                    <div class="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-darkborder">
                        <button type="button" onclick="closeModal()"
                                class="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-md shadow-purple-500/20 py-2.5 rounded-xl transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]">
                            <i data-lucide="wand-2" class="w-4 h-4"></i>
                            Auto-Schedule
                        </button>
                    </div>
                </form>
            </div>
        `);
        lucide.createIcons();

        document.getElementById('auto-schedule-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            const warningEl = document.getElementById('auto-schedule-warning');
            const warningText = document.getElementById('auto-schedule-warning-text');
            warningEl.classList.add('hidden');

            await withLoading(btn, async () => {
                try {
                    const prefs = {
                        min_block_size: parseInt(form.min_block_size.value) || 30,
                        max_block_size: parseInt(form.max_block_size.value) || 120,
                        work_start: parseInt(form.work_start.value) || 9,
                        work_end: parseInt(form.work_end.value) || 17,
                        include_weekends: form.include_weekends.checked,
                    };
                    saveSchedPrefs(prefs);
                    const result = await API.autoScheduleTask(taskId, prefs);

                    const rem = result.remaining_minutes || 0;

                    if (result.warning === 'not_enough_time' || rem > 0) {
                        closeModal();
                        if (result.scheduled > 0) this.render(true);
                        this.showScheduleWarningPopup(task, result);
                        return;
                    }

                    closeModal();
                    this.render(true);
                    showToast(`Scheduled ${result.scheduled} block(s) — fully scheduled!`, 'success');
                } catch (err) {
                    showToast('Auto-schedule failed: ' + err.message, 'error');
                }
            });
        });
    },

    // ── Schedule Warning Popup (centre screen) ─────────────────────────
    showScheduleWarningPopup(task, result) {
        const scheduled = result.scheduled || 0;
        const rem = result.remaining_minutes || 0;
        const freeStr = formatDuration(result.total_free_minutes || 0);
        const remStr = formatDuration(rem);
        const est = task.estimated_duration || 0;
        const scheduledNow = formatDuration(est - rem);

        const hasWarning = result.warning === 'not_enough_time';
        const icon = hasWarning ? 'alert-triangle' : 'alert-circle';
        const iconColor = hasWarning ? 'text-red-500' : 'text-amber-500';
        const bgColor = hasWarning ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20';
        const borderColor = hasWarning ? 'border-red-200 dark:border-red-800' : 'border-amber-200 dark:border-amber-800';

        showModal(`
            <div class="p-6 text-center">
                <div class="w-14 h-14 mx-auto mb-4 rounded-full ${bgColor} flex items-center justify-center">
                    <i data-lucide="${icon}" class="w-7 h-7 ${iconColor}"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                    ${hasWarning ? 'Not Enough Time' : 'Partially Scheduled'}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    <strong>${escapeHtml(task.title)}</strong>
                </p>
                <div class="p-4 ${bgColor} border ${borderColor} rounded-lg mb-4 text-sm text-left space-y-2">
                    ${scheduled > 0 ? `
                    <div class="flex justify-between">
                        <span class="text-gray-500 dark:text-gray-400">Blocks created</span>
                        <span class="font-medium text-gray-800 dark:text-gray-100">${scheduled}</span>
                    </div>` : ''}
                    <div class="flex justify-between">
                        <span class="text-gray-500 dark:text-gray-400">Total scheduled</span>
                        <span class="font-medium text-gray-800 dark:text-gray-100">${scheduledNow} / ${formatDuration(est)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 dark:text-gray-400">Still unscheduled</span>
                        <span class="font-bold ${hasWarning ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}">${remStr}</span>
                    </div>
                    ${hasWarning ? `
                    <div class="flex justify-between">
                        <span class="text-gray-500 dark:text-gray-400">Free time available</span>
                        <span class="font-medium text-gray-800 dark:text-gray-100">${freeStr}</span>
                    </div>` : ''}
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    ${hasWarning
                        ? 'There is not enough free time before the deadline to schedule all remaining work. Consider extending the deadline or adjusting work hours.'
                        : 'Some time could not be automatically placed. You can manually schedule the remaining time or try again with different settings.'}
                </p>
                <div class="flex justify-center gap-3">
                    <button onclick="closeModal()"
                            class="px-8 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-darkborder text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors shadow-sm">
                        OK
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    // ── Event Detail Modal ──────────────────────────────────────────────
    showEventDetail(id) {
        const ev = this.events.find(e => e.id === id);
        if (!ev) return;

        const s = new Date(ev.start_time);
        const en = new Date(ev.end_time);
        const dateStr = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const timeStr = ev.is_all_day ? 'All day' : `${DateUtils.formatTime(s)} – ${DateUtils.formatTime(en)}`;
        const sourceColor = ev.source === 'Outlook'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';

        showModal(`
            <div class="p-8">
                <div class="flex items-start justify-between mb-6">
                    <h3 class="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-brand-400 dark:to-indigo-400 tracking-tight flex-1 mr-4">${escapeHtml(ev.title)}</h3>
                    <button onclick="closeModal()" class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder rounded-lg transition-colors">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>

                <div class="space-y-3 text-sm">
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="calendar" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${dateStr}</span>
                    </div>
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="clock" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${timeStr}</span>
                    </div>
                    ${ev.calendar_name ? `
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="folder" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${escapeHtml(ev.calendar_name)}</span>
                    </div>` : ''}
                    <div class="flex items-center gap-3">
                        <i data-lucide="tag" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span class="text-xs px-2 py-0.5 rounded-full ${sourceColor}">${ev.source}</span>
                    </div>
                    ${ev.description ? `
                    <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div class="flex items-start gap-3">
                            <i data-lucide="file-text" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5"></i>
                            <p class="text-gray-600 dark:text-gray-300 whitespace-pre-wrap text-sm">${escapeHtml(ev.description)}</p>
                        </div>
                    </div>` : ''}
                    ${ev.excluded_from_schedule ? `
                    <div class="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                        <i data-lucide="eye-off" class="w-4 h-4 shrink-0"></i>
                        <span class="text-xs">Excluded from scheduling</span>
                    </div>` : ''}
                </div>

                <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mt-8 pt-5 border-t border-gray-100 dark:border-darkborder">
                    <div class="flex flex-1 sm:flex-none gap-2.5">
                        <button onclick="closeModal(); showConfirm('Delete this event?${ev.source === 'Outlook' ? ' This will also remove it from Outlook.' : ''}', () => CalendarView.deleteEvent(${ev.id}));"
                                class="flex-1 sm:flex-none justify-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl flex items-center gap-2 transition-all">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            Delete
                        </button>
                        <button onclick="CalendarView.toggleEventSchedule(${ev.id}, ${!ev.excluded_from_schedule}); closeModal();"
                                class="flex-1 sm:flex-none justify-center px-4 py-2 text-sm font-medium ${ev.excluded_from_schedule ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30' : 'text-amber-600 dark:text-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/10 dark:hover:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30'} rounded-xl flex items-center gap-2 transition-all"
                                title="${ev.excluded_from_schedule ? 'Include in scheduling' : 'Exclude from scheduling'}">
                            <i data-lucide="${ev.excluded_from_schedule ? 'eye' : 'eye-off'}" class="w-4 h-4"></i>
                            ${ev.excluded_from_schedule ? 'Include' : 'Exclude'}
                        </button>
                    </div>
                    <div class="flex flex-1 sm:flex-none gap-2.5">
                        <button onclick="closeModal(); CalendarView.showEditEventForm(${ev.id});"
                                class="flex-1 sm:flex-none justify-center px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md shadow-brand-500/20 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                            Edit
                        </button>
                        <button onclick="closeModal()"
                                class="flex-1 sm:flex-none justify-center px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-darkborder/50 dark:hover:bg-darkborder border border-gray-200 dark:border-darkborder rounded-xl transition-colors">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    async toggleEventSchedule(id, excluded) {
        try {
            await API.toggleEventSchedule(id, excluded);
            this.render(true);
            showToast(excluded ? 'Removed from schedule' : 'Added back to schedule', 'success');
        } catch (err) {
            showToast('Failed to update event: ' + err.message, 'error');
        }
    },

    // ── Edit Event Form ─────────────────────────────────────────────────
    showEditEventForm(id) {
        const ev = this.events.find(e => e.id === id);
        if (!ev) return;

        const startVal = this.formatDTLocal(ev.start_time);
        const endVal = this.formatDTLocal(ev.end_time);

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Edit Event</h3>
                ${ev.source === 'Outlook' ? '<p class="text-xs text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-1"><i data-lucide="info" class="w-3.5 h-3.5"></i> Changes will sync to Outlook</p>' : ''}
                <form id="edit-event-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <input type="text" name="title" value="${escapeAttr(ev.title)}" required
                               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start</label>
                            <input type="datetime-local" name="start_time" required value="${startVal}"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End</label>
                            <input type="datetime-local" name="end_time" required value="${endVal}"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                        <textarea name="description" rows="3"
                                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none">${escapeHtml(ev.description || '')}</textarea>
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
        lucide.createIcons();

        document.getElementById('edit-event-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            await withLoading(btn, async () => {
                try {
                    await API.updateEvent(id, {
                        title: form.title.value,
                        start_time: form.start_time.value + ':00',
                        end_time: form.end_time.value + ':00',
                        description: form.description.value,
                    });
                    closeModal();
                    this.render(true);
                    showToast('Event updated', 'success');
                } catch (err) {
                    if (err.message.includes('401') || err.message.includes('Not authenticated')) {
                        showToast('Session expired. Redirecting to login...', 'error');
                        setTimeout(() => { window.location.href = '/auth/login'; }, 1500);
                    } else {
                        showToast('Failed to update event: ' + err.message, 'error');
                    }
                }
            });
        });
    },

    // ── Task Detail Modal (with scheduling options) ─────────────────────
    showTaskDetail(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        let dueStr = 'No due date';
        if (task.due_date) {
            const dd = new Date(task.due_date);
            dueStr = dd.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            if (dd.getHours() !== 0 || dd.getMinutes() !== 0) {
                dueStr += ` at ${dd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }
        }

        const priorityColors = {
            High: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
            Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
            Low: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        };
        const statusColors = {
            'Pending': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
            'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
            'Completed': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        };

        // Time tracking section
        const est = task.estimated_duration || 0;
        const scheduled = task.time_scheduled || 0;
        const completed = task.time_completed || 0;
        const blockCount = task.block_count || 0;
        const completedCount = task.completed_count || 0;
        const hasTimeData = est > 0 || scheduled > 0 || completed > 0;

        let progressBar = '';
        if (est > 0) {
            const pct = Math.min((completed / est) * 100, 100);
            const sPct = Math.min((scheduled / est) * 100, 100);
            progressBar = `
                <div class="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>${formatDuration(completed)} / ${formatDuration(est)}</span>
                    </div>
                    <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
                        <div class="absolute inset-y-0 left-0 bg-blue-200 dark:bg-blue-800 rounded-full" style="width:${sPct}%"></div>
                        <div class="absolute inset-y-0 left-0 ${completed >= est ? 'bg-green-500' : 'bg-blue-500'} rounded-full" style="width:${pct}%"></div>
                    </div>
                    <div class="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        <span>${formatDuration(scheduled)} scheduled</span>
                        <span>${completedCount}/${blockCount} blocks done</span>
                    </div>
                </div>`;
        } else if (hasTimeData) {
            progressBar = `
                <div class="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    ${scheduled > 0 ? `<span>${formatDuration(scheduled)} scheduled</span>` : ''}
                    ${completed > 0 ? `<span class="ml-2">${formatDuration(completed)} completed</span>` : ''}
                    ${blockCount > 0 ? `<span class="ml-2">(${completedCount}/${blockCount} blocks)</span>` : ''}
                </div>`;
        }

        showModal(`
            <div class="p-6">
                <div class="flex items-start justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 flex-1 mr-4">${escapeHtml(task.title)}</h3>
                    <button onclick="closeModal()" class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>

                <div class="space-y-3 text-sm">
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="calendar" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>${dueStr}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <i data-lucide="flag" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span class="text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority] || ''}">${task.priority} Priority</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <i data-lucide="activity" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span class="text-xs px-2 py-0.5 rounded-full ${statusColors[task.status] || ''}">${task.status}</span>
                    </div>
                    ${est > 0 ? `
                    <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <i data-lucide="clock" class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"></i>
                        <span>Estimated: ${formatDuration(est)}</span>
                    </div>` : ''}
                    ${task.scheduling_status && task.status !== 'Completed' ? `
                    <div class="flex items-center gap-3">
                        <i data-lucide="${task.scheduling_status === 'fully_scheduled' ? 'calendar-check' : task.scheduling_status === 'partially_scheduled' ? 'calendar-clock' : 'calendar-x'}"
                           class="w-4 h-4 shrink-0 ${task.scheduling_status === 'fully_scheduled' ? 'text-green-500' : task.scheduling_status === 'partially_scheduled' ? 'text-amber-500' : 'text-red-400'}"></i>
                        <span class="text-xs ${task.scheduling_status === 'fully_scheduled' ? 'text-green-600 dark:text-green-400' : task.scheduling_status === 'partially_scheduled' ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}">
                            ${task.scheduling_status === 'fully_scheduled' ? 'Fully scheduled' : task.scheduling_status === 'partially_scheduled' ? `Partially scheduled (${formatDuration(est - scheduled)} unscheduled)` : 'Not yet scheduled'}
                        </span>
                    </div>` : ''}
                </div>
                ${progressBar}

                <div class="flex flex-wrap justify-between items-center mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 gap-2">
                    <button onclick="closeModal(); showConfirm('Delete this task and all its scheduled blocks?', () => CalendarView.deleteTask(${task.id}));"
                            class="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg flex items-center gap-2 transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        Delete
                    </button>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="closeModal(); CalendarView.showScheduleTimeForm(null, ${task.id});"
                                class="px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg flex items-center gap-1.5 transition-colors border border-purple-200 dark:border-purple-800"
                                title="Schedule work time">
                            <i data-lucide="timer" class="w-3.5 h-3.5"></i>
                            Schedule
                        </button>
                        ${est > 0 ? `
                        <button onclick="closeModal(); CalendarView.showAutoScheduleForm(${task.id});"
                                class="px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg flex items-center gap-1.5 transition-colors border border-purple-200 dark:border-purple-800"
                                title="Auto-schedule remaining time">
                            <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
                            Auto
                        </button>` : ''}
                        <button onclick="closeModal(); CalendarView.showEditTaskForm(${task.id});"
                                class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                            Edit
                        </button>
                        <button onclick="closeModal()"
                                class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    // ── Edit Task Form (from calendar) ──────────────────────────────────
    showEditTaskForm(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        showEditTaskModal(task, () => this.render(true));
    },

    // ── Add Event Form (with Outlook calendar picker) ───────────────────
    async showAddEventForm(dateStr, hour) {
        const defaultDate = dateStr || DateUtils.toISODate(this.currentDate);
        const defaultStartHour = hour !== undefined ? String(hour).padStart(2, '0') : '09';
        const defaultEndHour = hour !== undefined ? String(hour + 1).padStart(2, '0') : '10';

        let calendars = [];
        try {
            const allCals = await API.getCalendars();
            calendars = allCals.filter(c => c.is_enabled);
        } catch (err) { }

        const calOptions = calendars.length > 0
            ? `<div>
                   <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calendar</label>
                   <select name="calendar_id"
                           class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                       <option value="">Local only</option>
                       ${calendars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                   </select>
               </div>`
            : '';

        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Add Event</h3>
                <form id="event-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <input type="text" name="title" required
                               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    </div>
                    ${calOptions}
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start</label>
                            <input type="datetime-local" name="start_time" required
                                   value="${defaultDate}T${defaultStartHour}:00"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End</label>
                            <input type="datetime-local" name="end_time" required
                                   value="${defaultDate}T${defaultEndHour}:00"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                        <textarea name="description" rows="3" placeholder="Optional description..."
                                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"></textarea>
                    </div>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" onclick="closeModal()"
                                class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
                            Add Event
                        </button>
                    </div>
                </form>
            </div>
        `);

        document.getElementById('event-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');
            const payload = {
                title: form.title.value,
                start_time: form.start_time.value + ':00',
                end_time: form.end_time.value + ':00',
                description: form.description.value,
            };
            const calSelect = form.calendar_id;
            if (calSelect && calSelect.value) {
                payload.calendar_id = parseInt(calSelect.value, 10);
            }
            await withLoading(btn, async () => {
                try {
                    await API.createEvent(payload);
                    closeModal();
                    this.render(true);
                    showToast('Event created', 'success');
                } catch (err) {
                    if (err.message.includes('401') || err.message.includes('Not authenticated')) {
                        showToast('Session expired. Redirecting to login...', 'error');
                        setTimeout(() => { window.location.href = '/auth/login'; }, 1500);
                    } else {
                        showToast('Failed to create event: ' + err.message, 'error');
                    }
                }
            });
        });
    },

    // ── Toggle Pin Block ─────────────────────────────────────────────────
    async togglePinBlock(id, pinned) {
        try {
            await API.togglePinBlock(id, pinned);
            closeModal();
            this.render(true);
            showToast(pinned ? 'Block pinned — it will survive Reschedule All' : 'Block unpinned', 'success');
        } catch (err) {
            showToast('Failed to update pin: ' + err.message, 'error');
        }
    },

    // ── Reschedule All Modal ─────────────────────────────────────────────
    showRescheduleAllModal() {
        const sp = getSchedPrefs();
        showModal(`
            <div class="p-6">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <i data-lucide="refresh-cw" class="w-5 h-5 text-amber-500"></i>
                    Reschedule All Tasks
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    This will remove all un-pinned, uncompleted blocks (including past missed ones)
                    and reschedule every eligible task. Pinned and completed blocks are preserved.
                </p>
                <form id="reschedule-all-form" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Start Hour</label>
                            <input type="number" name="work_start" value="${sp.work_start ?? 9}" min="0" max="23"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work End Hour</label>
                            <input type="number" name="work_end" value="${sp.work_end ?? 17}" min="1" max="24"
                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Block Size</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Min</span>
                            <input type="number" name="min_block_size" value="${sp.min_block_size || 30}" min="5" max="480"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Max</span>
                            <input type="number" name="max_block_size" value="${sp.max_block_size || 120}" min="5" max="480"
                                   class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span class="text-xs text-gray-500 dark:text-gray-400">min</span>
                        </div>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_weekends" ${sp.include_weekends ? 'checked' : ''}
                               class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500">
                        Include weekends
                    </label>

                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Blocked Time Ranges</label>
                            <button type="button" id="add-blocked-range-btn"
                                    class="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1">
                                <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                                Add blocked time
                            </button>
                        </div>
                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">
                            Time ranges where no blocks should be placed. Select which days each range applies to.
                        </p>
                        <div id="blocked-ranges-list" class="space-y-3"></div>
                    </div>

                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" onclick="closeModal()"
                                class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                            Reschedule All
                        </button>
                    </div>
                </form>
            </div>
        `);
        lucide.createIcons();

        // Blocked ranges dynamic UI
        const rangesList = document.getElementById('blocked-ranges-list');
        const addBtn = document.getElementById('add-blocked-range-btn');
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const addRange = (start = '12:00', end = '13:00', days = [0,1,2,3,4]) => {
            const row = document.createElement('div');
            row.className = 'p-2.5 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700';
            row.dataset.blockedRange = 'true';
            const daysSet = new Set(days);
            const dayCheckboxes = dayLabels.map((label, i) => {
                const checked = daysSet.has(i) ? 'checked' : '';
                return `<label class="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input type="checkbox" data-day="${i}" ${checked}
                           class="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500 shrink-0">
                    <span class="text-xs font-semibold ${i >= 5 ? 'text-amber-600 dark:text-amber-500' : 'text-gray-700 dark:text-gray-300'}">${label}</span>
                </label>`;
            }).join('');

            row.innerHTML = `
                <div class="flex items-center gap-2 mb-1.5">
                    <input type="time" class="br-start px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500" value="${start}">
                    <span class="text-xs text-gray-400">to</span>
                    <input type="time" class="br-end px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500" value="${end}">
                    <button type="button" class="remove-range-btn p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 rounded transition-colors ml-auto">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="flex items-center gap-2 pl-0.5">
                    ${dayCheckboxes}
                </div>
            `;
            row.querySelector('.remove-range-btn').addEventListener('click', () => row.remove());
            rangesList.appendChild(row);
            lucide.createIcons();
        };

        addBtn.addEventListener('click', () => addRange());

        // Load saved blocked ranges from preferences
        const savedRanges = sp.blocked_ranges || [];
        savedRanges.forEach(r => addRange(r.start, r.end, r.days));

        // Form submit
        document.getElementById('reschedule-all-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]');

            // Collect blocked ranges with day selections
            const blockedRanges = [];
            rangesList.querySelectorAll('[data-blocked-range]').forEach(row => {
                const startVal = row.querySelector('.br-start').value;
                const endVal = row.querySelector('.br-end').value;
                const days = [];
                row.querySelectorAll('input[data-day]').forEach(cb => {
                    if (cb.checked) days.push(parseInt(cb.dataset.day));
                });
                if (startVal && endVal && days.length > 0) {
                    blockedRanges.push({ start: startVal, end: endVal, days });
                }
            });

            await withLoading(btn, async () => {
                try {
                    const prefs = {
                        work_start: parseInt(form.work_start.value) || 9,
                        work_end: parseInt(form.work_end.value) || 17,
                        min_block_size: parseInt(form.min_block_size.value) || 30,
                        max_block_size: parseInt(form.max_block_size.value) || 120,
                        include_weekends: form.include_weekends.checked,
                        blocked_ranges: blockedRanges,
                    };
                    saveSchedPrefs(prefs);
                    const result = await API.rescheduleAll({
                        ...prefs,
                    });
                    closeModal();
                    this.render(true);
                    this.showRescheduleResult(result);
                } catch (err) {
                    showToast('Reschedule failed: ' + err.message, 'error');
                }
            });
        });
    },

    // ── Reschedule Result Summary ────────────────────────────────────────
    showRescheduleResult(result) {
        const deleted = result.deleted_count || 0;
        const scheduled = result.scheduled_count || 0;
        const tasks = result.tasks_scheduled || [];
        const warnings = result.warnings || [];

        let taskRows = '';
        tasks.forEach(t => {
            taskRows += `
                <div class="flex justify-between text-sm py-1">
                    <span class="text-gray-700 dark:text-gray-300 truncate mr-2">${escapeHtml(t.title)}</span>
                    <span class="text-gray-500 dark:text-gray-400 shrink-0">${t.blocks_created} block${t.blocks_created !== 1 ? 's' : ''}</span>
                </div>`;
        });

        let warningRows = '';
        warnings.forEach(w => {
            warningRows += `
                <div class="flex justify-between text-sm py-1">
                    <span class="text-amber-700 dark:text-amber-300 truncate mr-2">${escapeHtml(w.title)}</span>
                    <span class="text-amber-500 dark:text-amber-400 shrink-0">${formatDuration(w.remaining_minutes)} unscheduled</span>
                </div>`;
        });

        showModal(`
            <div class="p-6 text-center">
                <div class="w-14 h-14 mx-auto mb-4 rounded-full ${warnings.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-green-50 dark:bg-green-900/20'} flex items-center justify-center">
                    <i data-lucide="${warnings.length > 0 ? 'alert-circle' : 'check-circle'}" class="w-7 h-7 ${warnings.length > 0 ? 'text-amber-500' : 'text-green-500'}"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Reschedule Complete</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Removed ${deleted} old block${deleted !== 1 ? 's' : ''}, created ${scheduled} new block${scheduled !== 1 ? 's' : ''}
                </p>

                ${taskRows ? `
                <div class="text-left p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 mb-3 max-h-40 overflow-y-auto">
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Tasks Scheduled</p>
                    ${taskRows}
                </div>` : ''}

                ${warningRows ? `
                <div class="text-left p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-3 max-h-32 overflow-y-auto">
                    <p class="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                        <i data-lucide="alert-triangle" class="w-3 h-3"></i>
                        Could Not Fully Schedule
                    </p>
                    ${warningRows}
                </div>` : ''}

                <div class="flex justify-center gap-3 mt-4">
                    <button onclick="closeModal()"
                            class="px-5 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
                        OK
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    // ── Delete Event ────────────────────────────────────────────────────
    async deleteEvent(id) {
        try {
            await API.deleteEvent(id);
            this.render(true);
            showToast('Event deleted', 'success');
        } catch (err) {
            if (err.message.includes('401') || err.message.includes('Not authenticated')) {
                showToast('Session expired. Redirecting to login...', 'error');
                setTimeout(() => { window.location.href = '/auth/login'; }, 1500);
            } else {
                showToast('Failed to delete event: ' + err.message, 'error');
            }
        }
    },

    // ── Delete Task ─────────────────────────────────────────────────────
    async deleteTask(id) {
        try {
            await API.deleteTask(id);
            this.render(true);
            showToast('Task deleted', 'success');
        } catch (err) {
            showToast('Failed to delete task', 'error');
        }
    },
};
