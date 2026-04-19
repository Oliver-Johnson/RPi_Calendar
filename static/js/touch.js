/* ============================================
   Touch gesture handler — swipe navigation + pull-to-refresh
   ============================================ */

const TouchHandler = {
    // View order for swipe navigation (matches nav order)
    _viewOrder: ['home', 'calendar', 'tasks', 'insights', 'jobs', 'agency'],

    // State
    _touchStartX: 0,
    _touchStartY: 0,
    _touchStartScrollTop: 0,
    _pullIndicator: null,
    _isPulling: false,
    _isRefreshing: false,

    // Thresholds
    SWIPE_THRESHOLD: 60,       // px horizontal for swipe nav
    SWIPE_MAX_VERTICAL: 40,    // px max vertical drift for horizontal swipe
    PULL_THRESHOLD: 80,        // px downward pull to trigger refresh

    init(switchViewFn, getCurrentViewFn) {
        this._switchView = switchViewFn;
        this._getCurrentView = getCurrentViewFn;
        this._pullIndicator = document.getElementById('pull-to-refresh-indicator');

        const main = document.querySelector('main');
        if (!main) return;

        main.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
        main.addEventListener('touchmove',  (e) => this._onTouchMove(e),  { passive: true });
        main.addEventListener('touchend',   (e) => this._onTouchEnd(e),   { passive: true });
    },

    _onTouchStart(e) {
        const t = e.touches[0];
        this._touchStartX = t.clientX;
        this._touchStartY = t.clientY;

        // Record scroll position of the active scrollable container
        const scrollEl = this._getScrollContainer(e.target);
        this._touchStartScrollTop = scrollEl ? scrollEl.scrollTop : 0;
        this._isPulling = false;
    },

    _onTouchMove(e) {
        if (this._isRefreshing) return;

        const t = e.touches[0];
        const dx = t.clientX - this._touchStartX;
        const dy = t.clientY - this._touchStartY;

        // Pull-to-refresh: downward drag when at top of scroll
        if (dy > 0 && this._touchStartScrollTop === 0 && Math.abs(dx) < 30) {
            this._isPulling = true;
            if (this._pullIndicator) {
                const progress = Math.min(dy / this._PULL_THRESHOLD, 1);
                this._pullIndicator.classList.remove('hidden');
                this._pullIndicator.style.opacity = progress;
                this._pullIndicator.textContent = dy >= this.PULL_THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh';
            }
        }
    },

    _onTouchEnd(e) {
        const t = e.changedTouches[0];
        const dx = t.clientX - this._touchStartX;
        const dy = t.clientY - this._touchStartY;

        // Pull-to-refresh release
        if (this._isPulling) {
            this._isPulling = false;
            if (dy >= this.PULL_THRESHOLD) {
                this._triggerRefresh();
            } else {
                if (this._pullIndicator) this._pullIndicator.classList.add('hidden');
            }
            return;
        }

        // Hide pull indicator if visible
        if (this._pullIndicator) this._pullIndicator.classList.add('hidden');

        // Horizontal swipe: only if movement is more horizontal than vertical
        if (Math.abs(dx) >= this.SWIPE_THRESHOLD && Math.abs(dy) <= this.SWIPE_MAX_VERTICAL) {
            const current = this._getCurrentView ? this._getCurrentView() : null;
            const idx = this._viewOrder.indexOf(current);
            if (idx === -1) return;

            if (dx < 0) {
                // Left swipe → next view
                const next = this._viewOrder[(idx + 1) % this._viewOrder.length];
                this._switchView(next);
            } else {
                // Right swipe → previous view
                const prev = this._viewOrder[(idx - 1 + this._viewOrder.length) % this._viewOrder.length];
                this._switchView(prev);
            }
        }
    },

    _triggerRefresh() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        if (this._pullIndicator) {
            this._pullIndicator.textContent = '↻ Refreshing…';
            this._pullIndicator.style.opacity = '1';
        }

        // Call refresh on current view object if available, else reload page
        const viewName = this._getCurrentView ? this._getCurrentView() : null;
        const viewMap = {
            home:     () => typeof HomeView     !== 'undefined' && HomeView._loadData    ? HomeView._loadData()     : null,
            tasks:    () => typeof TaskView     !== 'undefined' && TaskView.render       ? TaskView.render()        : null,
            calendar: () => typeof CalendarView !== 'undefined' && CalendarView.render   ? CalendarView.render()    : null,
            insights: () => typeof InsightsView !== 'undefined' && InsightsView.render   ? InsightsView.render()    : null,
            jobs:     () => typeof JobsView     !== 'undefined' && JobsView.render       ? JobsView.render()        : null,
            agency:   () => typeof AgencyView   !== 'undefined' && AgencyView.render     ? AgencyView.render()      : null,
        };

        const refreshFn = viewMap[viewName];
        const done = () => {
            this._isRefreshing = false;
            if (this._pullIndicator) {
                this._pullIndicator.classList.add('hidden');
                this._pullIndicator.style.opacity = '0';
            }
        };

        if (refreshFn) {
            try {
                const result = refreshFn();
                if (result && typeof result.then === 'function') {
                    result.then(done).catch(done);
                } else {
                    setTimeout(done, 500);
                }
            } catch (_) {
                setTimeout(done, 500);
            }
        } else {
            window.location.reload();
        }
    },

    _getScrollContainer(el) {
        // Walk up the DOM to find nearest scrollable ancestor
        let node = el;
        while (node && node !== document.body) {
            const style = window.getComputedStyle(node);
            const overflow = style.overflowY;
            if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    },
};
