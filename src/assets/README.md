# Fonts

`inter-regular.ttf` and `inter-semibold.ttf` are subsets of [Inter](https://rsms.me/inter/)
by Rasmus Andersson, used under the SIL Open Font License 1.1 — see
`Inter-LICENSE.txt`, which is included as the licence requires.

## Why a font is embedded at all

pdf-lib's built-in fonts use WinAnsi encoding, which cannot encode `₦`. A naira
invoice is impossible without an embedded Unicode font, and the same applies to
`₹`, `₵` and most non-European currency symbols. This is not a styling choice.

## Why they are subsets

The full family is around 800 kB across two weights. Cut down to Latin, Latin
Extended-A and the currency symbols, it is around 220 kB — and it is only
fetched when someone actually generates a PDF.

Regenerate with `node scripts/subset-fonts.mjs <dir containing Inter-*.ttf>`.
The output is committed, so a clone and a normal build need neither the script
nor the original font files.
