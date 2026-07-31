import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type Beat = {section: string; layout: string; headline: string; accent: string; narration: string; items: string[]; duration?: number; audio?: string};
type ReferenceData = {title: string; kicker: string; beats: Beat[]};
const palette = {bg: '#536a7d', white: '#ffffff', mint: '#91f0d3', mintDark: '#2e6f68', coral: '#f1a1a8', ink: '#20323c'};

const Tag: React.FC<{children: React.ReactNode; coral?: boolean; delay?: number; compact?: boolean}> = ({children, coral, delay = 0, compact}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 150}});
  return <span style={{display: 'inline-flex', alignItems: 'center', padding: compact ? '7px 10px' : '8px 15px', background: coral ? palette.coral : palette.mint, color: coral ? '#9d3141' : palette.ink, fontSize: compact ? 22 : 28, fontWeight: 650, borderRadius: 3, whiteSpace: 'nowrap', transform: `scale(${enter})`, opacity: enter}}>{children}</span>;
};

const Visual: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({frame: frame - 8, fps, config: {damping: 20}});
  if (beat.layout === 'wave') return <div style={{display: 'flex', height: 115, alignItems: 'center', justifyContent: 'center', gap: 10}}>{Array.from({length: 17}, (_, i) => <div key={i} style={{width: 11, height: 28 + Math.abs(Math.sin(i * 1.2 + frame / 7)) * 80, background: palette.white, borderRadius: 2}} />)}</div>;
  if (beat.layout === 'flow') return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', gap: 9, width: '100%'}}>{beat.items.map((item, i) => <React.Fragment key={item}><Tag compact delay={i * 5}>{item}</Tag>{i < beat.items.length - 1 && <span style={{fontSize: 31, fontWeight: 900, color: palette.white, opacity: reveal}}>→</span>}</React.Fragment>)}</div>;
  if (beat.layout === 'compare') return <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(beat.items.length, 3)}, 1fr)`, gap: 22, width: '100%'}}>{beat.items.map((item, i) => <div key={item} style={{padding: '25px 22px', minHeight: 100, background: i === 0 ? palette.coral : palette.mint, color: palette.ink, fontSize: 25, lineHeight: 1.4, textAlign: 'center', transform: `translateY(${(1 - reveal) * (30 + i * 12)}px)`, opacity: reveal}}>{item}</div>)}</div>;
  if (beat.layout === 'statement') return <div style={{fontSize: 45, lineHeight: 1.35, fontWeight: 700, color: palette.white, textAlign: 'center', transform: `scale(${0.9 + reveal * 0.1})`}}>{beat.items[0] || beat.accent}</div>;
  return <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18}}>{beat.items.map((item, i) => <Tag key={item} delay={i * 6} coral={i === 0 && beat.items.length > 3}>{item}</Tag>)}</div>;
};

const BeatView: React.FC<{beat: Beat; index: number; total: number}> = ({beat, index, total}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 20, stiffness: 130}});
  return <AbsoluteFill style={{color: palette.white, fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif'}}>
    {beat.audio && <Audio src={staticFile(beat.audio)} />}
    <div style={{position: 'absolute', top: 132, left: 90, right: 90, textAlign: 'center', opacity: enter, transform: `translateY(${(1 - enter) * 22}px)`}}>
      <Tag coral>{beat.section}</Tag>
      <h1 style={{fontSize: 49, lineHeight: 1.2, margin: '23px 0 12px', letterSpacing: 0}}>{beat.headline}</h1>
      <div style={{fontSize: 28, color: palette.mint, fontWeight: 700}}>{beat.accent}</div>
    </div>
    <div style={{position: 'absolute', top: 355, left: 90, right: 90, minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Visual beat={beat} /></div>
    <div style={{position: 'absolute', left: 56, right: 56, bottom: 32, display: 'flex', alignItems: 'center', gap: 22}}>
      <div style={{fontSize: 16, color: 'rgba(255,255,255,0.65)', width: 44}}>{String(index + 1).padStart(2, '0')}</div>
      <div style={{flex: 1, textAlign: 'center', fontSize: 24, lineHeight: 1.4, textShadow: '0 1px 2px rgba(0,0,0,.25)'}}>{beat.narration}</div>
      <div style={{fontSize: 16, color: 'rgba(255,255,255,0.65)', width: 44, textAlign: 'right'}}>{total}</div>
    </div>
  </AbsoluteFill>;
};

export const ReferenceStyleVideo: React.FC<{data: ReferenceData}> = ({data}) => {
  let from = 0;
  return <AbsoluteFill style={{background: palette.bg}}>
    <div style={{position: 'absolute', zIndex: 10, top: 54, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}><span style={{padding: '7px 14px', background: 'rgba(255,255,255,0.22)', color: palette.mint, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 29, fontWeight: 800}}>ECHOFLOW 实时语音 AGENT</span></div>
    {data.beats.map((beat, index) => {const start = from; const duration = beat.duration ?? 150; from += duration; return <Sequence key={index} from={start} durationInFrames={duration}><BeatView beat={beat} index={index} total={data.beats.length} /></Sequence>;})}
  </AbsoluteFill>;
};
