const DISMISSED_UNTIL_KEY = 'installPromptDismissedUntilV1';
const INSTALLED_KEY = 'installPromptInstalledV1';

const DISMISS_DAYS = 30;
const SHOW_DELAY_MS = 2500;
const MODAL_RETRY_MS = 1500;

let deferredInstallPrompt = null;
let promptShownThisSession = false;
let initialized = false;
let showTimer = null;
let lastFocusedElement = null;

function now() {
    return Date.now();
}

function getStoredNumber(key, fallback = 0) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
    } catch (_) {
        return fallback;
    }
}

function getStoredValue(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
}

function setStoredValue(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { }
}

function markReady() {
    if (!document.body.hasAttribute('data-beforeinstallprompt-fired')) {
        document.body.setAttribute('data-beforeinstallprompt-fired', 'false');
    }
    if (!document.body.hasAttribute('data-install-prompt-native-available')) {
        document.body.setAttribute('data-install-prompt-native-available', 'false');
    }
    if (!document.body.hasAttribute('data-install-prompt-visible')) {
        document.body.setAttribute('data-install-prompt-visible', 'false');
    }
    document.body.setAttribute('data-install-prompt-ready', 'true');
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

function isIosSafari() {
    const ua = window.navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isIos && isSafari;
}

function isDismissed() {
    return getStoredNumber(DISMISSED_UNTIL_KEY) > now();
}

function dismissForCooldown() {
    setStoredValue(DISMISSED_UNTIL_KEY, now() + DISMISS_DAYS * 24 * 60 * 60 * 1000);
}

function hasInstallPath() {
    return Boolean(deferredInstallPrompt) || isIosSafari();
}

function hasBlockingUi() {
    return Boolean(
        document.querySelector('.modal.active') ||
        document.querySelector('.search-container.active')
    );
}

function shouldShowPrompt() {
    if (promptShownThisSession) return false;
    if (isStandalone()) return false;
    if (getStoredValue(INSTALLED_KEY) === 'true') return false;
    if (isDismissed()) return false;
    return hasInstallPath();
}

function getElements() {
    return {
        prompt: document.getElementById('installPrompt'),
        install: document.getElementById('installPromptInstall'),
        later: document.getElementById('installPromptLater'),
        iosSteps: document.getElementById('iosInstallSteps'),
    };
}

function hidePrompt() {
    const { prompt } = getElements();
    if (!prompt) return;

    prompt.hidden = true;
    prompt.setAttribute('aria-hidden', 'true');
    document.body.setAttribute('data-install-prompt-visible', 'false');

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus({ preventScroll: true });
    }
    lastFocusedElement = null;
}

function showPrompt() {
    showTimer = null;
    if (!shouldShowPrompt()) return;

    if (hasBlockingUi()) {
        schedulePrompt(MODAL_RETRY_MS);
        return;
    }

    const { prompt, install, iosSteps } = getElements();
    if (!prompt || !install || !iosSteps) return;

    const ios = isIosSafari();
    promptShownThisSession = true;
    lastFocusedElement = document.activeElement;

    iosSteps.hidden = !ios;
    install.textContent = ios ? 'Got it' : 'Install';

    prompt.hidden = false;
    prompt.setAttribute('aria-hidden', 'false');
    document.body.setAttribute('data-install-prompt-visible', 'true');
    install.focus({ preventScroll: true });
}

function schedulePrompt(delay = SHOW_DELAY_MS) {
    if (showTimer) return;
    showTimer = window.setTimeout(showPrompt, delay);
}

function handleBeforeInstallPrompt(event) {
    document.body.setAttribute('data-beforeinstallprompt-fired', 'true');
    document.body.setAttribute('data-install-prompt-native-available', 'true');
    event.preventDefault();
    deferredInstallPrompt = event;

    if (initialized) schedulePrompt();
}

window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

async function installApp() {
    if (isIosSafari()) {
        dismissForCooldown();
        hidePrompt();
        return;
    }

    if (!deferredInstallPrompt) return;

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    document.body.setAttribute('data-install-prompt-native-available', 'false');

    try {
        promptEvent.prompt();
        const result = await promptEvent.userChoice;

        if (result?.outcome === 'accepted') {
            setStoredValue(INSTALLED_KEY, 'true');
        } else {
            dismissForCooldown();
        }
    } finally {
        hidePrompt();
    }
}

function dismissPrompt() {
    dismissForCooldown();
    hidePrompt();
}

function wireDomEvents() {
    const { prompt, install, later } = getElements();

    install?.addEventListener('click', installApp);
    later?.addEventListener('click', dismissPrompt);

    prompt?.addEventListener('click', (event) => {
        if (event.target === prompt) dismissPrompt();
    });

    document.addEventListener('keydown', (event) => {
        const { prompt } = getElements();
        if (event.key === 'Escape' && prompt && !prompt.hidden) dismissPrompt();
    });
}

export function initInstallPrompt() {
    if (initialized) return;
    initialized = true;

    if (isStandalone()) {
        setStoredValue(INSTALLED_KEY, 'true');
        markReady();
        return;
    }

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        document.body.setAttribute('data-install-prompt-native-available', 'false');
        document.body.setAttribute('data-install-prompt-visible', 'false');
        setStoredValue(INSTALLED_KEY, 'true');
        hidePrompt();
    });

    wireDomEvents();
    markReady();

    if (hasInstallPath() || isIosSafari()) schedulePrompt();
}
