// auth.js
// Firebase auth, user data, and reading-position persistence for BibleApp.

function lsSet(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { }
}

function lsSetJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { }
}

function isAuthRestorePositionSource(source) {
    const value = String(source || 'unspecified');
    return value === 'auth-restoration-newer-local-position' ||
        value.startsWith('auth-') ||
        value.includes(':auth-') ||
        value.startsWith('legacy-') ||
        value.includes(':legacy-');
}

function markLocalReadingPositionChange(app, source) {
    if (isAuthRestorePositionSource(source)) return;

    app._localReadingPositionVersion = (app._localReadingPositionVersion || 0) + 1;
    app._localReadingPositionChangedAt = performance.now();
    app._localReadingPositionChangeSource = source;
}

function hasLocalPositionChangedSinceAuthScheduled(app) {
    if (app.hasLocalPositionChangedSinceAuthStart?.()) return true;

    const scheduledAt = app._dbg?.t_auth_restore_scheduled;
    const changedAt = app._localReadingPositionChangedAt;

    return Number.isFinite(scheduledAt) &&
        Number.isFinite(changedAt) &&
        changedAt > scheduledAt;
}

function currentReadingPosition(app) {
    return {
        book: app.state.currentBook,
        chapter: app.state.currentChapter,
        scrollY: window.scrollY || 0,
    };
}

function markCurrentPositionAsAuthBaseline(app) {
    app._authRestorePositionBaseline = currentReadingPosition(app);
}

async function saveNewerLocalReadingPosition(app) {
    const pos = currentReadingPosition(app);
    lsSetJSON('readingPosition', pos);
    app._dbgEvent?.(
        'auth restoration: saved newer local position ' +
        pos.book + ' ' + pos.chapter + ' scrollY=' + pos.scrollY +
        ' source=' + (app._localReadingPositionChangeSource || 'unknown')
    );

    if (!app.currentUser || !app.database) return;

    try {
        await app.database
            .ref(`users/${app.currentUser.uid}/readingPosition`)
            .set(pos);
    } catch (err) {
        console.error('saveNewerLocalReadingPosition: Firebase write failed', err);
    }
}

async function keepNewerLocalPosition(app, reason) {
    app._dbgEvent?.(
        'auth restoration: skipped remote position after local interaction ' + reason
    );
    await saveNewerLocalReadingPosition(app);
    markCurrentPositionAsAuthBaseline(app);
}

export async function loadSavedPositionIfChanged(app, withTimeout) {
    if (!app.currentUser || !app.database) return;
    if (hasLocalPositionChangedSinceAuthScheduled(app)) {
        await keepNewerLocalPosition(app, 'before remote read');
        return;
    }

    let targetBook = app.state.currentBook;
    let targetChapter = app.state.currentChapter;
    let targetScrollY = 0;
    app._dbgEvent?.('auth restoration: local position at read start ' + targetBook + ' ' + targetChapter + ' scrollY=' + (window.scrollY || 0));

    try {
        const snapshot = await withTimeout(
            app.database.ref(`users/${app.currentUser.uid}/readingPosition`).once('value'),
            5000
        );

        if (snapshot) {
            const pos = snapshot.val();
            if (pos && pos.book && pos.chapter) {
                targetBook = pos.book;
                targetChapter = pos.chapter;
                targetScrollY = pos.scrollY || 0;
                app._dbgEvent?.('auth restoration: remote position: ' + targetBook + ' ' + targetChapter + ' scrollY=' + targetScrollY);
            }
        } else {
            console.warn('_loadSavedPositionIfChanged: timed out, keeping current passage');
        }
    } catch (err) {
        console.error('_loadSavedPositionIfChanged: Firebase read failed', err);
    }

    if (hasLocalPositionChangedSinceAuthScheduled(app)) {
        await keepNewerLocalPosition(app, 'during remote read');
        return;
    }

    if (targetBook !== app.state.currentBook || targetChapter !== app.state.currentChapter) {
        app.state.currentBook = targetBook;
        app.state.currentChapter = targetChapter;
        app.lastScrollPosition = targetScrollY;
        lsSetJSON('readingPosition', { book: targetBook, chapter: targetChapter, scrollY: targetScrollY });
        app._dbgEvent?.('auth restoration: chose remote position ' + targetBook + ' ' + targetChapter + ' scrollY=' + targetScrollY);
        await app.loadPassage(targetBook, targetChapter, !!targetScrollY, 'auth-remote-position');
        markCurrentPositionAsAuthBaseline(app);
    } else if (targetScrollY) {
        app._dbgEvent?.('auth restoration: chose remote scrollY=' + targetScrollY + ' for current passage');
        window.scrollTo(0, targetScrollY);
        markCurrentPositionAsAuthBaseline(app);
    } else {
        markCurrentPositionAsAuthBaseline(app);
    }
}

