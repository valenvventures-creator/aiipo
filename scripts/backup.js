// Consistent online backup of the SQLite database (encrypted fields stay encrypted).
// Encrypted object files in UPLOAD_DIR must be backed up alongside, and the master key stored separately.
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../src/db.js';
import { ROOT } from '../src/config.js';
const dir = process.argv[2] || path.join(ROOT, 'backups');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `ta-ipo-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
fs.chmodSync(file, 0o600);
console.log('Backup written to', file);
