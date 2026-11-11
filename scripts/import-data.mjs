import { access, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outFile = path.join(repoRoot, 'sample-data', 'kakeibo.latest-backup.json');
const tableNames = ['expenses', 'plans', 'reflections', 'journals', 'settings', 'audit'];

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const resolveSource = async (arg) => {
  if (arg) return path.resolve(arg);
  if (process.env.KAKEIBO_BACKUP) return path.resolve(process.env.KAKEIBO_BACKUP);

  const downloads = path.join(os.homedir(), 'Downloads');
  if (!(await exists(downloads))) {
    throw new Error('Pass a backup path or set KAKEIBO_BACKUP.');
  }

  const backups = (await readdir(downloads))
    .filter((name) => /^Kakeibo_backup_.*\.json$/i.test(name))
    .sort();

  if (backups.length === 0) {
    throw new Error(`No Kakeibo_backup_*.json files found in ${downloads}.`);
  }

  return path.join(downloads, backups[backups.length - 1]);
};

const validate = (payload) => {
  if (payload.version !== 1) {
    throw new Error(`Backup version must be 1 (got ${payload.version ?? 'missing'}).`);
  }
  if (!payload.tables || !Array.isArray(payload.tables.expenses)) {
    throw new Error('This is not a Kakeibo backup (missing tables.expenses).');
  }

  const counts = Object.fromEntries(
    tableNames.map((name) => [name, Array.isArray(payload.tables?.[name]) ? payload.tables[name].length : 0]),
  );

  return { exportedAt: payload.exportedAt ?? null, counts };
};

const source = await resolveSource(process.argv[2]);
const raw = await readFile(source, 'utf8');
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  throw new Error(`${path.basename(source)} is not valid JSON.`);
}

const summary = validate(payload);
await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);

const desktopCopy = path.join(os.homedir(), 'Desktop', 'Kakeibo_restore.json');
try {
  await copyFile(source, desktopCopy);
  console.log(`Copied restore file to ${desktopCopy}`);
} catch (error) {
  const hint = error instanceof Error ? error.message : String(error);
  console.warn(`Could not copy to Desktop (${hint}). Use ${path.relative(repoRoot, outFile)} instead.`);
}

const rows = tableNames.map((name) => `${name}: ${summary.counts[name]}`).join(', ');
console.log(`Imported ${path.basename(source)} → ${path.relative(repoRoot, outFile)}`);
if (summary.exportedAt) console.log(`Exported at ${summary.exportedAt}`);
console.log(rows);
console.log('In Kakeibo: Settings → Your data → Restore backup, then choose this file or paste its JSON.');
