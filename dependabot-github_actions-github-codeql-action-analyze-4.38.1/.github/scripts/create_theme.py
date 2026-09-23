import colorsys
import html
import os
import re
from pathlib import Path

THEMES_FILE = Path("css/themes.css")
INDEX_FILE = Path("index.html")
UI_FILE = Path("ui.js")
COLOR_PATTERN = re.compile(r"^#?[0-9a-fA-F]{6}$")
ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
PALETTE_KEYS = ("bg_base", "bg_card", "text_heading", "text_body", "text_muted", "primary", "secondary", "accent")


def required(name):
    value = os.environ[name].strip()
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def optional(name):
    return os.environ.get(name, "").strip()


def normalize_color(value, label):
    value = value.strip()
    if not COLOR_PATTERN.fullmatch(value):
        raise SystemExit(f"{label} must be a six-digit hex color")
    return f"#{value.lstrip('#').upper()}"


def slugify_theme_name(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        raise SystemExit("THEME_NAME must contain at least one letter or number")
    return slug


def rgb(hex_color):
    return tuple(int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5))


def hex_color(red, green, blue):
    return "#{:02X}{:02X}{:02X}".format(round(red * 255), round(green * 255), round(blue * 255))


def adjust_lightness(value, amount):
    red, green, blue = rgb(value)
    hue, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)
    lightness = max(0, min(1, lightness + amount))
    return hex_color(*colorsys.hls_to_rgb(hue, lightness, saturation))


def mix(first, second, weight):
    first_rgb = rgb(first)
    second_rgb = rgb(second)
    return hex_color(*(first_channel * weight + second_channel * (1 - weight) for first_channel, second_channel in zip(first_rgb, second_rgb)))


def parse_palette(env_name, dark):
    parts = [part.strip() for part in required(env_name).split(",")]
    if len(parts) != len(PALETTE_KEYS):
        raise SystemExit(f"{env_name} must contain exactly 8 comma-separated hex colors")

    values = {
        key: normalize_color(value, f"{env_name} item {index}")
        for index, (key, value) in enumerate(zip(PALETTE_KEYS, parts), 1)
    }
    values["bg_raised"] = adjust_lightness(values["bg_card"], 0.06 if dark else -0.04)
    values["border_neutral"] = mix(values["bg_raised"], values["text_muted"], 0.72 if dark else 0.82)
    values["highlight_border"] = mix(values["border_neutral"], values["text_heading"], 0.72)
    values["primary_dark"] = adjust_lightness(values["primary"], -0.08)
    values["primary_light"] = adjust_lightness(values["primary"], 0.10)
    values["success"] = "#6FBF73" if dark else "#2E7D32"
    values["warning"] = "#F2C14E" if dark else "#9A6700"
    values["error"] = "#E57373" if dark else "#B3261E"
    values["shadow_sm"] = f"0 1px 3px rgba(0, 0, 0, {'0.45' if dark else '0.10'})"
    values["shadow_md"] = f"0 6px 16px rgba(0, 0, 0, {'0.45' if dark else '0.12'})"
    values["shadow_lg"] = f"0 16px 40px rgba(0, 0, 0, {'0.50' if dark else '0.16'})"
    return values


def replace_once(text, old, new, description):
    if old not in text:
        raise SystemExit(f"Could not find insertion point for {description}")
    return text.replace(old, new, 1)


def validate_theme_id(theme_id, label):
    if not ID_PATTERN.fullmatch(theme_id):
        raise SystemExit(f"{label} must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens")


def remove_css_theme(css, theme_id):
    pattern = re.compile(
        rf"\n\n/\* [^*]+ theme \*/\n:root\.{re.escape(theme_id)}-theme,\nhtml\.{re.escape(theme_id)}-theme,\nbody\.{re.escape(theme_id)}-theme \{{.*?(?=\n\n/\* [^*]+ theme \*/|\Z)",
        re.S,
    )
    css, count = pattern.subn("", css)
    if count > 1:
        raise SystemExit(f"Theme ID '{theme_id}' appears more than once in {THEMES_FILE}")
    return css


