import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const startupCssSources = [
    'css/fonts.css',
    'css/base.css',
    'css/tokens.css',
    'css/themes.css',
    'css/layout.css',
    'css/components.css',
    'css/modals.css',
    'css/interactions.css',
    'css/utilities.css',
    'css/pericope.css',
];
const cssSources = [
    ...startupCssSources,
    'css/geek95.css',
];
const excludedTopLevel = new Set([
    '.git',
    '.github',
    '_site',
    'coverage',
    'data',
    'docs',
    'node_modules',
    'offline-test-results',
    'playwright-report',
    'scripts',
    'test-results',
    'tests',
]);
const excludedRootFiles = new Set([
    'package-lock.json',
    'package.json',
    'playwright.config.js',
    'playwright.offline.config.js',
    'vitest.config.js',
    'vitest.config.mjs',
]);
const runtimeRootExtensions = new Set([
    '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.png', '.svg',
    '.txt', '.webmanifest', '.webp', '.xml',
]);
const initialTranslations = (process.env.INITIAL_OFFLINE_TRANSLATIONS || 'KJV,BSB')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

function toPosix(value) {
    return value.split(path.sep).join('/');
}

async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function shouldCopyRootFile(name) {
    if (excludedRootFiles.has(name)) return false;
    return name === '.nojekyll' || name === 'CNAME' || runtimeRootExtensions.has(path.extname(name).toLowerCase());
}

async function copyRuntimeTree() {
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });

    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        if (excludedTopLevel.has(entry.name)) continue;

        const source = path.join(root, entry.name);
        const destination = path.join(outputRoot, entry.name);
        if (entry.isDirectory()) {
            await fs.cp(source, destination, { recursive: true });
        } else if (entry.isFile() && shouldCopyRootFile(entry.name)) {
            await fs.copyFile(source, destination);
        }
    }
}

