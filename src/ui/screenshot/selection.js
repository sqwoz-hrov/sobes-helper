const params = new URLSearchParams(window.location.search);
const ghostCursor = document.querySelector('.ghost-cursor');
const selectionElement = document.querySelector('.selection');
const dimensionsElement = document.querySelector('.dimensions');

if (params.get('nativeCursorLock') === 'true') {
    document.documentElement.classList.add('native-cursor-lock');
}

let anchor = null;
let isFinishing = false;
let cursorLockMode = 'none';
let virtualX = Number(params.get('cursorX'));
let virtualY = Number(params.get('cursorY'));

if (!Number.isFinite(virtualX)) virtualX = window.innerWidth / 2;
if (!Number.isFinite(virtualY)) virtualY = window.innerHeight / 2;

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function applyCursorMovement(deltaX, deltaY) {
    virtualX = clamp(virtualX + deltaX, 0, window.innerWidth);
    virtualY = clamp(virtualY + deltaY, 0, window.innerHeight);

    if (!anchor) {
        showGhostCursor(virtualX, virtualY);
        return;
    }

    drawSelection(getRectangle(virtualX, virtualY));
}

function showGhostCursor(x, y) {
    if (anchor) return;
    ghostCursor.style.setProperty('--cursor-x', `${x}px`);
    ghostCursor.style.setProperty('--cursor-y', `${y}px`);
    ghostCursor.classList.add('is-visible');
}

function getRectangle(x, y) {
    const left = Math.min(anchor.x, x);
    const top = Math.min(anchor.y, y);
    const right = Math.max(anchor.x, x);
    const bottom = Math.max(anchor.y, y);
    return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
    };
}

function drawSelection(rectangle) {
    selectionElement.classList.add('is-visible');
    selectionElement.style.left = `${rectangle.x}px`;
    selectionElement.style.top = `${rectangle.y}px`;
    selectionElement.style.width = `${rectangle.width}px`;
    selectionElement.style.height = `${rectangle.height}px`;
    dimensionsElement.textContent = `${rectangle.width} × ${rectangle.height}`;
}

window.addEventListener('mousemove', event => {
    if (cursorLockMode !== 'pointer') return;
    applyCursorMovement(event.movementX, event.movementY);
});

window.api.screenshotSelection.onMouseDelta(delta => {
    if (cursorLockMode !== 'native') return;
    applyCursorMovement(Number(delta?.x) || 0, Number(delta?.y) || 0);
});

window.addEventListener('mousedown', event => {
    if (cursorLockMode === 'none' || event.button !== 0 || anchor) return;

    event.preventDefault();
    anchor = { x: virtualX, y: virtualY };
    document.body.classList.add('is-selecting');
    ghostCursor.classList.remove('is-visible');
    window.api.screenshotSelection.selectionStarted();
    drawSelection({ x: anchor.x, y: anchor.y, width: 0, height: 0 });
});

window.addEventListener('mouseup', event => {
    if (event.button !== 0 || !anchor) return;

    event.preventDefault();
    const rectangle = getRectangle(virtualX, virtualY);
    anchor = null;
    isFinishing = true;
    window.api.screenshotSelection.complete(rectangle);
});

window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    isFinishing = true;
    window.api.screenshotSelection.cancel();
});

window.addEventListener('contextmenu', event => event.preventDefault());

document.addEventListener('pointerlockchange', () => {
    if (cursorLockMode === 'pointer' && !document.pointerLockElement && !isFinishing) {
        isFinishing = true;
        window.api.screenshotSelection.cancel();
    }
});

document.addEventListener('pointerlockerror', () => {
    if (cursorLockMode !== 'pointer' || isFinishing) return;
    isFinishing = true;
    window.api.screenshotSelection.cancel();
});

window.startGhostCursorLock = async () => {
    try {
        await document.body.requestPointerLock();
        const locked = document.pointerLockElement === document.body;
        if (locked) {
            cursorLockMode = 'pointer';
            showGhostCursor(virtualX, virtualY);
        }
        return locked;
    } catch (error) {
        console.error('[ScreenshotSelection] Pointer Lock request failed:', error);
        return false;
    }
};

window.startGhostCursorNativeLock = () => {
    cursorLockMode = 'native';
    showGhostCursor(virtualX, virtualY);
    return true;
};
