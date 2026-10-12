const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ContextScreenshotCache, safeSegment } = require('../src/features/ask/contextScreenshotCache');

test('screenshot cache saves, reads, and removes one session without touching another', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'glass-context-cache-'));
    const cache = new ContextScreenshotCache(root);
    const image = Buffer.from('fake-jpeg').toString('base64');
    try {
        await cache.save('session/a', 'context:1', image);
        await cache.save('session/b', 'context:2', image);
        assert.equal(await cache.readDataUrl('session/a', 'context:1'), `data:image/jpeg;base64,${image}`);
        assert.doesNotMatch(safeSegment('../unsafe'), /[/.]/);

        await cache.cleanupSession('session/a');
        await assert.rejects(cache.readDataUrl('session/a', 'context:1'));
        assert.equal(await cache.readDataUrl('session/b', 'context:2'), `data:image/jpeg;base64,${image}`);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
