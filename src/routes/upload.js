const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const upload = require('../lib/upload');

const router = express.Router();

router.post('/', authenticate, upload.array('files', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const paths = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ paths, path: paths[0] });
}));

module.exports = router;