function stylesheetPaths(indexHtml) {
    return [...indexHtml.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)]
        .map(match => match[1].split(/[?#]/, 1)[0]);
}

async function validateCssSources(sourceIndex) {
    const linkedCss = stylesheetPaths(sourceIndex);
    if (linkedCss.length !== startupCssSources.length || linkedCss.some((source, index) => source !== startupCssSources[index])) {
        throw new Error(`Expected startup CSS links in this order:\n${startupCssSources.join('\n')}\nFound:\n${linkedCss.join('\n')}`);
    }

    const missingUrls = [];
    const chunks = [];

    for (const source of cssSources) {
        const absoluteSource = path.join(root, source);
        if (!(await exists(absoluteSource))) {
            throw new Error(`Missing CSS source: ${source}`);
        }

        const css = await fs.readFile(absoluteSource, 'utf8');
        chunks.push(css);

        const urlPattern = /url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g;
        for (const match of css.matchAll(urlPattern)) {
            const url = match[1];
            if (/^(?:data:|https?:|#)/i.test(url)) continue;
            const resolved = path.resolve(path.dirname(absoluteSource), url.split(/[?#]/, 1)[0]);
            if (!(await exists(resolved))) missingUrls.push(`${source}: ${url}`);
        }

        css.split('\n').forEach((line, index) => {
            if (line.includes('transition: all')) {
                console.log(`::warning file=${source},line=${index + 1}::Replace transition: all with the properties this component animates.`);
            }
        });
    }

    if (missingUrls.length) {
        throw new Error(`CSS references missing files:\n${missingUrls.join('\n')}`);
    }

    const combinedCss = chunks.join('\n');
    const themeSelect = sourceIndex.match(/<select\s+id="themeSelector"[\s\S]*?<\/select>/);
    if (!themeSelect) throw new Error('Could not find #themeSelector in index.html.');

    const themeValues = [...themeSelect[0].matchAll(/<option\s+value="([^"]+)"/g)].map(match => match[1]);
    const missingThemes = themeValues.filter(theme => !combinedCss.includes(`.${theme}-theme`));
    if (missingThemes.length) {
        throw new Error(`Theme options missing CSS selectors: ${missingThemes.join(', ')}`);
    }
}

async function bundleFirebase() {
    const sourcePath = path.join(root, 'config/firebase-config.js');
    let source = await fs.readFile(sourcePath, 'utf8');
    const replacements = new Map([
        ['https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js', 'firebase/app'],
        ['https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js', 'firebase/auth'],
        ['https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js', 'firebase/database'],
        ['https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check.js', 'firebase/app-check'],
    ]);

    for (const [remote, local] of replacements) {
        if (!source.includes(remote)) throw new Error(`Firebase source no longer imports ${remote}.`);
        source = source.replaceAll(remote, local);
    }

    const outputPath = path.join(outputRoot, 'config/firebase-config.bundle.js');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await build({
        stdin: {
            contents: source,
            loader: 'js',
            resolveDir: root,
            sourcefile: 'config/firebase-config.js',
        },
        bundle: true,
        format: 'esm',
        minify: true,
        outfile: outputPath,
        platform: 'browser',
        target: ['chrome109', 'firefox115', 'safari16.4'],
    });
}

async function localizeMarked() {
    const candidates = [
        path.join(root, 'node_modules/marked/marked.min.js'),
        path.join(root, 'node_modules/marked/lib/marked.umd.js'),
    ];
    let resolvedSource = null;
    for (const candidate of candidates) {
        if (await exists(candidate)) {
            resolvedSource = candidate;
            break;
        }
    }
    if (!resolvedSource) throw new Error('Marked browser bundle was not installed.');

    const destination = path.join(outputRoot, 'vendor/marked/marked.min.js');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(resolvedSource, destination);
}

function rewriteMarkedLoader(source) {
    const markedPattern = /https:\/\/cdn\.jsdelivr\.net\/npm\/marked@9\/marked\.min\.js(?:\?[^"]*)?/;
    if (!markedPattern.test(source)) {
        throw new Error('Could not find the hosted Marked URL in settings.js.');
    }
    return source.replace(markedPattern, './vendor/marked/marked.min.js');
}

async function validateInitialTranslations() {
    for (const translation of initialTranslations) {
        const directory = path.join(outputRoot, 'translations', translation);
        if (!(await exists(directory))) {
            throw new Error(`Initial offline translation is missing: ${translation}`);
        }

        const bookFiles = (await fs.readdir(directory, { withFileTypes: true }))
            .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('_search_index.json') && entry.name !== 'meta.json');
        if (bookFiles.length < 66) {
            throw new Error(`${translation} has only ${bookFiles.length} top-level book JSON files.`);
        }
    }
}

async function walk(directory) {
    const files = [];
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await walk(absolute));
        else if (entry.isFile()) files.push(absolute);
    }
    return files;
}

function shouldPrecache(relativePath) {
    if (relativePath === 'sw.js') return false;
    if (relativePath === 'offline-assets.json') return true;

    if (relativePath.startsWith('translations/')) {
        if (relativePath === 'translations/index.json') return true;
        const translation = relativePath.split('/')[1];
        return initialTranslations.includes(translation);
    }

    const extension = path.extname(relativePath).toLowerCase();
    if (['.css', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.mjs', '.png', '.svg', '.txt', '.webmanifest', '.webp', '.woff', '.woff2', '.xml'].includes(extension)) {
        return true;
    }

    return !relativePath.includes('/') && shouldCopyRootFile(relativePath);
}

async function writeOfflineManifest() {
    const manifestPath = path.join(outputRoot, 'offline-assets.json');
    await fs.writeFile(manifestPath, '[]\n');

    const allFiles = await walk(outputRoot);
    const assets = allFiles
        .map(file => toPosix(path.relative(outputRoot, file)))
        .filter(shouldPrecache)
        .map(relative => `./${relative}`);

    assets.push('./');
    const uniqueAssets = [...new Set(assets)].sort((a, b) => a.localeCompare(b));
    await fs.writeFile(manifestPath, `${JSON.stringify(uniqueAssets, null, 2)}\n`);

    for (const asset of uniqueAssets) {
        if (asset === './') continue;
        const localPath = path.join(outputRoot, asset.slice(2));
        if (!(await exists(localPath))) throw new Error(`Offline manifest points to a missing file: ${asset}`);
    }

    return uniqueAssets;
}

async function verifyOutput(assets) {
    const outputIndex = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
    const linkedCss = stylesheetPaths(outputIndex);
    if (linkedCss.length !== startupCssSources.length || linkedCss.some((source, index) => source !== startupCssSources[index])) {
        throw new Error(`Offline artifact did not preserve the startup CSS files: ${linkedCss.join(', ')}`);
    }
    if (await exists(path.join(outputRoot, 'css/app.min.css'))) {
        throw new Error('Offline artifact unexpectedly contains css/app.min.css.');
    }
    if (outputIndex.includes('cdn.jsdelivr.net/npm/marked')) {
        throw new Error('Built index still loads Marked from jsDelivr.');
    }
    const outputSettings = await fs.readFile(path.join(outputRoot, 'settings.js'), 'utf8');
    if (outputSettings.includes('cdn.jsdelivr.net/npm/marked')) {
        throw new Error('Built settings.js still loads Marked from jsDelivr.');
    }
    if (!outputSettings.includes("'./vendor/marked/marked.min.js'")) {
        throw new Error('Built settings.js does not load the local Marked bundle.');
    }
    if (assets.length < 150) {
        throw new Error(`Offline manifest contains only ${assets.length} assets; expected the full shell and two translations.`);
    }
}

async function main() {
    if (!initialTranslations.length) throw new Error('INITIAL_OFFLINE_TRANSLATIONS cannot be empty.');

    const sourceIndex = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    const sourceSettings = await fs.readFile(path.join(root, 'settings.js'), 'utf8');
    await copyRuntimeTree();
    await validateCssSources(sourceIndex);
    await bundleFirebase();
    await localizeMarked();
    await fs.writeFile(
        path.join(outputRoot, 'settings.js'),
        rewriteMarkedLoader(sourceSettings)
    );
    await validateInitialTranslations();
    const assets = await writeOfflineManifest();
    await verifyOutput(assets);

    console.log(`Prepared _site with ${assets.length} required offline assets.`);
    console.log(`Initial offline translations: ${initialTranslations.join(', ')}`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
