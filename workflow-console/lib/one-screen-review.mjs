import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const readJson = async (filePath, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

const fileInfo = async (root, relativePath) => {
  if (!relativePath) return null;
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('One-screen review file leaves the formal project.');
  try {
    const bytes = await fs.readFile(target);
    return {
      path: relative.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const findInternalVideo = async (formalRoot, projectId) => {
  const preferred = `renders/${projectId}-internal-review.mp4`;
  if (await fileInfo(formalRoot, preferred)) return preferred;
  const renderRoot = path.join(formalRoot, 'renders');
  try {
    const entries = await fs.readdir(renderRoot);
    const match = entries.filter((name) => name.endsWith('.mp4')).sort().at(-1);
    return match ? `renders/${match}` : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const stepForTime = (steps, timestampSeconds) => steps.find((step) => (
  timestampSeconds >= Number(step.start) && timestampSeconds < Number(step.end)
)) ?? steps.at(-1) ?? null;

export async function buildOneScreenReview({project, formalRoot}) {
  const compositionRoot = path.join(formalRoot, 'production', 'hyperframes');
  const [build, shotManifest, narrationLock, qa, review] = await Promise.all([
    readJson(path.join(compositionRoot, 'data', 'composition-build.json')),
    readJson(path.join(compositionRoot, 'data', 'shot-manifest.json')),
    readJson(path.join(formalRoot, 'NarrationLock.json')),
    readJson(path.join(formalRoot, 'qa', 'one-screen-mvp-report.json')),
    readJson(path.join(formalRoot, 'review', 'one-screen-final-review.json')),
  ]);
  if (build?.continuity?.mode !== 'one-screen-master-board') return null;
  const narration = narrationLock?.frozenPath
    ? await fs.readFile(path.join(formalRoot, narrationLock.frozenPath), 'utf8')
    : '';
  const videoPath = await findInternalVideo(formalRoot, project.id);
  const storyboardPath = 'review/one-screen-master-storyboard.png';
  const [video, storyboard, captions, qaReceipt] = await Promise.all([
    fileInfo(formalRoot, videoPath),
    fileInfo(formalRoot, storyboardPath),
    fileInfo(formalRoot, 'captions/narration.zh-CN.srt'),
    fileInfo(formalRoot, 'qa/one-screen-mvp-report.json'),
  ]);
  const steps = (shotManifest?.shots ?? []).map((shot, index) => ({
    index: index + 1,
    cueId: shot.cueId,
    start: Number(shot.start),
    end: Number(shot.end),
    title: shot.screenText?.text ?? '',
    narration: shot.narration,
  }));
  return {
    schemaVersion: 'autovideo-one-screen-review-view/v1',
    projectId: project.id,
    title: project.title,
    narration: narration.trim(),
    format: {ratio: project.ratio, resolution: project.resolution, fps: project.fps, durationSeconds: build.timeline?.duration ?? null},
    build: {
      compilerVersion: build.compilerVersion,
      continuityMode: build.continuity.mode,
      fixedHostPose: build.continuity.fixedHostPose,
      stepCount: build.continuity.oneScreenStepCount,
      transition: build.continuity.transition,
    },
    qa: qa ?? {status: 'pending', checks: {}},
    review: review ?? {decision: 'pending', notes: '', issues: []},
    deliverables: {video, storyboard, captions, qa: qaReceipt},
    steps,
  };
}

export async function listOneScreenProjectSummaries({candidates, getProject, formalRootFor}) {
  const projects = [];
  for (const candidate of candidates) {
    const project = await getProject(candidate.id);
    if (!project.formalProjectPath) continue;
    const view = await buildOneScreenReview({project, formalRoot: formalRootFor(project)});
    if (!view) continue;
    projects.push({
      projectId: project.id,
      title: project.title,
      qaStatus: view.qa.status,
      reviewDecision: view.review.decision,
    });
  }
  return projects;
}

export async function saveOneScreenReview({project, formalRoot, input}) {
  const current = await buildOneScreenReview({project, formalRoot});
  if (!current) throw new Error('This project is not a one-screen MVP build.');
  if (!current.deliverables.video || !current.deliverables.storyboard) throw new Error('Render and master storyboard must exist before review.');
  const decision = input?.decision;
  if (!['approve', 'revise'].includes(decision)) throw new Error('Review decision must be approve or revise.');
  if (decision === 'approve' && current.qa?.status !== 'passed') throw new Error('Automated QA must pass before approval.');
  const notes = String(input?.notes ?? '').trim().slice(0, 8000);
  if (decision === 'revise' && !notes) throw new Error('Revision feedback requires a note.');
  if (decision === 'approve' && input?.watchedToEnd !== true) throw new Error('Watch the full video before approving it.');
  const timestampSeconds = Math.max(0, Math.min(Number(input?.timestampSeconds ?? 0), Number(current.format.durationSeconds ?? 0)));
  const cue = decision === 'revise' ? stepForTime(current.steps, timestampSeconds) : null;
  const receipt = {
    schemaVersion: 'autovideo-one-screen-final-review/v1',
    projectId: project.id,
    decision,
    reviewedBy: String(input?.reviewer || 'user').slice(0, 100),
    reviewedAt: new Date().toISOString(),
    humanReviewPerformed: true,
    fullTimelineWatched: input?.watchedToEnd === true,
    publicReleaseBlocked: true,
    bindings: {
      video: current.deliverables.video,
      storyboard: current.deliverables.storyboard,
      qa: current.deliverables.qa,
      narrationSha256: crypto.createHash('sha256').update(current.narration.trim()).digest('hex'),
    },
    notes,
    issues: decision === 'revise' ? [{
      timestampSeconds: Number(timestampSeconds.toFixed(3)),
      cueId: cue?.cueId ?? null,
      elementId: cue ? `visual-${cue.cueId}` : null,
      note: notes,
      status: 'open',
    }] : [],
  };
  const target = path.join(formalRoot, 'review', 'one-screen-final-review.json');
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}
