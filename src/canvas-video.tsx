import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type Sentence = {text: string; start: number; duration: number};
type DemoData = {duration: number; audio: string; sentences: Sentence[]};
const C = {paper: '#f3e5cf', ink: '#27343b', mint: '#b7e5d0', blue: '#c9e3ec', coral: '#efb6b4', line: '#8d806f', white: '#fffdf8'};
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const Presenter: React.FC<{style?: React.CSSProperties}> = ({style}) => <div style={{position: 'absolute', width: 150, height: 230, ...style}}>
  <div style={{position: 'absolute', left: 35, top: 8, width: 82, height: 96, borderRadius: '50% 50% 44% 44%', background: '#20262b'}} />
  <div style={{position: 'absolute', left: 48, top: 26, width: 57, height: 65, borderRadius: '48%', background: '#f0c9aa'}} />
  <div style={{position: 'absolute', left: 61, top: 51, width: 7, height: 7, borderRadius: '50%', background: C.ink, boxShadow: '25px 0 #27343b'}} />
  <div style={{position: 'absolute', left: 31, top: 98, width: 92, height: 116, borderRadius: '28px 28px 8px 8px', background: '#303b45'}} />
  <div style={{position: 'absolute', left: 13, top: 118, width: 42, height: 16, borderRadius: 8, background: '#303b45', transform: 'rotate(-25deg)'}} />
  <div style={{position: 'absolute', left: 98, top: 118, width: 42, height: 16, borderRadius: 8, background: '#303b45', transform: 'rotate(25deg)'}} />
</div>;

const Label: React.FC<{text: string; x: number; y: number; color?: string; scale?: number; opacity?: number; fontSize?: number}> = ({text, x, y, color = C.blue, scale = 1, opacity = 1, fontSize = 31}) => <div style={{position: 'absolute', left: x, top: y, padding: '10px 18px', border: `2px solid ${C.line}`, background: color, color: C.ink, fontSize, fontWeight: 700, borderRadius: 3, boxShadow: '3px 4px 0 rgba(80,65,45,.16)', whiteSpace: 'nowrap', transform: `scale(${scale})`, transformOrigin: 'center', opacity}}>{text}</div>;

