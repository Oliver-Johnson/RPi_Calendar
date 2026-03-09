// ── Jobs / Scraper View ─────────────────────────────────────────────────────
const JobsView = {
    container: null,
    searches: [],
    jobBoards: [],
    jobs: [],
    currentStatusFilter: 'New',
    currentSearchTerm: '',
    currentProfileFilter: 'All',

    async render() {
        this.container = document.getElementById('view-jobs');
        try {
            // Fetch searches, boards, and jobs
            [this.searches, this.jobBoards, this.jobs] = await Promise.all([
                API.getJobSearches(),
                API.getJobBoards(),
                API.getJobs({ status: this.currentStatusFilter })
            ]);

            this.container.innerHTML = `
                <div class="max-w-6xl mx-auto space-y-8">
                    <!-- Header -->
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <h2 class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight flex items-center gap-3">
                            <i data-lucide="briefcase" class="w-6 h-6 text-brand-500"></i>
                            Job Board
                        </h2>
                        <div class="flex items-center gap-3">
                            <button onclick="JobsView.triggerScrape(this)" class="px-4 py-2 bg-white dark:bg-darkpanel border border-gray-200 dark:border-darkborder hover:bg-gray-50 dark:hover:bg-darkborder/50 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm flex items-center gap-2 text-sm font-semibold transition-all group">
                                <i data-lucide="refresh-cw" class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500"></i> Refresh Jobs
                            </button>
                            <button onclick="JobsView.showAddSearchModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md flex items-center gap-2 text-sm font-semibold transition-all">
                                <i data-lucide="plus" class="w-4 h-4"></i> New Search
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <!-- Left sidebar: Active Searches -->
                        <div class="space-y-4">
                            <div class="bg-white dark:bg-darkpanel rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm p-5">
                                <h3 class="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                                    <i data-lucide="search" class="w-4 h-4 text-gray-400"></i>
                                    Active Searches
                                </h3>
                                <div class="space-y-2">
                                    ${this.renderSearchesList()}
                                </div>
                            </div>

                            <!-- Direct Job Boards -->
                            <div class="bg-white dark:bg-darkpanel rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm p-5">
                                <div class="flex items-center justify-between mb-4">
                                    <h3 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                        <i data-lucide="globe" class="w-4 h-4 text-gray-400"></i>
                                        Direct Boards
                                    </h3>
                                    <button onclick="JobsView.showAddBoardModal()" class="text-brand-500 hover:text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-500/10 dark:hover:bg-brand-500/20 p-1 rounded-md transition-colors" title="Add Job Board URL">
                                        <i data-lucide="plus" class="w-4 h-4"></i>
                                    </button>
                                </div>
                                <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                    ${this.renderJobBoardsList()}
                                </div>
                            </div>
                            
                            <!-- Status Filters -->
                            <div class="bg-white dark:bg-darkpanel rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm p-3 flex flex-col gap-1">
                                ${['New', 'Applied', 'Rejected'].map(s => `
                                    <button onclick="JobsView.setStatusFilter('${s}')" class="text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${this.currentStatusFilter === s ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-darkborder/50'}">
                                        ${s} Jobs
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Right area: Job Feed -->
                        <div class="lg:col-span-3 space-y-4">
                            <!-- Filter Header -->
                            <div class="bg-white dark:bg-darkpanel p-3 rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                                <div class="flex items-center gap-3 w-full sm:w-auto">
                                    <div class="relative w-full sm:w-64">
                                        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"></i>
                                        <input type="text" id="job-search-input" value="${escapeHtml(this.currentSearchTerm)}" 
                                            oninput="JobsView.filterJobsLocal(this.value, null)"
                                            placeholder="Search jobs or companies..." 
                                            class="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-darkborder/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all custom-input">
                                    </div>
                                    <select id="job-profile-filter" onchange="JobsView.filterJobsLocal(null, this.value)" 
                                            class="bg-gray-50 dark:bg-darkborder/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-2 custom-input mix-blend-normal">
                                        <option value="All" ${this.currentProfileFilter === 'All' ? 'selected' : ''}>All Profiles</option>
                                        <option value="Manual" ${this.currentProfileFilter === 'Manual' ? 'selected' : ''}>Direct Boards</option>
                                        ${this.searches.map(s => `<option value="${escapeHtml(s.name)}" ${this.currentProfileFilter === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="px-3 py-1 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg text-xs font-bold whitespace-nowrap hidden sm:block" id="job-counter-pill">
                                    <!-- Populated dynamically -->
                                </div>
                            </div>
                            
                            <!-- Job List Container -->
                            <div id="job-feed-list" class="space-y-4">
                                ${this.renderJobsFeedList()}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
            this.updateJobCounter();
        } catch (err) {
            this.container.innerHTML = `<p class="text-red-500">Failed to load jobs: ${err.message}</p>`;
        }
    },

    renderSearchesList() {
        if (this.searches.length === 0) {
            return `<div class="text-[11px] text-gray-400 dark:text-gray-500 italic">No search profiles configured.</div>`;
        }
        return this.searches.map(s => `
            <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-darkborder/50 transition-colors border border-transparent dark:hover:border-darkborder group">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full ${s.is_active ? 'bg-emerald-400' : 'bg-gray-300'}"></span>
                        ${escapeHtml(s.name)}
                    </div>
                    <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate" title="${escapeHtml(s.query)}">
                        ${escapeHtml(s.query)}
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <label class="relative inline-flex items-center cursor-pointer" title="${s.is_active ? 'Pause Search' : 'Resume Search'}">
                        <input type="checkbox" class="sr-only peer" ${s.is_active ? 'checked' : ''} onchange="JobsView.toggleSearchActivity(${s.id}, this.checked)">
                        <div class="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                    <button onclick="JobsView.showEditSearchModal(${s.id})" class="text-brand-500 hover:text-brand-600 p-1" title="Edit Search">
                        <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="JobsView.deleteSearch(${s.id})" class="text-red-400 hover:text-red-600 p-1" title="Delete Search">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    getFilteredJobs() {
        return this.jobs.filter(job => {
            // Text Search
            const term = this.currentSearchTerm.toLowerCase();
            const matchText = !term || (job.title && job.title.toLowerCase().includes(term)) || (job.company && job.company.toLowerCase().includes(term));
            
            // Profile Filter
            let matchProfile = true;
            if (this.currentProfileFilter !== 'All') {
                if (this.currentProfileFilter === 'Manual') {
                    matchProfile = !job.search_name;
                } else {
                    matchProfile = job.search_name === this.currentProfileFilter;
                }
            }
            return matchText && matchProfile;
        });
    },

    filterJobsLocal(searchTerm, profileFilter) {
        if (searchTerm !== null) this.currentSearchTerm = searchTerm;
        if (profileFilter !== null) this.currentProfileFilter = profileFilter;
        
        const feedList = document.getElementById('job-feed-list');
        if (feedList) {
            feedList.innerHTML = this.renderJobsFeedList();
            lucide.createIcons();
            this.updateJobCounter();
        }
    },

    updateJobCounter() {
        const counter = document.getElementById('job-counter-pill');
        if (counter) {
            const count = this.getFilteredJobs().length;
            counter.innerText = `${count} ${count === 1 ? 'Job' : 'Jobs'} Found`;
        }
    },

    renderJobsFeedList() {
        const displayJobs = this.getFilteredJobs();
        
        if (displayJobs.length === 0) {
            return `
                <div class="text-center py-16 bg-white dark:bg-darkpanel border border-dashed border-gray-200 dark:border-darkborder rounded-2xl">
                    <div class="w-16 h-16 rounded-full bg-gray-50 dark:bg-darkborder/50 flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="inbox" class="w-8 h-8 text-gray-400"></i>
                    </div>
                    <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">No ${this.currentStatusFilter.toLowerCase()} jobs found.</h3>
                </div>
            `;
        }

        return displayJobs.map(job => `
            <div class="bg-white dark:bg-darkpanel rounded-2xl border border-gray-100 dark:border-darkborder shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between transition-shadow hover:shadow-md">
                <div class="min-w-0 flex-1">
                    <h3 class="text-base font-bold text-gray-900 dark:text-white truncate" title="${escapeHtml(job.title)}">
                        ${escapeHtml(job.title)}
                    </h3>
                    <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span class="font-medium text-brand-600 dark:text-brand-400 flex items-center gap-1">
                            <i data-lucide="building-2" class="w-3.5 h-3.5"></i> ${escapeHtml(job.company)}
                        </span>
                        <span class="flex items-center gap-1 bg-gray-100 dark:bg-darkborder px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                            <i data-lucide="search" class="w-3 h-3"></i> ${escapeHtml(job.search_name || 'Manual')}
                        </span>
                        <span title="Date Found" class="flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> ${new Date(job.date_found).toLocaleDateString()}</span>
                        ${job.deadline ? `<span class="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded" title="Application Deadline"><i data-lucide="calendar-clock" class="w-3.5 h-3.5"></i> Due: ${escapeHtml(job.deadline)}</span>` : ''}
                    </div>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                    <a href="${job.url}" target="_blank" class="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-darkborder hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg transition-colors flex items-center gap-1.5">
                        View <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                    ${this.currentStatusFilter === 'New' ? `
                        <button onclick="JobsView.updateJobStatus(${job.id}, 'Applied')" class="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5">
                            <i data-lucide="check" class="w-3.5 h-3.5"></i> Applied
                        </button>
                        <button onclick="JobsView.updateJobStatus(${job.id}, 'Rejected')" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Reject">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    ` : `
                        <button onclick="JobsView.deleteJob(${job.id})" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Delete completely">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    `}
                </div>
            </div>
        `).join('');
    },

    setStatusFilter(status) {
        this.currentStatusFilter = status;
        this.render();
    },

    async updateJobStatus(id, newStatus) {
        try {
            await API.updateJob(id, { status: newStatus });
            showToast(`Job marked as ${newStatus}`, 'success');
            this.render();
        } catch (e) {
            showToast('Failed to update job status', 'error');
        }
    },

    async triggerScrape(btnElement) {
        if (btnElement.disabled) return;
        
        // Show loading state
        const originalContent = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Searching...`;
        lucide.createIcons();

        try {
            await API.triggerScrape();
            showToast('Background scrape initiated. This will take a few minutes.', 'success');
            
            // Start polling the backend for scraper status
            const pollInterval = setInterval(async () => {
                try {
                    const status = await API.getScrapeStatus();
                    if (!status.is_scraping) {
                        clearInterval(pollInterval);
                        
                        // Restore button and refresh job feed
                        btnElement.disabled = false;
                        btnElement.innerHTML = originalContent;
                        lucide.createIcons();
                        
                        showToast('Search complete! Refreshing feed.', 'success');
                        JobsView.render(); // Refresh the UI to show new jobs
                    }
                } catch (e) {
                    console.error("Failed to poll scraper status:", e);
                    // On error, let the interval continue, wait for next tick
                }
            }, 3000); // Check every 3 seconds
            
        } catch (error) {
            console.error('Error triggering scrape:', error);
            showToast('Failed to start scraper', 'error');
            btnElement.disabled = false;
            btnElement.innerHTML = originalContent;
            lucide.createIcons();
        }
    },

    async deleteJob(id) {
        showConfirm('Remove this job from the database permanently?', async () => {
            try {
                await API.deleteJob(id);
                showToast('Job removed', 'success');
                this.render();
            } catch (e) {
                showToast('Failed to delete job', 'error');
            }
        });
    },

    showAddSearchModal() {
        showModal(`
            <div class="px-6 py-5 border-b border-gray-100 dark:border-darkborder/50 flex justify-between items-center">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="search" class="w-5 h-5 text-brand-500"></i>
                    New Job Search
                </h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <form id="job-search-form" class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Search Profile Name</label>
                    <input type="text" id="js-name" required placeholder="e.g., Remote Python Developer" 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                </div>
                
                <div class="p-4 bg-gray-50 dark:bg-darkpanel border border-gray-200 dark:border-darkborder rounded-xl space-y-4 border-l-4 border-l-brand-500">
                    <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <i data-lucide="filter" class="w-4 h-4 text-brand-500"></i> Query Builder
                    </h4>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Must Include (Title/Role)</label>
                        <input type="text" id="js-must-include" required placeholder="e.g., Python Developer" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-gray-200 dark:border-darkborder/80 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">This exact phrase MUST be in the job listing.</p>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Optional Keywords (Skills/Location)</label>
                        <input type="text" id="js-optional" placeholder="e.g., remote django AWS" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-gray-200 dark:border-darkborder/80 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">Space-separated list. Jobs with these rank higher.</p>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Exclude Keywords</label>
                        <input type="text" id="js-exclude" placeholder="e.g., senior lead intern" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-red-200 dark:border-red-500/30 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">Jobs containing these words will be blocked.</p>
                    </div>
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkborder rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-colors">Start Searching</button>
                </div>
            </form>
        `);

        document.getElementById('job-search-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('js-name').value;
            const must = document.getElementById('js-must-include').value.trim();
            const optional = document.getElementById('js-optional').value.trim();
            const exclude = document.getElementById('js-exclude').value.trim();
            
            // Compile DuckDuckGo strict query
            let query = `"${must}"`;
            if (optional) query += ` ${optional}`;
            if (exclude) {
                const excludes = exclude.split(' ').filter(w => w).map(w => `-${w}`).join(' ');
                if (excludes) query += ` ${excludes}`;
            }

            try {
                await API.createJobSearch({ name, query, is_active: true });
                closeModal();
                showToast('Job search created successfully', 'success');
                this.render();
            } catch (err) {
                showToast('Failed to create search', 'error');
            }
        });
        lucide.createIcons();
    },

    showEditSearchModal(id) {
        const search = this.searches.find(s => s.id === id);
        if (!search) return;

        // Try to reverse-engineer the query string back into builder fields
        let must = "";
        let optional = "";
        let exclude = "";
        
        let q = search.query || "";
        
        // Extract quoted "must" string if present
        const mustMatch = q.match(/"([^"]+)"/);
        if (mustMatch) {
            must = mustMatch[1];
            q = q.replace(mustMatch[0], "").trim();
        }

        // Split remaining by space
        const tokens = q.split(" ").filter(t => t);
        const optTokens = [];
        const excTokens = [];
        
        tokens.forEach(t => {
            if (t.startsWith("-")) {
                excTokens.push(t.substring(1));
            } else {
                optTokens.push(t);
            }
        });
        
        optional = optTokens.join(" ");
        exclude = excTokens.join(" ");

        // Fallback: If no quotes were found, just dump everything into 'must' to prevent data loss
        if (!must && optional) {
            must = optional;
            optional = "";
        }

        showModal(`
            <div class="px-6 py-5 border-b border-gray-100 dark:border-darkborder/50 flex justify-between items-center">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="edit-2" class="w-5 h-5 text-brand-500"></i>
                    Edit Job Search
                </h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <form id="edit-job-search-form" class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Search Profile Name</label>
                    <input type="text" id="edit-js-name" value="${escapeHtml(search.name)}" required placeholder="e.g., Remote Python Developer" 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                </div>
                
                <div class="p-4 bg-gray-50 dark:bg-darkpanel border border-gray-200 dark:border-darkborder rounded-xl space-y-4 border-l-4 border-l-brand-500">
                    <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <i data-lucide="filter" class="w-4 h-4 text-brand-500"></i> Query Builder
                    </h4>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Must Include (Title/Role)</label>
                        <input type="text" id="edit-js-must" value="${escapeHtml(must)}" required placeholder="e.g., Python Developer" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-gray-200 dark:border-darkborder/80 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">This exact phrase MUST be in the job listing.</p>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Optional Keywords (Skills/Location)</label>
                        <input type="text" id="edit-js-optional" value="${escapeHtml(optional)}" placeholder="e.g., remote django AWS" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-gray-200 dark:border-darkborder/80 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">Space-separated list. Jobs with these rank higher.</p>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Exclude Keywords</label>
                        <input type="text" id="edit-js-exclude" value="${escapeHtml(exclude)}" placeholder="e.g., senior lead intern" 
                               class="w-full px-3 py-2 bg-white dark:bg-darkbg border border-red-200 dark:border-red-500/30 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none text-gray-800 dark:text-gray-100 transition-all" />
                        <p class="text-[10px] text-gray-500 mt-1">Jobs containing these words will be blocked.</p>
                    </div>
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkborder rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-colors">Save Changes</button>
                </div>
            </form>
        `);

        document.getElementById('edit-job-search-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-js-name').value;
            const must = document.getElementById('edit-js-must').value.trim();
            const optional = document.getElementById('edit-js-optional').value.trim();
            const exclude = document.getElementById('edit-js-exclude').value.trim();
            
            // Compile DuckDuckGo strict query
            let query = `"${must}"`;
            if (optional) query += ` ${optional}`;
            if (exclude) {
                const excludes = exclude.split(' ').filter(w => w).map(w => `-${w}`).join(' ');
                if (excludes) query += ` ${excludes}`;
            }

            try {
                await API.updateJobSearch(id, { name, query });
                closeModal();
                showToast('Job search updated successfully', 'success');
                this.render();
            } catch (err) {
                showToast('Failed to update search', 'error');
            }
        });
        lucide.createIcons();
    },

    async toggleSearchActivity(id, isActive) {
        try {
            await API.updateJobSearch(id, { is_active: isActive });
            showToast(isActive ? 'Search resumed' : 'Search paused', 'success');
            this.render();
        } catch (err) {
            showToast('Failed to toggle search: ' + err.message, 'error');
        }
    },

    deleteSearch(id) {
        showConfirm('Remove this search profile and stop looking for new matches? Existing job listings will NOT be deleted.', async () => {
            try {
                await API.deleteJobSearch(id);
                showToast('Search profile deleted', 'success');
                this.render();
            } catch (e) {
                showToast('Failed to delete search', 'error');
            }
        });
    },

    // ── Direct Job Boards ──────────────────────────────────────────

    renderJobBoardsList() {
        if (this.jobBoards.length === 0) {
            return `<div class="text-[11px] text-gray-400 dark:text-gray-500 italic">No direct boards configured.</div>`;
        }
        return this.jobBoards.map(b => `
            <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-darkborder/50 transition-colors border border-transparent dark:hover:border-darkborder group">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full ${b.is_active ? 'bg-emerald-400' : 'bg-gray-300'}"></span>
                        ${escapeHtml(b.name)}
                    </div>
                    <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate" title="${escapeHtml(b.url)}">
                        <a href="${escapeHtml(b.url)}" target="_blank" class="hover:underline">${escapeHtml(b.url)}</a>
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <label class="relative inline-flex items-center cursor-pointer" title="${b.is_active ? 'Pause Board' : 'Resume Board'}">
                        <input type="checkbox" class="sr-only peer" ${b.is_active ? 'checked' : ''} onchange="JobsView.toggleBoardActivity(${b.id}, this.checked)">
                        <div class="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                    <button onclick="JobsView.showEditBoardModal(${b.id})" class="text-brand-500 hover:text-brand-600 p-1" title="Edit Board">
                        <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="JobsView.deleteBoard(${b.id})" class="text-red-400 hover:text-red-600 p-1" title="Delete Board">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    showAddBoardModal() {
        showModal(`
            <div class="px-6 py-5 border-b border-gray-100 dark:border-darkborder/50 flex justify-between items-center">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="globe" class="w-5 h-5 text-brand-500"></i>
                    New Job Board
                </h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <form id="job-board-form" class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Board Name</label>
                    <input type="text" id="jb-name" required placeholder="e.g., Anthropic Careers" 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Target URL</label>
                    <input type="url" id="jb-url" required placeholder="e.g., https://boards.greenhouse.io/anthropic" 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                    <p class="text-[10px] text-gray-500 mt-1">The scraper will visit this link and extract all job postings it finds.</p>
                </div>
                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkborder rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-colors">Save Board</button>
                </div>
            </form>
        `);

        document.getElementById('job-board-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('jb-name').value;
            const url = document.getElementById('jb-url').value;
            
            try {
                await API.createJobBoard({ name, url, is_active: true });
                closeModal();
                showToast('Job board saved successfully', 'success');
                this.render();
            } catch (err) {
                showToast('Failed to save board', 'error');
            }
        });
        lucide.createIcons();
    },

    showEditBoardModal(id) {
        const board = this.jobBoards.find(b => b.id === id);
        if (!board) return;

        showModal(`
            <div class="px-6 py-5 border-b border-gray-100 dark:border-darkborder/50 flex justify-between items-center">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="edit-2" class="w-5 h-5 text-brand-500"></i>
                    Edit Job Board
                </h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <form id="edit-job-board-form" class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Board Name</label>
                    <input type="text" id="edit-jb-name" value="${escapeHtml(board.name)}" required 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Target URL</label>
                    <input type="url" id="edit-jb-url" value="${escapeHtml(board.url)}" required 
                           class="w-full px-3 py-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkborder rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-gray-100 transition-all font-medium" />
                </div>
                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkborder rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-colors">Save Changes</button>
                </div>
            </form>
        `);

        document.getElementById('edit-job-board-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-jb-name').value;
            const url = document.getElementById('edit-jb-url').value;
            
            try {
                await API.updateJobBoard(id, { name, url });
                closeModal();
                showToast('Job board updated successfully', 'success');
                this.render();
            } catch (err) {
                showToast('Failed to update board', 'error');
            }
        });
        lucide.createIcons();
    },

    async toggleBoardActivity(id, isActive) {
        try {
            await API.updateJobBoard(id, { is_active: isActive });
            showToast(isActive ? 'Board resumed' : 'Board paused', 'success');
            this.render();
        } catch (err) {
            showToast('Failed to toggle board: ' + err.message, 'error');
        }
    },

    deleteBoard(id) {
        showConfirm('Remove this job board from the scraper? Existing job listings will NOT be deleted.', async () => {
            try {
                await API.deleteJobBoard(id);
                showToast('Job board deleted', 'success');
                this.render();
            } catch (e) {
                showToast('Failed to delete board', 'error');
            }
        });
    }
};
