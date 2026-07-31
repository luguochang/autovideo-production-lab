import {makeProject} from '@motion-canvas/core';

import example from './scenes/example?scene';
import narration from './narration.wav';

export default makeProject({
  experimentalFeatures: true,
  scenes: [example],
  audio: narration,
});
