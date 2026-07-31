# Template Color Study

Status: `approved`; `03-light-apricot` is the default and `02-warm-peach` is a saved alternate.

All candidates use the same `1920x1080` layout, presenter, text and caption geometry. Only the color tokens change.

| ID | Direction | Background | Surface | Ink | Muted | Primary | Secondary |
|---|---|---|---|---|---|---|---|
| `01-neutral-sage` | current calm neutral | `#F4F4F0` | `#FFFFFF` | `#1D241F` | `#626C65` | `#4F7A62` | `#B85C42` |
| `02-warm-peach` | warmer and more human | `#F7EAE4` | `#FFF9F5` | `#29211E` | `#6D5D56` | `#456E63` | `#B45B43` |
| `03-light-apricot` | light orange without a solid orange field | `#F2DFC7` | `#FBF3E7` | `#2A211B` | `#675748` | `#496958` | `#A94E36` |
| `04-pale-sage` | clean and educational | `#E9F0EA` | `#F7FAF7` | `#1F2721` | `#5B675E` | `#3D7155` | `#B55E43` |
| `05-muted-orange` | strong orange stress test | `#D87955` | `#F7E8DF` | `#271B18` | `#4E3026` | `#1C473D` | `#8A3322` |
| `06-deep-forest` | optional dark mode | `#26342C` | `#314138` | `#F5F1E9` | `#C7CEC8` | `#A8CEAF` | `#F09A76` |

## Approved Selection

- Default: `03-light-apricot` / style palette ID `light-apricot`.
- Saved alternate: `02-warm-peach` / style palette ID `warm-peach`.
- All other study candidates remain review evidence and are not available to the generator without a new style review.

## Text Color Contract

- `ink`: primary information and default headline color.
- `muted`: helper text, source labels and unaccented captions.
- `primary`: the single active semantic emphasis in a beat.
- `secondary`: a small endpoint, contrast marker or the next beat's emphasis; do not use it simultaneously with `primary` across several text blocks.
- Caption text follows the same semantic roles but sits on `surface`, not directly on `background`.
- Text structure may vary by narration, but colors remain role-based. Do not assign arbitrary colors by sentence or keyword.
