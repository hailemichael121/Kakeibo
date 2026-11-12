import { spawn } from 'node:child_process';
import { copyFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const publishDir = 'portfolio latest/files';
const defaultSite = 'kaakeibo';
const defaultUrl = 'https://kaakeibo.netlify.app';
const artifactExtensions = new Set(['.apk', '.appimage', '.deb', '.exe', '.dmg']);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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

const runCapture = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}.`));
      }
    });
  });

const step = (message) => console.log(`\n▶ ${message}`);

const hasReleaseArtifacts = async () => {
  try {
    const entries = await readdir(path.join(repoRoot, 'release'), { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && artifactExtensions.has(path.extname(entry.name).toLowerCase()),
    );
  } catch {
    return false;
  }
};

const resolveSite = async () => {
  if (process.env.NETLIFY_SITE_ID) {
    return process.env.NETLIFY_SITE_ID;
  }
  try {
    const state = JSON.parse(
      await readFile(path.join(repoRoot, '.netlify', 'state.json'), 'utf8'),
    );
    if (state.siteId) {
      return state.siteId;
    }
  } catch {}
  return process.env.NETLIFY_SITE ?? defaultSite;
};

const verifyLive = async (baseUrl) => {
  const paths = ['/', '/story', '/practice', '/downloads', '/web/'];
  let failures = 0;

  for (const pathname of paths) {
    const url = baseUrl + pathname;
    let status = 0;
    let ok = false;

    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        status = response.status;
        ok = response.ok;
      } catch (error) {
        status = error.message;
      }
      if (!ok) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    console.log(`${ok ? '✓' : '✗'} ${url} (${status})`);
    if (!ok) {
      failures += 1;
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} live page check(s) failed. The deploy may still be propagating.`);
  }
};

step('Building the web app');
await run(npm, ['run', 'build']);

step('Publishing the web app into the portfolio');
await run(process.execPath, ['scripts/publish-web.mjs']);

if (await hasReleaseArtifacts()) {
  step('Refreshing checksums and published downloads from release/');
  await run(npm, ['run', 'checksums']);
}

step('Syncing the root checksum manifest');
await copyFile(
  path.join(repoRoot, publishDir, 'downloads', 'SHA256SUMS'),
  path.join(repoRoot, publishDir, 'SHA256SUMS'),
);

step('Verifying checksums, download links and embedded hashes');
await run(npm, ['run', 'checksums:check']);

const site = await resolveSite();
const message = process.env.NETLIFY_DEPLOY_MESSAGE ?? `Publish ${new Date().toISOString()}`;

step(`Deploying ${publishDir} to Netlify`);
const deployOutput = await runCapture(npx, [
  '--yes',
  'netlify',
  'deploy',
  '--dir',
  publishDir,
  '--prod',
  '--no-build',
  '--site',
  site,
  '--message',
  message,
  '--json',
]);

let deployedUrl = process.env.NETLIFY_URL ?? defaultUrl;
try {
  const start = deployOutput.indexOf('{');
  const end = deployOutput.lastIndexOf('}');
  const result = JSON.parse(deployOutput.slice(start, end + 1));
  if (result.url) {
    deployedUrl = result.url;
  }
} catch (error) {
  console.warn(`Could not read the deployed URL from Netlify output: ${error.message}`);
}

const liveUrl = deployedUrl.replace(/\/+$/, '');

step('Verifying the live site');
await verifyLive(liveUrl);

console.log(`\nPublished: ${liveUrl}`);