/** @deprecated Use loadSavedPositionIfChanged for the auth flow. */
export async function loadSavedReadingPosition(app, withTimeout) {
    if (!app.currentUser || !app.database) {
        await app.loadPassage(app.state.currentBook, app.state.currentChapter, false, 'legacy-saved-position-no-user');
        return;
    }

    try {
        const snapshot = await withTimeout(
            app.database.ref(`users/${app.currentUser.uid}/readingPosition`).once('value'),
            5000
        );

        if (snapshot) {
            const pos = snapshot.val();
            if (pos && pos.book && pos.chapter) {
                app.state.currentBook = pos.book;
                app.state.currentChapter = pos.chapter;
                app.lastScrollPosition = pos.scrollY || 0;
            }
        } else {
            console.warn('loadSavedReadingPosition: timed out, loading from local state');
        }
    } catch (err) {
        console.error('loadSavedReadingPosition: failed to read Firebase', err);
    }

    await app.loadPassage(app.state.currentBook, app.state.currentChapter, !!app.lastScrollPosition, 'legacy-saved-position');
}

export function saveReadingPosition(app, source = 'unspecified') {
    markLocalReadingPositionChange(app, source);

    const pos = {
        book: app.state.currentBook,
        chapter: app.state.currentChapter,
        scrollY: window.scrollY || 0,
    };

    // Always write locally — this is what _restorePassageCache matches against
    // on the next cold load. Without this, signed-in users always get a cache
    // miss because their localStorage position is stale.
    lsSetJSON('readingPosition', pos);
    app._dbgEvent?.('storage write: readingPosition ' + pos.book + ' ' + pos.chapter + ' scrollY=' + pos.scrollY + ' source=' + source);

    if (app.canWriteRemoteState()) {
        app.database
            .ref(`users/${app.currentUser.uid}/readingPosition`)
            .set(pos)
            .catch((err) => console.error('saveReadingPosition: Firebase write failed', err));
    }
}

export function handleUserButtonClick(app) {
    if (app.currentUser) {
        const emailEl = document.getElementById('userEmail');
        if (emailEl) emailEl.textContent = app.currentUser.email || '';

        const isLight = document.body.classList.contains('light-mode');
        let colorTheme = app.state?.colorTheme || '';

        try { colorTheme = app.state?.colorTheme || localStorage.getItem('colorTheme') || ''; } catch (_) { }
        const themeNameMap = {
            dracula: 'Dracula (Purple/Pink)',
            onyx: 'Onyx (Gold/OLED)',
            sage: 'Sage (Green/Forest)',
            ember: 'Ember (Amber/Candlelit)',
            perplexity: 'Perplexity (Teal/Minimal)',
            basic: 'Basic (Black & White)',
            geek: 'The Geek Shall Inherit The Earth',
            gnome: 'GNOME 3 (Adwaita)',
        };

        const themeEl = document.getElementById('userTheme');
        if (themeEl) {
            themeEl.textContent = themeNameMap[colorTheme] || colorTheme;
        }

        app.openModal(app.userMenuModal);
    } else {
        app.openModal(app.loginModal);
    }
}

export async function handleLogin(app) {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        app.showToast('Please enter valid credentials');
        return;
    }

    try {
        await app.ensureInteractiveAuth();
        await app.auth.signInWithEmailAndPassword(email, password);
        app.showToast('Signed in successfully!');
        app.closeModal(app.loginModal);
        app.maybeShowTranslationSyncModal();
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found') {
            if (confirm('No account found with this email. Sign up instead?')) {
                app.closeModal(app.loginModal);
                app.openModal(app.signupModal);
                document.getElementById('signupEmail').value = email;
            }
        } else if (error.code === 'auth/wrong-password') {
            app.showToast('Incorrect password');
        } else {
            app.showToast(`Login failed: ${error.message}`);
        }
    }
}

