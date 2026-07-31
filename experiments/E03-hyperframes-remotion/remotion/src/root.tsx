import React from 'react';
import {AbsoluteFill, Composition, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const colors = {
  background: '#10151d',
  panel: '#182333',
  cyan: '#6ee7f2',
  amber: '#f6bd60',
  ink: '#f5f7fb',
  muted: '#9aa8bc',
};

export const BridgeDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const intro = interpolate(time, [0, 0.7], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const progress = interpolate(time, [0, 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cardX = interpolate(time, [0, 2.2, 4.4, 6], [0, 250, 520, 760], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pulse = 1 + Math.sin(frame / 10) * 0.025;

  return (
    <AbsoluteFill style={{background: colors.background, color: colors.ink, fontFamily: 'Arial, sans-serif'}}>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #10151d 0%, #182333 100%)'}} />
      <div style={{position: 'absolute', left: 130, top: 118, opacity: intro}}>
        <div style={{fontSize: 30, letterSpacing: 3, color: colors.cyan, fontWeight: 700}}>BRIDGE EXPERIMENT</div>
        <div style={{fontSize: 82, lineHeight: 1.05, fontWeight: 800, marginTop: 18}}>Remotion <span style={{color: colors.amber}}>-&gt;</span> HyperFrames</div>
        <div style={{fontSize: 28, color: colors.muted, marginTop: 26}}>Deterministic pixels become reusable media assets.</div>
      </div>
      <div style={{position: 'absolute', left: 130, top: 430, width: 1660, height: 300, border: '2px solid #34465f', borderRadius: 14, background: 'rgba(24,35,51,0.82)'}}>
        {['compose', 'render', 'reuse'].map((label, index) => {
          const x = 100 + index * 520;
          return (
            <React.Fragment key={label}>
              <div style={{position: 'absolute', left: x, top: 86, width: 270, height: 112, borderRadius: 10, background: index === 1 ? colors.amber : '#22344b', border: '2px solid #49627e', color: index === 1 ? '#1a202a' : colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700, transform: `scale(${index === 1 ? pulse : 1})`}}>{label}</div>
              {index < 2 && <div style={{position: 'absolute', left: x + 302, top: 137, width: 175, height: 4, background: colors.cyan, transformOrigin: 'left', transform: `scaleX(${interpolate(time, [index * 2.2 + 0.4, index * 2.2 + 1.4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})})`}} />}
            </React.Fragment>
          );
        })}
        <div style={{position: 'absolute', left: cardX + 94, top: 64, width: 18, height: 18, borderRadius: '50%', background: colors.cyan, boxShadow: `0 0 0 8px rgba(110,231,242,0.13)`}} />
      </div>
      <div style={{position: 'absolute', left: 130, right: 130, bottom: 85, height: 8, borderRadius: 4, background: '#27364b'}}>
        <div style={{width: `${progress * 100}%`, height: '100%', borderRadius: 4, background: colors.cyan}} />
      </div>
      <div style={{position: 'absolute', right: 130, bottom: 42, fontSize: 22, color: colors.muted}}>frame {String(frame).padStart(3, '0')} / 179</div>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="RemotionBridge" component={BridgeDemo} durationInFrames={180} fps={30} width={1920} height={1080} />
);
