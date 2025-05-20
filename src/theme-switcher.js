const THEME_STORAGE_KEY = 'selected_theme_json_editor';

const themes = [
    {
        buttonId: 'theme-btn-1',
        themeClass: 'theme-soft-dark',
        name: 'Soft Dark',
    },
    {
        buttonId: 'theme-btn-2',
        themeClass: 'theme-classic-purple',
        name: 'Classic Purple Light',
    },
    {
        buttonId: 'theme-btn-3',
        themeClass: 'theme-soft-mint',
        name: 'Soft Mint',
    }
];

const DEFAULT_THEME_CLASS = 'theme-classic-purple';

let themeSwitcherElement = null;
let themeButtonElements = null;
let bodyElement = null;

function applyTheme(themeClassToApply) {
    if (!bodyElement) {
        bodyElement = document.body;
    }

    themes.forEach(theme => {
        if (bodyElement.classList.contains(theme.themeClass)) {
            bodyElement.classList.remove(theme.themeClass);
        }
    });

    let effectiveThemeClass = DEFAULT_THEME_CLASS;
    if (themeClassToApply && themes.some(t => t.themeClass === themeClassToApply)) {
        effectiveThemeClass = themeClassToApply;
    }

    bodyElement.classList.add(effectiveThemeClass);
    localStorage.setItem(THEME_STORAGE_KEY, effectiveThemeClass);
    updateActiveButton(effectiveThemeClass);
}

function updateActiveButton(activeThemeClass) {
    if (!themeButtonElements) return;

    themeButtonElements.forEach(button => {
        const buttonTheme = themes.find(t => t.buttonId === button.id);
        if (buttonTheme && buttonTheme.themeClass === activeThemeClass) {
            button.classList.add('active-theme');
        } else {
            button.classList.remove('active-theme');
        }
    });
}

function setupEventListeners() {
    if (!themeButtonElements) return;

    themeButtonElements.forEach(button => {
        button.addEventListener('click', () => {
            const selectedTheme = themes.find(theme => theme.buttonId === button.id);
            if (selectedTheme) {
                applyTheme(selectedTheme.themeClass);
            }
        });
    });
}

export function initializeThemeSwitcher() {
    bodyElement = document.body;
    themeSwitcherElement = document.querySelector('.theme-switcher');

    if (!themeSwitcherElement) {
        console.warn('Theme switcher element not found by theme-switcher.js during initialization.');
        return;
    }
    themeButtonElements = themeSwitcherElement.querySelectorAll('.theme-button');

    if (!themeButtonElements || themeButtonElements.length === 0) {
        console.warn('Theme buttons not found by theme-switcher.js during initialization.');
        return;
    }

    setupEventListeners();

    const savedThemeClass = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedThemeClass !== null) {
        applyTheme(savedThemeClass);
    } else {
        applyTheme(DEFAULT_THEME_CLASS);
    }
    console.log('Theme switcher initialized.');
}