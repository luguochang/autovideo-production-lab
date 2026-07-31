---
type: narration-timeline-audit
project_id: demoText-a6-handdrawn-landscape
status: verified
source: projects/demoText-a6-handdrawn-landscape/assets/narration.json
---

# demoText A6 时间轴核对

## 结论

`narration.json` 是有效 UTF-8 JSON，Node `JSON.parse` 可正常读取。它包含 14 个章节、46 个句级 cue、109 个 caption、809 个词级时间戳。不要把本文当作第二份字幕源；制作代码应继续直接读取或复制冻结的 `narration.json`。

锁定元数据：

- `duration`: `274.394667s`
- `metadataEnd`: `274.424526s`
- `fps`: `30`
- `voice`: `zh-CN-YunxiNeural`
- `rate`: `1.08`
- NarrationLock（LF 规范化 `text` 的 SHA-256）：`92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`

原始 `demoText.txt` 使用 CRLF；直接对文件字节计算出的哈希不同，这是预期的换行规范化差异，不应重新生成 NarrationLock。

## 章节映射

`sentenceStart` / `sentenceEnd` 是半开区间 `[start, end)`，可直接映射到 `sentences` 数组：

| 章节 | 起止（秒） | cue |
|---|---:|---|
| C01 | 0.1000000–6.2884256 | S01 |
| C02 | 6.2384256–19.0856473 | S02–S03 |
| C03 | 19.0856473–34.9537023 | S04–S05 |
| C04 | 34.9537023–52.0486089 | S06–S08 |
| C05 | 52.0486090–57.0486088 | S09 |
| C06 | 57.0486088–87.6157371 | S10–S13 |
| C07 | 87.6157372–114.0856435 | S14–S17 |
| C08 | 114.0856436–139.7180499 | S18–S20 |
| C09 | 139.7180500–167.0791599 | S21–S25 |
| C10 | 167.0791600–197.4611032 | S26–S35 |
| C11 | 197.4611032–214.0467506 | S36–S39 |
| C12 | 214.0467507–224.6486021 | S40 |
| C13 | 224.6486021–249.1856381 | S41–S43 |
| C14 | 249.1856382–274.4245260 | S44–S46 |

## 实现约定

建议在 composition 初始化时，将句级数组映射成如下内部结构；`chapter` 由半开区间查找得到，`source` 固定为 `exact-source`：

```js
const cues = narration.sentences.map((sentence, i) => {
  const nextStart = narration.sentences[i + 1]?.start;
  const measuredEnd = sentence.start + sentence.duration;
  const end = Math.min(
    nextStart == null ? narration.metadataEnd : nextStart,
    narration.duration,
  );
  return {
    id: `S${String(i + 1).padStart(2, "0")}`,
    start: sentence.start,
    end,
    duration: Math.max(0, end - sentence.start),
    startFrame: Math.round(sentence.start * 30),
    endFrame: Math.round(end * 30),
    text: sentence.text,
    source: "exact-source",
    measuredEnd,
  };
});
```

屏幕上的句子字幕必须最多两行，并在当前 cue 的 `start` 才出现；不能把后续 cue 的术语预先放到画板上。画板对象可以在 cue 结束后保留并降对比度，但字幕元素应在下一个 cue 开始时替换，避免双层重叠。

## 已发现的时间边界风险

1. `S01` 的测量结束为 `6.2884256`，而 `S02` 开始为 `6.2384256`，存在约 `50ms` 重叠。应以“下一 cue 的 start”作为前一字幕的显示上限；不要直接使用 `start + duration` 叠放两个字幕。
2. `S46` 和 `C14` 的结束为 `metadataEnd=274.424526`，比 NarrationLock 的 `duration=274.394667` 多 `29.859ms`。若根 composition 固定使用锁定时长，应将末 cue 显示结束裁到 `duration`；若保留完整音频尾部，则把根时长明确记录为 `metadataEnd`，并让最终画板动作在 `272.4s` 左右完成后保持。
3. 章节时间有极少量 `0.0000001s` 舍入间隙；不要用严格相等判断章节归属，使用 `start <= t && t < end` 或帧整数区间。

## 复核命令

在项目根目录执行以下命令可复核计数与边界：

```powershell
@'
const fs = require("fs");
const n = JSON.parse(fs.readFileSync("projects/demoText-a6-handdrawn-landscape/assets/narration.json", "utf8"));
console.log({ chapters: n.chapters.length, sentences: n.sentences.length, captions: n.captions.length, words: n.words.length, duration: n.duration, metadataEnd: n.metadataEnd });
for (let i = 0; i < n.sentences.length - 1; i++) {
  const end = n.sentences[i].start + n.sentences[i].duration;
  const delta = n.sentences[i + 1].start - end;
  if (Math.abs(delta) > 1e-7) console.log(i + 1, delta);
}
'@ | node -
```

## 产物

- `projects/demoText-a6-handdrawn-landscape/board.json`：仅含 14 章、46 cue 的时间、帧和 `exact-source` 来源范围；不复制口播文案。
- `projects/demoText-a6-handdrawn-landscape/ASSET_MANIFEST.md`：记录冻结音频、时间戳、脚本、GSAP 和运行时/参考资料的来源、哈希与许可状态。
