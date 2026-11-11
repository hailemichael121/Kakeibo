import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const web = path.resolve('portfolio latest/files/web');

const guard = `    <script>
      (function () {
        var path = location.pathname;
        if (/\\/web\\/?$/.test(path) && path.charAt(path.length - 1) !== "/") {
          location.replace(path + "/" + location.search + location.hash);
          return;
        }
        var reveal = function () {
          var note = document.getElementById("boot-status");
          if (note) { note.hidden = false; }
        };
        window.addEventListener("error", function (event) {
          var target = event.target;
          if (target && target.tagName === "SCRIPT") { reveal(); }
        }, true);
        window.addEventListener("DOMContentLoaded", function () {
          window.setTimeout(function () {
            var root = document.getElementById("root");
            if (root && root.childElementCount === 0) { reveal(); }
          }, 8000);
        });
      })();
    </script>
    <style>
      #boot-status { max-width: 44rem; margin: 14vh auto 0; padding: 0 24px; font: 400 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #2F3931; }
      #boot-status[hidden] { display: none; }
      #boot-status p { margin: 0 0 10px; }
      #boot-status a { color: #4F6A55; text-decoration: underline; }
    </style>`;

const fallback = `<div id="root"></div>
    <div id="boot-status" role="status" hidden>
      <p><b>Kakeibo could not start in this browser.</b></p>
      <p>Reload the web app from <a href="./index.html">this page</a>. If you opened the file directly from your disk, use the <b>Open web app</b> link on the Kakeibo site instead of the file path.</p>
      <p>If it still does not load, try a current version of Chrome, Firefox, Safari or Edge with JavaScript enabled.</p>
    </div>`;

for (const name of ['assets', 'kakeibo-guide']) {
  await rm(path.join(web, name), { recursive: true, force: true });
  await cp(path.join(dist, name), path.join(web, name), { recursive: true });
}

for (const name of ['index.html', 'kakeibo.png', 'kakeibo.svg']) {
  await cp(path.join(dist, name), path.join(web, name));
}

let html = await readFile(path.join(web, 'index.html'), 'utf8');
if (!html.includes('boot-status')) {
  if (!html.includes('  </head>')) {
    console.error('dist/index.html has no </head>; cannot add the boot fallback.');
    process.exit(1);
  }
  html = html.replace('<script type="module"', `${guard}\n    <script type="module"`);
  html = html.replace('<div id="root"></div>', fallback);
  await writeFile(path.join(web, 'index.html'), html);
}

console.log(`Published the web app to ${path.relative(process.cwd(), web)}.`);
