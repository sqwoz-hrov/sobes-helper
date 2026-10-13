const test = require('node:test');
const assert = require('node:assert/strict');

const modelStatePath = require.resolve('../src/features/common/services/modelStateService');
require.cache[modelStatePath] = {
    id: modelStatePath,
    filename: modelStatePath,
    loaded: true,
    exports: {},
};

const askServicePath = require.resolve('../src/features/ask/askService');
let endedAskSessions = 0;
require.cache[askServicePath] = {
    id: askServicePath,
    filename: askServicePath,
    loaded: true,
    exports: {
        endSession: async () => {
            endedAskSessions += 1;
        },
    },
};

const listenService = require('../src/features/listen/listenService');

test('pause and continue preserve the listen session, transcript history, and Ask contexts', async () => {
    const calls = [];
    const conversationHistory = ['them: Existing finalized transcript'];

    listenService.currentSessionId = 'shared-session';
    listenService.currentLanguage = 'ru';
    listenService.sessionState = 'listening';
    listenService.summaryService.conversationHistory = conversationHistory;
    listenService.sendToRenderer = (channel, payload) => calls.push([channel, payload]);
    listenService.sttService.flushPendingCompletions = async () => calls.push(['flush']);
    listenService.sttService.closeSessions = async () => calls.push(['close-stt']);
    listenService.summaryService.forceAnalysis = async () => calls.push(['force-analysis']);

    await listenService.pauseSession();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(listenService.sessionState, 'paused');
    assert.equal(listenService.currentSessionId, 'shared-session');
    assert.strictEqual(listenService.summaryService.conversationHistory, conversationHistory);
    assert.equal(endedAskSessions, 0);
    assert.deepEqual(calls.filter(([name]) => ['flush', 'close-stt', 'force-analysis'].includes(name)), [
        ['flush'],
        ['close-stt'],
        ['force-analysis'],
    ]);

    listenService.initializeSttWithRetry = async language => {
        calls.push(['initialize-stt', language]);
        return true;
    };

    await listenService.continueSession();

    assert.equal(listenService.sessionState, 'listening');
    assert.equal(listenService.currentSessionId, 'shared-session');
    assert.strictEqual(listenService.summaryService.conversationHistory, conversationHistory);
    assert.equal(endedAskSessions, 0);
    assert.ok(calls.some(([name, language]) => name === 'initialize-stt' && language === 'ru'));
});
