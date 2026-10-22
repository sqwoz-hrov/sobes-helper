const sqliteRepository = require('./sqlite.repository');
const authService = require('../../../common/services/authService');

function getBaseRepository() {
    return sqliteRepository;
}

const summaryRepositoryAdapter = {
    saveSummary: ({ sessionId, tldr, text, bullet_json, action_json, model }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, model });
    },
    getSummaryBySessionId: (sessionId) => {
        return getBaseRepository().getSummaryBySessionId(sessionId);
    }
};

module.exports = summaryRepositoryAdapter; 