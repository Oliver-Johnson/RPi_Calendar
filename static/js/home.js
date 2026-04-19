/* ============================================
   HomeView — ambient clock, events, tasks, weather
   ============================================ */

const HomeView = {
    _clockInterval: null,
    _weatherInterval: null,
    _countdownInterval: null,
    _events: [],
    _tasks: [],
    _initialized: false,

    init() {
        if (!this._initialized) {
            this._renderStructure();
            this._initialized = true;
        }
        this._startClock();
        this._loadData();
        this._startCountdownRefresh();
        this._startWeatherRefresh();
    },

    destroy() {
        if (this._clockInterval)    clearInterval(this._clockInterval);
        if (this._weatherInterval)  clearInterval(this._weatherInterval);
        if (this._countdownInterval) clearInterval(this._countdownInterval);
    },

    // ---- Structure ----

    _renderStructure() {
        const el = document.getElementById('view-home');
        if (!el) return;
        el.innerHTML = `
            <div class="home-view">
                <div class="home-clock-section">
                    <div id="home-time" class="home-clock">00:00</div>
                    <div id="home-date" class="home-date"></div>
                </div>
                <div class="home-cards">
                    <div class="home-card" id="home-events-card">
                        <div class="home-card-label">Next Up</div>
                        <div id="home-next-event-content">
                            <div class="home-empty-state">Loading&hellip;</div>
                        </div>
                    </div>
                    <div class="home-card" id="home-tasks-card">
                        <div class="home-card-label">Today&rsquo;s Tasks</div>
                        <div id="home-tasks-content">
                            <div class="home-empty-state">Loading&hellip;</div>
                        </div>
                    </div>
                </div>
                <div class="home-weather">
                    <div class="home-weather-card" id="home-weather-content">
                        <div style="color:#555;font-size:13px;">Loading weather&hellip;</div>
                    </div>
                </div>
                <div class="home-fab-container">
                    <button class="home-fab" id="fab-sleep" onclick="SleepManager.sleep()">
                        <span class="home-fab-icon">🌙</span>
                        <span class="home-fab-label">Sleep</span>
                    </button>
                    <button class="home-fab" id="fab-add-task" onclick="HomeView._openAddTask()">
                        <span class="home-fab-icon">➕</span>
                        <span class="home-fab-label">Task</span>
                    </button>
                    <button class="home-fab" id="fab-add-event" onclick="HomeView._openAddEvent()">
                        <span class="home-fab-icon">📅</span>
                        <span class="home-fab-label">Event</span>
                    </button>
                    <button class="home-fab home-fab-dismiss hidden" id="fab-dismiss-reminder">
                        <span class="home-fab-icon">🔕</span>
                        <span class="home-fab-label">Dismiss</span>
                    </button>
                </div>
            </div>
        `;
    },

    // ---- Clock ----

    _startClock() {
        if (this._clockInterval) clearInterval(this._clockInterval);
        this._updateClock();
        this._clockInterval = setInterval(() => this._updateClock(), 1000);
    },

    _updateClock() {
        const now = new Date();
        const timeEl = document.getElementById('home-time');
        const dateEl = document.getElementById('home-date');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString([], {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
        }
        // Keep ambient dim overlay clock in sync
        const ambClock = document.getElementById('ambient-dim-clock');
        if (ambClock) {
            ambClock.textContent = now.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
    },

    // ---- Data loading ----

    async _loadData() {
        await Promise.all([
            this._loadEvents(),
            this._loadTasks(),
            this._loadWeather(),
        ]);
    },

    // ---- Events ----

    async _loadEvents() {
        try {
            const now = new Date();
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            const events = await API.getEvents(
                DateUtils.toISODateTime(now),
                DateUtils.toISODateTime(endOfDay)
            );
            this._events = (events || [])
                .filter(e => new Date(e.end_time) > now)
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            this._renderEvents();
        } catch (_) {
            const el = document.getElementById('home-next-event-content');
            if (el) el.innerHTML = '<div class="home-empty-state">Unable to load events</div>';
        }
    },

    _renderEvents() {
        const el = document.getElementById('home-next-event-content');
        if (!el) return;

        const now = new Date();
        const upcoming = this._events.filter(e => new Date(e.end_time) > now);

        if (!upcoming.length) {
            el.innerHTML = '<div class="home-empty-state">No more events today</div>';
            return;
        }

        const next = upcoming[0];
        const nextStart = new Date(next.start_time);
        const diffMs = nextStart - now;

        const countdownText = diffMs > 0 ? this._formatCountdown(diffMs) : 'Now';
        const countdownColor = diffMs <= 0 ? 'color:#4ade80' : '';

        let upcomingHtml = '';
        upcoming.slice(1, 3).forEach(e => {
            const t = new Date(e.start_time);
            upcomingHtml += `
                <div class="home-upcoming-item">
                    <span class="home-upcoming-item-time">${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    <span>${escapeHtml(e.title)}</span>
                </div>`;
        });

        el.innerHTML = `
            <div class="home-next-event-title">${escapeHtml(next.title)}</div>
            <div class="home-next-event-countdown" style="${countdownColor}">${escapeHtml(countdownText)}</div>
            <div class="home-next-event-time">${nextStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
            ${upcomingHtml ? `<div class="home-upcoming-list">${upcomingHtml}</div>` : ''}
        `;
    },

    _formatCountdown(ms) {
        const totalMin = Math.floor(ms / 60000);
        if (totalMin < 1) return 'now';
        if (totalMin < 60) return `in ${totalMin}m`;
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
    },

    _startCountdownRefresh() {
        if (this._countdownInterval) clearInterval(this._countdownInterval);
        // Refresh countdown text every 30s, reload events every 5 minutes
        let tick = 0;
        this._countdownInterval = setInterval(() => {
            tick++;
            this._renderEvents();
            if (tick % 10 === 0) this._loadEvents(); // full reload every 5 min
        }, 30000);
    },

    // ---- Tasks ----

    async _loadTasks() {
        try {
            const tasks = await API.getTasks({ status: 'Pending' });
            this._tasks = tasks || [];
            this._renderTasks();
        } catch (_) {
            const el = document.getElementById('home-tasks-content');
            if (el) el.innerHTML = '<div class="home-empty-state">Unable to load tasks</div>';
        }
    },

    _renderTasks() {
        const el = document.getElementById('home-tasks-content');
        if (!el) return;

        const tasks = this._tasks;
        if (!tasks.length) {
            el.innerHTML = '<div class="home-empty-state">All done — no pending tasks</div>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayTasks = tasks.filter(t => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });

        const displayTasks = todayTasks.length > 0 ? todayTasks : tasks.slice(0, 4);
        const meta = todayTasks.length > 0
            ? `${todayTasks.length} due today · ${tasks.length} total`
            : `${tasks.length} pending`;

        const listHtml = displayTasks.slice(0, 4).map(t => {
            const priority = (t.priority || 'medium').toLowerCase();
            return `
                <div class="home-task-item">
                    <span class="home-task-dot ${priority}"></span>
                    <span>${escapeHtml(t.title)}</span>
                </div>`;
        }).join('');

        el.innerHTML = `
            <div class="home-tasks-count">${tasks.length}</div>
            <div class="home-tasks-meta">${meta}</div>
            <div class="home-tasks-list">${listHtml}</div>
        `;
    },

    // ---- Weather ----

    async _loadWeather() {
        try {
            const data = await API.getWeather();
            this._renderWeather(data);
        } catch (_) {
            const el = document.getElementById('home-weather-content');
            if (el) el.innerHTML = '<div style="color:#555;font-size:13px;">Weather unavailable</div>';
        }
    },

    _renderWeather(data) {
        const el = document.getElementById('home-weather-content');
        if (!el || !data) return;

        const cur = data.current || {};
        const hourly = (data.hourly || []).slice(0, 6);
        const daily = (data.daily || []).slice(0, 3);

        const hourlyHtml = hourly.map(h => `
            <div class="home-weather-hour">
                <div class="home-weather-hour-emoji">${h.icon_emoji || '🌡️'}</div>
                <div class="home-weather-hour-temp">${Math.round(h.temp)}°</div>
                <div>${h.time}</div>
            </div>`).join('');

        const dailyHtml = daily.map(d => `
            <div class="home-weather-day">
                <span class="home-weather-day-name">${escapeHtml(d.date_short || d.date || '')}</span>
                <span>${d.icon_emoji || '🌡️'}</span>
                <span style="color:#c0c0c0">${Math.round(d.temp_max)}°</span>
            </div>`).join('');

        el.innerHTML = `
            <div class="home-weather-current">
                <div class="home-weather-emoji">${cur.icon_emoji || '🌡️'}</div>
                <div>
                    <div class="home-weather-temp">${Math.round(cur.temperature || 0)}°C</div>
                    <div class="home-weather-desc">${escapeHtml(cur.description || '')} &middot; Feels like ${Math.round(cur.feels_like || 0)}°</div>
                </div>
            </div>
            ${hourlyHtml ? `<div class="home-weather-hourly">${hourlyHtml}</div>` : ''}
            ${dailyHtml ? `<div class="home-weather-daily">${dailyHtml}</div>` : ''}
        `;
    },

    _startWeatherRefresh() {
        if (this._weatherInterval) clearInterval(this._weatherInterval);
        this._weatherInterval = setInterval(() => this._loadWeather(), 30 * 60 * 1000);
    },

    // ---- Quick-action FABs ----

    _openAddTask() {
        const modal = document.getElementById('modal-add-task');
        if (!modal) return;
        // Reset form
        const form = modal.querySelector('form');
        if (form) form.reset();
        modal.classList.remove('hidden');
        modal.querySelector('input[type="text"]')?.focus();
    },

    async _openAddEvent() {
        const modal = document.getElementById('modal-add-event');
        if (!modal) return;
        const form = modal.querySelector('form');
        if (form) form.reset();

        // Prefill start to nearest upcoming hour
        const now = new Date();
        now.setMinutes(0, 0, 0);
        now.setHours(now.getHours() + 1);
        const toLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const startEl = document.getElementById('event-start');
        const endEl   = document.getElementById('event-end');
        if (startEl) startEl.value = toLocal(now);
        if (endEl) {
            const end = new Date(now.getTime() + 60 * 60 * 1000);
            endEl.value = toLocal(end);
        }

        // Populate calendar selector
        const calSelect = document.getElementById('event-calendar');
        if (calSelect) {
            calSelect.innerHTML = '<option value="">Default calendar</option>';
            try {
                const cals = await API.getCalendars();
                (cals || []).forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    calSelect.appendChild(opt);
                });
            } catch (_) { /* leave default only */ }
        }

        modal.classList.remove('hidden');
        modal.querySelector('input[type="text"]')?.focus();
    },

    _closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    },

    async _submitTask(e) {
        e.preventDefault();
        const title    = document.getElementById('task-title')?.value.trim();
        const dueDate  = document.getElementById('task-due-date')?.value || null;
        const priority = document.getElementById('task-priority')?.value || 'Medium';
        if (!title) return;

        const btn = e.target.querySelector('button[type="submit"]');
        const orig = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        try {
            await API.createTask({ title, due_date: dueDate, priority, status: 'Pending' });
            this._closeModal('modal-add-task');
            await this._loadTasks();
            if (typeof showToast !== 'undefined') showToast('Task added', 'success');
        } catch (err) {
            if (typeof showToast !== 'undefined') showToast('Failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = orig; }
        }
    },

    async _submitEvent(e) {
        e.preventDefault();
        const title      = document.getElementById('event-title')?.value.trim();
        const startRaw   = document.getElementById('event-start')?.value;
        const endRaw     = document.getElementById('event-end')?.value;
        const calendarId = document.getElementById('event-calendar')?.value || null;
        if (!title || !startRaw) return;

        const btn = e.target.querySelector('button[type="submit"]');
        const orig = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        const payload = {
            title,
            start_time: new Date(startRaw).toISOString(),
            end_time:   endRaw ? new Date(endRaw).toISOString() : new Date(new Date(startRaw).getTime() + 3600000).toISOString(),
        };
        if (calendarId) payload.calendar_id = calendarId;

        try {
            await API.createEvent(payload);
            this._closeModal('modal-add-event');
            await this._loadEvents();
            if (typeof showToast !== 'undefined') showToast('Event added', 'success');
        } catch (err) {
            if (typeof showToast !== 'undefined') showToast('Failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = orig; }
        }
    },
};