def remove_index_theme(index, theme_id):
    index = re.sub(rf"\n\t+<option value=\"{re.escape(theme_id)}\">[^\n]*</option>", "", index)
    index = index.replace(f", '{theme_id}': 1", "")
    index = index.replace(f"'{theme_id}': 1, ", "")
    return index


def add_index_theme_allowlist(index, theme_id):
    pattern = re.compile(r"(var valid = \{)([^}]*)(\};)")
    match = pattern.search(index)
    if not match:
        raise SystemExit("Could not find insertion point for prepaint theme allowlist")

    body = match.group(2).strip()
    updated_body = f"{body}, '{theme_id}': 1" if body else f"'{theme_id}': 1"
    return index[:match.start()] + f"{match.group(1)} {updated_body} {match.group(3)}" + index[match.end():]


def remove_ui_theme(ui, theme_id):
    theme_class = f"{theme_id}-theme"
    ui = ui.replace(f", '{theme_class}'", "")
    ui = re.sub(rf"\n\t'{re.escape(theme_class)}':\s*\{{ dark: '[^']+', light: '[^']+' \}},", "", ui)
    return ui


def add_ui_theme_class(ui, theme_class):
    pattern = re.compile(r"(const ALL_THEME_CLASSES = \[)([^\]]*)(\];)", re.S)
    match = pattern.search(ui)
    if not match:
        raise SystemExit("Could not find insertion point for theme class list")

    body = match.group(2).strip()
    updated_body = f"{body}, '{theme_class}'" if body else f"'{theme_class}'"
    return ui[:match.start()] + f"{match.group(1)}{updated_body}{match.group(3)}" + ui[match.end():]


def resolve_theme_id(initial_theme_id):
    action = optional("EXISTING_THEME_ACTION") or "stop"
    if action not in {"stop", "overwrite", "rename"}:
        raise SystemExit("EXISTING_THEME_ACTION must be stop, overwrite, or rename")
    if action == "rename":
        renamed = optional("RENAME_THEME_ID")
        if not renamed:
            raise SystemExit("RENAME_THEME_ID is required when EXISTING_THEME_ACTION is rename")
        validate_theme_id(renamed, "RENAME_THEME_ID")
        return renamed, action
    return initial_theme_id, action


def palette_block(selector, values):
    return f'''{selector} {{
    --bg-base: {values["bg_base"]};
    --bg-card: {values["bg_card"]};
    --bg-raised: {values["bg_raised"]};

    --text-heading: {values["text_heading"]};
    --text-body: {values["text_body"]};
    --text-muted: {values["text_muted"]};

    --border-neutral: {values["border_neutral"]};
    --highlight-border: {values["highlight_border"]};

    --primary-color: {values["primary"]};
    --primary-dark: {values["primary_dark"]};
    --primary-light: {values["primary_light"]};
    --brand-secondary: {values["secondary"]};
    --section-heading-color: var(--brand-secondary);
    --accent-color: {values["accent"]};

    --success-color: {values["success"]};
    --warning-color: {values["warning"]};
    --error-color: {values["error"]};

    --footnote-hover-bg: color-mix(in srgb, var(--primary-color) 18%, transparent);

    --shadow-sm: {values["shadow_sm"]};
    --shadow-md: {values["shadow_md"]};
    --shadow-lg: {values["shadow_lg"]};
}}'''


