import React from 'react';
import {Composition} from 'remotion';
import storyboard from '../content/storyboard.generated.json';
import reference from '../content/reference.generated.json';
import {KnowledgeVideo} from './video';
import {ReferenceStyleVideo} from './reference-video';
import canvasDemo from '../content/canvas-demo.json';
import {CanvasStyleDemo} from './canvas-video';
import flowDemo from '../content/flow-demo.json';
import {FlowMotionDemo} from './flow-motion-demo';

const durationInFrames = storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
const referenceDuration = reference.beats.reduce((sum, beat) => sum + (('duration' in beat ? Number(beat.duration) : 150)), 0);

export const Root: React.FC = () => (<>
  <Composition
    id="KnowledgeVideo"
    component={KnowledgeVideo}
    durationInFrames={durationInFrames}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{storyboard}}
  />
  <Composition
    id="ReferenceStyleVideo"
    component={ReferenceStyleVideo}
    durationInFrames={referenceDuration}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{data: reference}}
  />
  <Composition
    id="CanvasStyleDemo"
    component={CanvasStyleDemo}
    durationInFrames={canvasDemo.duration}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{data: canvasDemo}}
  />
  <Composition
    id="FlowMotionDemo"
    component={FlowMotionDemo}
    durationInFrames={flowDemo.duration}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{data: flowDemo}}
  />
</>);
