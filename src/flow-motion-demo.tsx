import React from 'react';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Boundary = {text: string; start: number; duration: number};
type FlowData = {
  narration: string;
  audio: string;
  duration: number;
  words: Boundary[];
  sentences: Boundary[];
};

const colors = {
  paper: '#f3e6d2',
  ink: '#26343d',
  muted: '#786f66',
  blue: '#cbe7ef',
  mint: '#cce7cf',
  coral: '#f0b4ae',
  navy: '#356276',
  red: '#c95258',
  gold: '#e0ad55',
  white: '#fffdf8',
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const enterEase = Easing.bezier(0.22, 1, 0.36, 1);
const exitEase = Easing.bezier(0.4, 0, 1, 1);

const tween = (
  time: number,
  start: number,
  duration = 0.55,
  easing: (value: number) => number = enterEase,
) => interpolate(time, [start, start + duration], [0, 1], {...clamp, easing});

const sceneMotion = (
  time: number,
  start: number,
  end: number,
  enterX: number,
  enterY: number,
  exitX: number,
  exitY: number,
): React.CSSProperties => {
  const enter = tween(time, start, 0.72);
  const exit = tween(time, end - 0.72, 0.72, exitEase);
  return {
    opacity: enter * (1 - exit),
    transform: `translate3d(${(1 - enter) * enterX + exit * exitX}px, ${(1 - enter) * enterY + exit * exitY}px, 0) scale(${0.988 + enter * 0.012 - exit * 0.008})`,
    filter: `blur(${(1 - enter) * 2.2 + exit * 1.5}px)`,
    willChange: 'transform, opacity, filter',
  };
};

const revealMotion = (
  time: number,
  start: number,
  x = 0,
  y = 24,
  duration = 0.48,
): React.CSSProperties => {
  const progress = tween(time, start, duration);
  return {
    opacity: progress,
    transform: `translate3d(${(1 - progress) * x}px, ${(1 - progress) * y}px, 0) scale(${0.985 + progress * 0.015})`,
    filter: `blur(${(1 - progress) * 1.6}px)`,
    willChange: 'transform, opacity, filter',
  };
};

const Chip: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
  strong?: boolean;
}> = ({children, color = colors.blue, style, strong = false}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 45,
      padding: '7px 18px',
      background: color,
      border: '1.5px solid rgba(58,70,72,.42)',
      borderRadius: 5,
      boxShadow: '3px 4px 0 rgba(91,72,53,.12)',
      color: colors.ink,
      fontSize: strong ? 29 : 24,
      fontWeight: strong ? 850 : 720,
      lineHeight: 1.1,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </div>
);

const PresenterDrawing: React.FC<{mood: 'serious' | 'skeptical' | 'thinking' | 'bright'}> = ({mood}) => {
  const skeptical = mood === 'skeptical';
  const thinking = mood === 'thinking';
  const bright = mood === 'bright';
  return (
    <div style={{position: 'relative', width: 214, height: 330}}>
      <div
        style={{
          position: 'absolute',
          left: 27,
          top: 2,
          width: 160,
          height: 185,
          borderRadius: '48% 48% 43% 43%',
          background: '#252c35',
          boxShadow: '0 12px 30px rgba(55,42,31,.18)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 58,
          top: 36,
          width: 98,
          height: 116,
          borderRadius: '46% 46% 43% 43%',
          background: '#f0c7ad',
          border: '2px solid rgba(53,45,45,.18)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 80,
          width: 10,
          height: bright ? 3 : 9,
          borderRadius: 8,
          background: colors.ink,
          boxShadow: '52px 0 #26343d',
          transform: skeptical ? 'rotate(8deg)' : undefined,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 101,
          top: 113,
          width: 22,
          height: bright ? 12 : 5,
          borderBottom: `3px solid ${colors.ink}`,
          borderRadius: '0 0 50% 50%',
          transform: skeptical ? 'rotate(-7deg)' : undefined,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 38,
          top: 160,
          width: 140,
          height: 160,
          borderRadius: '38px 38px 12px 12px',
          background: '#34434d',
          border: '2px solid rgba(28,39,45,.25)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: skeptical ? 44 : 21,
          top: skeptical ? 205 : thinking ? 184 : 199,
          width: skeptical ? 126 : 80,
          height: 20,
          borderRadius: 12,
          background: '#34434d',
          transform: skeptical ? 'rotate(8deg)' : thinking ? 'rotate(-49deg)' : 'rotate(-25deg)',
          transformOrigin: 'right center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: skeptical ? 44 : 18,
          top: skeptical ? 205 : 197,
          width: skeptical ? 126 : 82,
          height: 20,
          borderRadius: 12,
          background: '#34434d',
          transform: skeptical ? 'rotate(-8deg)' : 'rotate(27deg)',
          transformOrigin: 'left center',
        }}
      />
      {!skeptical && !thinking && (
        <div style={{position: 'absolute', right: 3, top: 155, color: colors.gold, fontSize: 48, textShadow: '0 2px 0 #fff'}}>
          ✦
        </div>
      )}
    </div>
  );
};

