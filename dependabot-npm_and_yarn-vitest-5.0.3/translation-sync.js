// translation-sync.js
// Synchronizes the user's desired translation library while keeping Bible files device-local.

import {
    LOCAL_TRANSLATIONS,
    PRECACHED_TRANSLATIONS,
} from './bible-api.js';
import {
    idbDeleteTranslation,
    idbGetBook,
    idbIsDownloaded,
} from './translation-store.js';

export const BUILT_IN_TRANSLATIONS = new Set(PRECACHED_TRANSLATIONS);

const PENDING_ADDS_KEY = 'translationLibraryPendingAddsV1';
const NOT_NOW_KEY = 'translationSyncNotNowV1';

export function normalizeTranslationId(value) {
    return String(value || '').trim().toUpperCase();
}

export function isBuiltInTranslation(translation) {
    return BUILT_IN_TRANSLATIONS.has(normalizeTranslationId(translation));
}

export function chooseDeviceTranslation({
    preferred,
    active,
    available,
    fallback = 'KJV',
}) {
    const normalizedPreferred = normalizeTranslationId(preferred || 'KJV');
    const normalizedActive = normalizeTranslationId(active || normalizedPreferred);
    const normalizedFallback = BUILT_IN_TRANSLATIONS.has(normalizeTranslationId(fallback))
        ? normalizeTranslationId(fallback)
        : 'KJV';
    const isAvailable = (translation) => (
        BUILT_IN_TRANSLATIONS.has(translation) || available.has(translation)
    );

    if (isAvailable(normalizedPreferred)) {
        return {
            active: normalizedPreferred,
            pendingPreferred: null,
        };
    }

    return {
        active: isAvailable(normalizedActive) && normalizedActive !== normalizedPreferred
            ? normalizedActive
            : normalizedFallback,
        pendingPreferred: normalizedPreferred,
    };
}

