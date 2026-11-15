// main.ts — the entrypoint. It copies the game and its screenshots into the
// output directory and writes dossier.json with the kit's buildDossier, so
// the scorer reads exactly what the game ships. Node 22, standard library
// only, no build step, no network. The grader runs this with the repo
// read-only at /bot, an empty /output, and no MAKEFUN_OUTPUT_DIR set; the
// output directory is therefore read from that variable, defaulting to
// /output. The copy is deterministic: same repo, same bytes out.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoDir, 'game');
const shotsDir = join(repoDir, 'screenshots');

if (!existsSync(gameDir)) {
  throw new Error('main.ts: game/ is missing from the repository (expected beside main.ts)');
}
if (!existsSync(shotsDir)) {
  throw new Error('main.ts: screenshots/ is missing from the repository (expected beside main.ts)');
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The dossier is built from the output directory itself, so what the scorer
// reads is byte-for-byte what this program wrote. Caps are the gate's own:
// text 160 KiB, 3–4 screenshots at most 256 KiB each, at most 993 game
// entries and 48 MiB of game files.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

const dossierJson = JSON.parse(new TextDecoder().decode(dossier));
console.log(`CINDERWORKS — Foundry 9`);
console.log(`output: ${outDir}`);
console.log(`dossier: ${dossier.length} bytes, ${dossierJson.images.length} screenshots (${dossierJson.images.map((i) => i.name).join(', ')})`);
console.log(`dossier text: ${dossierJson.text.length} bytes`);
console.log('done.');
