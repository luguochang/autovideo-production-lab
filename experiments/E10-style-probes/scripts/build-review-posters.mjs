import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const posterDir = path.join(root, "review", "posters");
const ids = [
  "A-handdrawn-board",
  "B-magazine-collage",
  "C-editorial-data",
  "A-handdrawn-board-landscape",
  "B-magazine-collage-landscape",
  "C-editorial-data-landscape",
];

fs.mkdirSync(posterDir, { recursive: true });

for (const id of ids) {
  const input = path.join(root, "renders", `${id}.mp4`);
  const output = path.join(posterDir, `${id}.png`);
  if (!fs.existsSync(input)) {
    throw new Error(`Missing render: ${input}`);
  }

  const result = spawnSync("ffmpeg.exe", [
    "-y",
    "-v", "error",
    "-ss", "2.5",
    "-i", input,
    "-frames:v", "1",
    output,
  ], { cwd: root, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`Poster generation failed for ${id}: ${result.stderr}`);
  }

  console.log(path.relative(root, output));
}
