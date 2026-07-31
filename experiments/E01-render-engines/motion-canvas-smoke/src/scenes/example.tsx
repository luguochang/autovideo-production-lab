import {Camera, Rect, Txt, makeScene2D} from '@motion-canvas/2d';
import {
  all,
  createRef,
  createRefMap,
  easeInOutCubic,
  waitFor,
} from '@motion-canvas/core';
import data from '../canvas.json';

export default makeScene2D(function* (view) {
  view.fill('#f4f0e8');
  const camera = createRef<Camera>();
  const cards = createRefMap<Rect>();

  view.add(
    <Camera ref={camera}>
      {data.objects.map(object => (
        <Rect
          key={object.id}
          ref={cards[object.id]}
          position={[object.x, object.y]}
          size={[520, 250]}
          padding={36}
          fill="#fffdf8"
          stroke="#182326"
          lineWidth={5}
          shadowColor={object.color}
          shadowOffset={[14, 14]}
          layout
          direction="column"
          alignItems="start"
          justifyContent="center"
          opacity={0}
          scale={0.88}
        >
          <Txt
            text="知识节点"
            fontFamily="Microsoft YaHei"
            fontSize={24}
            fontWeight={800}
            fill={object.color}
          />
          <Txt
            text={object.title}
            fontFamily="Microsoft YaHei"
            fontSize={76}
            fontWeight={800}
            fill="#182326"
          />
          <Txt
            text={object.subtitle}
            fontFamily="Microsoft YaHei"
            fontSize={30}
            fill="#48595b"
          />
        </Rect>
      ))}
    </Camera>,
  );

  let cursor = 0;
  for (const action of data.operations) {
    if (action.at > cursor) {
      yield* waitFor(action.at - cursor);
    }

    const duration = action.duration;
    if (action.op === 'add' && action.target) {
      const card = cards[action.target]();
      yield* all(card.opacity(1, duration), card.scale(1, duration));
    } else if (action.op === 'move' && action.target) {
      const card = cards[action.target]();
      yield* all(
        card.position([action.x ?? 0, action.y ?? 0], duration, easeInOutCubic),
        card.scale(action.scale ?? 1, duration, easeInOutCubic),
      );
    } else if (action.op === 'highlight' && action.target) {
      const card = cards[action.target]();
      yield* card
        .scale(action.scale ?? 1.1, duration / 2)
        .to(1, duration / 2);
    } else if (action.op === 'camera') {
      yield* all(
        camera().centerOn([action.x ?? 0, action.y ?? 0], duration),
        camera().zoom(action.zoom ?? 1, duration),
      );
    }

    cursor = action.at + duration;
  }

  if (cursor < data.duration) {
    yield* waitFor(data.duration - cursor);
  }
});
