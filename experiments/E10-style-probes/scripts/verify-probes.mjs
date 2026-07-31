import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const probes = [
  { id: "A-handdrawn-board", file: "renders/A-handdrawn-board.mp4", width: 720, height: 1280 },
  { id: "B-magazine-collage", file: "renders/B-magazine-collage.mp4", width: 720, height: 1280 },
  { id: "C-editorial-data", file: "renders/C-editorial-data.mp4", width: 720, height: 1280 },
  { id: "A-handdrawn-board-landscape", file: "renders/A-handdrawn-board-landscape.mp4", width: 1280, height: 720 },
  { id: "B-magazine-collage-landscape", file: "renders/B-magazine-collage-landscape.mp4", width: 1280, height: 720 },
  { id: "C-editorial-data-landscape", file: "renders/C-editorial-data-landscape.mp4", width: 1280, height: 720 },
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  return { ...result, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function probeMedia(file) {
  const result = run("ffprobe.exe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    file,
  ]);
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const report = { ok: true, expectedDuration: 7.242254, probes: [] };
for (const item of probes) {
  const absolute = path.join(root, item.file);
  const row = { id: item.id, file: item.file, exists: fs.existsSync(absolute) };
  if (row.exists) {
    row.media = probeMedia(item.file);
    const streams = row.media.streams ?? [];
    row.hasVideo = streams.some((s) => s.codec_type === "video");
    row.hasAudio = streams.some((s) => s.codec_type === "audio");
    row.video = streams.find((s) => s.codec_type === "video") ?? null;
    row.audio = streams.find((s) => s.codec_type === "audio") ?? null;
    row.duration = Number(row.media.format?.duration ?? 0);
    row.dimensionsOk = row.video?.width === item.width && row.video?.height === item.height;
    row.frameRateOk = row.video?.r_frame_rate === "30/1";
    const blackDetect = run("ffmpeg.exe", [
      "-v", "info", "-i", item.file,
      "-vf", "blackdetect=d=0.15:pix_th=0.10",
      "-an", "-f", "null", "-",
    ]);
    const decode = run("ffmpeg.exe", ["-v", "error", "-i", item.file, "-f", "null", "-"]);
    row.decodeOk = decode.status === 0;
    row.blackDetectOk = blackDetect.status === 0;
    row.blackIntervals = (blackDetect.stderr.match(/black_start:/g) ?? []).length;
    row.ok = row.hasVideo
      && row.hasAudio
      && row.dimensionsOk
      && row.frameRateOk
      && row.decodeOk
      && row.blackDetectOk
      && row.duration > 7.0
      && row.duration < 8.0
      && row.blackIntervals === 0;
  } else {
    row.ok = false;
  }
  report.probes.push(row);
  report.ok &&= row.ok;
}

fs.mkdirSync(path.join(root, "qa"), { recursive: true });
fs.writeFileSync(path.join(root, "qa", "media-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
