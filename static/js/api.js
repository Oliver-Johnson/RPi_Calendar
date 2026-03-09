const API = {
    async request(url, options = {}) {
        const defaults = {
            headers: { 'Content-Type': 'application/json' },
        };
        const response = await fetch(url, { ...defaults, ...options });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        if (response.status === 204) return null;
        return response.json();
    },

    // ── Tasks ───────────────────────────────────────────────────────────
    getTasks(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/tasks${query ? '?' + query : ''}`);
    },
    createTask(data) {
        return this.request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateTask(id, data) {
        return this.request(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteTask(id) {
        return this.request(`/api/tasks/${id}`, { method: 'DELETE' });
    },

    // ── Events ──────────────────────────────────────────────────────────
    getEvents(start, end) {
        return this.request(`/api/events?start=${start}&end=${end}`);
    },
    createEvent(data) {
        return this.request('/api/events', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateEvent(id, data) {
        return this.request(`/api/events/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteEvent(id) {
        return this.request(`/api/events/${id}`, { method: 'DELETE' });
    },
    toggleEventSchedule(id, excluded) {
        return this.request(`/api/events/${id}/toggle-schedule`, {
            method: 'POST',
            body: JSON.stringify({ excluded_from_schedule: excluded }),
        });
    },

    // ── Sync ────────────────────────────────────────────────────────────
    triggerSync() {
        return this.request('/auth/sync', { method: 'POST' });
    },

    // ── Outlook Calendars ─────────────────────────────────────────────
    getCalendars() {
        return this.request('/api/calendars');
    },
    toggleCalendar(id, isEnabled) {
        return this.request(`/api/calendars/${id}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ is_enabled: isEnabled }),
        });
    },
    refreshCalendars() {
        return this.request('/api/calendars/refresh', { method: 'POST' });
    },

    // ── Scheduled Blocks ─────────────────────────────────────────────
    getScheduledBlocks(start, end) {
        return this.request(`/api/scheduled-blocks?start=${start}&end=${end}`);
    },
    createScheduledBlock(data) {
        return this.request('/api/scheduled-blocks', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateScheduledBlock(id, data) {
        return this.request(`/api/scheduled-blocks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteScheduledBlock(id) {
        return this.request(`/api/scheduled-blocks/${id}`, { method: 'DELETE' });
    },
    completeScheduledBlock(id, actualDuration) {
        return this.request(`/api/scheduled-blocks/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ actual_duration: actualDuration }),
        });
    },
    autoScheduleTask(taskId, options = {}) {
        return this.request('/api/scheduled-blocks/auto-schedule', {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, ...options }),
        });
    },
    togglePinBlock(id, isPinned) {
        return this.request(`/api/scheduled-blocks/${id}/toggle-pin`, {
            method: 'POST',
            body: JSON.stringify({ is_pinned: isPinned }),
        });
    },
    rescheduleAll(options = {}) {
        return this.request('/api/scheduled-blocks/reschedule-all', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    },

    // ── Jobs ─────────────────────────────────────────
    getJobSearches() {
        return this.request('/api/job_searches');
    },
    createJobSearch(data) {
        return this.request('/api/job_searches', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateJobSearch(id, data) {
        return this.request(`/api/job_searches/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteJobSearch(id) {
        return this.request(`/api/job_searches/${id}`, {
            method: 'DELETE',
        });
    },

    // ── Job Boards ───────────────────────────────────
    getJobBoards() {
        return this.request('/api/job_boards');
    },
    createJobBoard(data) {
        return this.request('/api/job_boards', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateJobBoard(id, data) {
        return this.request(`/api/job_boards/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteJobBoard(id) {
        return this.request(`/api/job_boards/${id}`, {
            method: 'DELETE',
        });
    },

    // ── Jobs ─────────────────────────────────────────
    getJobs(params = {}) {
        const url = new URL(window.location.origin + '/api/jobs');
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });
        return this.request(url.pathname + url.search);
    },
    updateJob(id, data) {
        return this.request(`/api/jobs/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    deleteJob(id) {
        return this.request(`/api/jobs/${id}`, {
            method: 'DELETE',
        });
    },
    triggerScrape() {
        return this.request('/api/jobs/scrape', {
            method: 'POST',
        });
    },
    getScrapeStatus() {
        return this.request('/api/jobs/scrape/status');
    }
};
