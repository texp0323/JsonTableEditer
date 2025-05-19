// templateManager.js

const TEMPLATES_STORAGE_KEY = 'userJsonEditorTemplates_v1'; // Key for localStorage
let currentTemplates = []; // In-memory cache of templates

// Default templates that are always available
const DEFAULT_TEMPLATES = [
    { name: "빈 객체 (Empty Object)", type: "object", value: {}, isDefault: true },
    { name: "빈 배열 (Empty Array)", type: "array", value: [], isDefault: true }
];

/**
 * Loads templates from localStorage or initializes with defaults.
 */
export function loadTemplates() {
    try {
        const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (storedTemplates) {
            const parsedTemplates = JSON.parse(storedTemplates);
            if (Array.isArray(parsedTemplates)) {
                // Ensure defaults are always present if user somehow removed them or if storage is from an older version without them.
                // A more robust way would be to merge, ensuring default names don't get overwritten by user if they happen to be the same.
                // For simplicity now, we'll just ensure the default ones are there.
                const defaultNames = DEFAULT_TEMPLATES.map(dt => dt.name);
                const userTemplates = parsedTemplates.filter(pt => !defaultNames.includes(pt.name) || !pt.isDefault);
                currentTemplates = [...DEFAULT_TEMPLATES, ...userTemplates];

            } else { // Stored data is not an array
                console.warn("Stored templates are not in array format, resetting to defaults.");
                currentTemplates = [...DEFAULT_TEMPLATES];
            }
        } else { // No templates stored yet
            currentTemplates = [...DEFAULT_TEMPLATES];
        }
    } catch (error) {
        console.error("Error loading templates from localStorage, resetting to defaults:", error);
        currentTemplates = [...DEFAULT_TEMPLATES];
    }
    // Save back to ensure format is correct and defaults are stored if it was the first load.
    saveTemplatesInternal();
    return currentTemplates;
}

/**
 * Returns the current list of all templates.
 */
export function getTemplates() {
    // Ensure templates are loaded if this is called before explicit load (e.g. direct import)
    if (currentTemplates.length === 0 && localStorage.getItem(TEMPLATES_STORAGE_KEY) === null) {
        loadTemplates();
    } else if (currentTemplates.length === 0 && localStorage.getItem(TEMPLATES_STORAGE_KEY) !== null) {
        // Edge case: local storage exists but currentTemplates is empty (e.g. after a clear all then refresh)
        loadTemplates();
    }
    return currentTemplates;
}

/**
 * Adds a new user-defined template.
 * @param {string} name - The name of the template.
 * @param {"object"|"array"} type - The type of the template.
 * @param {object|array} value - The actual template value.
 * @returns {boolean|string} True on success, 'duplicate_name' if name exists, false on other errors.
 */
export function addTemplate(name, type, value) {
    if (!name || !type || value === undefined) {
        console.error("Template name, type, and value are required.");
        return false;
    }
    const trimmedName = name.trim();
    if (currentTemplates.some(t => t.name === trimmedName)) {
        console.warn(`Template with name "${trimmedName}" already exists.`);
        return 'duplicate_name'; // Indicate duplicate name
    }

    const newTemplate = {
        name: trimmedName,
        type,
        value: JSON.parse(JSON.stringify(value)), // Deep copy the value
        isDefault: false // User-added templates are not defaults
    };
    currentTemplates.push(newTemplate);
    saveTemplatesInternal();
    return true;
}

/**
 * Internal function to save the currentTemplates array to localStorage.
 */
function saveTemplatesInternal() {
    try {
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(currentTemplates));
    } catch (error) {
        console.error("Error saving templates to localStorage:", error);
    }
}

// Initialize templates when the module is loaded.
loadTemplates();