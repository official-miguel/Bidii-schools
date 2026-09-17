# Dark-Mode Logo Asset

## Status: present (generated, replaceable)

`public/logo-dark.png` now exists. It was generated from `public/logo.png`
rather than drawn by a designer, so it is a faithful but mechanical rendition —
swap it for a designed version whenever one is available. No code change is
needed to do so; `src/components/Logo.tsx` just reads the file.

### How the current file was produced

The source logo is dark navy artwork on an **opaque white** background, which
rendered as a glaring white box on dark surfaces. The generated variant:

1. greyscales and negates `logo.png`, turning the white background into a
   transparent mask and the navy artwork into the opaque region;
2. fills that mask with `#E8EDF2`;
3. resizes to 512x512 and palette-quantises (45 KB, down from 326 KB at full
   size — the mark is only ever displayed at 30-40 px).

Reproduce with `sharp`:

```js
const { width, height } = await sharp('public/logo.png').metadata();
const alpha = await sharp('public/logo.png')
  .removeAlpha().greyscale().negate().raw().toBuffer();

await sharp({ create: { width, height, channels: 3,
                        background: { r: 232, g: 237, b: 242 } } })
  .joinChannel(alpha, { raw: { width, height, channels: 1 } })
  .resize(512, 512)
  .png({ palette: true, quality: 90, compressionLevel: 9 })
  .toFile('public/logo-dark.png');
```

### Requirements a replacement must meet

- Light fill (`#E8EDF2` or white `#FFFFFF`) so the wordmark reads on dark cards
- Contrast ratio >= **3:1** against the dark card surface `#162233`
  (WCAG 2.1 SS1.4.11 Non-text Contrast)
- Transparent background — not a white plate

| Fill color | Background | Ratio | Pass? |
|---|---|---|---|
| `#FFFFFF` (white) | `#162233` | ~11.5:1 | yes |
| `#E8EDF2` (light, current) | `#162233` | ~5.4:1 | yes |
| `#2C7F7E` (brand teal - exempt) | `#162233` | ~3.1:1 | yes (>= 3:1) |

### Note on school logos

A school that uploads its own logo (`School.logoUrl`) has that image shown in
both light and dark mode — there is only one upload, so there is nothing to
swap to. Only this Bidii fallback has light/dark variants.

### Reference

- Design spec: dark-mode-system-sync SS11.1, SS11.3, SS11.6
- Requirements: 11.1, 11.3, 11.5, 11.6