const Presenter: React.FC<{time: number; frame: number}> = ({time, frame}) => {
  const intro = tween(time, 0.05, 0.62);
  const idleY = Math.sin(frame / 38) * 1.8;
  const idleScale = 1 + Math.sin(frame / 56) * 0.0025;
  const states: Array<{mood: 'serious' | 'skeptical' | 'thinking' | 'bright'; start: number; end: number}> = [
    {mood: 'serious', start: 0, end: 12.7},
    {mood: 'skeptical', start: 12.15, end: 23.75},
    {mood: 'thinking', start: 23.15, end: 32.5},
    {mood: 'bright', start: 31.9, end: 39.2},
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 52,
        top: 184,
        width: 230,
        height: 350,
        opacity: intro,
        transform: `translate3d(${(1 - intro) * -28}px, ${idleY}px, 0) scale(${idleScale})`,
        transformOrigin: 'center bottom',
      }}
    >
      {states.map((state) => {
        const enter = tween(time, state.start, 0.38);
        const exit = tween(time, state.end - 0.38, 0.38, exitEase);
        const opacity = enter * (1 - exit);
        return (
          <div
            key={state.mood}
            style={{
              position: 'absolute',
              inset: 0,
              opacity,
              transform: `translateY(${(1 - enter) * 18 - exit * 12}px) scale(${0.985 + enter * 0.015})`,
            }}
          >
            <PresenterDrawing mood={state.mood} />
          </div>
        );
      })}
    </div>
  );
};

const SceneOne: React.FC<{time: number}> = ({time}) => {
  const line = tween(time, 3.62, 0.5);
  const aiPulse = spring({fps: 30, frame: Math.max(0, (time - 1.87) * 30), config: {damping: 24, stiffness: 170, mass: 0.8}});
  return (
    <div style={{position: 'absolute', left: 315, top: 112, width: 850, height: 470, ...sceneMotion(time, 0, 7.12, 36, 12, -34, -22)}}>
      <div style={{fontSize: 22, color: colors.muted, fontWeight: 700, ...revealMotion(time, 0.18, 0, 14)}}>我奉劝很多人</div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 24, fontWeight: 900, color: colors.ink}}>
        <span style={{fontSize: 54, ...revealMotion(time, 1.48, 0, 18)}}>对</span>
        <span style={{fontSize: 82, color: colors.red, opacity: aiPulse, transform: `scale(${0.9 + aiPulse * 0.1})`}}>AI</span>
        <span style={{fontSize: 54, ...revealMotion(time, 2.2, 0, 18)}}>技术</span>
      </div>
      <div style={{position: 'relative', display: 'inline-block', marginTop: 16, fontSize: 64, fontWeight: 900, color: colors.navy, ...revealMotion(time, 3.08, 0, 22)}}>
        保持敬畏
        <div style={{position: 'absolute', left: 0, bottom: -9, width: 270, height: 5, background: colors.gold, transform: `scaleX(${line})`, transformOrigin: 'left'}} />
      </div>
      <div style={{display: 'flex', gap: 14, marginTop: 60}}>
        <Chip color={colors.mint} style={revealMotion(time, 4.42, -18, 12)}>理解边界</Chip>
        <Chip color={colors.blue} style={revealMotion(time, 5.08, -18, 12)}>擦亮信息</Chip>
        <Chip color={colors.coral} style={revealMotion(time, 5.5, -18, 12)}>保持判断</Chip>
      </div>
    </div>
  );
};

