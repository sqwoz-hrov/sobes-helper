const { BrowserWindow, screen, app } = require('electron');
const path = require('node:path');
const { captureScreenshot } = require('./screenshotCapture');

const CAPTURE_SETTLE_DELAY_MS = 80;

class ScreenshotSelectionService {
    constructor() {
        this.activeSelection = null;
        this.sequence = 0;
        this.nativeCursorLock = null;
        this.nativeCursorDeltaTimer = null;

        app.on('before-quit', () => this.stopNativeCursorLock());
    }

    async startSelection() {
        this.cancelSelection();

        const cursor = screen.getCursorScreenPoint();
        const displays = screen.getAllDisplays();
        const selection = {
            id: ++this.sequence,
            finishing: false,
            windows: new Map(),
        };
        this.activeSelection = selection;

        for (const display of displays) {
            const win = this.createOverlayWindow(display, cursor, selection.id);
            selection.windows.set(win.webContents.id, { win, display });
        }

    }

    createOverlayWindow(display, cursor, selectionId) {
        const win = new BrowserWindow({
            ...display.bounds,
            show: false,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            hiddenInMissionControl: true,
            focusable: true,
            movable: false,
            resizable: false,
            fullscreenable: false,
            enableLargerThanScreen: true,
            roundedCorners: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../../preload.js'),
                backgroundThrottling: false,
            },
        });

        // This selector is always private, independently of the user's setting for
        // the regular Glass windows.
        win.setContentProtection(true);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        if (process.platform === 'darwin') win.setWindowButtonVisibility(false);

        const cursorInsideDisplay = cursor.x >= display.bounds.x
            && cursor.x < display.bounds.x + display.bounds.width
            && cursor.y >= display.bounds.y
            && cursor.y < display.bounds.y + display.bounds.height;

        win.loadFile(path.join(__dirname, '../../ui/screenshot/selection.html'), {
            query: {
                selectionId: String(selectionId),
                cursorX: String(cursor.x - display.bounds.x),
                cursorY: String(cursor.y - display.bounds.y),
                nativeCursorLock: String(process.platform === 'darwin'),
            },
        });
        const webContentsId = win.webContents.id;
        win.once('ready-to-show', async () => {
            if (this.activeSelection?.id !== selectionId || win.isDestroyed()) return;

            if (!cursorInsideDisplay) {
                win.showInactive();
                return;
            }

            win.show();
            win.moveTop();
            win.focus();
            win.webContents.focus();

            try {
                const useNativeVisibleCursorLock = process.platform === 'darwin';
                if (useNativeVisibleCursorLock && !(await this.startNativeCursorLock())) {
                    throw new Error('The native visible cursor lock could not be acquired.');
                }
                if (useNativeVisibleCursorLock) {
                    this.startNativeCursorDeltaForwarding(win, selectionId);
                }

                // macOS uses CoreGraphics to leave the real cursor visible and
                // stationary. Other platforms retain Pointer Lock as a fallback.
                const startCursorLockExpression = useNativeVisibleCursorLock
                    ? 'window.startGhostCursorNativeLock && window.startGhostCursorNativeLock()'
                    : 'window.startGhostCursorLock && window.startGhostCursorLock()';
                const locked = await win.webContents.executeJavaScript(
                    startCursorLockExpression,
                    true
                );
                if (!locked && this.activeSelection?.id === selectionId) {
                    console.error('[ScreenshotSelection] Pointer Lock could not be acquired.');
                    this.stopNativeCursorLock();
                    this.cancelSelection();
                }
            } catch (error) {
                console.error('[ScreenshotSelection] Failed to lock the system cursor:', error);
                this.stopNativeCursorLock();
                if (this.activeSelection?.id === selectionId) this.cancelSelection();
            }
        });
        win.on('closed', () => {
            if (this.activeSelection?.id !== selectionId) return;
            this.activeSelection.windows.delete(webContentsId);
            if (cursorInsideDisplay && !this.activeSelection.finishing) {
                this.cancelSelection();
                return;
            }
            if (!this.activeSelection.finishing && this.activeSelection.windows.size === 0) {
                this.activeSelection = null;
            }
        });

