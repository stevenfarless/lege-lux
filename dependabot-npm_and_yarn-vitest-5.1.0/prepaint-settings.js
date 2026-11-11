// prepaint-settings.js

(function () {
    var root = document.documentElement;
    var systemLightQuery = window.matchMedia('(prefers-color-scheme: light)');
    var DEFAULT_COLOR_THEME = 'vespers';
    var OPTIONAL_FONT_CSS_ID = 'optional-font-faces';
    var GEEK_THEME_CSS_ID = 'geek-theme-css';
    var THEME_CLASSES = [
        'lux-theme', 'vespers-theme', 'vigil-theme',
        'dracula-theme', 'dracula2test-theme', 'onyx-theme',
        'sage-theme', 'ember-theme', 'perplexity-theme',
        'basic-theme', 'geek-theme', 'gnome-theme', 'uxorem-amo-theme'
    ];
    var VALID_THEMES = {
        dracula: 1,
        dracula2test: 1,
        onyx: 1,
        sage: 1,
        ember: 1,
        perplexity: 1,
        basic: 1,
        geek: 1,
        gnome: 1,
        lux: 1,
        vespers: 1,
        vigil: 1,
        'uxorem-amo': 1
    };

    function get(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function set(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (_) { }
    }

    function applyStartupTheme() {
        var theme = get('colorTheme') || DEFAULT_COLOR_THEME;
        if (!VALID_THEMES[theme]) theme = DEFAULT_COLOR_THEME;
        if (theme === 'geek') ensureGeekThemeCss();

        root.classList.remove.apply(root.classList, THEME_CLASSES);
        root.classList.add(theme + '-theme', 'no-color-transition');

        if (document.body) {
            document.body.classList.remove.apply(document.body.classList, THEME_CLASSES);
            document.body.classList.add(theme + '-theme', 'no-color-transition');
        }
    }

    function mirrorStartupClassesToBody() {
        if (!document.body) return;
        THEME_CLASSES.forEach(function (className) {
            document.body.classList.toggle(className, root.classList.contains(className));
        });
        document.body.classList.toggle('light-mode', root.classList.contains('light-mode'));
        document.body.classList.add('no-color-transition');
    }

    function ensureOptionalFontFaces() {
        if (document.getElementById(OPTIONAL_FONT_CSS_ID)) return;

        var link = document.createElement('link');
        link.id = OPTIONAL_FONT_CSS_ID;
        link.rel = 'stylesheet';
        link.href = './css/optional-fonts.css';
        document.head.appendChild(link);
    }

    function ensureGeekThemeCss() {
        if (document.getElementById(GEEK_THEME_CSS_ID)) return;

        var link = document.createElement('link');
        link.id = GEEK_THEME_CSS_ID;
        link.rel = 'stylesheet';
        link.href = './css/geek95.css';
        document.head.appendChild(link);
    }

    applyStartupTheme();

    var fontFiles = {
        gentium: ['./fonts/GentiumBookPlus-Regular.woff2', 'font/woff2'],
        andika: ['./fonts/Andika-Regular.woff2', 'font/woff2'],
        ubuntu: ['./fonts/Ubuntu-Regular.woff2', 'font/woff2'],
        opendyslexic3: ['./fonts/OpenDyslexic3-Regular.woff2', 'font/woff2'],
        'ia-quattro': ['./fonts/iAWriterQuattroS-Regular.woff2', 'font/woff2'],
        adwaitasans: ['./fonts/AdwaitaSans-Regular.woff2', 'font/woff2']
    };
    var activeFont = get('readingFont') || 'gentium';
    var activeFontFile = fontFiles[activeFont];
    if (activeFont !== 'gentium') ensureOptionalFontFaces();
    if (activeFontFile) {
        var fontPreload = document.createElement('link');
        fontPreload.rel = 'preload';
        fontPreload.as = 'font';
        fontPreload.href = activeFontFile[0];
        fontPreload.type = activeFontFile[1];
        fontPreload.crossOrigin = 'anonymous';
        document.head.appendChild(fontPreload);
    }

    function readBool(key, fallback) {
        var value = get(key);
        if (value === 'true') return true;
        if (value === 'false') return false;
        return fallback;
    }

    function readLightMode() {
        var value = get('lightMode');
        return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    }

    function applyLightMode(mode) {
        var light = mode === 'light' || (mode === 'system' && systemLightQuery.matches);
        root.classList.toggle('light-mode', light);
        if (document.body) document.body.classList.toggle('light-mode', light);
    }

    function installVerseSelectionSuppression() {
        var style = document.createElement('style');
        style.textContent = '.passage-text .verse,.passage-text .verse *{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent!important;}';
        document.head.appendChild(style);
    }

    function redactDebugReportText(text) {
        if (typeof text !== 'string') return text;
        return text.replace(
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
            '[redacted-email]'
        );
    }

    function installDebugReportEmailRedaction() {
        var assignedReportBuilder;

        try {
            Object.defineProperty(window, '_buildDebugReport', {
                configurable: true,
                get: function () { return assignedReportBuilder; },
                set: function (fn) {
                    assignedReportBuilder = typeof fn === 'function'
                        ? function () { return redactDebugReportText(fn.apply(this, arguments)); }
                        : fn;
                }
            });
        } catch (_) { }

        function redactDebugPanel() {
            var panel = document.getElementById('debugPanel');
            var box = panel && panel.firstElementChild && panel.firstElementChild.firstElementChild;
            if (!box) return;

            var redacted = redactDebugReportText(box.textContent || '');
            if (redacted !== box.textContent) box.textContent = redacted;
        }

        document.addEventListener('DOMContentLoaded', function () {
            if (!document.body || !('MutationObserver' in window)) return;

            var observer = new MutationObserver(redactDebugPanel);
            observer.observe(document.body, {
                childList: true,
                characterData: true,
                subtree: true
            });
        });
    }

    if (!readBool('showVerseNumbers', true)) root.classList.add('hide-verse-numbers');
    if (!readBool('coloredVerseNumbers', true)) root.classList.add('muted-verse-numbers');
    if (!readBool('showChapterArrows', false)) root.classList.add('hide-chapter-arrows');
    if (readBool('verseByVerse', false)) root.classList.add('verse-by-verse-enabled');

    var fontClasses = {
        andika: 'font-andika',
        ubuntu: 'font-ubuntu',
        opendyslexic3: 'font-opendyslexic3',
        retrocide: 'font-retrocide',
        'ia-quattro': 'font-ia-quattro',
        adwaitasans: 'font-adwaitasans'
    };
    var fontClass = fontClasses[get('readingFont') || 'gentium'];
    if (fontClass) root.classList.add(fontClass);

    var size = parseInt(get('fontSize') || '20', 10);
    root.style.setProperty('--startup-passage-font-size', Number.isFinite(size) ? size + 'px' : '20px');

    applyLightMode(readLightMode());
    installVerseSelectionSuppression();
    installDebugReportEmailRedaction();

    document.addEventListener('DOMContentLoaded', function () {
        applyStartupTheme();
        mirrorStartupClassesToBody();
        applyLightMode(readLightMode());

        var settingsButton = document.getElementById('settingsBtn');
        if (settingsButton) {
            settingsButton.addEventListener('click', ensureOptionalFontFaces, { once: true });
        }

        var readingFontSelector = document.getElementById('readingFontSelector');
        if (readingFontSelector) {
            readingFontSelector.addEventListener('focus', ensureOptionalFontFaces, { once: true });
            readingFontSelector.addEventListener('pointerdown', ensureOptionalFontFaces, { once: true });
        }

        var radios = document.querySelectorAll('input[name="lightMode"]');
        if (!radios.length) return;

        function syncLightModeRadios(mode) {
            for (var i = 0; i < radios.length; i += 1) {
                radios[i].checked = radios[i].value === mode;
            }
        }

        syncLightModeRadios(readLightMode());

        function updateFromRadio(event) {
            var radio = event.currentTarget;
            if (!radio.checked) return;

            var mode = radio.value === 'light' || radio.value === 'dark' || radio.value === 'system'
                ? radio.value
                : 'system';

            set('lightMode', mode);
            applyLightMode(mode);
        }

        for (var i = 0; i < radios.length; i += 1) {
            radios[i].addEventListener('change', updateFromRadio);
        }
    });

    systemLightQuery.addEventListener('change', function () {
        if (readLightMode() === 'system') applyLightMode('system');
    });
}());