export async function handleSignup(app) {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    if (!email || !password) {
        app.showToast('Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        app.showToast('Password must be at least 6 characters');
        return;
    }

    try {
        await app.ensureInteractiveAuth();
        const userCredential = await app.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await app.ensureInteractiveDatabase();
        await app.database.ref(`users/${user.uid}/settings`).set({
            fontSize: app.state.fontSize,
            showVerseNumbers: app.state.showVerseNumbers,
            showHeadings: app.state.showHeadings,
            showFootnotes: app.state.showFootnotes,
            showCrossReferences: app.state.showCrossReferences,
            verseByVerse: app.state.verseByVerse,
            showChapterArrows: app.state.showChapterArrows,
            hideInterfaceOnScroll: app.state.hideInterfaceOnScroll,
            hapticsEnabled: app.state.hapticsEnabled,
            colorTheme: app.state.colorTheme,
            lightMode: app.state.lightMode ?? 'system',
            translation: app.preferredTranslation || app.state.translation || 'KJV',
            readingFont: app.state.readingFont,
            verseSelectionGesture: app.state.verseSelectionGesture,
        });

        app.showToast('Account created successfully!');
        app.closeModal(app.signupModal);
    } catch (error) {
        console.error('Signup error:', error);
        if (error.code === 'auth/email-already-in-use') {
            app.showToast('An account with this email already exists');
        } else {
            app.showToast(`Signup failed: ${error.message}`);
        }
    }
}

export async function handleLogout(app) {
    try {
        await app.auth.signOut();
        app.showToast('Signed out successfully');
        app.closeModal(app.userMenuModal);
    } catch (error) {
        console.error('Logout error:', error);
        app.showToast('Failed to sign out');
    }
}

export async function loadUserData(app, normalizeTranslation) {
    if (!app.currentUser || !app.database) return;

    let data;
    try {
        const snapshot = await app.database
            .ref(`users/${app.currentUser.uid}`)
            .once('value');
        data = snapshot?.val();
    } catch (error) {
        console.error('loadUserData error:', error);
        return;
    }

    const s = data?.settings;
    if (!s) return;

    const applySetting = (key, value) => {
        if (value == null) return;
        app.state[key] = value;
        lsSet(key, value);
    };

    applySetting('fontSize', s.fontSize);
    applySetting('showVerseNumbers', s.showVerseNumbers);
    applySetting('coloredVerseNumbers', s.coloredVerseNumbers);
    applySetting('showHeadings', s.showHeadings);
    applySetting('showFootnotes', s.showFootnotes);
    applySetting('showCrossReferences', s.showCrossReferences);
    applySetting('verseByVerse', s.verseByVerse);
    applySetting('showChapterArrows', s.showChapterArrows);
    applySetting('hideInterfaceOnScroll', s.hideInterfaceOnScroll);
    applySetting('hapticsEnabled', s.hapticsEnabled);
    applySetting('colorTheme', s.colorTheme);
    applySetting('readingFont', s.readingFont);
    applySetting('verseSelectionGesture', s.verseSelectionGesture);

    if (s.lightMode != null) {
        app.state.lightMode =
            s.lightMode === 'light' ||
                s.lightMode === 'dark' ||
                s.lightMode === 'system'
                ? s.lightMode
                : s.lightMode === true
                    ? 'light'
                    : s.lightMode === false
                        ? 'dark'
                        : 'system';
        lsSet('lightMode', app.state.lightMode);
    }

    if (s.translation != null) {
        app.preferredTranslation = normalizeTranslation(
            s.translation || app.preferredTranslation || 'KJV'
        );
        lsSet('preferredTranslation', app.preferredTranslation);
    }
}

export async function handleChangeEmail(app) {
    const currentPassword = document.getElementById('changeEmailCurrent').value;
    const newEmail = document.getElementById('changeEmailNew').value;

    if (!currentPassword || !newEmail) {
        app.showToast('Please fill in all fields');
        return;
    }

    try {
        const credential = app.auth.createCredential(app.currentUser.email, currentPassword);
        await app.auth.reauthenticateWithCredential(app.currentUser, credential);
        await app.auth.verifyBeforeUpdateEmail(app.currentUser, newEmail);
        app.showToast('Verification sent — check your inbox to confirm the new email');
        // modal teardown and field clearing handled by credential-modals.js
        document.getElementById('userEmail').textContent = newEmail;
    } catch (err) {
        if (err.code === 'auth/wrong-password') {
            app.showToast('Current password is incorrect');
        } else if (err.code === 'auth/email-already-in-use') {
            app.showToast('That email is already in use');
        } else if (err.code === 'auth/invalid-email') {
            app.showToast('Invalid email address');
        } else {
            app.showToast(`Failed: ${err.message}`);
        }
    }
}

export async function handleChangePassword(app) {
    const currentPassword = document.getElementById('changePasswordCurrent').value;
    const newPassword = document.getElementById('changePasswordNew').value;

    if (!currentPassword || !newPassword) {
        app.showToast('Please fill in all fields');
        return;
    }

    if (newPassword.length < 6) {
        app.showToast('New password must be at least 6 characters');
        return;
    }

    try {
        const credential = app.auth.createCredential(app.currentUser.email, currentPassword);
        await app.auth.reauthenticateWithCredential(app.currentUser, credential);
        await app.auth.updatePassword(app.currentUser, newPassword);
        app.showToast('Password updated successfully');
        // modal teardown and field clearing handled by credential-modals.js
    } catch (err) {
        if (err.code === 'auth/wrong-password') {
            app.showToast('Current password is incorrect');
        } else {
            app.showToast(`Failed: ${err.message}`);
        }
    }
}

export async function handleForgotPassword(app) {
    const email = document.getElementById('forgotPasswordEmail').value.trim();

    if (!email) {
        app.showToast('Please enter your email address');
        return;
    }

    try {
        await app.ensureInteractiveAuth();
        await app.auth.sendPasswordResetEmail(email);
        app.showToast('Reset link sent — check your inbox');
        app.closeModal(document.getElementById('forgotPasswordModal'));
        document.getElementById('forgotPasswordEmail').value = '';
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            app.showToast('No account found with that email');
        } else if (err.code === 'auth/invalid-email') {
            app.showToast('Invalid email address');
        } else {
            app.showToast(`Failed: ${err.message}`);
        }
    }
}