        return win;
    }

    isActiveSender(sender) {
        return Boolean(this.activeSelection && this.activeSelection.windows.has(sender.id));
    }

    handleSelectionStarted(sender) {
        if (!this.isActiveSender(sender)) return;

        for (const [webContentsId, entry] of this.activeSelection.windows) {
            if (webContentsId !== sender.id && !entry.win.isDestroyed()) entry.win.hide();
        }
    }

    async completeSelection(sender, rectangle) {
        if (!this.isActiveSender(sender) || this.activeSelection.finishing) {
            return { success: false, error: 'No screenshot selection is active.' };
        }

        const entry = this.activeSelection.windows.get(sender.id);
        const selectedWidth = Number(rectangle?.width);
        const selectedHeight = Number(rectangle?.height);
        if (![rectangle?.x, rectangle?.y, selectedWidth, selectedHeight].every(Number.isFinite)
            || selectedWidth < 8 || selectedHeight < 8) {
            this.cancelSelection(sender);
            return { success: false, error: 'Select an area at least 8 by 8 pixels.' };
        }

        const active = this.activeSelection;
        active.finishing = true;
        const absoluteSelection = {
            displayId: entry.display.id,
            x: entry.display.bounds.x + Number(rectangle.x),
            y: entry.display.bounds.y + Number(rectangle.y),
            width: selectedWidth,
            height: selectedHeight,
        };

        this.stopNativeCursorLock();
        this.destroyOverlayWindows(active);
        this.activeSelection = null;

        await new Promise(resolve => setTimeout(resolve, CAPTURE_SETTLE_DELAY_MS));
        const screenshot = await captureScreenshot({ selection: absoluteSelection, quality: 'medium' });
        if (!screenshot.success) {
            console.error('[ScreenshotSelection] Capture failed:', screenshot.error);
            return screenshot;
        }

        // Required lazily so shortcut registration and AskService do not form an
        // initialization cycle.
        const askService = require('./askService');
        return await askService.sendSelectedScreenshot(screenshot.base64);
    }

    cancelSelection(sender = null) {
        if (!this.activeSelection) return { success: true };
        if (sender && !this.isActiveSender(sender)) {
            return { success: false, error: 'The sender does not own the active selection.' };
        }

        const active = this.activeSelection;
        active.finishing = true;
        this.stopNativeCursorLock();
        this.destroyOverlayWindows(active);
        this.activeSelection = null;
        return { success: true };
    }

    destroyOverlayWindows(selection) {
        for (const { win } of selection.windows.values()) {
            if (!win.isDestroyed()) win.destroy();
        }
        selection.windows.clear();
    }

    getNativeCursorLockPath() {
        return app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'assets', 'MouseCursorLock.node')
            : path.join(app.getAppPath(), 'src', 'ui', 'assets', 'MouseCursorLock.node');
    }

    startNativeCursorLock() {
        if (process.platform !== 'darwin') return false;

        this.stopNativeCursorLock();
        try {
            // This must run inside Electron's foreground process. Running the same
            // CoreGraphics call from a child helper reports success but does not
            // decouple the cursor from Electron's mouse events.
            this.nativeCursorLock ||= require(this.getNativeCursorLockPath());
            this.nativeCursorLock.unlock();
            return this.nativeCursorLock.lock();
        } catch (error) {
            console.error('[ScreenshotSelection] Native cursor module is unavailable:', error.message);
            return false;
        }
    }

    stopNativeCursorLock() {
        if (this.nativeCursorDeltaTimer) {
            clearInterval(this.nativeCursorDeltaTimer);
            this.nativeCursorDeltaTimer = null;
        }
        if (!this.nativeCursorLock) return;
        try {
            this.nativeCursorLock.unlock();
        } catch (error) {
            console.error('[ScreenshotSelection] Failed to restore the native cursor:', error.message);
        }
    }

    startNativeCursorDeltaForwarding(win, selectionId) {
        if (!this.nativeCursorLock || typeof this.nativeCursorLock.getDelta !== 'function') {
            throw new Error('The native cursor module does not expose relative mouse movement.');
        }

        if (this.nativeCursorDeltaTimer) clearInterval(this.nativeCursorDeltaTimer);
        this.nativeCursorDeltaTimer = setInterval(() => {
            if (this.activeSelection?.id !== selectionId || win.isDestroyed()) {
                this.stopNativeCursorLock();
                return;
            }

            try {
                const delta = this.nativeCursorLock.getDelta();
                if (!delta || (!delta.x && !delta.y)) return;
                win.webContents.send('screenshot-selection:mouse-delta', delta);
            } catch (error) {
                console.error('[ScreenshotSelection] Failed to read native mouse movement:', error);
                this.cancelSelection();
            }
        }, 8);
    }
}

module.exports = new ScreenshotSelectionService();
