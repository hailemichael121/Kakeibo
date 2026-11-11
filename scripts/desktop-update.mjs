import { spawnSync } from 'node:child_process';
import { access, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: repoRoot, ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const skipBuild = process.env.KAKEIBO_UPDATE_SKIP_BUILD === '1';

if (process.platform === 'linux') {
  const debName = `kakeibo_${version}_amd64.deb`;
  let debPath = path.join(repoRoot, 'release', debName);

  if (skipBuild) {
    console.log('Skipping rebuild (KAKEIBO_UPDATE_SKIP_BUILD=1).');
  } else {
    console.log('Building the latest desktop app before install (set KAKEIBO_UPDATE_SKIP_BUILD=1 to reuse release/*.deb)…');
    run('npm', ['run', 'desktop:build:linux']);
  }

  if (!(await exists(debPath))) {
    console.error(`${debName} was not found in release/. Run: npm run desktop:build:linux`);
    process.exit(1);
  }

  const installPath = path.join('/tmp', debName);
  await copyFile(debPath, installPath);
  console.log(`Installing ${debName} from ${installPath}…`);
  const install = spawnSync('sudo', ['apt', 'install', '-y', './' + debName], { cwd: '/tmp', stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(`apt install failed (status ${install.status ?? 'unknown'}). If sudo needs a password, run in your terminal:`);
    console.error(`  cd /tmp && sudo apt install -y ./${debName}`);
    process.exit(install.status ?? 1);
  }

  const installed = spawnSync('dpkg-query', ['-W', '-f=${Version}', 'kakeibo'], { encoding: 'utf8' });
  if (installed.status === 0 && installed.stdout.trim()) {
    console.log(`Installed package version: ${installed.stdout.trim()}`);
  } else {
    console.log(`Installed ${debName} (could not read dpkg version).`);
  }
} else if (process.platform === 'win32') {
  const exe = path.join(repoRoot, 'release', `Kakeibo-Setup-${version}.exe`);
  console.log(`On Windows, run the installer manually:\n  ${exe}`);
  console.log('Or build it with: npm run desktop:build:win');
} else if (process.platform === 'darwin') {
  const dmg = path.join(repoRoot, 'release', `Kakeibo-${version}.dmg`);
  console.log(`On macOS, open the disk image manually:\n  ${dmg}`);
  console.log('Or build it with: npm run desktop:build:mac');
} else {
  console.log(`Unsupported platform "${process.platform}" for automatic install.`);
  console.log(`Linux: release/kakeibo_${version}_amd64.deb`);
  console.log(`Windows: release/Kakeibo-Setup-${version}.exe`);
  console.log(`macOS: release/Kakeibo-${version}.dmg`);
}
