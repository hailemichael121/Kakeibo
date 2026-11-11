import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifactExtensions = ['.apk', '.appimage', '.deb', '.exe', '.dmg'];
const manifestName = 'SHA256SUMS';
const defaultDir = path.resolve('release');
const siteRoot = path.resolve('portfolio latest/files');
const siteDownloads = path.join(siteRoot, 'downloads');
const siteManifest = path.join(siteDownloads, manifestName);
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const outputDir = path.resolve(args[0] ?? 'release');
const checkOnly = process.argv.includes('--check');

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const isArtifact = (name) => artifactExtensions.includes(path.extname(name).toLowerCase());

const listArtifacts = async (dir) => {
  if (!(await exists(dir))) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isArtifact(entry.name))
    .map((entry) => entry.name)
    .sort();
};

const hashFile = async (file) => {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
};

const formatManifest = (entries) =>
  `${entries.map(({ hash, name }) => `${hash}  ${name}`).join('\n')}\n`;

const readManifest = async (file) => {
  const entries = new Map();
  const problems = [];
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    if (!line) {
      return;
    }
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) {
      problems.push(`${path.relative(process.cwd(), file)}:${index + 1} is not "<sha256>  <filename>".`);
      return;
    }
    const [, hash, name] = match;
    if (entries.has(name)) {
      problems.push(`${path.relative(process.cwd(), file)} lists ${name} more than once.`);
      return;
    }
    entries.set(name, hash);
  });
  return { entries, problems };
};

const short = (hash) => `${hash.slice(0, 12)}…`;
const linkedFiles = (html) =>
  [...html.matchAll(/href="(?:\.\/)?downloads\/([^"/]+)"/g)]
    .map((match) => match[1])
    .filter((name) => name !== manifestName);

