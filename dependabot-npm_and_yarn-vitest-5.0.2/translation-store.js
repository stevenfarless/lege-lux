// translation-store.js
// IndexedDB persistence layer for on-demand downloaded translations.
//
// Downloaded translations are stored as:
//   books store:       key = "{translation}/{book}"  value = book JSON object
//   searchIndex store: key = translation             value = search index object
//
// A "downloaded" record stores the translation id so we can check presence
// without reading every book.

const DB_NAME = 'bibleTranslations';
const DB_VERSION = 1;

let _db = null;

function _open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('books')) {
                db.createObjectStore('books');
            }
            if (!db.objectStoreNames.contains('searchIndex')) {
                db.createObjectStore('searchIndex');
            }
            if (!db.objectStoreNames.contains('downloaded')) {
                db.createObjectStore('downloaded');
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => reject(e.target.error);
    });
}

function _tx(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
}

function _idbGet(store, key) {
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = (e) => reject(e.target.error);
    });
}

function _idbPut(store, key, value) {
    return new Promise((resolve, reject) => {
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

function _idbDelete(store, key) {
    return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

function _idbGetAllKeys(store) {
    return new Promise((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function idbGetBook(translation, book) {
    try {
        await _open();
        return _idbGet(_tx('books', 'readonly'), `${translation}/${book}`);
    } catch (error) {
        console.warn(`idbGetBook failed for ${translation}/${book}`, error);
        return null;
    }
}

export async function idbPutBook(translation, book, data) {
    try {
        await _open();
        await _idbPut(_tx('books', 'readwrite'), `${translation}/${book}`, data);
        return true;
    } catch (error) {
        console.error(`idbPutBook failed for ${translation}/${book}`, error);
        return false;
    }
}

export async function idbGetSearchIndex(translation) {
    try {
        await _open();
        return _idbGet(_tx('searchIndex', 'readonly'), translation);
    } catch (error) {
        console.warn(`idbGetSearchIndex failed for ${translation}`, error);
        return null;
    }
}

export async function idbPutSearchIndex(translation, data) {
    try {
        await _open();
        await _idbPut(_tx('searchIndex', 'readwrite'), translation, data);
        return true;
    } catch (error) {
        console.error(`idbPutSearchIndex failed for ${translation}`, error);
        return false;
    }
}

export async function idbIsDownloaded(translation) {
    try {
        await _open();
        return (await _idbGet(_tx('downloaded', 'readonly'), translation)) === true;
    } catch (error) {
        console.warn(`idbIsDownloaded failed for ${translation}`, error);
        return false;
    }
}

export async function idbMarkDownloaded(translation) {
    try {
        await _open();
        await _idbPut(_tx('downloaded', 'readwrite'), translation, true);
        return true;
    } catch (error) {
        console.error(`idbMarkDownloaded failed for ${translation}`, error);
        return false;
    }
}

/**
 * Remove all IndexedDB data for a translation (books, search index, downloaded flag).
 */
export async function idbDeleteTranslation(translation) {
    try {
        await _open();
        const prefix = `${translation}/`;
        const bookKeys = await _idbGetAllKeys(_tx('books', 'readonly'));
        const toDelete = bookKeys.filter((k) => k.startsWith(prefix));
        await Promise.all(
            toDelete.map((k) => _idbDelete(_tx('books', 'readwrite'), k))
        );
        await _idbDelete(_tx('searchIndex', 'readwrite'), translation);
        await _idbDelete(_tx('downloaded', 'readwrite'), translation);
    } catch (err) {
        console.error('idbDeleteTranslation failed', err);
    }
}
