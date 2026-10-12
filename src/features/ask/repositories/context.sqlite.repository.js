const crypto = require('node:crypto');
const sqliteClient = require('../../common/services/sqliteClient');

function createContext({ id = crypto.randomUUID(), sessionId, uid, sourceType, question, sourcePayload, title, status }) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
        INSERT INTO ask_contexts
            (id, session_id, uid, source_type, question, source_payload_json, title, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, uid, sourceType, question, JSON.stringify(sourcePayload || {}), title, status, now, now);
    return getContextById(id);
}

function getContextById(id) {
    return sqliteClient.getDb().prepare('SELECT * FROM ask_contexts WHERE id = ?').get(id) || null;
}

function getContextsBySessionId(sessionId, uid) {
    return sqliteClient.getDb().prepare(`
        SELECT * FROM ask_contexts
        WHERE session_id = ? AND uid = ?
        ORDER BY created_at DESC, rowid DESC
    `).all(sessionId, uid);
}

function updateContext(id, patch) {
    const allowed = {
        title: 'title',
        status: 'status',
        sourcePayload: 'source_payload_json',
    };
    const assignments = [];
    const values = [];
    for (const [key, column] of Object.entries(allowed)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        assignments.push(`${column} = ?`);
        values.push(key === 'sourcePayload' ? JSON.stringify(patch[key] || {}) : patch[key]);
    }
    if (assignments.length === 0) return { changes: 0 };
    assignments.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000), id);
    return sqliteClient.getDb().prepare(
        `UPDATE ask_contexts SET ${assignments.join(', ')} WHERE id = ?`
    ).run(...values);
}

function addMessage({ id = crypto.randomUUID(), contextId, sequence, role, content, model = 'unknown' }) {
    const sentAt = Math.floor(Date.now() / 1000);
    sqliteClient.getDb().prepare(`
        INSERT INTO ask_context_messages (id, context_id, sequence, role, content, model, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, contextId, sequence, role, content, model, sentAt);
    return { id, contextId, sequence, role, content, model, sentAt };
}

function getMessagesByContextId(contextId) {
    return sqliteClient.getDb().prepare(`
        SELECT id, context_id, sequence, role, content, model, sent_at
        FROM ask_context_messages
        WHERE context_id = ?
        ORDER BY sequence ASC
    `).all(contextId);
}

function deleteBySessionId(sessionId) {
    const db = sqliteClient.getDb();
    return db.transaction(() => {
        db.prepare(`
            DELETE FROM ask_context_messages
            WHERE context_id IN (SELECT id FROM ask_contexts WHERE session_id = ?)
        `).run(sessionId);
        return db.prepare('DELETE FROM ask_contexts WHERE session_id = ?').run(sessionId);
    })();
}

module.exports = {
    addMessage,
    createContext,
    deleteBySessionId,
    getContextById,
    getContextsBySessionId,
    getMessagesByContextId,
    updateContext,
};
