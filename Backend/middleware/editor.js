const editorMiddleware = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'editor')) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden: This action requires editor or administrator privileges.' });
    }
};

module.exports = editorMiddleware;
