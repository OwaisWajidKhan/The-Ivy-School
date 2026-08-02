// Upload storage abstraction.
//  - Local mode (dev / packaged exe): files land on disk under config.uploadDir.
//  - Vercel mode (BLOB_READ_WRITE_TOKEN set): files go to Vercel Blob.
// DB rows always store a relative URL like "/uploads/<folder>/<file>" so the
// frontend is identical either way; a /uploads/* route resolves it.

const fs = require('fs');
const path = require('path');
const config = require('../config');

// Only use Vercel Blob on a real Vercel serverless runtime. A token present in a
// local .env must not silently flip uploads from disk to Blob (which would fail).
const VERCEL_BLOB = process.env.VERCEL === '1' && !!process.env.BLOB_READ_WRITE_TOKEN;

function safeExt(name) {
  const m = String(name || '').match(/\.([a-zA-Z0-9]{1,8})$/);
  return m ? `.${m[1].toLowerCase()}` : '';
}

async function uploadBuffer({ buffer, folder = 'misc', originalname = '', mimetype = '' }) {
  const file = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt(originalname)}`;
  const rel = `/uploads/${folder}/${file}`;
  if (VERCEL_BLOB) {
    const { put } = require('@vercel/blob');
    await put(`${folder}/${file}`, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: mimetype || undefined
    });
    return rel;
  }
  const dir = path.join(config.uploadDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buffer);
  return rel;
}

async function deleteUpload(rel) {
  if (!rel) return;
  if (VERCEL_BLOB) {
    try {
      const { del } = require('@vercel/blob');
      await del(rel.replace(/^\/uploads\//, ''));
    } catch (e) {
      // best-effort
    }
    return;
  }
  const p = path.join(config.uploadDir, rel.replace(/^\/uploads\//, ''));
  try {
    fs.unlinkSync(p);
  } catch (e) {
    // best-effort
  }
}

// GET /uploads/:path handler. Local mode uses express.static instead.
async function serveUpload(req, res, rel) {
  if (!VERCEL_BLOB) {
    const p = path.join(config.uploadDir, rel);
    return fs.existsSync(p) ? res.sendFile(p) : res.status(404).end();
  }
  const { head } = require('@vercel/blob');
  const key = rel.replace(/^\/uploads\//, '');
  const info = await head(key).catch(() => null);
  if (!info) return res.status(404).end();
  return res.redirect(info.url);
}

module.exports = { uploadBuffer, deleteUpload, serveUpload, VERCEL_BLOB };
