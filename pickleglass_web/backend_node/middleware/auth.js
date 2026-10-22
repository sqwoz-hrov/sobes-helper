function identifyUser(req, res, next) {
    req.uid = 'default_user';
    next();
}

module.exports = { identifyUser };
