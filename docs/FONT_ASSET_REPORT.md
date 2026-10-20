# v0.1.41 font asset report

This report records the release-size and runtime validation for the local theme font system introduced after v0.1.40. Font-level source, license, subset, and byte details are in `public/fonts/NOTICE.md`.

## Release size impact

| Artifact | v0.1.40 baseline | v0.1.41 | Increase | Increase % |
| --- | ---: | ---: | ---: | ---: |
| `dist/` | 2,430,036 B | 17,256,549 B | 14,826,513 B | 610.14% |
| Android debug APK | 6,579,965 B | 21,388,335 B | 14,808,370 B | 225.05% |
| Windows portable x64 | 105,861,000 B | 120,660,109 B | 14,799,109 B | 13.98% |
| Windows NSIS x64 | 106,201,197 B | 121,000,406 B | 14,799,209 B | 13.94% |

The 14.12 MiB WOFF2 payload accounts for essentially all of the increase. Two real weights are retained for each differentiated theme because titles, names, settings, and user-generated text use both regular and medium/semibold weights. The files are common-Simplified-Chinese subsets rather than full Pan-CJK fonts, and hinting data was removed; no fixed-copy-only subset was used.

## Runtime verification

- Desktop Chromium: Sage, Fox, Ink, and Nord were checked in light/dark mode at 390×844 and 1440×900. No document/shell horizontal overflow, clipped title, or changed composer height was detected.
- Font authenticity: all eight WOFF2 files appeared as successful resource loads; `document.fonts.load()` and `document.fonts.check()` succeeded for each family. Canvas measurements for Chinese/Latin/digits/punctuation differed from the system font, confirming the bundled glyphs were used.
- Fallback: the WOFF2 cmap intentionally excludes `龘`, `𠮷`, and Emoji. Canvas measurements matched the system fallback for those samples, while common Chinese continued to use the bundled family.
- Android: the release APK was installed on the `Medium_Phone` Android 16 emulator (WebView 133.0.6943.137). WebView DevTools confirmed Ink Regular and Medium loaded from `https://localhost/fonts/`, both body and title resolved to `Talk Noto Serif CJK SC`, and the page had no horizontal overflow.
- Chromium 99 compatibility is maintained at the syntax level: WOFF2, `@font-face`, `font-display: swap`, CSS custom properties, and font-weight ranges are supported; no `oklch()`, `color-mix()`, remote font import, or runtime CDN dependency was introduced.

## Release hashes

- APK SHA256: `c12968ab079ce050bb2b61fd691b9971c70f0a423c087ee957b49521ea843c7a`
- Windows portable SHA256: `1fe6fb7ded2895ff431dcd02172107d929a2a19cbf27d48aaeeb0d5dc3a36f75`
- Windows NSIS SHA256: `8ace3ad001b4e980b1743bb1fac98a5325d814c2dfa79972b7e5fd56165bbe1d`
