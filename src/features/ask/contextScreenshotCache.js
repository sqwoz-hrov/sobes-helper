const fs = require('node:fs/promises');
const path = require('node:path');

function safeSegment(value) {
    return Buffer.from(String(value), 'utf8').toString('base64url');
}

class ContextScreenshotCache {
    constructor(rootPath = null) {
        this.rootPath = rootPath;
    }

    getRootPath() {
        if (this.rootPath) return this.rootPath;
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'ask-contexts');
    }

    getSessionPath(sessionId) {
        return path.join(this.getRootPath(), safeSegment(sessionId));
    }

    getScreenshotPath(sessionId, contextId) {
        return path.join(this.getSessionPath(sessionId), `${safeSegment(contextId)}.jpg`);
    }

    async save(sessionId, contextId, screenshotBase64) {
        const targetPath = this.getScreenshotPath(sessionId, contextId);
        const base64 = String(screenshotBase64 || '').replace(/^data:image\/[^;]+;base64,/, '');
        if (!base64) throw new Error('The selected screenshot is empty.');
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, Buffer.from(base64, 'base64'));
        return targetPath;
    }

    async readDataUrl(sessionId, contextId) {
        const data = await fs.readFile(this.getScreenshotPath(sessionId, contextId));
        return `data:image/jpeg;base64,${data.toString('base64')}`;
    }

    async cleanupSession(sessionId) {
        await fs.rm(this.getSessionPath(sessionId), { recursive: true, force: true });
    }

    async cleanupAll() {
        await fs.rm(this.getRootPath(), { recursive: true, force: true });
    }
}

module.exports = { ContextScreenshotCache, safeSegment };
