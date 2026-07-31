import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type Caption = {text: string; start: number; duration: number};
type Scene = {type: string; duration: number; headline: string; body: string; narration: string; items?: string[]; audio?: string; captions?: Caption[]};
type Storyboard = {title: string; subtitle: string; scenes: Scene[]};

const colors = {ink: '#17212b', paper: '#f7f8f3', red: '#ef4b42', cyan: '#20a6a6', yellow: '#f4c95d'};

const SceneView: React.FC<{scene: Scene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const activeCaption = scene.captions?.findIndex((caption) => time >= caption.start && time < caption.start + caption.duration);
  const captionIndex = activeCaption !== undefined && activeCaption >= 0 ? activeCaption : 0;
  const captionWindow = scene.captions?.slice(Math.max(0, captionIndex - 3), captionIndex + 5) ?? [];
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 120}});
  const opacity = interpolate(frame, [0, 12, scene.duration - 12, scene.duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const progress = interpolate(frame, [0, scene.duration], [0, 1], {easing: Easing.linear});
  return (
    <AbsoluteFill style={{backgroundColor: colors.paper, color: colors.ink, fontFamily: 'Microsoft YaHei, sans-serif', padding: '118px 82px 92px', opacity}}>
      {scene.audio && <Audio src={staticFile(scene.audio)} />}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, fontWeight: 700}}>
        <span style={{color: colors.red}}>AI KNOWLEDGE</span><span>0{index + 1}</span>
      </div>
      <div style={{marginTop: 120, transform: `translateY(${(1 - enter) * 70}px)`}}>
        <div style={{width: 110, height: 12, background: index % 2 ? colors.cyan : colors.red, marginBottom: 42}} />
        <h1 style={{fontSize: scene.type === 'hook' ? 112 : 82, lineHeight: 1.18, margin: 0, whiteSpace: 'pre-line', letterSpacing: 0}}>{scene.headline}</h1>
        <p style={{fontSize: 42, lineHeight: 1.55, marginTop: 44, color: '#52606b'}}>{scene.body}</p>
      </div>
      {scene.items && <div style={{display: 'grid', gap: 25, marginTop: 80}}>{scene.items.map((item, i) => {
        const itemIn = spring({frame: frame - i * 15 - 20, fps, config: {damping: 20}});
        return <div key={item} style={{display: 'flex', alignItems: 'center', gap: 24, padding: '28px 34px', border: '3px solid #dce1dc', background: 'white', transform: `translateX(${(1 - itemIn) * 90}px)`, opacity: itemIn}}><b style={{display: 'grid', placeItems: 'center', width: 58, height: 58, background: i === scene.items!.length - 1 ? colors.yellow : colors.cyan, color: 'white', fontSize: 28}}>{i + 1}</b><span style={{fontSize: 39, fontWeight: 700}}>{item}</span></div>;
      })}</div>}
      <div style={{position: 'absolute', left: 82, right: 82, bottom: 190, minHeight: 116, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 28px', background: 'rgba(23,33,43,0.92)', color: 'white', fontSize: 38, lineHeight: 1.5, textAlign: 'center'}}>
        {captionWindow.length ? captionWindow.map((caption, i) => <span key={`${caption.start}-${i}`} style={{color: caption === scene.captions?.[captionIndex] ? colors.yellow : 'white'}}>{caption.text}</span>) : scene.narration}
      </div>
      <div style={{position: 'absolute', left: 82, right: 82, bottom: 88}}>
        <div style={{fontSize: 29, color: '#6b7680', marginBottom: 20}}>ECHOFLOW / REAL-TIME VOICE AGENT</div>
        <div style={{height: 8, background: '#dfe3df'}}><div style={{height: '100%', width: `${progress * 100}%`, background: colors.red}} /></div>
      </div>
    </AbsoluteFill>
  );
};

export const KnowledgeVideo: React.FC<{storyboard: Storyboard}> = ({storyboard}) => {
  let start = 0;
  return <AbsoluteFill>{storyboard.scenes.map((scene, index) => {
    const from = start; start += scene.duration;
    return <Sequence key={index} from={from} durationInFrames={scene.duration}><SceneView scene={scene} index={index} /></Sequence>;
  })}</AbsoluteFill>;
};
