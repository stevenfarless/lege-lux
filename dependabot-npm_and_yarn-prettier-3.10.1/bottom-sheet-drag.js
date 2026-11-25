const COMPACT_HEIGHT_RATIO = 0.46;
const COMPACT_MIN_HEIGHT = 360;
const COMPACT_MAX_HEIGHT = 440;
const EXPANDED_HEIGHT_RATIO = 0.82;
const MAX_HEIGHT_RATIO = 0.9;
const AXIS_THRESHOLD = 8;
const DISMISS_PULL = 90;
const FLICK_VELOCITY = 0.45;

function addDragZone(content, side) {
    const zone = document.createElement('div');
    zone.className = `modal-drag-zone modal-drag-zone--${side}`;
    zone.setAttribute('aria-hidden', 'true');
    content.appendChild(zone);
    return zone;
}

function compactHeight() {
    return Math.min(
        COMPACT_MAX_HEIGHT,
        Math.max(COMPACT_MIN_HEIGHT, window.innerHeight * COMPACT_HEIGHT_RATIO),
    );
}

function expandedHeight() {
    return Math.min(window.innerHeight * MAX_HEIGHT_RATIO, window.innerHeight * EXPANDED_HEIGHT_RATIO);
}

function setSnapState(content, state, animate = true) {
    content.classList.toggle('settings-sheet--compact', state === 'compact');
    content.classList.toggle('settings-sheet--expanded', state === 'expanded');
    content.classList.toggle('settings-sheet--snapping', animate);
    content.style.height = `${state === 'expanded' ? expandedHeight() : compactHeight()}px`;
    if (animate) {
        window.setTimeout(() => content.classList.remove('settings-sheet--snapping'), 300);
    }
}

function attachBottomSheetDrag(app, modal) {
    const content = modal.querySelector('.modal-content');
    const header = modal.querySelector('.modal-header');

    if (!content || !header) return;

    content.classList.add('modal-drag-resizable');
    setSnapState(content, 'compact', false);

    const dragSources = [
        header,
        addDragZone(content, 'left'),
        addDragZone(content, 'right'),
    ];

    const drag = {
        pointerId: null,
        source: null,
        startX: 0,
        startY: 0,
        startHeight: 0,
        axis: null,
        dismissArmed: false,
        lastY: 0,
        lastTime: 0,
        velocityY: 0,
    };

    function resetDrag() {
        content.classList.remove('dragging', 'dismiss-armed');
        drag.pointerId = null;
        drag.source = null;
        drag.axis = null;
        drag.dismissArmed = false;
        drag.velocityY = 0;
    }

    function finishDrag(event, allowDismiss) {
        if (event.pointerId !== drag.pointerId) return;

        const shouldDismiss = allowDismiss && drag.dismissArmed && drag.velocityY > 0;
        const currentHeight = content.offsetHeight;
        const compact = compactHeight();
        const expanded = expandedHeight();
        const midpoint = (compact + expanded) / 2;

        if (drag.source?.hasPointerCapture(event.pointerId)) {
            drag.source.releasePointerCapture(event.pointerId);
        }
        resetDrag();

        if (shouldDismiss) {
            app.closeModal(modal);
            window.setTimeout(() => setSnapState(content, 'compact', false), 320);
            return;
        }

        if (drag.velocityY <= -FLICK_VELOCITY) {
            setSnapState(content, 'expanded');
            return;
        }

        if (drag.velocityY >= FLICK_VELOCITY) {
            setSnapState(content, 'compact');
            return;
        }

        setSnapState(content, currentHeight >= midpoint ? 'expanded' : 'compact');
    }

    function startDrag(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest('.close-btn')) return;

        drag.pointerId = event.pointerId;
        drag.source = event.currentTarget;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.startHeight = content.offsetHeight;
        drag.axis = null;
        drag.dismissArmed = false;
        drag.lastY = event.clientY;
        drag.lastTime = performance.now();
        drag.velocityY = 0;

        drag.source.setPointerCapture(event.pointerId);
        content.classList.remove('settings-sheet--snapping');
        content.classList.add('dragging');
        event.preventDefault();
    }

    function moveDrag(event) {
        if (event.pointerId !== drag.pointerId) return;

        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;

        if (drag.axis === null) {
            if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
            drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'vertical' : 'horizontal';
            if (drag.axis === 'horizontal') {
                finishDrag(event, false);
                return;
            }
        }

        const now = performance.now();
        const elapsed = Math.max(1, now - drag.lastTime);
        drag.velocityY = (event.clientY - drag.lastY) / elapsed;
        drag.lastY = event.clientY;
        drag.lastTime = now;

        const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
        const compact = compactHeight();
        const requestedHeight = drag.startHeight - dy;
        const resizedHeight = Math.max(compact, Math.min(maxHeight, requestedHeight));
        const pullPastCompact = Math.max(0, compact - requestedHeight);

        content.style.height = `${resizedHeight}px`;
        drag.dismissArmed = pullPastCompact >= DISMISS_PULL;
        content.classList.toggle('dismiss-armed', drag.dismissArmed);
        event.preventDefault();
    }

    modal.addEventListener('transitionend', () => {
        if (!modal.classList.contains('active')) setSnapState(content, 'compact', false);
    });

    for (const source of dragSources) {
        source.addEventListener('pointerdown', startDrag);
        source.addEventListener('pointermove', moveDrag);
        source.addEventListener('pointerup', (event) => finishDrag(event, true));
        source.addEventListener('pointercancel', (event) => finishDrag(event, false));
    }
}

export function attachDragToResize(app) {
    if (app.settingsModal) attachBottomSheetDrag(app, app.settingsModal);
}
