document.addEventListener('DOMContentLoaded', () => {
    const themeSwitcher = document.querySelector('.theme-switcher');
    if (!themeSwitcher) {
        return;
    }

    const themeButtons = themeSwitcher.querySelectorAll('.theme-button');
    const body = document.body;
    const THEME_STORAGE_KEY = 'selected_theme_json_editor';

    const themes = [
        {
            buttonId: 'theme-btn-1',
            themeClass: 'theme-high-contrast-dark',
            name: 'High Contrast Dark',
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

    function applyTheme(themeClassToApply) {
        themes.forEach(theme => {
            if (body.classList.contains(theme.themeClass)) {
                body.classList.remove(theme.themeClass);
            }
        });

        let effectiveThemeClass = DEFAULT_THEME_CLASS;
        if (themeClassToApply && themes.some(t => t.themeClass === themeClassToApply)) {
            effectiveThemeClass = themeClassToApply;
        }

        body.classList.add(effectiveThemeClass);
        localStorage.setItem(THEME_STORAGE_KEY, effectiveThemeClass);
        updateActiveButton(effectiveThemeClass);
    }

    function updateActiveButton(activeThemeClass) {
        themeButtons.forEach(button => {
            const buttonTheme = themes.find(t => t.buttonId === button.id);
            if (buttonTheme && buttonTheme.themeClass === activeThemeClass) {
                button.classList.add('active-theme');
            } else {
                button.classList.remove('active-theme');
            }
        });
    }

    themeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedTheme = themes.find(theme => theme.buttonId === button.id);
            if (selectedTheme) {
                applyTheme(selectedTheme.themeClass);
            }
        });
    });

    const savedThemeClass = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedThemeClass !== null) {
        applyTheme(savedThemeClass);
    } else {
        applyTheme(DEFAULT_THEME_CLASS);
    }
});