import { spawn, spawnSync } from 'node:child_process';
import { access, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const releaseDir = path.join(repoRoot, 'release');
const manifestFile = path.join(releaseDir, 'SHA256SUMS');
const siteDir = path.join(repoRoot, 'portfolio latest/files');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: repoRoot });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}.`));
      }
    });
  });

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const step = (message) => console.log(`\n▶ ${message}`);

step('Refreshing checksums from release artifacts');
await run(npm, ['run', 'checksums']);

step('Syncing the root checksum manifest');
await copyFile(
  path.join(siteDir, 'downloads', 'SHA256SUMS'),
  path.join(siteDir, 'SHA256SUMS'),
);

step('Verifying checksums, download links and embedded hashes');
await run(npm, ['run', 'checksums:check']);

if (!(await exists(manifestFile))) {
  console.error(`Missing ${path.relative(repoRoot, manifestFile)}.`);
  process.exit(1);
}

const manifest = await readFile(manifestFile, 'utf8');
const entries = manifest
  .trim()
  .split('\n')
  .map((line) => /^([0-9a-f]{64}) {2}(.+)$/.exec(line))
  .filter(Boolean)
  .map((match) => ({ hash: match[1], name: match[2] }));

if (entries.length === 0) {
  console.error(`No checksum entries found in ${path.relative(repoRoot, manifestFile)}.`);
  process.exit(1);
}

const missing = [];
for (const entry of entries) {
  if (!(await exists(path.join(releaseDir, entry.name)))) {
    missing.push(entry.name);
  }
}

if (missing.length > 0) {
  console.error(`Missing release artifacts: ${missing.join(', ')}`);
  process.exit(1);
}

const assets = [...entries.map((entry) => path.join(releaseDir, entry.name)), manifestFile];
const repo = spawnSync(gh, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
const repoSlug = repo.status === 0 ? repo.stdout.trim() : 'hailemichael121/Kakeibo';
const rows = entries.map(({ hash, name }) => `| ${name} | \`${hash}\` |`).join('\n');
const notes = [
  `## Kakeibo ${version}`,
  '',
  'Native builds with SHA-256 checksums. These are the same files served on the website.',
  '',
  '| File | SHA-256 |',
  '| --- | --- |',
  rows,
  '',
  'Website: https://kaakeibo.netlify.app',
  '',
  'Verify downloads with `sha256sum -c SHA256SUMS`.',
].join('\n');

const releaseExists =
  spawnSync(gh, ['release', 'view', tag], { cwd: repoRoot, stdio: 'ignore' }).status === 0;

if (releaseExists) {
  step(`Uploading assets to existing GitHub release ${tag}`);
  await run(gh, ['release', 'upload', tag, ...assets, '--clobber']);
} else {
  step(`Creating GitHub release ${tag}`);
  await run(gh, [
    'release',
    'create',
    tag,
    ...assets,
    '--title',
    `Kakeibo ${version}`,
    '--notes',
    notes,
    '--latest',
  ]);
}

console.log(`\nGitHub release: https://github.com/${repoSlug}/releases/tag/${tag}`);
