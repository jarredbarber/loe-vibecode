# `/static` — Site theme assets

CSS, images, and JavaScript that make up the visual design of the site. These files are copied as-is into the built site under `/theme/`.

```
static/
├── css/
│   ├── style.css       # main stylesheet
│   └── dark-mode.css   # dark mode overrides (applied on top of style.css)
├── img/
│   ├── logo.png        # LOE logo (top of every page)
│   └── PRX-Logo-Horizontal-Dark.svg
└── js/
    └── music-cue-player.js   # inline audio player for music cues in transcripts
```

Dark mode activates automatically when a visitor's device is set to dark, or manually via the ☀/⬤/☾ toggle in the page header. The preference is saved in the browser.