const SceneTwo: React.FC<{time: number}> = ({time}) => {
  const lineProgress = tween(time, 8.25, 1.65);
  const nodes = [
    {label: 'AI', x: 338, y: 204, at: 8.62, color: colors.coral},
    {label: 'Coze', x: 530, y: 99, at: 9.27, color: colors.blue},
    {label: 'Dify', x: 670, y: 259, at: 9.92, color: colors.mint},
    {label: '社群', x: 472, y: 339, at: 10.23, color: colors.blue},
  ];
  return (
    <div style={{position: 'absolute', left: 302, top: 92, width: 900, height: 500, ...sceneMotion(time, 6.25, 13.55, 46, 22, -38, -24)}}>
      <div style={{fontSize: 43, fontWeight: 900, color: colors.ink, ...revealMotion(time, 6.45, 22, 0)}}>
        市场上的 <span style={{color: colors.red}}>AI 社群</span>
      </div>
      <svg style={{position: 'absolute', left: 0, top: 50, width: 850, height: 390, overflow: 'visible'}} viewBox="0 0 850 390">
        {[[385,190,560,95],[385,190,700,255],[385,190,515,330]].map((line, index) => (
          <line
            key={index}
            x1={line[0]}
            y1={line[1]}
            x2={line[2]}
            y2={line[3]}
            pathLength={1}
            stroke={colors.navy}
            strokeWidth={3}
            strokeDasharray={1}
            strokeDashoffset={1 - lineProgress}
            opacity={0.58}
          />
        ))}
      </svg>
      {nodes.map((node) => (
        <Chip
          key={node.label}
          color={node.color}
          strong={node.label === 'AI'}
          style={{position: 'absolute', left: node.x, top: node.y, ...revealMotion(time, node.at, 0, 28, 0.42)}}
        >
          {node.label}
        </Chip>
      ))}
      <div style={{position: 'absolute', left: 160, bottom: 18, display: 'flex', gap: 12}}>
        <Chip color={colors.white} style={revealMotion(time, 11.02, 20, 0)}>告诉你</Chip>
        <Chip color={colors.mint} style={revealMotion(time, 11.48, 20, 0)}>应该怎么做</Chip>
      </div>
    </div>
  );
};

const SceneThree: React.FC<{time: number}> = ({time}) => {
  const ninetyNine = spring({fps: 30, frame: Math.max(0, (time - 13.53) * 30), config: {damping: 23, stiffness: 165, mass: 0.82}});
  const codeReveal = (at: number) => tween(time, at, 0.55);
  return (
    <div style={{position: 'absolute', left: 318, top: 90, width: 870, height: 510, ...sceneMotion(time, 12.45, 21.15, 38, 30, -30, -20)}}>
      <div style={{fontSize: 30, fontWeight: 800, color: colors.muted, ...revealMotion(time, 12.75, 0, 16)}}>但是这里面</div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 5}}>
        <span style={{fontSize: 112, lineHeight: 1, fontWeight: 950, color: colors.red, opacity: ninetyNine, transform: `scale(${0.9 + ninetyNine * 0.1})`, transformOrigin: 'left bottom'}}>99%</span>
        <span style={{fontSize: 46, fontWeight: 900, color: colors.ink, ...revealMotion(time, 14.42, 12, 0)}}>的人</span>
      </div>
      <div style={{fontSize: 40, fontWeight: 900, color: colors.ink, marginTop: 12, ...revealMotion(time, 15.45, 0, 20)}}>不具备真正的能力</div>
      <div style={{display: 'flex', gap: 15, marginTop: 24}}>
        <Chip color={colors.coral} style={revealMotion(time, 15.86, 0, 20)}>开发</Chip>
        <Chip color={colors.blue} style={revealMotion(time, 16.43, 0, 20)}>维护</Chip>
        <Chip color={colors.mint} style={revealMotion(time, 16.88, 0, 20)}>AI 系统</Chip>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 5,
          width: 390,
          height: 155,
          padding: '20px 24px',
          background: '#26343d',
          border: '2px solid rgba(255,255,255,.7)',
          borderRadius: 7,
          boxShadow: '8px 10px 0 rgba(88,65,43,.12)',
          ...revealMotion(time, 17.85, 34, 18, 0.62),
        }}
      >
        {[0.82, 0.64, 0.73].map((width, index) => {
          const progress = codeReveal(18.1 + index * 0.48);
          return (
            <div key={index} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 17, opacity: progress}}>
              <span style={{color: colors.gold, fontSize: 16}}>{String(index + 1).padStart(2, '0')}</span>
              <div style={{height: 9, width: `${width * 285 * progress}px`, background: index === 1 ? colors.mint : colors.blue, borderRadius: 2}} />
            </div>
          );
        })}
        <div style={{position: 'absolute', right: 18, bottom: 14, color: colors.coral, fontSize: 20, fontWeight: 800, ...revealMotion(time, 19.4, 10, 0)}}>看不懂底层代码</div>
      </div>
    </div>
  );
};

