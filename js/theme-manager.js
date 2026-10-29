/** Appearance selection. Annotation swatch colors remain project data. */
const ThemeManager = {
    key: 'annotateAppearance',
    legacyKey: 'annotateTheme',
    choices: new Set(['light', 'dark', 'system']),
    media: null,

    saved() {
        try {
            const mode = localStorage.getItem(this.key);
            if (this.choices.has(mode)) return mode;
            const legacy = localStorage.getItem(this.legacyKey);
            if (legacy === 'paper') return 'light';
            if (['tide', 'dusk', 'amber'].includes(legacy)) return 'dark';
        } catch (_) { /* Storage can be unavailable. */ }
        return 'system';
    },

    current() {
        const mode = document.documentElement.dataset.appearance;
        return this.choices.has(mode) ? mode : this.saved();
    },

    apply(mode, persist = false) {
        if (!this.choices.has(mode)) return;
        const resolved = mode === 'system' ? (this.media?.matches ? 'dark' : 'light') : mode;
        const root = document.documentElement;
        root.dataset.appearance = mode;
        root.dataset.theme = resolved;
        root.classList.toggle('dark', resolved === 'dark');
        document.querySelectorAll('[data-theme-choice]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.themeChoice === mode));
        });
        if (persist) {
            try { localStorage.setItem(this.key, mode); } catch (_) { /* Storage can be unavailable. */ }
        }
    },

    bootstrap() {
        this.media = window.matchMedia?.('(prefers-color-scheme: dark)') || null;
        this.apply(this.saved());
        if (this.media) {
            const update = () => { if (this.current() === 'system') this.apply('system'); };
            if (this.media.addEventListener) this.media.addEventListener('change', update);
            else this.media.addListener?.(update);
        }
    },

    initSettings() {
        this.apply(this.current());
        document.querySelectorAll('[data-theme-choice]').forEach(button => {
            button.addEventListener('click', () => this.apply(button.dataset.themeChoice, true));
        });
    }
};

ThemeManager.bootstrap();
