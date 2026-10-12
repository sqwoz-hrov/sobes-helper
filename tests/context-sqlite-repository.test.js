const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqliteClient = require('../src/features/common/services/sqliteClient');
const contextRepository = require('../src/features/ask/repositories/context.sqlite.repository');
const sessionRepository = require('../src/features/common/repositories/session/sqlite.repository');

test('local context repository stores ordered threads and deletes by session', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'glass-context-db-'));
    const databasePath = path.join(directory, 'contexts.db');
    try {
        sqliteClient.connect(databasePath);
        await sqliteClient.initTables();

        const context = contextRepository.createContext({
            id: 'context-1',
            sessionId: 'remote-session-id',
            uid: 'signed-in-user',
            sourceType: 'quick_ask',
            question: 'Original prompt',
            sourcePayload: { conversationTexts: ['them: question'] },
            title: 'Quick Ask 1',
            status: 'loading',
        });
        assert.equal(context.session_id, 'remote-session-id');
        assert.equal(context.uid, 'signed-in-user');

        contextRepository.addMessage({ contextId: context.id, sequence: 0, role: 'user', content: 'Question' });
        contextRepository.addMessage({ contextId: context.id, sequence: 1, role: 'assistant', content: 'Answer' });
        assert.deepEqual(
            contextRepository.getMessagesByContextId(context.id).map(message => [message.sequence, message.role, message.content]),
            [[0, 'user', 'Question'], [1, 'assistant', 'Answer']]
        );

        contextRepository.updateContext(context.id, { title: 'Derived title', status: 'complete' });
        assert.equal(contextRepository.getContextById(context.id).title, 'Derived title');
        assert.equal(contextRepository.getContextsBySessionId('remote-session-id', 'signed-in-user').length, 1);

        contextRepository.deleteBySessionId('remote-session-id');
        assert.equal(contextRepository.getContextById(context.id), null);
        assert.equal(contextRepository.getMessagesByContextId(context.id).length, 0);

        const localSessionId = sessionRepository.create('default_user', 'ask');
        contextRepository.createContext({
            id: 'context-2',
            sessionId: localSessionId,
            uid: 'default_user',
            sourceType: 'screenshot',
            question: 'Screenshot prompt',
            sourcePayload: { hasScreenshot: true },
            title: 'Screenshot 1',
            status: 'complete',
        });
        contextRepository.addMessage({ contextId: 'context-2', sequence: 0, role: 'user', content: 'Screenshot prompt' });
        sessionRepository.deleteWithRelatedData(localSessionId);
        assert.equal(contextRepository.getContextById('context-2'), null);
        assert.equal(contextRepository.getMessagesByContextId('context-2').length, 0);
    } finally {
        sqliteClient.close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});
