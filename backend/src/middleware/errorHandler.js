module.exports = function errorHandler(err, req, res, next) {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  console.error('[ERROR]', err);
  const status = err.status || 500;
  const message = err.expose ? err.message : 'Internal server error';
  res.status(status).json({ success: false, message });
};

module.exports.notFound = function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};
