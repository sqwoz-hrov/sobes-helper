const { BrowserWindow, shell } = require('electron');
const sessionRepository = require('../repositories/session');

// A single local profile owns all data. Sign-in remains a UI placeholder.
class AuthService {
    constructor() {
        this.initializationPromise = null;
        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                await require('../../ask/askService').endAllContextSessions();
                await sessionRepository.endAllActiveSessions();
                this.broadcastUserState();
            })();
        }
        return this.initializationPromise;
    }

    async startAuthFlow() {
        try {
            const webUrl = process.env.pickleglass_WEB_URL || 'http://localhost:3000';
            await shell.openExternal(`${webUrl}/login?mode=electron`);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async signOut() {
        // No remote session exists, and the local profile remains available.
        return { success: true, user: this.getCurrentUser() };
    }

    broadcastUserState() {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', this.getCurrentUser());
            }
        }
    }

    getCurrentUserId() {
        return 'default_user';
    }

    getCurrentUser() {
        return {
            uid: this.getCurrentUserId(),
            email: '',
            displayName: 'Local User',
            mode: 'local',
            isLoggedIn: false,
        };
    }
}

module.exports = new AuthService();
