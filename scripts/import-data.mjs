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

  const sample = path.join(repoRoot, 'sample-data', 'user-salary-restore.json');
  if (await exists(sample)) return sample;

  const downloads = path.join(os.homedir(), 'Downloads');
  if (!(await exists(downloads))) {
    throw new Error('Pass a backup path, set KAKEIBO_BACKUP, or add sample-data/user-salary-restore.json.');
  }

  const backups = (await readdir(downloads))
    .filter((name) => /^Kakeibo_backup_.*\.json$/i.test(name))
    .sort();

  if (backups.length === 0) {
    throw new Error(`No Kakeibo_backup_*.json files found in ${downloads}.`);
  }

  return path.join(downloads, backups[backups.length - 1]);
};

const isExpensePayload = (payload) =>
  (Array.isArray(payload?.expenses) && payload.expenses.length > 0)
  || (Array.isArray(payload?.transactions) && payload.transactions.length > 0)
  || payload?.type === 'expense-seed';

const validate = (payload) => {
  if (payload.version === 1 && payload.tables && Array.isArray(payload.tables.expenses)) {
    const counts = Object.fromEntries(
      tableNames.map((name) => [name, Array.isArray(payload.tables?.[name]) ? payload.tables[name].length : 0]),
    );
    return { exportedAt: payload.exportedAt ?? null, counts, converted: false };
  }

  if (isExpensePayload(payload)) {
    const count = payload.expenses?.length ?? payload.transactions?.length ?? 0;
    return { exportedAt: null, counts: Object.fromEntries(tableNames.map((name) => [name, name === 'expenses' ? count : 0])), converted: true };
  }

  throw new Error('This is not a Kakeibo backup or an expenses / transactions JSON file.');
};

async function materializeBackup(text) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: repoRoot,
    configFile: path.join(repoRoot, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  });
  try {
    const mod = await server.ssrLoadModule('/src/domain/backupRestore.ts');
    return mod.materializeBackupFromExpenseJson(text).backup;
  } finally {
    await server.close();
  }
}

const source = await resolveSource(process.argv[2]);
const raw = await readFile(source, 'utf8');
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  throw new Error(`${path.basename(source)} is not valid JSON.`);
}

const summary = validate(payload);
if (summary.converted) {
  payload = await materializeBackup(raw);
}

await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);

const desktopCopy = path.join(os.homedir(), 'Desktop', 'Kakeibo_restore.json');
try {
  await writeFile(desktopCopy, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote restore file to ${desktopCopy}`);
} catch (error) {
  const hint = error instanceof Error ? error.message : String(error);
  console.warn(`Could not copy to Desktop (${hint}). Use ${path.relative(repoRoot, outFile)} instead.`);
}

const counts = summary.converted
  ? Object.fromEntries(tableNames.map((name) => [name, Array.isArray(payload.tables?.[name]) ? payload.tables[name].length : 0]))
  : summary.counts;
const rows = tableNames.map((name) => `${name}: ${counts[name] ?? 0}`).join(', ');
console.log(`${summary.converted ? 'Converted' : 'Imported'} ${path.basename(source)} → ${path.relative(repoRoot, outFile)}`);
if (summary.exportedAt) console.log(`Exported at ${summary.exportedAt}`);
console.log(rows);
console.log('In Kakeibo: Settings → Your data → Restore backup, then choose this file or paste its JSON.');