const SceneFour: React.FC<{time: number}> = ({time}) => {
  const underline = tween(time, 22.22, 0.52);
  return (
    <div style={{position: 'absolute', left: 325, top: 150, width: 835, height: 370, ...sceneMotion(time, 20.12, 24.05, 0, 35, 0, -30)}}>
      <div style={{fontSize: 28, color: colors.muted, fontWeight: 750, ...revealMotion(time, 20.42, 0, 14)}}>别被工具制造的错觉骗了</div>
      <div style={{position: 'relative', marginTop: 38, fontSize: 65, lineHeight: 1.2, fontWeight: 950, color: colors.ink, ...revealMotion(time, 20.95, 0, 26)}}>
        AI 没那么简单
        <div style={{position: 'absolute', left: 0, bottom: -12, width: 485, height: 6, background: colors.red, transform: `scaleX(${underline})`, transformOrigin: 'left'}} />
      </div>
      <div style={{display: 'flex', gap: 14, marginTop: 64}}>
        <Chip color={colors.blue} style={revealMotion(time, 21.45, 0, 18)}>会调用</Chip>
        <Chip color={colors.mint} style={revealMotion(time, 21.78, 0, 18)}>不等于理解</Chip>
        <Chip color={colors.coral} style={revealMotion(time, 22.25, 0, 18)}>更不等于产品</Chip>
      </div>
    </div>
  );
};

