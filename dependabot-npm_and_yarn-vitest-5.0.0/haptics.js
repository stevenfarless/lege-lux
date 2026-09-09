const LIGHT_CLICK_MS = 35;
const FIRM_PATTERN = [50, 30, 50];

const debugState = {
    lastAttempt: null,
};

function supported() {
    return typeof navigator.vibrate === 'function';
}

function enabled(app) {
    return app?.state?.hapticsEnabled !== false;
}

function record(kind, pattern, result, reason = null) {
    debugState.lastAttempt = {
        at: Date.now(),
        kind,
        pattern,
        result,
        reason,
    };
}

function vibrate(app, kind, pattern) {
    if (!enabled(app)) {
        record(kind, pattern, false, 'disabled');
        return false;
    }

    if (!supported()) {
        record(kind, pattern, false, 'unsupported');
        return false;
    }

    const result = navigator.vibrate(pattern);
    record(kind, pattern, result, result ? null : 'rejected');
    return result;
}

export function hapticLight(app) {
    return vibrate(app, 'light', LIGHT_CLICK_MS);
}

export function hapticFirm(app) {
    return vibrate(app, 'firm', FIRM_PATTERN);
}

export function supportsHaptics() {
    return supported();
}

export function getHapticsDebugState(app) {
    return {
        supported: supported(),
        enabled: enabled(app),
        lastAttempt: debugState.lastAttempt,
    };
}

export function attachButtonHaptics(app) {
    document.addEventListener('click', (event) => {
        const control = event.target.closest('button, [role="button"], input[type="checkbox"], input[type="radio"]');
        if (!control || control.disabled) return;
        if (control.closest('[data-no-haptics]')) return;
        if (control.id === 'hapticsToggle' && !control.checked) return;
        hapticLight(app);
    });
}
