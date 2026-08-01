// Vercel serverless entry for The Ivy School.
//
// vercel.json rewrites /api/* and /uploads/* to this function. It simply
// exports the Express app; the readiness middleware inside backend/src/index.js
// awaits schema + auto-seed + Phase-2 reference data on cold start.
//
// Requires these env vars on Vercel:
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN   (serverless DB)
//   BLOB_READ_WRITE_TOKEN                  (Vercel Blob for photo/doc uploads)
//   JWT_SECRET, JWT_REFRESH_SECRET         (sign secrets)
//   FRONTEND_URL                           (CORS origin, e.g. https://app.vercel.app)

module.exports = require('../backend/src/index');