const verify = async () => {
  const errors = [];
  const warnings = [];

  if (!(await exists(siteManifest))) {
    console.error(`Missing published manifest at ${path.relative(process.cwd(), siteManifest)}. Run "npm run checksums" first.`);
    process.exit(1);
  }

  const site = await readManifest(siteManifest);
  errors.push(...site.problems);
  if (site.entries.size === 0) {
    errors.push(`The published ${manifestName} is empty.`);
  }

  const releaseManifest = path.join(outputDir, manifestName);
  if (await exists(releaseManifest)) {
    const release = await readManifest(releaseManifest);
    errors.push(...release.problems);
    const names = new Set([...site.entries.keys(), ...release.entries.keys()]);
    for (const name of [...names].sort()) {
      if (site.entries.get(name) !== release.entries.get(name)) {
        errors.push(`${manifestName} and the published copy disagree about ${name}.`);
      }
    }
  } else {
    warnings.push('release/SHA256SUMS is not in this checkout; compared the published manifest only.');
  }

  const published = await listArtifacts(siteDownloads);
  if (published.length === 0) {
    warnings.push('No download binaries are checked in; file hashes were not re-computed.');
  } else {
    for (const name of published) {
      const hash = await hashFile(path.join(siteDownloads, name));
      if (!site.entries.has(name)) {
        errors.push(`downloads/${name} is not listed in ${manifestName}.`);
      } else if (site.entries.get(name) !== hash) {
        errors.push(`downloads/${name} does not match its SHA-256 in ${manifestName}.`);
      }
    }
    for (const name of site.entries.keys()) {
      if (!published.includes(name)) {
        errors.push(`${manifestName} lists ${name}, but downloads/${name} is missing.`);
      }
    }
  }

  for (const name of await listArtifacts(outputDir)) {
    if (!site.entries.has(name)) {
      errors.push(`release/${name} is missing from the published ${manifestName}.`);
      continue;
    }
    if (site.entries.get(name) !== (await hashFile(path.join(outputDir, name)))) {
      errors.push(`release/${name} does not match the published ${manifestName}. Run "npm run checksums".`);
    }
  }

  const indexHtml = await readFile(path.join(siteRoot, 'index.html'), 'utf8');
  for (const name of new Set(linkedFiles(indexHtml))) {
    if (!site.entries.has(name)) {
      errors.push(`index.html links downloads/${name}, which is not in ${manifestName}.`);
    }
  }

  const downloadsHtml = await readFile(path.join(siteRoot, 'downloads.html'), 'utf8');
  const pageLinks = [...new Set(linkedFiles(downloadsHtml))];
  for (const name of pageLinks) {
    if (!site.entries.has(name)) {
      errors.push(`downloads.html links downloads/${name}, which is not in ${manifestName}.`);
    } else if (published.length > 0 && !published.includes(name)) {
      errors.push(`downloads.html links downloads/${name}, but the file is missing.`);
    }
  }
  for (const name of site.entries.keys()) {
    if (!pageLinks.includes(name)) {
      errors.push(`downloads.html does not link ${name}, which is listed in ${manifestName}.`);
    }
  }

  const manifestHashes = new Set(site.entries.values());
  const pageHashes = [...downloadsHtml.matchAll(/\b([0-9a-f]{64})\b/g)].map((match) => match[1]);
  for (const hash of manifestHashes) {
    if (!pageHashes.includes(hash)) {
      errors.push(`downloads.html does not show the fingerprint ${short(hash)} from ${manifestName}.`);
    }
  }
  for (const hash of pageHashes) {
    if (!manifestHashes.has(hash)) {
      errors.push(`downloads.html shows fingerprint ${short(hash)}, which is not in ${manifestName}.`);
    }
  }

  const webIndex = path.join(siteRoot, 'web', 'index.html');
  if (!(await exists(webIndex))) {
    errors.push('web/index.html is missing; the "Open web app" link would 404.');
  } else {
    const html = await readFile(webIndex, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (!(await exists(path.join(siteRoot, 'web', ref)))) {
        errors.push(`web/index.html references web/${ref}, which is missing — the app would load a blank page.`);
      }
    }
    if (!refs.some((ref) => ref.endsWith('.js'))) {
      errors.push('web/index.html does not load an app bundle.');
    }
  }

  const siteJs = await readFile(path.join(siteRoot, 'site.js'), 'utf8');
  for (const hash of siteJs.matchAll(/expected:\s*"([0-9a-f]{64})"/g)) {
    if (!manifestHashes.has(hash[1])) {
      errors.push(`site.js shows fingerprint ${short(hash[1])}, which is not in ${manifestName}.`);
    }
  }

  warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`error: ${error}`));
    process.exit(1);
  }
  console.log(
    `Checksums OK — ${site.entries.size} entries in ${path.relative(process.cwd(), siteManifest)}` +
      `${published.length > 0 ? `, ${published.length} file${published.length === 1 ? '' : 's'} verified` : ' (binary hashes skipped)'}.`,
  );
};

const build = async () => {
  const files = await listArtifacts(outputDir);
  if (files.length === 0) {
    console.error(`No release artifacts (${artifactExtensions.join(', ')}) found in ${outputDir}.`);
    process.exit(1);
  }

  const entries = [];
  for (const name of files) {
    const file = path.join(outputDir, name);
    const { size } = await stat(file);
    entries.push({ name, hash: await hashFile(file) });
    console.log(`  ${name}  ${(size / 1024 / 1024).toFixed(1)} MB`);
  }

  const contents = formatManifest(entries);
  const releaseManifest = path.join(outputDir, manifestName);
  await writeFile(releaseManifest, contents);
  console.log(`Wrote ${path.relative(process.cwd(), releaseManifest)} with ${entries.length} checksum${entries.length === 1 ? '' : 's'}.`);

  if (outputDir !== defaultDir) {
    return;
  }

  await mkdir(siteDownloads, { recursive: true });
  for (const name of files) {
    await copyFile(path.join(outputDir, name), path.join(siteDownloads, name));
  }
  for (const name of await listArtifacts(siteDownloads)) {
    if (!files.includes(name)) {
      await rm(path.join(siteDownloads, name));
      console.log(`Removed stale published file downloads/${name}.`);
    }
  }
  await writeFile(siteManifest, contents);
  console.log(`Published ${entries.length} download${entries.length === 1 ? '' : 's'} and ${manifestName} to ${path.relative(process.cwd(), siteDownloads)}.`);
};

if (checkOnly) {
  await verify();
} else {
  await build();
}
