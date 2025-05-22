const TEMPLATES_STORAGE_KEY = 'userJsonEditorTemplates_v1';
let currentTemplates = [];

const DEFAULT_TEMPLATES = [
    { name: "Null 값 (Null Value)", type: "null", value: null, isDefault: true },
    { name: "빈 객체 (Empty Object)", type: "object", value: {}, isDefault: true },
    { name: "빈 배열 (Empty Array)", type: "array", value: [], isDefault: true }
];

export function loadTemplates() {
    try {
        const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (storedTemplates) {
            const parsedTemplates = JSON.parse(storedTemplates);
            if (Array.isArray(parsedTemplates)) {
                const userStoredTemplates = parsedTemplates.filter(pt => !pt.isDefault);
                const defaultNames = new Set(DEFAULT_TEMPLATES.map(dt => dt.name));
                const uniqueUserTemplates = [];
                const seenNames = new Set();

                userStoredTemplates.forEach(ut => {
                    if (!defaultNames.has(ut.name) && !seenNames.has(ut.name)) {
                        uniqueUserTemplates.push({...ut, isDefault: false });
                        seenNames.add(ut.name);
                    }
                });
                currentTemplates = [...DEFAULT_TEMPLATES, ...uniqueUserTemplates];
            } else {
                currentTemplates = [...DEFAULT_TEMPLATES];
            }
        } else {
            currentTemplates = [...DEFAULT_TEMPLATES];
        }
    } catch (error) {
        console.error("Error loading templates from localStorage:", error);
        currentTemplates = [...DEFAULT_TEMPLATES];
    }
    saveTemplatesInternal();
    return currentTemplates;
}

export function getTemplates() {
    if (currentTemplates.length === 0) {
        loadTemplates();
    }
    return [...currentTemplates];
}

export function addTemplate(name, type, value) {
    if (!name || !type || value === undefined) return false;
    const trimmedName = name.trim();
    if (currentTemplates.some(t => t.name === trimmedName)) return 'duplicate_name';
    if (DEFAULT_TEMPLATES.some(dt => dt.name === trimmedName)) return 'default_conflict';

    const newTemplate = { name: trimmedName, type, value: JSON.parse(JSON.stringify(value)), isDefault: false };
    currentTemplates.push(newTemplate);
    saveTemplatesInternal();
    return true;
}

function saveTemplatesInternal() {
    try {
        const templatesToSave = currentTemplates.map(t => ({
            ...t,
            isDefault: DEFAULT_TEMPLATES.some(dt => dt.name === t.name && dt.isDefault)
        }));
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templatesToSave));
    } catch (error) { console.error("Error saving templates to localStorage:", error); }
}

export function loadSelectedUserTemplates(selectedTemplatesFromFile) {
    if (!Array.isArray(selectedTemplatesFromFile)) return 0;

    const validatedIncomingTemplates = selectedTemplatesFromFile
        .map(t => {
            const type = t.type === "object" || t.type === "array" ? t.type : "object";
            return { name: String(t.name || `템플릿_${Date.now()}`).trim(), type, value: JSON.parse(JSON.stringify(t.value || (type === "array" ? [] : {}))), isDefault: false };
        })
        .filter(t => t.name);

    const nonConflictingWithDefaults = validatedIncomingTemplates.filter(it => !DEFAULT_TEMPLATES.some(dt => dt.name === it.name));
    const existingUserTemplates = currentTemplates.filter(t => !t.isDefault);
    const userTemplatesMap = new Map();
    existingUserTemplates.forEach(et => userTemplatesMap.set(et.name, et));
    nonConflictingWithDefaults.forEach(it => userTemplatesMap.set(it.name, { ...it, isDefault: false }));

    const finalUserTemplates = Array.from(userTemplatesMap.values());
    currentTemplates = [...DEFAULT_TEMPLATES, ...finalUserTemplates];
    saveTemplatesInternal();
    return nonConflictingWithDefaults.length;
}

export function setAndSaveUserTemplates(userTemplatesArray) {
    return loadSelectedUserTemplates(userTemplatesArray);
}

export function getUserTemplates() {
    if (currentTemplates.length === 0) loadTemplates();
    return currentTemplates.filter(t => !t.isDefault);
}

export function renameUserTemplate(oldName, newName) {
    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) return 'empty_name';

    const templateIndex = currentTemplates.findIndex(t => t.name === trimmedOldName && !t.isDefault);
    if (templateIndex === -1) return 'not_found';

    if (currentTemplates.some((t, idx) => t.name === trimmedNewName && idx !== templateIndex)) {
        return 'duplicate_name';
    }
    if (DEFAULT_TEMPLATES.some(dt => dt.name === trimmedNewName)) {
        return 'default_conflict';
    }

    currentTemplates[templateIndex].name = trimmedNewName;
    saveTemplatesInternal();
    return true;
}

export function deleteUserTemplate(name) {
    const trimmedName = name.trim();
    const initialUserTemplatesCount = currentTemplates.filter(t => !t.isDefault).length;

    currentTemplates = currentTemplates.filter(t => {
        if (!t.isDefault && t.name === trimmedName) {
            return false;
        }
        return true;
    });

    const finalUserTemplatesCount = currentTemplates.filter(t => !t.isDefault).length;

    if (finalUserTemplatesCount < initialUserTemplatesCount) {
        saveTemplatesInternal();
        return true;
    }
    return false;
}

loadTemplates();