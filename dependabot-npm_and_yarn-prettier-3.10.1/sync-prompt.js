// sync-prompt.js
// Owns the persistent sign-in prompt state and storage behavior.

export const SYNC_PROMPT_DISMISSED_KEY = 'syncPromptDismissedV1';

function getLocalStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch (_) {
        return null;
    }
}

function isSyncPromptComplete(storage = getLocalStorage()) {
    try {
        return storage?.getItem(SYNC_PROMPT_DISMISSED_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function persistSyncPromptCompletion(storage = getLocalStorage()) {
    try {
        storage?.setItem(SYNC_PROMPT_DISMISSED_KEY, '1');
        return true;
    } catch (_) {
        return false;
    }
}

export function hideSyncPrompt(app) {
    if (!app?.syncPrompt) return false;
    app.syncPrompt.hidden = true;
    return true;
}

export function maybeShowSyncPrompt(app, storage = getLocalStorage()) {
    if (!app?.syncPrompt) return false;

    if (app.currentUser || isSyncPromptComplete(storage)) {
        hideSyncPrompt(app);
        return false;
    }

    app.syncPrompt.hidden = false;
    return true;
}

export function dismissSyncPrompt(app, storage = getLocalStorage()) {
    persistSyncPromptCompletion(storage);
    return hideSyncPrompt(app);
}

export function completeSyncPrompt(app, storage = getLocalStorage()) {
    persistSyncPromptCompletion(storage);
    return hideSyncPrompt(app);
}

export function openSyncPromptLogin(app) {
    hideSyncPrompt(app);

    if (!app?.loginModal || typeof app.openModal !== 'function') {
        return false;
    }

    app.openModal(app.loginModal);
    return true;
}
