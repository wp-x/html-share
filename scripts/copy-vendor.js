'use strict';

const fs = require('fs');
const path = require('path');
const { ensureVendor } = require('../src/util');

ensureVendor(path.join(__dirname, '..'));
const dest = path.join(__dirname, '..', 'public', 'vendor', 'highlight');
if (fs.existsSync(dest)) {
  console.log('[vendor] highlight.js 静态资源已就位:', fs.readdirSync(dest).join(', '));
}
