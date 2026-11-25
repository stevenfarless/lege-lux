# Making Your Own Theme — No Coding Experience Required

This app uses simple text files to control colors. A theme is just a list of color assignments.
You'll edit three files, and in each one the change is small and clearly marked.

The example theme used throughout this guide is called **Nord** — a cool, arctic color palette.
Swap every mention of "nord" with your own theme name (all lowercase, no spaces).

---

## Before You Start — Pick Your Colors

You need to decide on these colors before editing any files. Write them down as hex codes
(e.g. `#2E3440`). You can find hex codes at any color picker website like coolors.co or
simply by searching "hex color picker" in Google.

**Surfaces** — three background shades, darkest to lightest (for dark mode):

| What it's for | Example (Nord) |
|---|---|
| Page background — the darkest shade | `#1C2128` |
| Cards and panels — slightly lighter | `#242831` |
| Dropdowns and hover highlights — lightest | `#2E3440` |

**Text** — three levels:

| What it's for | Example (Nord) |
|---|---|
| Headings and titles | `#ECEFF4` |
| Body text and labels | `#D8DEE9` |
| Muted / secondary info | `#616E88` |

**Brand colors** — two accent colors:

| What it's for | Example (Nord) |
|---|---|
| Primary (buttons, links, active items) | `#88C0D0` |
| Secondary accent (decorative highlights) | `#D08770` |

**Functional colors** — these should be clearly readable on your background:

| What it's for | Example (Nord) |
|---|---|
| Success / confirmation | `#4A8A3F` |
| Warning / caution | `#9A7B00` |
| Error / delete actions | `#B03030` |

---

## File 1 of 3 — `css/themes.css`

This is the main file. Open it and scroll to the very bottom. Paste the entire block below,
then replace every hex code with your own colors.

The class name `nord-theme` appears in several places — replace `nord` with your theme name
everywhere. Keep the `-theme` suffix.

```css
/* ============================================================
   YOUR THEME NAME HERE — short description
   ============================================================ */

/* Dark mode */
:root.nord-theme,
html.nord-theme,
body.nord-theme {

    /* --- Surfaces --- */
    --bg-base:   #1C2128;   /* page background — darkest */
    --bg-card:   #242831;   /* cards and panels */
    --bg-raised: #2E3440;   /* dropdowns and hover highlights */

    /* --- Text --- */
    --text-heading: #ECEFF4;  /* headings and titles */
    --text-body:    #D8DEE9;  /* body text and labels */
    --text-muted:   #616E88;  /* secondary info, captions */

    /* --- Borders --- */
    --border-neutral:   #4C566A;  /* dividers and outlines */
    --highlight-border: #434C5E;  /* active/focused borders */

    /* --- Brand colors --- */
    --primary-color:  #88C0D0;  /* buttons, links, active states */
    --primary-dark:   #5E81AC;  /* hover state of primary (slightly darker) */
    --primary-light:  #8FBCBB;  /* lighter tint of primary */
    --brand-secondary: #D08770; /* second accent color */
    --section-heading-color: var(--brand-secondary); /* book category labels */
    --accent-color:   #81A1C1;  /* decorative accent */

    /* --- Functional colors --- */
    /* These should be readable on your --bg-base color */
    --success-color: #4A8A3F;
    --warning-color: #9A7B00;
    --error-color:   #B03030;

    /* --- Shadows --- */
    /* For dark themes: keep the opacity between 0.40 and 0.55 */
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.45);
    --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.50);

    /* Leave this line exactly as-is — it auto-derives from your primary color */
    --footnote-hover-bg: color-mix(in srgb, var(--primary-color) 18%, transparent);
}


/* Light mode — add this block if you want a light version of your theme.
   Delete this entire block if you only want a dark theme. */
:root.nord-theme.light-mode,
html.nord-theme.light-mode,
body.nord-theme.light-mode {

    /* --- Surfaces (lightest to slightly darker) --- */
    --bg-base:   #ECEFF4;
    --bg-card:   #E5E9F0;
    --bg-raised: #D8DEE9;

    /* --- Text (darkest = most readable) --- */
    --text-heading: #2E3440;
    --text-body:    #3B4252;
    --text-muted:   #616E88;

    /* --- Borders --- */
    --border-neutral:   #D0D6E0;
    --highlight-border: #B8C0CC;

    /* --- Brand colors ---
       Important: your dark-mode primary color may be too light to read
       on a white/light background. Darken it here if needed.
       Test at: webaim.org/resources/contrastchecker
       Paste your background color in the top box and brand color in the
       bottom box. You need a ratio of at least 4.5:1. */
    --primary-color:   #4A7FA8;
    --primary-dark:    #3A6B91;
    --primary-light:   #6FA8C8;
    --brand-secondary: #C07050;
    --section-heading-color: var(--brand-secondary);
    --accent-color:    #5A8AAA;

    /* --- Functional colors --- */
    --success-color: #4A8A3F;
    --warning-color: #9A7B00;
    --error-color:   #B03030;

    /* --- Shadows ---
       For light themes: keep opacity between 0.08 and 0.18 */
    --shadow-sm: 0 1px 3px rgba(46, 52, 64, 0.10);
    --shadow-md: 0 4px 6px rgba(46, 52, 64, 0.12);
    --shadow-lg: 0 10px 15px rgba(46, 52, 64, 0.16);

    --footnote-hover-bg: color-mix(in srgb, var(--primary-color) 14%, transparent);
}
```

---

## File 2 of 3 — `index.html`

Open `index.html`. Search for this line (around line 316):

```
<select id="themeSelector" class="input-field">
```

Directly below it you'll see a list of `<option>` lines — one per existing theme. Add yours
to the list. The `value` must match the name you used in `themes.css` (without `-theme`):

```html
<option value="nord">Nord (Arctic Blue)</option>
```

The text inside the tags (`Nord (Arctic Blue)`) is what users see in the dropdown — write
whatever you want there.

---

## File 3 of 3 — `ui.js`

Open `ui.js`. You need to make two small additions.

**Addition 1** — Find this line (around line 227):

```
const ALL_THEME_CLASSES = ['dracula-theme', 'dracula2test-theme', 'onyx-theme', ...
```

Add `'nord-theme'` to that array (the name must end in `-theme`):

```js
const ALL_THEME_CLASSES = ['dracula-theme', 'dracula2test-theme', 'onyx-theme', 'sage-theme', 'ember-theme', 'perplexity-theme', 'basic-theme', 'geek-theme', 'gnome-theme', 'nord-theme'];
```

**Addition 2** — A few lines below that, find the `THEME_BG` block. It maps each theme to its
background colors so the browser tab bar matches your theme:

```js
'dracula-theme':  { dark: '#191A21', light: '#FFFBEB' },
```

Add a line for your theme. Use the hex values you set for `--bg-base` in your dark and light
blocks above:

```js
'nord-theme': { dark: '#1C2128', light: '#ECEFF4' },
```

If your theme is dark-only, use the same color for both:

```js
'nord-theme': { dark: '#1C2128', light: '#1C2128' },
```

---

## That's it.

Save all three files. Reload the app. Your theme should appear in the Color Theme dropdown
in Settings.

If colors look wrong, the most likely cause is that you have a light-mode block and forgot to
adjust the brand colors for contrast. See the contrast checker note in File 1.

