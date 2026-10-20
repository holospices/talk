# Talk bundled font notice

Talk bundles local WOFF2 subsets so theme typography is identical on Android WebView, mobile browsers, and Windows. All four upstream families are distributed under the SIL Open Font License 1.1; the corresponding unmodified license texts are stored in `licenses/`.

| Theme | Bundled family | Upstream version/source | Regular | Medium | Total |
| --- | --- | --- | ---: | ---: | ---: |
| Sage | LXGW WenKai | v1.522, https://github.com/lxgw/LxgwWenKai | 1,672,528 B | 1,703,184 B | 3,375,712 B |
| Fox | GenSen Rounded JP (Pan-CJK face) | v2.100, https://github.com/ButTaiwan/gensen-font | 1,596,776 B | 1,631,948 B | 3,228,724 B |
| Ink | Noto Serif CJK SC | Serif2.003, https://github.com/notofonts/noto-cjk | 2,806,108 B | 2,847,480 B | 5,653,588 B |
| Nord | IBM Plex Sans SC | 1.1.0, https://github.com/IBM/plex (`@ibm/plex-sans-sc`) | 1,248,860 B | 1,295,792 B | 2,544,652 B |

Total WOFF2 payload: 14,802,676 B (14.12 MiB).

## Subset policy

The files were generated with fontTools 4.60.1 from the listed upstream releases. They contain the GB2312 common Simplified Chinese repertoire plus ASCII, Latin characters, digits, General Punctuation, CJK punctuation, and full-width forms (8,225 requested characters; the exact cmap count varies by upstream family). Hinting data was removed to reduce the offline application payload; OpenType layout features were retained.

The subset is intentionally not limited to Talk's fixed interface copy because messages and contact names are dynamic. Characters absent from a subset fall through to the system Chinese stack. Emoji code points are intentionally excluded and fall through to Apple Color Emoji, Segoe UI Emoji, or Noto Color Emoji before the generic family.

The GenSen Rounded project does not publish a Simplified-Chinese-specific face. Talk uses its JP Pan-CJK face and subsets the Simplified Chinese code points that it provides, preserving the requested GenSen Rounded design consistently across platforms.

Medium files are used for CSS weights 500–700 so existing medium, semibold, and bold UI labels resolve to a real bundled face rather than browser-synthesized weight. Regular files serve weight 400.
