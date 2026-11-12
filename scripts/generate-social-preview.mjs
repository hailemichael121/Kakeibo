import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(import.meta.dirname, '..');
const siteDir = path.join(repoRoot, 'portfolio latest/files');
const assetsDir = path.join(siteDir, 'assets');
const fontsDir = path.join(siteDir, 'fonts');

const toDataUri = async (file, mime) =>
  `data:${mime};base64,${(await readFile(file)).toString('base64')}`;

const fontFace = (family, file, weight, style = 'normal') =>
  `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url("${file}") format("woff2")}`;

const logo = await toDataUri(path.join(assetsDir, 'kakeibo-logo.png'), 'image/png');
const phone = await toDataUri(path.join(assetsDir, 'kakeibo-mobile.webp'), 'image/webp');
const sans400 = await toDataUri(path.join(fontsDir, 'plus-jakarta-sans-400.woff2'), 'font/woff2');
const sans600 = await toDataUri(path.join(fontsDir, 'plus-jakarta-sans-600.woff2'), 'font/woff2');
const hand400 = await toDataUri(path.join(fontsDir, 'shantell-sans-400.woff2'), 'font/woff2');

const fontFaces = [
  fontFace('Plus Jakarta Sans', sans400, 400),
  fontFace('Plus Jakarta Sans', sans600, 600),
  fontFace('Shantell Sans', hand400, 400),
].join('\n');

const watermark = `
  <svg class="watermark" viewBox="0 0 520 420" aria-hidden="true">
    <ellipse class="wash" cx="260" cy="330" rx="210" ry="60"/>
    <circle cx="404" cy="88" r="34"/>
    <path d="M60 92q18-12 36 0t36 0M420 176q16-11 32 0t32 0"/>
    <path d="M260 32v48M236 80h48"/>
    <path d="M170 112q90-30 180 0M186 112h148M200 128h120"/>
    <path d="M150 154q110-36 220 0M170 154h180M186 170h148"/>
    <path d="M128 198q132-42 264 0M150 198h220M168 214h184"/>
    <path d="M106 244q154-48 308 0M130 244h260M150 260h220"/>
    <path d="M82 292q178-54 356 0M108 292h304M130 308h260"/>
    <path d="M100 344h320M80 358h360M60 372h400M40 386h440"/>
    <path d="M220 154v44M300 154v44M200 198v46M320 198v46M180 244v48M340 244v48M160 292v52M360 292v52"/>
    <path d="M240 308v38h40v-38M246 346v22M274 346v22M200 344v-22M320 344v-22M260 128v48M260 198v46M260 260v48"/>
    <path d="M84 338q28-2 42-18h24q16 16 44 18M76 340v24M194 340v24M76 364h118"/>
    <path d="M436 338q-28-2-42-18h-24q-16 16-44 18M444 340v24M326 340v24M326 364h118"/>
  </svg>`;

const enso = `
  <svg class="enso" viewBox="0 0 600 600" aria-hidden="true">
    <path d="M470 140c90 90 75 240-25 325-95 80-245 65-325-30C45 345 75 205 175 130c75-55 175-55 245-10" stroke-width="18"/>
    <path d="M455 160c75 85 55 210-30 280-85 70-210 55-280-25-60-70-40-185 40-250 65-50 155-50 220-15" stroke-width="5" opacity=".5"/>
  </svg>`;

