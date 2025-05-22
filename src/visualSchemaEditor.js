function deepClone(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.warn("JSON.stringify를 사용한 deepClone 실패, 수동 클론 시도:", e);
        if (Array.isArray(obj)) {
            return obj.map(item => deepClone(item));
        }
        const cloned = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
}

let currentSchema = {};
let onChangeCallback = null;
let editorContainer = null;

const availableTypes = ["string", "number", "integer", "object", "array", "boolean", "null"];

function createDomElement(tag, classNames = [], attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    if (Array.isArray(classNames)) {
        element.classList.add(...classNames.filter(cn => cn));
    } else if (classNames) {
        element.classList.add(classNames);
    }
    for (const attr in attributes) {
        element.setAttribute(attr, attributes[attr]);
    }
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
}

function renderRootEditor() {
    if (!editorContainer) return [];

    const type = currentSchema.type || 'object';
    const description = currentSchema.description || '';

    const typeSelect = createDomElement('select', ['p-2', 'border', 'rounded-md', 'shadow-sm', 'mr-2'], { id: 'visualRootSchemaType' });
    availableTypes.forEach(t => {
        const option = createDomElement('option', [], { value: t }, t.charAt(0).toUpperCase() + t.slice(1));
        if (t === type) option.selected = true;
        typeSelect.appendChild(option);
    });
    typeSelect.addEventListener('change', (e) => {
        currentSchema.type = e.target.value;
        if (currentSchema.type === 'object') {
            if (!currentSchema.properties) currentSchema.properties = {};
            delete currentSchema.items;
            delete currentSchema.minItems;
            delete currentSchema.maxItems;
        } else if (currentSchema.type === 'array') {
            if (!currentSchema.items) currentSchema.items = { type: 'string' };
            delete currentSchema.properties;
            delete currentSchema.additionalProperties;
        } else {
            delete currentSchema.properties;
            delete currentSchema.items;
            delete currentSchema.minItems;
            delete currentSchema.maxItems;
            delete currentSchema.additionalProperties;
        }
        renderFullVisualEditor();
        if (onChangeCallback) onChangeCallback(currentSchema);
    });

    const descriptionInput = createDomElement('input', ['w-full', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'text-sm'], { type: 'text', id: 'visualRootSchemaDescription', placeholder: '스키마 전체에 대한 설명을 입력하세요...' });
    descriptionInput.value = description;
    descriptionInput.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
            currentSchema.description = e.target.value.trim();
        } else {
            delete currentSchema.description;
        }
        if (onChangeCallback) onChangeCallback(currentSchema);
    });

    const rootFlexContainer = createDomElement('div', ['flex', 'items-center', 'space-x-2', 'mb-3']);
    rootFlexContainer.appendChild(createDomElement('label', ['font-semibold', 'text-gray-700'], { for: 'visualRootSchemaType' }, '루트 타입:'));
    rootFlexContainer.appendChild(typeSelect);

    const rootDescContainer = createDomElement('div', ['mb-4']);
    rootDescContainer.appendChild(createDomElement('label', ['block', 'font-semibold', 'text-gray-700', 'mb-1'], { for: 'visualRootSchemaDescription' }, '스키마 설명:'));
    rootDescContainer.appendChild(descriptionInput);

    return [rootFlexContainer, rootDescContainer];
}

