/**
 * TimerWidget - A floating Pomodoro-style timer for scheduled blocks.
 * Directly tracks "actual time spent" by pulsing the backend every minute.
 */
const TimerWidget = {
    _blockId: null,
    _taskTitle: '',
    _remainingSeconds: 0,
    _totalSeconds: 0,
    _isRunning: false,
    _interval: null,
    _pulseInterval: null,
    _lastPulseTime: null,
    _container: null,

    init() {
        this._loadState();
        if (this._blockId) {
            this.show();
        }
    },

    /**
     * Start a new timer for a specific block.
     * @param {number} blockId 
     * @param {string} taskTitle 
     * @param {number} durationMins 
     */
    startNew(blockId, taskTitle, durationMins) {
        if (this._blockId && this._blockId !== blockId) {
            if (!confirm('A timer is already running for another block. Replace it?')) {
                return;
            }
            this.stop();
        }

        this._blockId = blockId;
        this._taskTitle = taskTitle;
        this._totalSeconds = durationMins * 60;
        this._remainingSeconds = this._totalSeconds;
        this._isRunning = true;
        this._lastPulseTime = Date.now();

        this._saveState();
        this.show();
        this._startIntervals();
    },

    show() {
        if (this._container) return;

        this._container = document.createElement('div');
        this._container.className = 'timer-widget';
        this._render();
        document.body.appendChild(this._container);
        
        if (this._isRunning) {
            this._startIntervals();
        }

        lucide.createIcons();
    },

    toggle() {
        this._isRunning = !this._isRunning;
        if (this._isRunning) {
            this._lastPulseTime = Date.now();
            this._startIntervals();
        } else {
            this._stopIntervals();
        }
        this._saveState();
        this._render();
        lucide.createIcons();
    },

    stop() {
        this._stopIntervals();
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
        this._blockId = null;
        this._clearState();
        
        // Refresh calendar if a block was active
        if (typeof CalendarView !== 'undefined') {
            CalendarView.render(true);
        }
    },

    _render() {
        if (!this._container) return;

        const minutes = Math.floor(this._remainingSeconds / 60);
        const seconds = this._remainingSeconds % 60;
        const displayTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        const progress = ((this._totalSeconds - this._remainingSeconds) / this._totalSeconds) * 100;

        this._container.innerHTML = `
            <div class="timer-info">
                <div class="timer-title" title="${escapeHtml(this._taskTitle)}">${escapeHtml(this._taskTitle)}</div>
                <div class="timer-subtitle">Pomodoro Session</div>
            </div>
            
            <div class="timer-display">${displayTime}</div>
            
            <div class="timer-progress">
                <div class="timer-progress-bar" style="width: ${progress}%"></div>
            </div>
            
            <div class="timer-controls">
                <button onclick="TimerWidget.stop()" class="timer-btn stop" title="Stop & Close">
                    <i data-lucide="square" class="w-5 h-5"></i>
                </button>
                <button onclick="TimerWidget.toggle()" class="timer-btn primary" title="${this._isRunning ? 'Pause' : 'Resume'}">
                    <i data-lucide="${this._isRunning ? 'pause' : 'play'}" class="w-6 h-6"></i>
                </button>
            </div>
        `;
    },

    _startIntervals() {
        this._stopIntervals();

        // Tick interval (every second)
        this._interval = setInterval(() => {
            if (this._remainingSeconds > 0) {
                this._remainingSeconds--;
                this._render();
            } else {
                this.toggle(); // Auto-pause at zero
                if (typeof showToast !== 'undefined') {
                    showToast('Pomodoro session completed!', 'success');
                }
            }
        }, 1000);

        // Pulse interval (every minute)
        this._pulseInterval = setInterval(async () => {
            if (this._isRunning) {
                try {
                    await API.pulseScheduledBlock(this._blockId);
                } catch (err) {
                    console.error('Failed to pulse timer:', err);
                }
            }
        }, 60000);
    },

    _stopIntervals() {
        if (this._interval) clearInterval(this._interval);
        if (this._pulseInterval) clearInterval(this._pulseInterval);
        this._interval = null;
        this._pulseInterval = null;
    },

    _saveState() {
        const state = {
            blockId: this._blockId,
            taskTitle: this._taskTitle,
            remainingSeconds: this._remainingSeconds,
            totalSeconds: this._totalSeconds,
            isRunning: this._isRunning,
            lastSaved: Date.now()
        };
        localStorage.setItem('pomodoro_timer_state', JSON.stringify(state));
    },

    _loadState() {
        const saved = localStorage.getItem('pomodoro_timer_state');
        if (!saved) return;

        try {
            const state = JSON.parse(saved);
            this._blockId = state.blockId;
            this._taskTitle = state.taskTitle;
            this._totalSeconds = state.totalSeconds;
            this._isRunning = state.isRunning;
            
            // Adjust remaining time based on elapsed time if it was running
            const elapsedSinceLastSave = Math.floor((Date.now() - state.lastSaved) / 1000);
            
            if (this._isRunning) {
                this._remainingSeconds = Math.max(0, state.remainingSeconds - elapsedSinceLastSave);
                
                // Also pulse for the missed minutes if significant
                const missedPulses = Math.floor(elapsedSinceLastSave / 60);
                if (missedPulses > 0) {
                    this._catchUpPulses(this._blockId, missedPulses);
                }
            } else {
                this._remainingSeconds = state.remainingSeconds;
            }
        } catch (err) {
            console.error('Failed to load timer state:', err);
            this._clearState();
        }
    },

    async _catchUpPulses(blockId, count) {
        console.log(`Catching up ${count} pulses for block ${blockId}`);
        for (let i = 0; i < count; i++) {
            try {
                await API.pulseScheduledBlock(blockId);
            } catch (err) {
                console.error('Failed catch-up pulse:', err);
                break;
            }
        }
    },

    _clearState() {
        localStorage.removeItem('pomodoro_timer_state');
    }
};
