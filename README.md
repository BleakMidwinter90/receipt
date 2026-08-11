<div align="center">

# receipt

**Invoices that never leave your device.**

Fill in a form, get a clean PDF. No account, no subscription, and nothing uploaded — your clients, your rates and your income stay in your browser.

**[Use it →](https://bleakmidwinter90.github.io/receipt/)**

[![CI](https://github.com/BleakMidwinter90/receipt/actions/workflows/ci.yml/badge.svg)](https://github.com/BleakMidwinter90/receipt/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

## Why this exists

Invoicing is the one piece of admin every freelancer and small business has to do, and the options are a monthly subscription to a service that holds your entire client list and income history, or a Word template that quietly breaks every time you touch it.

Neither is a good trade for what is, in the end, a form and a PDF.

receipt does it in the browser. There is no account, no server, and no network call in the path between typing an amount and downloading the file.

## What it does

**Makes a PDF that looks like an invoice.** Your details, your client's, the lines, the totals, how to pay. It also does receipts and quotes, which are the same document with a different word at the top.

**Handles money as money.** Every amount is a whole number of minor units — kobo, cents, pence — never a float, because `0.1 + 0.2` is `0.30000000000000004` and an invoice out by a hundredth is one someone has to query.

**Takes amounts the way people write them.** `45,000`, `₦45,000`, `45 000`, `1.234,56`, `(45.00)` for a credit. What it will *not* do is guess: `about 45k` is refused rather than quietly becoming 45, because a line silently worth ₦45 is much worse than a visible error.

**Understands inclusive tax.** If your prices already include VAT, the tax inside ₦10,000 at 7.5% is `10,000 − 10,000 ÷ 1.075`, not 7.5% of 10,000. Taking the percentage of the gross overstates it by about seven percent, and it is the mistake most templates make.

**Prints ₦.** This sounds trivial and is the reason a font is embedded at all — the standard PDF fonts use WinAnsi encoding, which physically cannot encode `₦`, `₹` or `₵`. Most browser invoice tools quietly fall back to `N` or a blank box.

**Remembers your details, on your device.** Business name, address, payment instructions, tax settings and a client list, kept in this browser's storage. The invoice number moves on by itself, and only once you have actually downloaded one — nobody wants a gap in the sequence because they opened the page and changed their mind.

## The preview is the file

The preview pane is not a styled HTML approximation of the output. It is the actual PDF, redrawn as you type.

An HTML mock-up is the obvious way to build this and it is a trap: the two drift apart, and the first anyone finds out is when a client receives something that does not match what was on screen. Rendering the real thing means the preview cannot be wrong about the document.

## Try it

It is live at **[bleakmidwinter90.github.io/receipt](https://bleakmidwinter90.github.io/receipt/)** — a static page, so opening it involves no account and sends nothing anywhere.

To run it yourself:

```sh
git clone https://github.com/BleakMidwinter90/receipt.git
cd receipt
npm install
npm run dev
```

`npm run build` produces a `dist/` you can host anywhere — there is no backend to deploy because there is no backend. Serve it over HTTP rather than opening `index.html` directly; `node scripts/serve.mjs` will do that, including on your local network.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Static production build |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | Lint |
| `npm run smoke` | Builds, then drives it in a real browser |

## How it works

The parts that have to be right are pure functions in [`src/lib/`](src/lib/), with no DOM and no PDF anywhere near them, covered by 97 unit tests:

- [`money.ts`](src/lib/money.ts) — integer minor units, parsing and formatting
- [`invoice.ts`](src/lib/invoice.ts) — what it all adds up to
- [`layout.ts`](src/lib/layout.ts) — text wrapping, which takes a `measure` function rather than a font so the awkward cases are testable without rendering
- [`storage.ts`](src/lib/storage.ts) — reads defensively, because stored data outlives the code that wrote it

Two decisions worth knowing about:

**A lone separator followed by three digits means thousands.** `45,000` and `45.000` both parse as forty-five thousand. That case is genuinely ambiguous across locales — `1.005` is 1005 in Germany and 1.005 in the US — and an invoice survives a rounding difference but not being wrong by a factor of a thousand.

**Fonts are subset and loaded on demand.** Inter, cut down to Latin and the currency symbols, is about 220 kB across two weights and is only fetched when a PDF is actually drawn. Nobody who opens the page to look pays for it.

## Contributing

Issues and pull requests welcome. Anything in `src/lib/` needs tests; anything touching the PDF should keep the smoke test green.

```sh
npm test && npm run lint && npm run typecheck && npm run smoke
```

## License

[MIT](LICENSE). Inter is used under the [SIL Open Font License](src/assets/Inter-LICENSE.txt).