const html = (kind) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFaces}
:root{
  --paper:#F4F2EB;
  --paper-deep:#EAE7DE;
  --paper-light:#F8F6F0;
  --ink:#2F3931;
  --muted:#5E685F;
  --sage-deep:#566B58;
  --terracotta-deep:#9A5B4E;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper)}
body{
  color:var(--ink);
  font-family:"Plus Jakarta Sans",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
.card{
  position:relative;
  width:1200px;
  height:630px;
  overflow:hidden;
  background:
    radial-gradient(50rem 38rem at 94% 2%,rgba(165,181,160,.30),transparent 64%),
    radial-gradient(42rem 32rem at -4% 64%,rgba(214,181,141,.22),transparent 66%),
    linear-gradient(170deg,var(--paper-light),var(--paper) 52%,var(--paper-deep));
}
.card.square{height:1200px}
.noise{
  position:absolute;
  inset:0;
  z-index:1;
  pointer-events:none;
  opacity:.045;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
}
.watermark{
  position:absolute;
  z-index:1;
  color:var(--sage-deep);
  opacity:.075;
  pointer-events:none;
  overflow:visible;
  -webkit-mask-image:linear-gradient(152deg,#000 0%,rgba(0,0,0,.7) 40%,rgba(0,0,0,.16) 66%,transparent 82%);
  mask-image:linear-gradient(152deg,#000 0%,rgba(0,0,0,.7) 40%,rgba(0,0,0,.16) 66%,transparent 82%);
}
.watermark :is(path,circle,ellipse){fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.watermark .wash{fill:currentColor;opacity:.16;stroke:none}
.lockup{
  position:absolute;
  z-index:4;
  display:flex;
  align-items:center;
  gap:16px;
}
.lockup img{
  width:62px;
  height:62px;
  object-fit:contain;
  filter:drop-shadow(0 6px 12px rgba(47,57,49,.14));
}
.wordmark{font-weight:600;font-size:42px;line-height:.9;letter-spacing:-.05em}
.tagline{
  margin-top:7px;
  color:var(--muted);
  font-weight:600;
  font-size:10px;
  line-height:1;
  letter-spacing:.16em;
  text-transform:uppercase;
}
.copy{position:absolute;z-index:3}
.eyebrow{
  margin:0 0 20px;
  color:var(--sage-deep);
  font-weight:600;
  font-size:14px;
  line-height:1;
  letter-spacing:.16em;
  text-transform:uppercase;
}
h1{font-weight:600;margin:0;letter-spacing:-.065em}
h1 em{font-style:italic;color:var(--sage-deep)}
.lead{color:var(--muted);margin:22px 0 0;line-height:1.5;font-weight:400}
.meta{
  position:absolute;
  z-index:3;
  display:flex;
  align-items:center;
  gap:20px;
  color:var(--muted);
  font-size:13px;
  font-weight:500;
}
.meta span{display:inline-flex;align-items:center;gap:8px}
.meta span::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--sage-deep)}
.visual{position:absolute;z-index:2}
.enso{position:absolute;color:var(--sage-deep);opacity:.14}
.enso path{fill:none;stroke:currentColor;stroke-linecap:round}
.phone{
  position:relative;
  z-index:2;
  padding:9px;
  border-radius:42px;
  background:linear-gradient(145deg,#3B463D,#252D27);
  border:1px solid rgba(255,255,255,.18);
  box-shadow:0 38px 76px rgba(47,57,49,.26),inset 0 1px 0 rgba(255,255,255,.18);
}
.phone::before{
  content:"";
  position:absolute;
  z-index:3;
  top:14px;
  left:50%;
  width:46px;
  height:6px;
  border-radius:999px;
  background:rgba(248,246,240,.22);
  transform:translateX(-50%);
}
.phone img{display:block;width:100%;height:auto;border-radius:33px;background:var(--paper-light)}
.note{
  position:absolute;
  z-index:3;
  margin:0;
  color:var(--terracotta-deep);
  font-family:"Shantell Sans",cursive;
  font-size:36px;
  line-height:1.3;
  letter-spacing:.01em;
  transform:rotate(-2deg);
}
.wide .lockup{left:305px;top:44px}
.wide .watermark{left:-30px;top:-10px;width:560px}
.wide .copy{left:305px;top:150px;width:590px}
.wide h1{font-size:78px;line-height:.94}
.wide .lead{font-size:20px;max-width:520px}
.wide .meta{left:305px;bottom:44px;gap:18px;font-size:12px}
.wide .visual{right:30px;top:44px;width:300px;height:550px}
.wide .enso{right:-20px;top:16px;width:480px}
.wide .phone{position:absolute;right:10px;top:0;width:230px}
.square .lockup{left:72px;top:66px}
.square .lockup img{width:72px;height:72px}
.square .wordmark{font-size:50px}
.square .tagline{font-size:11px;margin-top:8px}
.square .watermark{left:-40px;top:40px;width:760px}
.square .copy{left:72px;top:250px;width:680px}
.square h1{font-size:104px;line-height:.94}
.square .lead{font-size:26px;max-width:640px;margin-top:28px}
.square .note{left:72px;top:800px}
.square .meta{left:72px;bottom:70px;font-size:15px;gap:26px}
.square .visual{right:50px;bottom:-50px;width:430px;height:760px}
.square .enso{right:-70px;bottom:0;width:640px}
.square .phone{position:absolute;right:20px;bottom:0;width:330px}
</style>
</head>
<body>
<div class="card ${kind}">
  <div class="noise"></div>
  ${watermark}
  <div class="lockup">
    <img src="${logo}" alt="">
    <div>
      <div class="wordmark">Kakeibo</div>
      <div class="tagline">A little more mindful</div>
    </div>
  </div>
  <div class="copy">
    <p class="eyebrow">Kakeibo · 家計簿 · a household ledger</p>
    <h1>Money, with<br><em>room to<br>breathe.</em></h1>
    <p class="lead">A calm, offline-first household ledger inspired by the Japanese Kakeibo practice.</p>
  </div>
  ${kind === 'square' ? '<p class="note">a little attention,<br>once a month.</p>' : ''}
  <div class="meta"><span>Offline-first</span><span>No account</span><span>Android · Linux · Windows</span></div>
  <div class="visual">
    ${enso}
    <div class="phone"><img src="${phone}" alt=""></div>
  </div>
</div>
</body>
</html>`;

const outputs = [
  { kind: 'wide', file: 'og-kakeibo-wide-v2.jpg', width: 1200, height: 630 },
  { kind: 'square', file: 'og-kakeibo-square.jpg', width: 1200, height: 1200 },
];

const browser = await chromium.launch();
try {
  for (const output of outputs) {
    const page = await browser.newPage({
      viewport: { width: output.width, height: output.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html(output.kind), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode().catch(() => {}))),
    );
    await page.waitForTimeout(150);
    const destination = path.join(assetsDir, output.file);
    await page.screenshot({ path: destination, type: 'jpeg', quality: 92 });
    await page.close();
    console.log(`Wrote ${path.relative(repoRoot, destination)} (${output.width}×${output.height})`);
  }
} finally {
  await browser.close();
}
