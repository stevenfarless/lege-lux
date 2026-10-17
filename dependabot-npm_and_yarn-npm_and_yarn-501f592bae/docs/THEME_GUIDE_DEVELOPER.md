# How to Make a Theme for This Bible App

This guide walks you through adding a complete theme — dark mode and light mode — from scratch.

---

## How the CSS is Structured

There are three files you need to understand:

**`tokens.css`** — defines the default values for every semantic token and stores any palette constants your theme needs (your raw hex color palette). You add your palette here.

**`themes.css`** — overrides the semantic tokens for each named theme. You add your theme block here.

**`layout.css` / `components.css` / etc.** — these files never mention colors directly. They only use semantic token names like `var(--bg-base)` or `var(--text-body)`. You never touch these files when making a theme.

---

## The Semantic Tokens

These are the only names you need to set. Every component in the app reads from exactly these tokens.

| Token | What it controls |
|---|---|
| `--bg-base` | Outermost page/body background |
| `--bg-card` | Cards, panels, modal backgrounds |
| `--bg-raised` | Elevated items: dropdowns, active rows, hover states |
| `--text-heading` | h1–h3, passage titles, modal titles |
| `--text-body` | Body copy, list items, nav items, button labels |
| `--text-muted` | Secondary labels, captions, placeholder text |
| `--border-neutral` | Standard dividers and outlines |
| `--highlight-border` | Emphasized borders, active states |
| `--primary-color` | Main interactive color: buttons, links, active states |
| `--primary-dark` | Hover/pressed state of primary (slightly darker) |
| `--primary-light` | Lighter tint of primary, used for certain highlights |
| `--brand-secondary` | Second accent color (orange, amber, gold, etc.) |
| `--section-heading-color` | Book/category label text in the book selector |
| `--accent-color` | Tertiary decorative accent (links, verse numbers) |
| `--success-color` | Positive feedback, confirmation states |
| `--warning-color` | Caution states |
| `--error-color` | Destructive actions, error messages, delete buttons |
| `--shadow-sm/md/lg` | Box shadows — tune to your background tone |
| `--footnote-hover-bg` | Hover background on footnote markers |

---

## Step 1 — Add Your Palette to `tokens.css`

Open `css/tokens.css`. At the top of the `:root` block, after the existing Alucard palette constants, add your raw hex colors as named constants. These are just your color references — they don't control anything yet.

```css
/* Nord palette constants */
--nord-bg:          #2E3440;  /* Polar Night — darkest */
--nord-bg-dark:     #242831;  /* Slightly darker than bg */
--nord-bg-darker:   #1C2128;  /* Darkest surface */
--nord-bg-light:    #3B4252;  /* Elevated surface */
--nord-bg-lighter:  #434C5E;  /* Higher elevation */
--nord-selection:   #4C566A;  /* Selected text background */
--nord-fg:          #ECEFF4;  /* Brightest foreground */
--nord-fg-dim:      #D8DEE9;  /* Slightly dimmer foreground */
--nord-muted:       #616E88;  /* De-emphasized text */
--nord-frost-1:     #8FBCBB;  /* Teal — calm, focused */
--nord-frost-2:     #88C0D0;  /* Light blue — primary */
--nord-frost-3:     #81A1C1;  /* Blue — secondary */
--nord-frost-4:     #5E81AC;  /* Dark blue — links */
--nord-red:         #BF616A;
--nord-orange:      #D08770;
--nord-yellow:      #EBCB8B;
--nord-green:       #A3BE8C;
--nord-purple:      #B48EAD;

/* Nord functional colors — UI only, not for decoration */
--nord-func-green:  #4A8A3F;
--nord-func-yellow: #9A7B00;
--nord-func-red:    #B03030;
```

Name your constants `--yourtheme-colorname` so they are clearly scoped to your theme and don't conflict with anything else.

---

## Step 2 — Add Your Theme Block to `themes.css`

Open `css/themes.css`. Copy this template and fill in your values. The class name you choose here (e.g. `nord-theme`) is what gets applied to the `<html>` element when the user selects your theme.

