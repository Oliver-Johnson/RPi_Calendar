const AgencyView = {
    render: function() {
        const container = document.getElementById('view-agency');
        if (!container) return;

        container.innerHTML = `
            <div class="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div class="mb-8 flex items-center justify-between">
                    <div>
                        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Business Checklist: Ipswich AI Web Agency</h2>
                        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Launch sequence for an agentic AI-powered digital transformation agency.</p>
                    </div>
                    <div class="p-3 rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400">
                        <i data-lucide="rocket" class="w-8 h-8"></i>
                    </div>
                </div>

                <div class="space-y-8">
                    <!-- Legal & Compliance -->
                    <section class="bg-white dark:bg-darkpanel rounded-2xl p-6 border border-gray-200/50 dark:border-darkborder/50 shadow-sm">
                        <div class="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
                            <i data-lucide="scale" class="w-5 h-5"></i>
                            <h3 class="text-lg font-bold">Legal & Compliance</h3>
                        </div>
                        <div class="space-y-4">
                            ${this.renderChecklistItem('Incorporate Limited Company', 'Register via Companies House (£100 one-off fee).')}
                            ${this.renderChecklistItem('Select SIC Codes', 'Use 62012 (Software development) and 73110 (Advertising agencies).')}
                            ${this.renderChecklistItem('Ipswich Registered Office', 'Secure virtual address at 50 Princes Street (IP1) for central presence.')}
                            ${this.renderChecklistItem('ICO Registration', 'Pay Tier 1 fee of £47/yr (Direct Debit) before processing lead data.')}
                            ${this.renderChecklistItem('KYC Verification', 'Identity checks (photo ID + utility bill) for virtual office and banking.')}
                        </div>
                    </section>

                    <!-- Financial Infrastructure -->
                    <section class="bg-white dark:bg-darkpanel rounded-2xl p-6 border border-gray-200/50 dark:border-darkborder/50 shadow-sm">
                        <div class="flex items-center gap-2 mb-6 text-emerald-600 dark:text-emerald-400">
                            <i data-lucide="banknote" class="w-5 h-5"></i>
                            <h3 class="text-lg font-bold">Financial Infrastructure</h3>
                        </div>
                        <div class="space-y-4">
                            ${this.renderChecklistItem('Business Bank Account', 'Open fee-free account (Starling, Monzo Business Lite, or Tide).')}
                            ${this.renderChecklistItem('Professional Indemnity Insurance', 'Purchase cover (approx. £7–£15/month) against negligence claims.')}
                            ${this.renderChecklistItem('HMRC Registration', 'Register for Corporation Tax within 3 months; prepare for MTD 2026/27.')}
                        </div>
                    </section>

                    <!-- AI Tech Stack Setup -->
                    <section class="bg-white dark:bg-darkpanel rounded-2xl p-6 border border-gray-200/50 dark:border-darkborder/50 shadow-sm">
                        <div class="flex items-center gap-2 mb-6 text-brand-600 dark:text-brand-400">
                            <i data-lucide="cpu" class="w-5 h-5"></i>
                            <h3 class="text-lg font-bold">AI Tech Stack Setup</h3>
                        </div>
                        <div class="space-y-4">
                            ${this.renderChecklistItem('Lead Generation', 'Setup Scrap.io for "website: null" listings in Ipswich.')}
                            ${this.renderChecklistItem('Orchestration Engine', 'Configure self-hosted n8n for data sovereignty and agentic loops.')}
                            ${this.renderChecklistItem('Cold Outreach', 'Setup Instantly.ai with alternate domains and 3-week warmup.')}
                            ${this.renderChecklistItem('Production Pipeline', 'Purchase 10Web Agency plan for white-labeled WordPress sites.')}
                            ${this.renderChecklistItem('Client Management', 'Deploy GoHighLevel for CRM, portal, and automated billing.')}
                        </div>
                    </section>

                    <!-- Market Launch & Strategy -->
                    <section class="bg-white dark:bg-darkpanel rounded-2xl p-6 border border-gray-200/50 dark:border-darkborder/50 shadow-sm">
                        <div class="flex items-center gap-2 mb-6 text-amber-600 dark:text-amber-400">
                            <i data-lucide="map-pin" class="w-5 h-5"></i>
                            <h3 class="text-lg font-bold">Market Launch & Strategy</h3>
                        </div>
                        <div class="space-y-4">
                            ${this.renderChecklistItem('Grant Positioning', 'Align Tier 3 offer (£5k+) with Suffolk Economy Grant criteria.')}
                            ${this.renderChecklistItem('Local Networking', 'Arcade Tavern "Powered Up Business" (2nd to last Thursday monthly).')}
                            ${this.renderChecklistItem('Service Agreement', 'Clarify client owns site code (WordPress) even after cancellation.')}
                        </div>
                    </section>
                </div>
            </div>
        `;

        lucide.createIcons();
    },

    renderChecklistItem: function(label, description) {
        const id = 'agency-' + label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
        // Persist state in localStorage
        const isChecked = localStorage.getItem(id) === 'true';

        return `
            <label class="flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-darkborder/50 cursor-pointer transition-all group border border-transparent hover:border-gray-200 dark:hover:border-darkborder">
                <div class="mt-0.5">
                    <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''} 
                           class="agency-checkbox w-5 h-5 rounded-md border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500 transition-colors"
                           onchange="localStorage.setItem('${id}', this.checked)">
                </div>
                <div>
                    <span class="block text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors capitalize">${escapeHtml(label)}</span>
                    <span class="block text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(description)}</span>
                </div>
            </label>
        `;
    }
};