def main():
    name = required("THEME_NAME")
    initial_theme_id = slugify_theme_name(name)
    mode = required("THEME_MODE")

    if mode not in {"dark", "light", "both"}:
        raise SystemExit("THEME_MODE must be dark, light, or both")

    theme_id, action = resolve_theme_id(initial_theme_id)
    dark_values = parse_palette("DARK_PALETTE", mode != "light")
    light_values = parse_palette("LIGHT_PALETTE", False) if mode == "both" else None

    css = THEMES_FILE.read_text()
    index = INDEX_FILE.read_text()
    ui = UI_FILE.read_text()
    selector = f":root.{theme_id}-theme"
    theme_exists = selector in css or f'value="{html.escape(theme_id, quote=True)}"' in index or f"'{theme_id}-theme'" in ui

    if theme_exists and action == "stop":
        raise SystemExit(f"Theme ID '{theme_id}' already exists. Choose overwrite or rename.")
    if theme_exists and action == "overwrite":
        css = remove_css_theme(css, theme_id)
        index = remove_index_theme(index, theme_id)
        ui = remove_ui_theme(ui, theme_id)
    if theme_exists and action == "rename":
        raise SystemExit(f"Rename target '{theme_id}' already exists. Choose another rename ID.")

    base_selector = f":root.{theme_id}-theme,\nhtml.{theme_id}-theme,\nbody.{theme_id}-theme"
    theme_block = f"\n\n/* {name} theme */\n{palette_block(base_selector, dark_values)}"

    if mode == "both":
        light_selector = f":root.{theme_id}-theme.light-mode,\nhtml.{theme_id}-theme.light-mode,\nbody.{theme_id}-theme.light-mode"
        theme_block += f"\n\n{palette_block(light_selector, light_values)}"

    theme_block += f'''

body.{theme_id}-theme,
body.{theme_id}-theme .main-content {{
    background-color: var(--bg-base);
    color: var(--text-body);
}}

body.{theme_id}-theme .passage-container {{
    background-color: var(--bg-card);
    color: var(--text-body);
}}

body.{theme_id}-theme .passage-title,
body.{theme_id}-theme .passage-text,
body.{theme_id}-theme .verse {{
    color: var(--text-body);
}}

body.{theme_id}-theme .top-chrome,
body.{theme_id}-theme .header,
body.{theme_id}-theme .navigation,
body.{theme_id}-theme .modal-content,
body.{theme_id}-theme .accordion-section,
body.{theme_id}-theme .accordion-panel,
body.{theme_id}-theme .settings-group,
body.{theme_id}-theme .input-field {{
    background-color: var(--bg-card);
    color: var(--text-body);
    border-color: var(--border-neutral);
}}

body.{theme_id}-theme .modal-header,
body.{theme_id}-theme .accordion-header,
body.{theme_id}-theme .selector-btn,
body.{theme_id}-theme .nav-btn,
body.{theme_id}-theme .icon-btn {{
    background-color: var(--bg-raised);
    color: var(--text-heading);
    border-color: var(--border-neutral);
}}

body.{theme_id}-theme .help-text,
body.{theme_id}-theme .verse-number {{
    color: var(--text-muted);
}}
'''
    THEMES_FILE.write_text(css.rstrip() + theme_block)

    option_value = html.escape(theme_id, quote=True)
    mode_label = "Light | Dark" if mode == "both" else mode.title()
    option = f'\t\t\t\t\t\t\t\t\t<option value="{option_value}">{html.escape(name)} ({mode_label})</option>\n'
    index = replace_once(index, '\t\t\t\t\t\t\t\t</select>', option + '\t\t\t\t\t\t\t\t</select>', "theme selector option")
    index = add_index_theme_allowlist(index, theme_id)
    INDEX_FILE.write_text(index)

    theme_class = f"{theme_id}-theme"
    ui = add_ui_theme_class(ui, theme_class)
    light_bg = light_values["bg_base"] if light_values else dark_values["bg_base"]
    bg_entry = f"\t'{theme_class}':        {{ dark: '{dark_values['bg_base']}', light: '{light_bg}' }},\n"
    ui = replace_once(ui, "};\n\nexport function updateThemeColor()", bg_entry + "};\n\nexport function updateThemeColor()", "theme-color background map")
    UI_FILE.write_text(ui)


if __name__ == "__main__":
    main()
