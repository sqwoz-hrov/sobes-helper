const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electronPath = require('electron');
const tests = [
    path.join('tests', 'ask-context-utils.test.js'),
    path.join('tests', 'context-screenshot-cache.test.js'),
    path.join('tests', 'context-sqlite-repository.test.js'),
    path.join('tests', 'gemini-context-history.test.js'),
    path.join('tests', 'listen-pause-lifecycle.test.js'),
];

const result = spawnSync(electronPath, ['--test', ...tests], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
