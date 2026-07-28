<div align="center">

# 紬 Tsumugi

**Weave your vocabulary into sentences you can actually read.**

![Vanilla JS](https://img.shields.io/badge/JS-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/CSS-Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![Gemini API](https://img.shields.io/badge/AI-Gemini-8E75B2?logo=googlegemini&logoColor=white)
![No build step](https://img.shields.io/badge/build_step-none-success)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

[**Live Demo**](#) · [Features](#features) · [How it works](#how-the-ai-is-constrained) · [Running locally](#running-locally)

</div>

---

## What is Tsumugi?

Most "example sentence" generators are frustrating for a beginner: you look up one word you're learning, and the example sentence throws five *other* unfamiliar words at you. Tsumugi flips that.

Give it a handful of Japanese words or kanji you're studying, and it builds sentences and a short story using **only those words** — plus grammar particles and the copula (だ / です / あります / います) — so every character in the output is something you already recognize or are actively learning.

It's a small, focused tool built around one idea: **comprehensible input, guaranteed by construction, not by luck.**

## Try It

- 🔗 **[Live demo](#)**
- No API key needed to look around — click **"See an example first"** for an instant, zero-setup preview using static sample data.
- To weave your own words, grab a free key from [Google AI Studio](https://aistudio.google.com/apikey) and paste it into Settings (⚙️).

*📸 Demo GIF coming soon.*

## Features

**The core loop**
- 🧵 **Weave** — turns up to 10 words into a full breakdown: readings, meaning, a mnemonic, part of speech, and (for verbs/i-adjectives) a polite-form conjugation table
- **The Weave** — four example sentences built only from your words, each with a blurred romaji / English / "vibe" reveal — a small anti-cheat nudge to try reading the Japanese yourself before peeking
- **The Micro-Story** — a short story tying all your words together
- 🔊 Text-to-speech playback, with voice and speed selection in Settings

**What makes repeated use worthwhile**
- **Bridge Mode** — optionally blends a few already-learned Vault words in alongside new ones, so sentences get richer and more natural the longer you use the app, instead of staying capped at "beginner noun + copula" forever
- **Story Genre** — Slice of Life / Noir / Fantasy / Comedy, so sessions don't all read the same
- **Vocabulary Vault** — every word you weave is saved locally and reusable with one tap
- **CSV export** — pull your generated vocabulary into Anki or any other spaced-repetition tool

**Built to actually ship, not just demo once**
- Zero-setup demo mode (static example, no API call, no key required)
- Session persistence — an accidental refresh won't lose a result that cost a real API call
- Dark mode, keyboard shortcuts (`⌘/Ctrl+Enter` to weave, `Esc` to close modals, `←/→` to navigate), first-run onboarding
- Input validation — rejects non-Japanese input before it ever reaches the Vault or the API

## How the AI is constrained

The interesting part of this project isn't the UI — it's the prompt design. The system prompt is *ultra-strict*: the model is told it may only use the exact words provided, standard grammatical particles, and the copula. No outside nouns, verbs, or adjectives allowed. This guarantees every sentence is 100% comprehensible to someone who knows only those words — at the cost of occasionally producing simple, repetitive-feeling sentences when the input is a handful of unrelated abstract nouns (there's only so much you can say with three nouns and "is/are").

**Bridge Mode** is the fix for that: it lets the model optionally draw on a few already-learned Vault words too, so sentences can get more natural and varied as your vocabulary compounds — without ever breaking the "you'll understand every word" guarantee, since Bridge words are, by definition, ones you've already studied.

Output is enforced with [Gemini's structured output](https://ai.google.dev/gemini-api/docs/structured-output) (`responseSchema`), not prompt-engineered JSON — the model is *structurally incapable* of returning malformed JSON, the wrong field names, or the wrong number of sentences.

## Tech Stack

- Vanilla HTML / CSS / JS — no framework, no build step, no bundler
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- [Gemini API](https://ai.google.dev/) (`gemini-3.6-flash`) with structured JSON output
- Web Speech API for text-to-speech
- `localStorage` / `sessionStorage` only — no backend, no database, no server of any kind

## Project Structure

```
tsumugi/
├── index.html   # markup + Tailwind config
├── style.css    # theme variables (light/dark), custom animations, native-control fixes
├── app.js       # all application logic
└── README.md
```

## Running Locally

No build step — but Gemini's structured-output requests need to run from `http://` rather than `file://` in most browsers, so serve it with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL and paste your API key into Settings.

## Privacy & Security

- Your API key lives only in your browser's `localStorage` — it's sent directly to Google's Gemini API and never touches a server we control, because there isn't one.
- The app talks to exactly three external services: the Gemini API (to generate content), Google Fonts, and the Tailwind CDN (both serving static assets only). No analytics, no cookies, no tracking.
- All AI-generated content is HTML-escaped before it's ever rendered, and every input word is validated as actual Japanese (kanji / hiragana / katakana) before it reaches the Vault or the API.

## Future Improvements

Ideas that didn't make the cut for this version — each is a real feature, just one that needs more than model output to do responsibly:

- **Pitch accent notation** — needs a real accent dictionary (e.g. [Kanjium](https://github.com/mifunetoshiro/kanjium)); pitch accent is dialect-sensitive and isn't something to guess from a language model
- **JLPT level / frequency tags** — JLPT hasn't published an official vocabulary list since the 2010 reform, so this needs a real frequency corpus rather than a model's best guess
- **Kanji stroke-order diagrams** — would pull real stroke-path data (e.g. [KanjiVG](https://kanjivg.tagaini.net/)) at runtime
- **Full Anki `.apkg` export** — CSV export already covers the core need; a true `.apkg` means replicating Anki's SQLite schema client-side

## License

[MIT](LICENSE) — or swap in whatever you prefer.
