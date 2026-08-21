# Devil's Journey

A tiny third-person action-RPG demo built with plain [three.js](https://threejs.org/) —
no build step, no bundler, no install. Kill the monster, pick up better gear, level up.

![screenshot](docs/screenshot-gameplay.png)

## Play it

The page uses ES modules, so it needs to be served over http (opening `index.html`
straight off disk will not work).

```bash
npx http-server -p 8099 -c-1 .      # or: python3 -m http.server 8099
# then open http://127.0.0.1:8099/index.html
```

Three.js is vendored in `vendor/three.module.js`, so it runs completely offline.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` | walk |
| mouse | swing the camera around her (click once to lock the cursor; right-drag also works) |
| left click | swing your sword |
| `Shift` | run |
| `I` | open the bag |
| `2`–`8` | equip from the hotbar |
| `Esc` | pause |

## How it plays

* One monster roams the meadow. Get close and it charges you.
* Hitting it costs a little stamina; killing it gives xp and drops one item.
* Walk over the item to pick it up. If it is better than what you wear, you put
  it on automatically — no menu digging required.
* Every item shows at most three small numbers (`+6 smidighed`, `+14 skade`), and
  rarity is just a colour: grey → green → blue → purple → orange.
* Fill the purple bar and you level up: more life, more damage, full heal.

The camera is a fixed third-person rig: it orbits a pivot above the hero at a
constant distance, so the mouse swings it around her and never leaves her out
of frame.

## Layout

```
index.html          markup + HUD
src/main.js         game loop, input, combat, camera
src/world.js        terrain, sky, trees, lighting
src/characters.js   hero, monster and weapon meshes (built from primitives)
src/items.js        loot generation and canvas item icons
src/ui.js           HUD, bag, tooltips, floating numbers
tools/shot.mjs      headless screenshot helper
tools/playtest.mjs  headless play-through with assertions
```

## Checking it still works

```bash
npx http-server -p 8099 -c-1 . &
node tools/playtest.mjs            # asserts movement, combat, loot, levelling
node tools/shot.mjs shots/x.png    # renders a frame to a png
```

`tools/shot.mjs` takes a scenario as its second argument — `start`, `menu`,
`combat`, `walk`, `inventory`, `closeup:<deg>` or `walkclose:<deg>` — and
honours `SHOT_W` / `SHOT_H` for the viewport, which is how the HUD was checked
down to 880x620.
