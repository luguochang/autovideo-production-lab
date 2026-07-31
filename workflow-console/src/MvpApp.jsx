import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Check, CircleAlert, Clock3, FileText, Film, RefreshCw, Send, ShieldCheck} from 'lucide-react';
import './mvp.css';

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {'Content-Type': 'application/json', ...(options.headers || {})},
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
};

const fileUrl = (projectId, file) => file?.path
  ? `/api/projects/${encodeURIComponent(projectId)}/deliverables/file?path=${encodeURIComponent(file.path)}`
  : null;

const formatTime = (seconds) => {
  const value = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
};

const hasPlayedFullTimeline = (video) => {
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return false;
  let playedSeconds = 0;
  for (let index = 0; index < video.played.length; index += 1) {
    playedSeconds += video.played.end(index) - video.played.start(index);
  }
  return playedSeconds / video.duration >= 0.97;
};

export default function MvpApp() {
  const videoRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [watchedToEnd, setWatchedToEnd] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (requestedId = '') => {
    setError('');
    const list = await api('/api/one-screen/projects');
    setProjects(list.projects);
    const nextId = requestedId || list.projects[0]?.projectId || '';
    setSelectedId(nextId);
    setCurrentTime(0);
    setWatchedToEnd(false);
    if (!nextId) {
      setView(null);
      return;
    }
    const payload = await api(`/api/one-screen/projects/${encodeURIComponent(nextId)}`);
    setView(payload.project);
    setNotes(payload.project.review?.notes || '');
  }, []);

  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, [load]);

  const submitReview = async (decision) => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/one-screen/projects/${encodeURIComponent(view.projectId)}/review`, {
        method: 'POST',
        body: JSON.stringify({decision, notes, timestampSeconds: currentTime, watchedToEnd, reviewer: 'user'}),
      });
      await load(view.projectId);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return <main className="mvp-empty"><Film size={28} /><h1>单屏样片验收</h1><p>{error || '正在读取样片...'}</p></main>;
  }

  const videoUrl = fileUrl(view.projectId, view.deliverables.video);
  const storyboardUrl = fileUrl(view.projectId, view.deliverables.storyboard);
  const qaPassed = view.qa?.status === 'passed';

  return (
    <main className="mvp-shell">
      <header className="mvp-header">
        <div>
          <span className="mvp-brand">AUTOVIDEO / ONE SCREEN</span>
          <h1>单屏样片验收</h1>
        </div>
        <div className="mvp-header-actions">
          {projects.length > 1 && (
            <select value={selectedId} onChange={(event) => load(event.target.value).catch((reason) => setError(reason.message))} aria-label="选择样片">
              {projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.title}</option>)}
            </select>
          )}
          <button className="icon-button" type="button" title="刷新" aria-label="刷新" onClick={() => load(selectedId).catch((reason) => setError(reason.message))}><RefreshCw size={18} /></button>
          <a className="advanced-link" href="/?advanced=1">高级维护</a>
        </div>
      </header>

      <section className="mvp-status-band" aria-label="交付状态">
        <span><FileText size={16} /> 文稿已锁定</span>
        <span><Film size={16} /> 单屏 {view.build.stepCount} 步</span>
        <span className={qaPassed ? 'is-pass' : 'is-pending'}><ShieldCheck size={16} /> {qaPassed ? '自测通过' : '自测待完成'}</span>
        <span><Clock3 size={16} /> {Number(view.format.durationSeconds).toFixed(1)} 秒</span>
      </section>

      {error && <div className="mvp-error"><CircleAlert size={17} />{error}</div>}

      <section className="mvp-review-grid">
        <div className="mvp-player-pane">
          <div className="section-heading"><h2>成片</h2><span>{view.format.resolution} · {view.format.fps} FPS</span></div>
          {videoUrl ? (
            <video
              ref={videoRef}
              controls
              preload="metadata"
              src={videoUrl}
              onLoadedMetadata={() => {
                setCurrentTime(0);
                setWatchedToEnd(false);
              }}
              onTimeUpdate={(event) => {
                setCurrentTime(event.currentTarget.currentTime);
                if (hasPlayedFullTimeline(event.currentTarget)) setWatchedToEnd(true);
              }}
              onEnded={(event) => setWatchedToEnd(hasPlayedFullTimeline(event.currentTarget))}
            />
          ) : <div className="media-missing">内部审片 MP4 尚未生成</div>}
        </div>
        <div className="mvp-storyboard-pane">
          <div className="section-heading"><h2>完整单屏</h2><span>最终帧包含全部内容</span></div>
          {storyboardUrl ? <img src={storyboardUrl} alt="完整单屏故事板" /> : <div className="media-missing">单屏故事板尚未生成</div>}
        </div>
      </section>

      <section className="mvp-plan-band">
        <div className="section-heading"><h2>画面顺序</h2><span>点击时间可定位成片</span></div>
        <div className="step-list">
          {view.steps.map((step) => (
            <button key={step.cueId} type="button" onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.currentTime = step.start + 0.35;
              setCurrentTime(step.start + 0.35);
            }}>
              <span>{String(step.index).padStart(2, '0')}</span>
              <strong title={step.title}>{step.title}</strong>
              <small>{formatTime(step.start)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="mvp-copy-band">
        <div className="section-heading"><h2>锁定口播</h2><span>NarrationLock</span></div>
        <p>{view.narration}</p>
      </section>

      <section className="mvp-feedback-band">
        <div className="feedback-copy">
          <h2>集中验收</h2>
          <p>当前定位 {formatTime(currentTime)}，退回意见会自动绑定到对应画面节点。</p>
        </div>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="需要修改时，写清楚这一处哪里不对、希望怎样调整" rows={3} />
        <div className="feedback-actions">
          <button type="button" className="secondary-command" disabled={busy || !notes.trim()} onClick={() => submitReview('revise')}><Send size={17} /> 标记此处需修改</button>
          <button type="button" className="primary-command" disabled={busy || !watchedToEnd || !qaPassed} onClick={() => submitReview('approve')}><Check size={18} /> 全片通过</button>
        </div>
        <div className="approval-state">
          {watchedToEnd ? '已完整播放，可提交通过' : '完整播放一次后开放“全片通过”'}
        </div>
      </section>
    </main>
  );
}