export const CanvasStyleDemo: React.FC<{data: DemoData}> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const intro = spring({frame, fps, config: {damping: 18, stiffness: 115}});
  const reorganize = interpolate(t, [8.5, 10.5], [0, 1], clamp);
  const cameraX = interpolate(t, [0, 17, 22, 30], [0, 0, -470, -720], clamp);
  const cameraY = interpolate(t, [0, 17, 22, 30], [0, 0, 20, -40], clamp);
  const zoom = interpolate(t, [0, 9, 12, 20, 24], [1, 1, 0.82, 0.82, 0.9], clamp);
  const presenterX = interpolate(reorganize, [0, 1], [70, 55]);
  const presenterY = interpolate(reorganize, [0, 1], [145, 55]);
  const presenterScale = interpolate(reorganize, [0, 1], [1, 0.68]);
  const currentCaption = data.sentences.find((s) => t >= s.start && t < s.start + s.duration)?.text ?? '';
  const show = (start: number, end = start + 0.7) => interpolate(t, [start, end], [0, 1], clamp);
  return <AbsoluteFill style={{background: C.paper, overflow: 'hidden', fontFamily: 'Microsoft YaHei, sans-serif'}}>
    <Audio src={staticFile(data.audio)} />
    <div style={{position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'repeating-linear-gradient(0deg, transparent 0, transparent 47px, #8d806f 48px)'}} />
    <div style={{position: 'absolute', width: 2200, height: 1050, transformOrigin: '0 0', transform: `translate(${cameraX}px, ${cameraY}px) scale(${zoom})`}}>
      <Presenter style={{left: presenterX, top: presenterY, transform: `scale(${presenterScale})`, transformOrigin: 'top left', opacity: intro}} />
      <div style={{position: 'absolute', left: interpolate(reorganize, [0, 1], [260, 190]), top: interpolate(reorganize, [0, 1], [95, 65]), transform: `scale(${interpolate(reorganize, [0, 1], [1, 0.62])})`, transformOrigin: 'top left'}}>
        <div style={{fontSize: 43, fontWeight: 900, color: C.ink, opacity: intro}}>语音智能体，不只是串接口</div>
        <div style={{width: 650, height: 4, marginTop: 14, background: C.line, transform: `scaleX(${intro})`, transformOrigin: 'left'}} />
      </div>
      <Label text="音频接入" x={interpolate(reorganize,[0,1],[310,205])} y={interpolate(reorganize,[0,1],[250,145])} scale={interpolate(reorganize,[0,1],[show(1.8),0.64])} opacity={show(1.8)} color={C.blue} />
      <Label text="VAD" x={interpolate(reorganize,[0,1],[520,340])} y={interpolate(reorganize,[0,1],[250,145])} scale={interpolate(reorganize,[0,1],[show(3),0.64])} opacity={show(3)} color={C.mint} />
      <Label text="ASR" x={interpolate(reorganize,[0,1],[655,435])} y={interpolate(reorganize,[0,1],[250,145])} scale={interpolate(reorganize,[0,1],[show(4.2),0.64])} opacity={show(4.2)} color={C.mint} />
      <Label text="LLM" x={interpolate(reorganize,[0,1],[790,530])} y={interpolate(reorganize,[0,1],[250,145])} scale={interpolate(reorganize,[0,1],[show(5.3),0.64])} opacity={show(5.3)} color={C.coral} />
      <Label text="TTS" x={interpolate(reorganize,[0,1],[925,625])} y={interpolate(reorganize,[0,1],[250,145])} scale={interpolate(reorganize,[0,1],[show(6.4),0.64])} opacity={show(6.4)} color={C.coral} />

      <div style={{position: 'absolute', left: 315, top: 405, opacity: show(9.4), transform: `translateY(${(1-show(9.4))*35}px)`}}>
        <div style={{fontSize: 37, fontWeight: 900, color: C.ink}}>先找到输入边界</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 35}}>
          {['WebSocket', '连续 PCM', 'VAD 分段', 'ASR 文字'].map((item, i) => <React.Fragment key={item}><Label text={item} x={i*205} y={70} scale={show(10+i*1.25)} opacity={show(10+i*1.25)} color={i<2?C.blue:C.mint} fontSize={25}/>{i<3&&<span style={{position:'absolute',left:i*205+158,top:80,fontSize:37,color:C.line,opacity:show(10.5+i*1.25)}}>→</span>}</React.Fragment>)}
        </div>
      </div>

      <div style={{position: 'absolute', left: 1320, top: 115, opacity: show(17.2), transform: `scale(${0.88+show(17.2)*0.12})`}}>
        <div style={{fontSize: 42, fontWeight: 900, color: C.ink}}>输出也必须是流式的</div>
        <div style={{width: 650, height: 4, marginTop: 14, background: C.line}} />
      </div>
      <Label text="LLM Token" x={1360} y={260} opacity={show(18)} scale={show(18)} color={C.coral}/>
      <Label text="SentenceSplitter" x={1585} y={260} opacity={show(19.2)} scale={show(19.2)} color={C.blue}/>
      <Label text="TTS Task" x={1880} y={260} opacity={show(20.4)} scale={show(20.4)} color={C.mint}/>
      <div style={{position:'absolute',left:1420,top:390,fontSize:31,fontWeight:700,color:C.ink,opacity:show(22)}}>边生成　→　边分句　→　边播放</div>
      <Label text="用户再次开口" x={1430} y={505} opacity={show(24)} scale={show(24)} color={C.coral}/>
      <div style={{position:'absolute',left:1700,top:515,fontSize:38,color:C.line,opacity:show(24.8)}}>→</div>
      <Label text="立即打断旧回复" x={1770} y={505} opacity={show(25.3)} scale={show(25.3)} color={C.mint}/>
      <div style={{position:'absolute',left:1390,top:650,fontSize:43,fontWeight:900,color:C.ink,opacity:show(27),transform:`translateY(${(1-show(27))*24}px)`}}>稳定、流式、可打断</div>
    </div>
    <div style={{position: 'absolute', left: 160, right: 160, bottom: 26, minHeight: 44, display: 'grid', placeItems: 'center', padding: '6px 18px', background: 'rgba(39,52,59,.88)', color: C.white, fontSize: 24}}>{currentCaption}</div>
  </AbsoluteFill>;
};
