import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const chrome = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const preview = new URL('./SVG图标预览.html', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('./icons.manifest.json', import.meta.url), 'utf8'));
const evidence = new URL('../evidence/', import.meta.url);
const flags = ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--hide-scrollbars', '--window-size=1260,3950'];
function runBrowser(...args) {
  const run = spawnSync(chrome, [...flags, ...args], { encoding: 'utf8', timeout: 35000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (run.error || run.status !== 0) throw new Error(String(run.error || run.stderr));
  return run.stdout;
}

const measurements = `<script>
const cards = [...document.querySelectorAll('article')];
const clipping = [];
const invalidPaths = [];
for (const card of cards) {
  const svg = card.querySelector('.light .glyph:last-child svg');
  for (const shape of svg.children) {
    const box = shape.getBBox();
    const style = getComputedStyle(shape);
    const pad = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth) / 2;
    if (box.x - pad < -.05 || box.y - pad < -.05 || box.x + box.width + pad > 24.05 || box.y + box.height + pad > 24.05) {
      clipping.push({ id: card.dataset.id, tag: shape.tagName, box: [box.x,box.y,box.width,box.height], pad });
    }
    if (shape.tagName === 'path' && !(shape.getTotalLength() > 0)) invalidPaths.push(card.dataset.id);
  }
}
const accent = theme => getComputedStyle(document.querySelector('[data-id="file.newNote"] .' + theme + ' [stroke^="var(--icon-accent"]')).stroke;
const star = theme => getComputedStyle(document.querySelector('[data-id="model.reasoning.serviceDefault"] .' + theme + ' [fill^="var(--icon-accent"]')).fill;
const menuSize = theme => document.querySelector('[data-id="panel.stashGroup"] .' + theme + ' [aria-label="14 像素"] svg').getBoundingClientRect().width;
const colors = { light: accent('light'), dark: accent('dark') };
const serviceDefaultColors = { light: star('light'), dark: star('dark') };
const stashGroupMenuSizes = { light: menuSize('light'), dark: menuSize('dark') };
document.getElementById('mono').click();
const monochrome = { light: accent('light'), dark: accent('dark') };
const serviceDefaultMonochrome = { light: star('light'), dark: star('dark') };
const report = document.createElement('pre');
report.id = 'verify-svg-report';
report.textContent = JSON.stringify({ placements: cards.length, renderedSamples: document.querySelectorAll('.glyph svg').length, clipping, invalidPaths, colors, monochrome, serviceDefaultColors, serviceDefaultMonochrome, stashGroupMenuSizes, previewFitsViewport: document.documentElement.scrollHeight <= window.innerHeight });
document.body.append(report);
</script>`;

const temp = join(tmpdir(), `hive-svg-${randomUUID()}.html`);
writeFileSync(temp, readFileSync(preview, 'utf8').replace('</html>', measurements + '</html>'), { flag: 'wx' });
try {
  const dom = runBrowser('--dump-dom', pathToFileURL(temp).href);
  const match = dom.match(/<pre id="verify-svg-report">([^<]+)<\/pre>/);
  if (!match) throw new Error('Chrome did not return SVG measurements');
  const report = JSON.parse(match[1]);
  const fileNames = readdirSync(new URL('./svg/', import.meta.url)).filter(file => file.endsWith('.svg'));
  report.assetCount = fileNames.length;
  report.manifestEntries = manifest.entries.length;
  report.uniqueAssetLinks = new Set(manifest.entries.map(entry => entry.asset)).size;
  report.sourceLinks = manifest.entries.every(entry => existsSync(new URL(entry.source, import.meta.url)) && existsSync(new URL(entry.asset, import.meta.url)));
  report.passes = report.placements === report.manifestEntries && report.renderedSamples === report.manifestEntries * 6
    && report.assetCount === report.uniqueAssetLinks && report.sourceLinks && report.previewFitsViewport
    && report.clipping.length === 0 && report.invalidPaths.length === 0
    && ['light', 'dark'].every(theme => report.colors[theme] !== report.monochrome[theme]
      && report.serviceDefaultColors[theme] === report.colors[theme]
      && report.serviceDefaultMonochrome[theme] === report.monochrome[theme]
      && report.stashGroupMenuSizes[theme] === 14);
  console.log(JSON.stringify(report));
  if (!report.passes) throw new Error('SVG asset checks failed');
  const screenshot = new URL('svg-icons-preview.png', evidence);
  runBrowser(`--screenshot=${fileURLToPath(screenshot)}`, preview.href);
  report.screenshot = 'svg-icons-preview.png';
  writeFileSync(new URL('svg-icons-check.json', evidence), JSON.stringify(report, null, 2) + '\n');
} finally {
  unlinkSync(temp);
}