```css
/* Nord — cool dark theme inspired by arctic landscapes */
:root.nord-theme,
html.nord-theme,
body.nord-theme {
    --bg-base:   var(--nord-bg-darker);
    --bg-card:   var(--nord-bg-dark);
    --bg-raised: var(--nord-bg);

    --text-heading: var(--nord-fg);
    --text-body:    var(--nord-fg-dim);
    --text-muted:   var(--nord-muted);

    --border-neutral:   var(--nord-selection);
    --highlight-border: var(--nord-bg-lighter);

    --primary-color:  var(--nord-frost-2);
    --primary-dark:   var(--nord-frost-4);
    --primary-light:  var(--nord-frost-1);
    --brand-secondary: var(--nord-orange);
    --section-heading-color: var(--brand-secondary);
    --accent-color:   var(--nord-frost-3);

    --success-color: var(--nord-func-green);
    --warning-color: var(--nord-func-yellow);
    --error-color:   var(--nord-func-red);

    --footnote-hover-bg: color-mix(in srgb, var(--primary-color) 18%, transparent);

    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.45);
    --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.50);
}
```

---

## Step 3 — Add a Light Mode Variant (Optional)

If your theme has a light version, add a second block that matches both your theme class and `.light-mode`. This block only needs to override what changes — surfaces, text, and borders are usually the main differences.

```css
/* Nord Light — Snow Storm surfaces */
:root.nord-theme.light-mode,
html.nord-theme.light-mode,
body.nord-theme.light-mode {
    --bg-base:   #ECEFF4;  /* Snow Storm — lightest */
    --bg-card:   #E5E9F0;
    --bg-raised: #D8DEE9;

    --text-heading: #2E3440;
    --text-body:    #3B4252;
    --text-muted:   #616E88;

    --border-neutral:   #D0D6E0;
    --highlight-border: #B8C0CC;

    /* Brand colors stay the same — just darken for contrast on light bg */
    --primary-color:   #4A7FA8;
    --primary-dark:    #3A6B91;
    --primary-light:   #6FA8C8;
    --brand-secondary: #C07050;
    --section-heading-color: var(--brand-secondary);
    --accent-color:    #5A8AAA;

    --success-color: var(--nord-func-green);
    --warning-color: var(--nord-func-yellow);
    --error-color:   var(--nord-func-red);

    --shadow-sm: 0 1px 3px rgba(46, 52, 64, 0.10);
    --shadow-md: 0 4px 6px rgba(46, 52, 64, 0.12);
    --shadow-lg: 0 10px 15px rgba(46, 52, 64, 0.16);
}
```

---

## Step 4 — Register the Theme in JavaScript

The JS needs to know your theme exists so it can add the class to `<html>` when selected. Search the codebase for where existing themes are registered (look for `dracula-theme`, `onyx-theme`, etc.) and add your theme name to that list alongside a display name and whether it supports light mode.

---

## Common Mistakes

**Shadows too light on dark themes.** Dark backgrounds need higher shadow opacity — `rgba(0,0,0,0.45)` or more. The default shadow values in `tokens.css` are tuned for dark mode already, but a pale dark theme (like Nord) can use slightly less.

**Shadows too dark on light themes.** Light mode surfaces need shadows around `rgba(0,0,0,0.10)–0.16`. Higher than that looks like a drop shadow from a 2010 website.

**`--primary-color` failing contrast on light backgrounds.** Colors that look vibrant on dark surfaces often drop below 4.5:1 contrast on white. If your primary is a bright frost blue, darken it for the light variant — check contrast at [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker).

**Forgetting `--section-heading-color`.** This controls the book category labels (Old Testament, New Testament, etc.) in the book selector. If you leave it inheriting `--brand-secondary` it usually works, but some themes want these labels muted rather than accented — set it to `var(--text-muted)` if so.

**`--error-color` unreadable on the delete button.** The delete button background is `var(--error-color)` and its text is `var(--bg-base)`. Make sure your error color has enough contrast against your base background color.
