const NotesView = (() => {
    let notes = [];
    let activeId = null;
    let saveTimer = null;
    let initialized = false;

    function container() {
        return document.getElementById('view-notes');
    }

    function render() {
        const el = container();
        el.innerHTML = `
            <div class="flex h-full">
                <!-- Note list -->
                <div id="notes-list-panel" class="w-64 shrink-0 border-r border-gray-200 dark:border-darkborder flex flex-col bg-white dark:bg-darkpanel overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-darkborder">
                        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Notes</span>
                        <button id="notes-new-btn" class="p-1 rounded-lg text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-darkborder transition-colors" title="New note">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                        </button>
                    </div>
                    <div id="notes-list" class="flex-1 overflow-y-auto"></div>
                </div>

                <!-- Editor -->
                <div id="notes-editor-panel" class="flex-1 flex flex-col min-w-0 bg-white dark:bg-darkbg overflow-hidden">
                    <div id="notes-empty" class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
                        <div class="text-center">
                            <i data-lucide="notebook-pen" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
                            <p class="text-sm">Select a note or create a new one</p>
                        </div>
                    </div>
                    <div id="notes-editor" class="hidden flex-1 flex flex-col min-h-0">
                        <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-darkborder">
                            <input id="notes-title-input" type="text" placeholder="Note title"
                                   class="flex-1 text-lg font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400">
                            <span id="notes-save-indicator" class="text-xs text-gray-400 dark:text-gray-600 hidden">Saving…</span>
                            <button id="notes-delete-btn" class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete note">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <textarea id="notes-content-input" placeholder="Start typing…"
                                  class="flex-1 w-full px-5 py-4 bg-transparent border-none outline-none resize-none text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-mono"></textarea>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();

        document.getElementById('notes-new-btn').addEventListener('click', newNote);
        document.getElementById('notes-title-input').addEventListener('input', scheduleSave);
        document.getElementById('notes-content-input').addEventListener('input', scheduleSave);
        document.getElementById('notes-delete-btn').addEventListener('click', deleteActive);

        loadList();
    }

    async function loadList() {
        try {
            notes = await API.getNotes();
        } catch (e) {
            notes = [];
        }
        renderList();
    }

    function renderList() {
        const list = document.getElementById('notes-list');
        if (!list) return;
        if (!notes.length) {
            list.innerHTML = `<p class="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">No notes yet</p>`;
            return;
        }
        list.innerHTML = notes.map(n => `
            <button data-note-id="${n.id}"
                    class="note-list-item w-full text-left px-4 py-3 border-b border-gray-100 dark:border-darkborder hover:bg-gray-50 dark:hover:bg-darkborder transition-colors ${activeId === n.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}">
                <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">${escapeHtml(n.title)}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">${escapeHtml(n.snippet || '')}</div>
            </button>
        `).join('');
        list.querySelectorAll('.note-list-item').forEach(btn => {
            btn.addEventListener('click', () => openNote(parseInt(btn.dataset.noteId)));
        });
    }

    async function openNote(id) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await flushSave(); }
        activeId = id;
        renderList();
        try {
            const note = await API.getNote(id);
            showEditor(note);
        } catch (e) {
            showToast('Failed to load note', 'error');
        }
    }

    function showEditor(note) {
        document.getElementById('notes-empty').classList.add('hidden');
        const editor = document.getElementById('notes-editor');
        editor.classList.remove('hidden');
        editor.classList.add('flex');
        document.getElementById('notes-title-input').value = note.title;
        document.getElementById('notes-content-input').value = note.content || '';
    }

    async function newNote() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await flushSave(); }
        try {
            const note = await API.createNote({ title: 'Untitled', content: '' });
            notes.unshift({ id: note.id, title: note.title, snippet: '', updated_at: note.updated_at });
            activeId = note.id;
            renderList();
            showEditor(note);
            document.getElementById('notes-title-input').focus();
            document.getElementById('notes-title-input').select();
        } catch (e) {
            showToast('Failed to create note', 'error');
        }
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        const indicator = document.getElementById('notes-save-indicator');
        if (indicator) indicator.classList.remove('hidden');
        saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, 2000);
    }

    async function flushSave() {
        if (!activeId) return;
        const titleEl = document.getElementById('notes-title-input');
        const contentEl = document.getElementById('notes-content-input');
        if (!titleEl || !contentEl) return;
        try {
            const updated = await API.updateNote(activeId, {
                title: titleEl.value || 'Untitled',
                content: contentEl.value,
            });
            // Update local list entry
            const idx = notes.findIndex(n => n.id === activeId);
            if (idx !== -1) {
                notes[idx].title = updated.title;
                notes[idx].snippet = (updated.content || '').substring(0, 100).replace(/\n/g, ' ');
                notes[idx].updated_at = updated.updated_at;
                renderList();
            }
        } catch (e) {
            showToast('Failed to save note', 'error');
        } finally {
            const indicator = document.getElementById('notes-save-indicator');
            if (indicator) indicator.classList.add('hidden');
        }
    }

    function deleteActive() {
        if (!activeId) return;
        const note = notes.find(n => n.id === activeId);
        showConfirm(
            `Delete "${escapeHtml(note ? note.title : 'this note')}"? This cannot be undone.`,
            async () => {
                try {
                    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
                    await API.deleteNote(activeId);
                    notes = notes.filter(n => n.id !== activeId);
                    activeId = null;
                    renderList();
                    document.getElementById('notes-empty').classList.remove('hidden');
                    const editor = document.getElementById('notes-editor');
                    if (editor) { editor.classList.add('hidden'); editor.classList.remove('flex'); }
                    showToast('Note deleted', 'info');
                } catch (e) {
                    showToast('Failed to delete note', 'error');
                }
            }
        );
    }

    function init() {
        if (!initialized) {
            initialized = true;
        }
        render();
    }

    return { init };
})();
