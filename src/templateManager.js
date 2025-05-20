const TEMPLATES_STORAGE_KEY = 'userJsonEditorTemplates_v1';
let currentTemplates = [];

const DEFAULT_TEMPLATES = [
    { name: "빈 객체 (Empty Object)", type: "object", value: {}, isDefault: true },
    { name: "빈 배열 (Empty Array)", type: "array", value: [], isDefault: true }
];

export function loadTemplates() {
    try {
        const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (storedTemplates) {
            const parsedTemplates = JSON.parse(storedTemplates);
            if (Array.isArray(parsedTemplates)) {
                const userStoredTemplates = parsedTemplates.filter(pt => !pt.isDefault && !DEFAULT_TEMPLATES.some(dt => dt.name === pt.name));
                currentTemplates = [...DEFAULT_TEMPLATES, ...userStoredTemplates];
            } else {
                currentTemplates = [...DEFAULT_TEMPLATES];
            }
        } else {
            currentTemplates = [...DEFAULT_TEMPLATES];
        }
    } catch (error) {
        currentTemplates = [...DEFAULT_TEMPLATES];
    }
    saveTemplatesInternal();
    return currentTemplates;
}

export function getTemplates() {
    if (currentTemplates.length === 0 && localStorage.getItem(TEMPLATES_STORAGE_KEY) === null) {
        loadTemplates();
    } else if (currentTemplates.length === 0 && localStorage.getItem(TEMPLATES_STORAGE_KEY) !== null) {
        loadTemplates();
    }
    return currentTemplates;
}

export function addTemplate(name, type, value) {
    if (!name || !type || value === undefined) {
        return false;
    }
    const trimmedName = name.trim();
    if (currentTemplates.some(t => t.name === trimmedName)) {
        return 'duplicate_name';
    }

    const newTemplate = {
        name: trimmedName,
        type,
        value: JSON.parse(JSON.stringify(value)),
        isDefault: false
    };
    currentTemplates.push(newTemplate);
    saveTemplatesInternal();
    return true;
}

function saveTemplatesInternal() {
    try {
        const templatesToSave = currentTemplates.map(t => {
            const isActualDefault = DEFAULT_TEMPLATES.find(dt => dt.name === t.name);
            return {
                ...t,
                isDefault: !!isActualDefault
            };
        });
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templatesToSave));
    } catch (error) {
        console.error("Error saving templates to localStorage:", error);
    }
}

export function setAndSaveUserTemplates(userTemplatesArray) {
    if (!Array.isArray(userTemplatesArray)) {
        return 0;
    }

    const validatedUserTemplates = userTemplatesArray.map(t => ({
        name: String(t.name || "Unnamed Template").trim(),
        type: t.type === "object" || t.type === "array" ? t.type : "object",
        value: JSON.parse(JSON.stringify(t.value || {})),
        isDefault: false
    }));

    const nonConflictingUserTemplates = validatedUserTemplates.filter(ut =>
        !DEFAULT_TEMPLATES.some(dt => dt.name === ut.name)
    );

    const uniqueUserTemplates = nonConflictingUserTemplates.filter((template, index, self) =>
        index === self.findIndex((t) => t.name === template.name)
    );

    currentTemplates = [...DEFAULT_TEMPLATES, ...uniqueUserTemplates];
    saveTemplatesInternal();
    return uniqueUserTemplates.length;
}

export function getUserTemplates() {
    if (currentTemplates.length === 0) {
        loadTemplates();
    }
    return currentTemplates.filter(t => !t.isDefault);
}

loadTemplates();