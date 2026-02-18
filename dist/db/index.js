import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMA } from './schema.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/clawmarket.db');
let _db = null;
export function getDb() {
    if (!_db) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        _db = new Database(DB_PATH);
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        _db.exec(SCHEMA);
        console.log('[db] initialized at', DB_PATH);
    }
    return _db;
}
export function closeDb() {
    if (_db) {
        _db.close();
        _db = null;
    }
}
//# sourceMappingURL=index.js.map