const SceneFive: React.FC<{time: number}> = ({time}) => {
  const rail = tween(time, 33.2, 3.95);
  const flow = [
    {label: '工作流', at: 33.58, x: 48, color: colors.blue},
    {label: '提示词', at: 34.84, x: 275, color: colors.mint},
    {label: 'Agent', at: 36.9, x: 502, color: colors.coral},
  ];
  return (
    <div style={{position: 'absolute', left: 315, top: 92, width: 870, height: 515, ...sceneMotion(time, 23.05, 39.0, 44, 22, -24, -14)}}>
      <div style={{fontSize: 24, color: colors.muted, fontWeight: 750, ...revealMotion(time, 23.28, 0, 14)}}>工具带来的自信膨胀</div>
      <div style={{display: 'flex', gap: 14, marginTop: 18}}>
        <Chip color={colors.blue} strong style={revealMotion(time, 24.72, 0, 22)}>Codex</Chip>
        <Chip color={colors.mint} strong style={revealMotion(time, 25.5, 0, 22)}>Claude Code</Chip>
      </div>
      <div style={{position: 'relative', marginTop: 42, height: 125}}>
        <div style={{position: 'absolute', left: 0, top: 0, fontSize: 34, fontWeight: 800, color: colors.ink, ...revealMotion(time, 26.73, -20, 0)}}>用完工具，就觉得自己是</div>
        <Chip color={colors.coral} strong style={{position: 'absolute', left: 430, top: -8, ...revealMotion(time, 27.38, 18, 0)}}>大神</Chip>
        <div style={{position: 'absolute', left: 55, top: 72, fontSize: 31, fontWeight: 800, color: colors.red, ...revealMotion(time, 30.68, 0, 18)}}>“被掩埋的技术天才”</div>
      </div>
      <div style={{position: 'absolute', left: 45, right: 70, bottom: 35, height: 115}}>
        <div style={{position: 'absolute', left: 66, right: 70, top: 26, height: 4, background: 'rgba(53,98,118,.24)'}} />
        <div style={{position: 'absolute', left: 66, top: 26, width: `${rail * 615}px`, height: 4, background: colors.navy, transformOrigin: 'left'}} />
        {flow.map((item, index) => (
          <React.Fragment key={item.label}>
            <Chip color={item.color} style={{position: 'absolute', left: item.x, top: 0, ...revealMotion(time, item.at, 0, 18)}}>{item.label}</Chip>
            {index < flow.length - 1 && <span style={{position: 'absolute', left: item.x + 174, top: 5, fontSize: 34, color: colors.navy, opacity: tween(time, item.at + 0.25, 0.35)}}>→</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const makeCaptionChunks = (words: Boundary[]) => {
  const chunks: Array<{text: string; start: number; end: number}> = [];
  let current: Boundary[] = [];
  let length = 0;
  for (const word of words) {
    current.push(word);
    length += word.text.length;
    if (length >= 9 || current.length >= 6) {
      chunks.push({text: current.map((item) => item.text).join(''), start: current[0].start, end: word.start + word.duration});
      current = [];
      length = 0;
    }
  }
  if (current.length) {
    const last = current[current.length - 1];
    chunks.push({text: current.map((item) => item.text).join(''), start: current[0].start, end: last.start + last.duration});
  }
  return chunks;
};

export const FlowMotionDemo: React.FC<{data: FlowData}> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const captions = makeCaptionChunks(data.words);
  const caption = captions.find((item, index) => {
    const next = captions[index + 1];
    return time >= item.start && time < (next?.start ?? item.end + 0.2);
  });
  const captionIn = caption ? tween(time, caption.start, 0.12) : 0;
  const endFade = interpolate(time, [37.9, 38.7], [1, 0], clamp);

  return (
    <AbsoluteFill style={{background: colors.paper, overflow: 'hidden', fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif', opacity: endFade}}>
      <Audio src={staticFile(data.audio)} from={-143} />
      <div style={{position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: 'repeating-linear-gradient(0deg, transparent 0, transparent 47px, rgba(119,102,80,.28) 48px)'}} />
      <div style={{position: 'absolute', left: 35, top: 34, width: 66, height: 66, border: '2px solid rgba(53,98,118,.42)', transform: 'rotate(9deg)', opacity: 0.22}} />
      <div style={{position: 'absolute', right: 46, bottom: 75, width: 110, height: 110, border: '2px solid rgba(201,82,88,.28)', transform: 'rotate(-7deg)', opacity: 0.18}} />
      <div style={{position: 'absolute', left: 54, top: 38, color: colors.muted, fontSize: 17, fontWeight: 750}}>AI ENGINEERING NOTES</div>
      <div style={{position: 'absolute', right: 55, top: 37, color: colors.muted, fontSize: 17, fontWeight: 700}}>01 / FLOW STUDY</div>
      <Presenter time={time} frame={frame} />
      <SceneOne time={time} />
      <SceneTwo time={time} />
      <SceneThree time={time} />
      <SceneFour time={time} />
      <SceneFive time={time} />
      <div
        style={{
          position: 'absolute',
          left: 305,
          right: 72,
          bottom: 25,
          height: 46,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {caption && (
          <div
            key={caption.start}
            style={{
              padding: '6px 15px 7px',
              background: 'rgba(38,52,61,.84)',
              color: colors.white,
              borderRadius: 3,
              fontSize: 20,
              lineHeight: 1.2,
              opacity: captionIn,
              transform: `translateY(${(1 - captionIn) * 5}px)`,
            }}
          >
            {caption.text}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
