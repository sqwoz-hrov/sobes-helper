const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

function loadWithMocks(relativePath, mocks) {
    const filename = path.resolve(__dirname, relativePath);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console, process,
        require: name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
    }, { filename });
    return module.exports;
}

test('sign-in opens only the local placeholder and never changes identity', async () => {
    const opened = [];
    const cleanup = [];
    const auth = loadWithMocks('../src/features/common/services/authService.js', {
        electron: {
            shell: { openExternal: async url => opened.push(url) },
            BrowserWindow: { getAllWindows: () => [] },
        },
        '../repositories/session': {
            setAuthService: () => {},
            endAllActiveSessions: async () => cleanup.push('sessions'),
        },
        '../../ask/askService': { endAllContextSessions: async () => cleanup.push('contexts') },
    });
    await Promise.all([auth.initialize(), auth.initialize()]);
    assert.deepEqual(cleanup, ['contexts', 'sessions']);
    assert.equal((await auth.startAuthFlow()).success, true);
    const url = new URL(opened[0]);
    assert.equal(url.hostname, 'localhost');
    assert.equal(url.pathname, '/login');
    await auth.signOut();
    assert.equal(auth.getCurrentUserId(), 'default_user');
    assert.equal(auth.getCurrentUser().isLoggedIn, false);
});

test('local adapters retain history, built-in templates, custom presets, and preferences', async () => {
    const sqlite = require('../src/features/common/services/sqliteClient');
    const auth = require('../src/features/common/services/authService');
    const sessions = require('../src/features/common/repositories/session');
    const presets = require('../src/features/common/repositories/preset');
    const users = require('../src/features/common/repositories/user');
    const settings = require('../src/features/settings/repositories');
    const transcripts = require('../src/features/listen/stt/repositories');
    const messages = require('../src/features/ask/repositories');
    const summaries = require('../src/features/listen/summary/repositories');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-local-mode-'));
    const database = path.join(directory, 'local.db');
    try {
        sqlite.connect(database);
        await sqlite.initTables();
        const templates = await presets.getPresetTemplates();
        assert.ok(templates.length > 0);
        assert.ok(templates.every(preset => preset.is_default === 1 && preset.prompt));
        await users.update({ uid: 'untrusted-browser-user', displayName: 'Local Tester' });
        assert.equal((await users.getById()).uid, auth.getCurrentUserId());
        assert.equal((await users.getById()).display_name, 'Local Tester');

        const sessionId = await sessions.create('listen');
        await transcripts.addTranscript({ sessionId, speaker: 'them', text: 'A local transcript' });
        await messages.addAiMessage({ sessionId, role: 'assistant', content: 'A local answer' });
        await summaries.saveSummary({ sessionId, text: 'Summary', tldr: 'TLDR', bullet_json: '[]', action_json: '[]' });
        const preset = await presets.create({ title: 'Custom', prompt: 'My instructions' });
        await settings.setAutoUpdate(false);

        sqlite.close();
        sqlite.connect(database);
        assert.equal((await sessions.getAllByUserId())[0].id, sessionId);
        assert.equal((await transcripts.getAllTranscriptsBySessionId(sessionId))[0].text, 'A local transcript');
        assert.equal((await messages.getAllAiMessagesBySessionId(sessionId))[0].content, 'A local answer');
        assert.equal((await summaries.getSummaryBySessionId(sessionId)).tldr, 'TLDR');
        assert.equal(await settings.getAutoUpdate(), false);
        assert.ok((await presets.getPresets()).some(item => item.id === preset.id));
        await presets.delete(preset.id);
        assert.equal((await presets.getPresetTemplates()).length, templates.length);
        await sessions.deleteWithRelatedData(sessionId);
        assert.equal((await transcripts.getAllTranscriptsBySessionId(sessionId)).length, 0);
    } finally {
        sqlite.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('obsolete providers cannot unlock AI and startup selects an available personal provider', async () => {
    let rows = [{ provider: 'retired-provider', api_key: 'obsolete', selected_llm_model: 'retired-model' }];
    let active = { llm: rows[0], stt: null };
    const repository = {
        getAll: async () => rows,
        remove: async provider => { rows = rows.filter(row => row.provider !== provider); },
        getRawApiKeys: async () => [],
        getActiveSettings: async () => active,
        getActiveProvider: async type => active[type],
        getByProvider: async provider => rows.find(row => row.provider === provider),
        upsert: async (provider, settings) => { Object.assign(rows.find(row => row.provider === provider), settings); },
        setActiveProvider: async (provider, type) => { active[type] = rows.find(row => row.provider === provider) || null; },
    };
    const state = loadWithMocks('../src/features/common/services/modelStateService.js', {
        'electron-store': class { get() { return undefined; } },
        './authService': { getCurrentUserId: () => 'default_user' },
        './encryptionService': { looksEncrypted: () => false },
        '../repositories/providerSettings': repository,
        './sqliteClient': { getDb: () => ({ prepare: () => ({ get: () => undefined }) }) },
        './localAIManager': new EventEmitter(),
        '../repositories/ollamaModel': { getInstalledModels: () => [] },
    });
    assert.equal(await state.hasValidApiKey(), false);
    assert.equal(await state.areProvidersConfigured(), false);
    assert.equal(await state.getCurrentModelInfo('llm'), null);
    await assert.rejects(state.setApiKey('retired-provider', 'key'), /Unsupported provider/);
    rows.push({ provider: 'openai', api_key: 'personal-key' });
    await state.initialize();
    assert.deepEqual(rows.map(row => row.provider), ['openai']);
    assert.equal((await state.getCurrentModelInfo('llm')).model, 'gpt-4.1');
    assert.equal((await state.getCurrentModelInfo('stt')).model, 'gpt-4o-mini-transcribe');
    assert.equal(await state.areProvidersConfigured(), true);
});

test('OpenAI streaming uses the configured personal credential directly', async t => {
    const { createStreamingLLM } = require('../src/features/common/ai/factory');
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return { ok: true };
    });
    await createStreamingLLM('openai', { apiKey: 'personal-key', model: 'gpt-4.1' })
        .streamChat([{ role: 'user', content: 'Hello' }]);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer personal-key');
    assert.equal(JSON.parse(calls[0].options.body).model, 'gpt-4.1');
});

test('dashboard auth status remains local regardless of the supplied user header', async () => {
    const { identifyUser } = require('../pickleglass_web/backend_node/middleware/auth');
    const router = require('../pickleglass_web/backend_node/routes/auth');
    const bridge = new EventEmitter();
    const req = { bridge, get: () => 'previous-account-id' };
    let continued = false;
    identifyUser(req, {}, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.uid, 'default_user');
    bridge.on('web-data-request', (channel, responseChannel) => {
        assert.equal(channel, 'get-user-profile');
        bridge.emit(responseChannel, {
            success: true,
            data: { uid: req.uid, display_name: 'Local User' },
        });
    });
    let body;
    const statusHandler = router.stack.find(layer => layer.route?.path === '/status').route.stack[0].handle;
    await statusHandler(req, { json: value => { body = value; } });
    assert.equal(body.authenticated, false);
    assert.equal(body.mode, 'local');
    assert.equal(body.user.id, 'default_user');
});