function renderObjectPropertiesEditor() {
    if (!editorContainer || currentSchema.type !== 'object') return null;

    const sectionDiv = createDomElement('div', ['mt-4', 'p-4', 'border', 'rounded', 'bg-gray-50'], { id: 'visualObjectEditorControls' });
    sectionDiv.appendChild(createDomElement('h3', ['text-lg', 'font-semibold', 'text-gray-700', 'mb-2'], {}, '객체 속성 편집:'));

    const listDiv = createDomElement('div', ['space-y-3', 'bg-white', 'p-3', 'rounded-md', 'border', 'border-gray-200'], { id: 'visualPropertiesList' });
    if (currentSchema.properties) {
        for (const key in currentSchema.properties) {
            if (Object.prototype.hasOwnProperty.call(currentSchema.properties, key)) {
                listDiv.appendChild(createPropertyElement(key, currentSchema.properties[key]));
            }
        }
    }
    sectionDiv.appendChild(listDiv);

    const addBtn = createDomElement('button', ['mt-3', 'px-4', 'py-2', 'bg-blue-500', 'text-white', 'rounded', 'hover:bg-blue-600', 'text-sm', 'font-medium', 'add-property-btn'], {}, '+ 새 속성 추가');
    addBtn.addEventListener('click', () => {
        const newPropName = `newProperty${Object.keys(currentSchema.properties || {}).length + 1}`;
        if (!currentSchema.properties) currentSchema.properties = {};
        currentSchema.properties[newPropName] = { type: 'string', description: '' };
        renderFullVisualEditor();
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    sectionDiv.appendChild(addBtn);
    return sectionDiv;
}

function createPropertyElement(key, propSchema) {
    const itemDiv = createDomElement('div', ['property-editor-item', 'flex', 'items-center', 'space-x-2', 'p-2', 'border-b', 'border-gray-200']);
    itemDiv.dataset.key = key;

    const nameInput = createDomElement('input', ['p-1', 'border', 'rounded-md', 'w-2/6', 'text-sm', 'prop-name'], { type: 'text', value: key, placeholder: '속성 이름' });
    nameInput.addEventListener('input', (e) => {
        const oldKey = itemDiv.dataset.key;
        const newKey = e.target.value.trim();
        if (newKey && newKey !== oldKey) {
            if (currentSchema.properties && currentSchema.properties[oldKey]) {
                const schemaBackup = currentSchema.properties[oldKey];
                delete currentSchema.properties[oldKey];
                currentSchema.properties[newKey] = schemaBackup;
                itemDiv.dataset.key = newKey;
            }
        } else if (!newKey && oldKey) {
            e.target.value = oldKey;
            return;
        }
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    nameInput.addEventListener('blur', (e) => {
        const oldKey = itemDiv.dataset.key;
        const newKey = e.target.value.trim();
        if (newKey && newKey !== oldKey) {
            renderFullVisualEditor();
        } else if (!newKey && oldKey) {
            e.target.value = oldKey;
        }
    });

    const typeSelect = createDomElement('select', ['p-1', 'border', 'rounded-md', 'w-1/4', 'text-sm', 'prop-type']);
    availableTypes.forEach(t => {
        const option = createDomElement('option', [], { value: t }, t.charAt(0).toUpperCase() + t.slice(1));
        if (t === (propSchema.type || 'string')) option.selected = true;
        typeSelect.appendChild(option);
    });
    typeSelect.addEventListener('change', (e) => {
        const currentKey = itemDiv.dataset.key;
        if (currentSchema.properties && currentSchema.properties[currentKey]) {
            currentSchema.properties[currentKey].type = e.target.value;
            if (e.target.value === 'object') {
                currentSchema.properties[currentKey].properties = {};
            } else if (e.target.value === 'array') {
                currentSchema.properties[currentKey].items = { type: 'string' };
            } else {
                delete currentSchema.properties[currentKey].properties;
                delete currentSchema.properties[currentKey].items;
            }
            if (onChangeCallback) onChangeCallback(currentSchema);
            renderFullVisualEditor();
        }
    });

    const descriptionInput = createDomElement('input', ['p-1', 'border', 'rounded-md', 'w-2/6', 'text-sm', 'prop-description'], { type: 'text', value: propSchema.description || '', placeholder: '설명' });
    descriptionInput.addEventListener('input', (e) => {
        const currentKey = itemDiv.dataset.key;
        if (currentSchema.properties && currentSchema.properties[currentKey]) {
            if (e.target.value.trim()) {
                currentSchema.properties[currentKey].description = e.target.value.trim();
            } else {
                delete currentSchema.properties[currentKey].description;
            }
            if (onChangeCallback) onChangeCallback(currentSchema);
        }
    });

    const removeBtn = createDomElement('button', ['px-2', 'py-1', 'bg-red-500', 'text-white', 'rounded', 'hover:bg-red-600', 'text-xs', 'ml-auto'], {}, 'X');
    removeBtn.addEventListener('click', () => {
        const currentKey = itemDiv.dataset.key;
        if (currentSchema.properties && currentSchema.properties[currentKey]) {
            delete currentSchema.properties[currentKey];
            renderFullVisualEditor();
            if (onChangeCallback) onChangeCallback(currentSchema);
        }
    });

    itemDiv.appendChild(nameInput);
    itemDiv.appendChild(typeSelect);
    itemDiv.appendChild(descriptionInput);
    itemDiv.appendChild(removeBtn);
    return itemDiv;
}

function renderArrayItemsEditor() {
    if (!editorContainer || currentSchema.type !== 'array') return null;

    const sectionDiv = createDomElement('div', ['mt-4', 'p-4', 'border', 'rounded', 'bg-gray-50'], { id: 'visualArrayEditorControls' });
    sectionDiv.appendChild(createDomElement('h3', ['text-lg', 'font-semibold', 'text-gray-700', 'mb-2'], {}, '배열 항목 편집:'));

    const itemsSchema = currentSchema.items || { type: 'string', description: '' };
    const minItems = currentSchema.minItems !== undefined ? currentSchema.minItems : '';
    const maxItems = currentSchema.maxItems !== undefined ? currentSchema.maxItems : '';

    const itemTypeGroup = createDomElement('div', ['flex', 'items-center', 'space-x-2', 'mb-2']);
    itemTypeGroup.appendChild(createDomElement('label', ['font-semibold', 'text-gray-700'], {for: 'visualArrayItemType'}, '항목 타입:'));
    const itemTypeSelect = createDomElement('select', ['p-1', 'border', 'rounded-md', 'text-sm'], {id: 'visualArrayItemType'});
    availableTypes.forEach(t => {
        const option = createDomElement('option', [], {value: t}, t.charAt(0).toUpperCase() + t.slice(1));
        if (t === itemsSchema.type) option.selected = true;
        itemTypeSelect.appendChild(option);
    });
    itemTypeSelect.addEventListener('change', (e) => {
        if (!currentSchema.items) currentSchema.items = {};
        currentSchema.items.type = e.target.value;
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    itemTypeGroup.appendChild(itemTypeSelect);
    sectionDiv.appendChild(itemTypeGroup);

    const itemDescGroup = createDomElement('div', ['mb-2']);
    itemDescGroup.appendChild(createDomElement('label', ['block', 'font-semibold', 'text-gray-700', 'mb-1'], {for: 'visualArrayItemDesc'}, '항목 설명:'));
    const itemDescInput = createDomElement('input', ['w-full', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'text-sm'], {type: 'text', id: 'visualArrayItemDesc', placeholder: '배열 항목에 대한 설명'});
    itemDescInput.value = itemsSchema.description || '';
    itemDescInput.addEventListener('input', (e) => {
        if (!currentSchema.items) currentSchema.items = {};
        if (e.target.value.trim()) {
            currentSchema.items.description = e.target.value.trim();
        } else {
            delete currentSchema.items.description;
        }
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    itemDescGroup.appendChild(itemDescInput);
    sectionDiv.appendChild(itemDescGroup);

    const minItemsGroup = createDomElement('div', ['flex', 'items-center', 'space-x-2', 'mb-2']);
    minItemsGroup.appendChild(createDomElement('label', ['font-semibold', 'text-gray-700'], {for: 'visualArrayMinItems'}, '최소 항목 수:'));
    const minItemsInput = createDomElement('input', ['p-1', 'border', 'rounded-md', 'w-20', 'text-sm'], {type: 'number', id: 'visualArrayMinItems', placeholder: '예: 0'});
    minItemsInput.value = minItems;
    minItemsInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val === '' || isNaN(parseInt(val))) delete currentSchema.minItems;
        else currentSchema.minItems = parseInt(val);
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    minItemsGroup.appendChild(minItemsInput);
    sectionDiv.appendChild(minItemsGroup);

    const maxItemsGroup = createDomElement('div', ['flex', 'items-center', 'space-x-2', 'mb-2']);
    maxItemsGroup.appendChild(createDomElement('label', ['font-semibold', 'text-gray-700'], {for: 'visualArrayMaxItems'}, '최대 항목 수:'));
    const maxItemsInput = createDomElement('input', ['p-1', 'border', 'rounded-md', 'w-20', 'text-sm'], {type: 'number', id: 'visualArrayMaxItems', placeholder: '예: 10'});
    maxItemsInput.value = maxItems;
    maxItemsInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val === '' || isNaN(parseInt(val))) delete currentSchema.maxItems;
        else currentSchema.maxItems = parseInt(val);
        if (onChangeCallback) onChangeCallback(currentSchema);
    });
    maxItemsGroup.appendChild(maxItemsInput);
    sectionDiv.appendChild(maxItemsGroup);

    return sectionDiv;
}

function renderFullVisualEditor() {
    if (!editorContainer) return;
    editorContainer.innerHTML = '';

    const rootEditors = renderRootEditor();
    rootEditors.forEach(el => editorContainer.appendChild(el));

    if (currentSchema.type === 'object') {
        const objEditor = renderObjectPropertiesEditor();
        if (objEditor) editorContainer.appendChild(objEditor);
    } else if (currentSchema.type === 'array') {
        const arrEditor = renderArrayItemsEditor();
        if (arrEditor) editorContainer.appendChild(arrEditor);
    }
}

export function initVisualSchemaEditor(containerDomElement, initialSchema, callback) {
    if (!containerDomElement) {
        console.error("Visual schema editor container not provided!");
        return;
    }
    editorContainer = containerDomElement;
    onChangeCallback = callback;

    if (initialSchema && typeof initialSchema === 'object') {
        currentSchema = deepClone(initialSchema);
        if (!currentSchema.type) currentSchema.type = "object";
        if (currentSchema.type === "object" && !currentSchema.properties) {
            currentSchema.properties = {};
        }
        if (currentSchema.type === "array" && !currentSchema.items) {
            currentSchema.items = { type: "string" };
        }
        if (!currentSchema.$schema) {
            currentSchema.$schema = "http://json-schema.org/draft-07/schema#";
        }
    } else {
        currentSchema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            description: ""
        };
    }
    renderFullVisualEditor();
}