console.error([
  'The legacy `npm run pipeline` entry is disabled.',
  'It targets the old 9:16 / Edge TTS / Remotion prototype and conflicts with the formal AutoVideo contract.',
  'Use `npm run video:new`, the AutoVideo workbench, and `npm run video:compile -- --project <formal-project-path>`.',
  'For explicit historical reproduction only, run `npm run pipeline:legacy`.',
].join('\n'));

process.exitCode = 1;
