const sqliteRepository = require('./sqlite.repository');

let authService = null;

function getAuthService() {
    if (!authService) {
        authService = require('../../services/authService');
    }
    return authService;
}

function getBaseRepository() {
    return sqliteRepository;
}

const userRepositoryAdapter = {
    findOrCreate: (user) => {
        // All profile operations belong to the local user.
        return getBaseRepository().findOrCreate({ ...user, uid: getAuthService().getCurrentUserId() });
    },
    
    getById: () => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().getById(uid);
    },



    update: (updateData) => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().update({ ...updateData, uid });
    },

    deleteById: () => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().deleteById(uid);
    }
};

module.exports = {
    ...userRepositoryAdapter
}; 