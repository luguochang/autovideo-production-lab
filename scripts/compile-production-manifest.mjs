import fs from 'node:fs/promises';
import path from 'node:path';
import {compileProductionManifest, writeProductionManifest} from '../tools/planning-contract/compile-production-manifest.mjs';

const parseArgs = (argv) => {
  const args = {_: []};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) args[rawKey] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) args[rawKey] = argv[++index];
    else args[rawKey] = true;
  }
  return args;
};

const usage = () => {
  console.error('Usage: node scripts/compile-production-manifest.mjs --project <project-dir> [--output <production-manifest.json>] [--internal-motion-fallback <request.json>] [--check-only] [--force]');
  process.exitCode = 2;
};

const args = parseArgs(process.argv.slice(2));
if (!args.project) usage();
else {
  try {
    const projectRoot = path.resolve(args.project);
    const internalFallbackRequest = args['internal-motion-fallback']
      ? JSON.parse(await fs.readFile(path.resolve(args['internal-motion-fallback']), 'utf8'))
      : null;
    if (args.output && args.output !== '-') {
      const outputPath = path.resolve(args.output);
      if (!args.force) {
        try {
          await fs.access(outputPath);
          throw new Error(`Output already exists: ${outputPath}. Pass --force to replace it.`);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      const {manifest} = await writeProductionManifest({projectRoot, outputPath, internalFallbackRequest});
      console.log(JSON.stringify({
        ok: true,
        output: outputPath,
        projectId: manifest.projectId,
        sceneCount: manifest.sceneCount,
        cueCount: manifest.cueCount,
        timeline: manifest.timeline,
      }, null, 2));
    } else {
      const manifest = await compileProductionManifest({projectRoot, internalFallbackRequest});
      if (args['check-only']) {
        console.log(JSON.stringify({
          ok: true,
          projectId: manifest.projectId,
          sceneCount: manifest.sceneCount,
          cueCount: manifest.cueCount,
          graphCount: manifest.scenes.reduce((count, scene) => count + scene.graphRefs.length, 0),
          timeline: manifest.timeline,
          motionLifecycleAccess: manifest.motionLifecycleAccess,
          bindings: manifest.bindings,
        }, null, 2));
      } else {
        process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