function readJsonStorage(storage, key, fallback) {
    try {
        const raw = storage?.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeJsonStorage(storage, key, value) {
    try {
        storage?.setItem(key, JSON.stringify(value));
        return true;
    } catch (_) {
        return false;
    }
}

function removeStorage(storage, key) {
    try { storage?.removeItem(key); } catch (_) { }
}

function getFallbackPreference() {
    try {
        const stored = localStorage.getItem('translationFallback');
        if (BUILT_IN_TRANSLATIONS.has(stored)) return stored;
    } catch (_) { }
    return 'KJV';
}

function setActiveTranslationWithoutLoading(app, translation) {
    app.state.translation = translation;
    app.bibleApi.setTranslation(translation);

    try { localStorage.setItem('translation', translation); } catch (_) { }

    if (app.currentTranslationSpan) {
        app.currentTranslationSpan.textContent = translation;
    }
}

function readPendingAdds() {
    const values = readJsonStorage(localStorage, PENDING_ADDS_KEY, []);
    if (!Array.isArray(values)) return new Set();

    return new Set(values
        .map(normalizeTranslationId)
        .filter((translation) => (
            translation && !BUILT_IN_TRANSLATIONS.has(translation)
        )));
}

function writePendingAdds(values) {
    if (values.size === 0) {
        removeStorage(localStorage, PENDING_ADDS_KEY);
        return;
    }
    writeJsonStorage(localStorage, PENDING_ADDS_KEY, [...values].sort());
}

function rememberPendingAdd(translation) {
    if (!translation || BUILT_IN_TRANSLATIONS.has(translation)) return;
    const values = readPendingAdds();
    values.add(translation);
    writePendingAdds(values);
}

function forgetPendingAdd(translation) {
    const values = readPendingAdds();
    values.delete(translation);
    writePendingAdds(values);
}

function getPromptTranslations(app) {
    const translations = new Set(app.missingSyncedTranslations || []);

    if (
        app.pendingPreferredTranslation &&
        !BUILT_IN_TRANSLATIONS.has(app.pendingPreferredTranslation)
    ) {
        translations.add(app.pendingPreferredTranslation);
    }

    return [...translations].sort();
}

function getPromptFingerprint(app) {
    return getPromptTranslations(app).join(',');
}

function wasDismissedForSession(app) {
    const fingerprint = getPromptFingerprint(app);
    if (!fingerprint) return false;

    try {
        return sessionStorage.getItem(NOT_NOW_KEY) === fingerprint;
    } catch (_) {
        return false;
    }
}

export function dismissTranslationSyncForSession(app) {
    const fingerprint = getPromptFingerprint(app);
    if (!fingerprint) return false;

    try {
        sessionStorage.setItem(NOT_NOW_KEY, fingerprint);
        return true;
    } catch (_) {
        return false;
    }
}

function clearSessionDismissal() {
    removeStorage(sessionStorage, NOT_NOW_KEY);
}

async function fetchTranslationBookList(translation) {
    const response = await fetch(
        `./translations/${encodeURIComponent(translation)}/meta.json`
    );

    if (!response.ok) {
        throw new Error(`Unable to load ${translation} metadata`);
    }

    const meta = await response.json();
    if (!Array.isArray(meta?.books) || meta.books.length === 0) {
        throw new Error(`${translation} has no book list`);
    }

    return meta.books.map((book) => book.name);
}

export async function isTranslationAvailableOnDevice(translation) {
    const normalized = normalizeTranslationId(translation);
    if (!normalized) return false;
    if (BUILT_IN_TRANSLATIONS.has(normalized)) return true;
    if (!(await idbIsDownloaded(normalized))) return false;

    const genesis = await idbGetBook(normalized, 'Genesis');
    if (genesis !== null) return true;

    await idbDeleteTranslation(normalized);
    return false;
}

export async function refreshMissingSyncedTranslations(app) {
    const missing = [];

    for (const translation of app.syncedTranslationLibrary || []) {
        if (BUILT_IN_TRANSLATIONS.has(translation)) continue;
        if (!(await isTranslationAvailableOnDevice(translation))) {
            missing.push(translation);
        }
    }

    app.missingSyncedTranslations = missing.sort();
    return app.missingSyncedTranslations;
}

async function collectAvailableTranslations() {
    const available = new Set(BUILT_IN_TRANSLATIONS);

    for (const translation of LOCAL_TRANSLATIONS) {
        if (BUILT_IN_TRANSLATIONS.has(translation)) continue;
        if (await isTranslationAvailableOnDevice(translation)) {
            available.add(translation);
        }
    }

    return available;
}

async function seedFirstLibrary(app, preferredTranslation) {
    const library = new Set();

    for (const translation of LOCAL_TRANSLATIONS) {
        if (BUILT_IN_TRANSLATIONS.has(translation)) continue;
        if (await isTranslationAvailableOnDevice(translation)) {
            library.add(translation);
        }
    }

    if (
        preferredTranslation &&
        !BUILT_IN_TRANSLATIONS.has(preferredTranslation)
    ) {
        library.add(preferredTranslation);
    }

    return library;
}

async function writeEntireRemoteLibrary(app, library) {
    if (!app.currentUser || !app.database) return;

    const items = {};
    for (const translation of library) {
        if (!BUILT_IN_TRANSLATIONS.has(translation)) {
            items[translation] = true;
        }
    }

    await app.database
        .ref(`users/${app.currentUser.uid}/translationLibrary`)
        .set({ initialized: true, items });
}

async function applyPreferredTranslationState(app) {
    const available = await collectAvailableTranslations();
    const preferred = normalizeTranslationId(
        app.preferredTranslation || app.state.translation || 'KJV'
    );
    const active = normalizeTranslationId(app.state.translation || preferred);
    const result = chooseDeviceTranslation({
        preferred,
        active,
        available,
        fallback: getFallbackPreference(),
    });

    app.preferredTranslation = preferred;
    app.pendingPreferredTranslation = result.pendingPreferred;

    const activeTranslationChanged = app.state.translation !== result.active;
    if (activeTranslationChanged) {
        setActiveTranslationWithoutLoading(app, result.active);
    }

    return {
        activeTranslationChanged,
        preferredTranslationMissing: Boolean(result.pendingPreferred),
    };
}

export async function prepareLocalTranslation(app) {
    return applyPreferredTranslationState(app);
}

export async function loadSyncedTranslationLibrary(app) {
    const preferred = normalizeTranslationId(
        app.preferredTranslation || app.state.translation || 'KJV'
    );

    if (!app.currentUser || !app.database) {
        const result = await applyPreferredTranslationState(app);
        await refreshMissingSyncedTranslations(app);
        return result;
    }

    let remote = null;
    try {
        const snapshot = await app.database
            .ref(`users/${app.currentUser.uid}/translationLibrary`)
            .once('value');
        remote = snapshot?.val() || null;
    } catch (error) {
        console.error('Failed to load synced translation library', error);
    }

    let library;
    if (remote?.initialized === true) {
        library = new Set(Object.entries(remote.items || {})
            .filter(([, enabled]) => enabled === true)
            .map(([translation]) => normalizeTranslationId(translation))
            .filter((translation) => (
                translation && !BUILT_IN_TRANSLATIONS.has(translation)
            )));
    } else {
        library = await seedFirstLibrary(app, preferred);
        await writeEntireRemoteLibrary(app, library);
    }

    const pendingAdds = readPendingAdds();
    for (const translation of pendingAdds) {
        library.add(translation);
        await app.database
            .ref(
                `users/${app.currentUser.uid}` +
                `/translationLibrary/items/${translation}`
            )
            .set(true);
    }

    if (pendingAdds.size > 0) {
        await app.database
            .ref(
                `users/${app.currentUser.uid}` +
                '/translationLibrary/initialized'
            )
            .set(true);
        removeStorage(localStorage, PENDING_ADDS_KEY);
    }

    if (
        preferred &&
        !BUILT_IN_TRANSLATIONS.has(preferred) &&
        !library.has(preferred)
    ) {
        library.add(preferred);
        await app.database
            .ref(
                `users/${app.currentUser.uid}` +
                `/translationLibrary/items/${preferred}`
            )
            .set(true);
        await app.database
            .ref(
                `users/${app.currentUser.uid}` +
                '/translationLibrary/initialized'
            )
            .set(true);
    }

    app.syncedTranslationLibrary = library;

    const result = await applyPreferredTranslationState(app);
    await refreshMissingSyncedTranslations(app);
    return result;
}

export async function recordTranslationInstalled(app, translation) {
    const normalized = normalizeTranslationId(translation);
    if (!normalized || BUILT_IN_TRANSLATIONS.has(normalized)) return false;

    app.syncedTranslationLibrary?.add(normalized);
    app.missingSyncedTranslations = (app.missingSyncedTranslations || [])
        .filter((item) => item !== normalized);

    if (!app.canWriteRemoteState()) {
        rememberPendingAdd(normalized);
        return true;
    }

    await app.database
        .ref(
            `users/${app.currentUser.uid}` +
            '/translationLibrary/initialized'
        )
        .set(true);
    await app.database
        .ref(
            `users/${app.currentUser.uid}` +
            `/translationLibrary/items/${normalized}`
        )
        .set(true);
    return true;
}

export async function removeTranslationFromSyncedLibrary(app, translation) {
    const normalized = normalizeTranslationId(translation);
    if (!normalized || BUILT_IN_TRANSLATIONS.has(normalized)) return false;

    app.syncedTranslationLibrary?.delete(normalized);
    app.missingSyncedTranslations = (app.missingSyncedTranslations || [])
        .filter((item) => item !== normalized);
    forgetPendingAdd(normalized);

    if (app.canWriteRemoteState()) {
        await app.database
            .ref(
                `users/${app.currentUser.uid}` +
                `/translationLibrary/items/${normalized}`
            )
            .set(null);
    }

    return true;
}

export async function recordTranslationUninstalled(
    app,
    translation,
    { removeFromLibrary = false } = {}
) {
    const normalized = normalizeTranslationId(translation);
    if (!normalized || BUILT_IN_TRANSLATIONS.has(normalized)) return false;

    forgetPendingAdd(normalized);

    if (removeFromLibrary) {
        await removeTranslationFromSyncedLibrary(app, normalized);
    } else {
        app.syncedTranslationLibrary?.add(normalized);
        await refreshMissingSyncedTranslations(app);
        dismissTranslationSyncForSession(app);
    }

    const wasActive = app.state.translation === normalized;
    const wasPreferred = app.preferredTranslation === normalized;

    if (removeFromLibrary && wasPreferred) {
        const fallback = getFallbackPreference();
        app.preferredTranslation = fallback;
        app.pendingPreferredTranslation = null;
        await app.changeTranslation(fallback, { syncPreference: true });
        return true;
    }

    if (wasActive) {
        if (wasPreferred) app.pendingPreferredTranslation = normalized;
        await app.changeTranslation(
            getFallbackPreference(),
            { syncPreference: false }
        );
    }

    return true;
}

function renderTranslationSyncModal(app) {
    const title = app.translationSyncTitle;
    const description = app.translationSyncDescription;
    const list = app.translationSyncList;
    const fallbackActions = app.translationSyncFallbackActions;
    const status = app.translationSyncStatus;

    if (!title || !description || !list || !fallbackActions || !status) {
        return false;
    }

    const translations = getPromptTranslations(app);
    const preferred = app.pendingPreferredTranslation;
    if (translations.length === 0) return false;

    if (preferred) {
        title.textContent = `${preferred} is not installed`;
        description.textContent =
            `${preferred} is your synced reading translation. ` +
            'Download it on this device, or use KJV or BSB for now.';
        fallbackActions.hidden = false;
    } else {
        title.textContent = 'Download your synced translations?';
        description.textContent =
            'These translations are in your synced library but are not ' +
            'installed on this device. Nothing will download until you choose it.';
        fallbackActions.hidden = true;
    }

    list.replaceChildren();

    for (const translation of translations) {
        const label = document.createElement('label');
        label.className = 'translation-sync-choice';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = translation;
        checkbox.checked = true;

        const text = document.createElement('span');
        text.textContent = translation === preferred
            ? `${translation} · preferred`
            : translation;

        label.append(checkbox, text);
        list.appendChild(label);
    }

    status.textContent = '';
    app.translationSyncDownload.disabled = false;
    return true;
}

export function maybeShowTranslationSyncModal(app, { force = false } = {}) {
    const translations = getPromptTranslations(app);
    if (translations.length === 0) return false;
    if (!force && wasDismissedForSession(app)) return false;

    const activeModal = document.querySelector('.modal.active:not(.closing)');
    if (activeModal && activeModal !== app.translationSyncModal) return false;
    if (!renderTranslationSyncModal(app)) return false;

    clearSessionDismissal();
    app.openModal(app.translationSyncModal);
    return true;
}

export async function recoverUnavailableActiveTranslation(app, book) {
    const failedTranslation = normalizeTranslationId(app.state.translation);
    if (!failedTranslation || BUILT_IN_TRANSLATIONS.has(failedTranslation)) {
        return false;
    }

    const storedBook = await idbGetBook(failedTranslation, book);
    if (storedBook !== null) return false;

    await idbDeleteTranslation(failedTranslation);
    app.bibleApi.evictTranslation(failedTranslation);

    if (!app.syncedTranslationLibrary) {
        app.syncedTranslationLibrary = new Set();
    }
    app.syncedTranslationLibrary.add(failedTranslation);

    if (!app.preferredTranslation) {
        app.preferredTranslation = failedTranslation;
    }
    if (app.preferredTranslation === failedTranslation) {
        app.pendingPreferredTranslation = failedTranslation;
    }

    await refreshMissingSyncedTranslations(app);
    await app.changeTranslation(
        getFallbackPreference(),
        { syncPreference: false }
    );
    maybeShowTranslationSyncModal(app, { force: true });
    return true;
}

async function downloadSelectedTranslations(app) {
    const selected = Array.from(
        app.translationSyncList.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map((checkbox) => checkbox.value);

    if (selected.length === 0) {
        app.translationSyncStatus.textContent = 'Choose at least one translation.';
        return;
    }

    app.translationSyncDownload.disabled = true;
    const failures = [];
    let downloadedPreferred = false;

    for (let index = 0; index < selected.length; index++) {
        const translation = selected[index];
        app.translationSyncStatus.textContent =
            `Downloading ${translation} (${index + 1} of ${selected.length})…`;

        try {
            const bookList = await fetchTranslationBookList(translation);
            await app.bibleApi.downloadTranslation(
                translation,
                bookList
            );
            await recordTranslationInstalled(app, translation);

            if (translation === app.pendingPreferredTranslation) {
                downloadedPreferred = true;
            }
        } catch (error) {
            console.error(`Failed to download ${translation}`, error);
            failures.push(translation);
        }
    }

    await refreshMissingSyncedTranslations(app);

    if (downloadedPreferred) {
        const preferred = app.pendingPreferredTranslation;
        app.pendingPreferredTranslation = null;
        await app.changeTranslation(preferred, { syncPreference: false });
    }

    if (failures.length > 0) {
        renderTranslationSyncModal(app);
        app.translationSyncStatus.textContent =
            `Could not download: ${failures.join(', ')}`;
        app.translationSyncDownload.disabled = false;
        return;
    }

    if (getPromptTranslations(app).length === 0) {
        app.closeModal(app.translationSyncModal);
        return;
    }

    renderTranslationSyncModal(app);
    app.translationSyncDownload.disabled = false;
}

async function useFallback(app, translation) {
    if (!BUILT_IN_TRANSLATIONS.has(translation)) return;

    try { localStorage.setItem('translationFallback', translation); } catch (_) { }
    dismissTranslationSyncForSession(app);
    app.closeModal(app.translationSyncModal);
    await app.changeTranslation(translation, { syncPreference: false });
}

export function attachTranslationSyncEvents(app) {
    app.closeTranslationSyncModal?.addEventListener(
        'click',
        () => app.closeModal(app.translationSyncModal)
    );
    app.translationSyncNotNow?.addEventListener(
        'click',
        () => app.closeModal(app.translationSyncModal)
    );
    app.translationSyncUseKJV?.addEventListener(
        'click',
        () => useFallback(app, 'KJV')
    );
    app.translationSyncUseBSB?.addEventListener(
        'click',
        () => useFallback(app, 'BSB')
    );
    app.translationSyncDownload?.addEventListener(
        'click',
        () => downloadSelectedTranslations(app)
    );
}
