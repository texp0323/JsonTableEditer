// treeView.js
import { applyValueStyleToNode } from './treeViewStyleUtils.js'; // 스타일링 함수 분리 가정


let selectedNodeElement = null;

/** 지정된 노드를 선택 상태로 만들고 이전 선택은 해제합니다. */
export function selectNode(nodeElementDiv) {
    if (selectedNodeElement) selectedNodeElement.classList.remove('selected-node');
    selectedNodeElement = nodeElementDiv;
    if (selectedNodeElement) selectedNodeElement.classList.add('selected-node');
}

/** 트리 노드의 DOM 요소를 생성합니다. */
function createNodeElement(key, value, nodePath, config) {
    const nodeElementDiv = document.createElement('div');
    nodeElementDiv.classList.add('tree-node');
    nodeElementDiv.dataset.path = nodePath;
    const toggleIconSpan = document.createElement('span');
    toggleIconSpan.classList.add('toggle-icon');
    nodeElementDiv.appendChild(toggleIconSpan);
    const nodeTextWrapperSpan = document.createElement('span');
    nodeTextWrapperSpan.classList.add('node-text-wrapper');
    nodeElementDiv.appendChild(nodeTextWrapperSpan);
    const keySpan = document.createElement('span');
    keySpan.classList.add('tree-node-key');
    keySpan.textContent = `${key}: `;
    nodeTextWrapperSpan.appendChild(keySpan);

    if (typeof value === 'object' && value !== null) {
        const typeSpan = document.createElement('span');
        typeSpan.classList.add('tree-node-type');
        typeSpan.textContent = Array.isArray(value) ? `[Array (${value.length})]` : '{Object}';
        nodeTextWrapperSpan.appendChild(typeSpan);
        const hasChildren = Object.keys(value).length > 0;
        toggleIconSpan.textContent = hasChildren ? '▶' : ' ';

        nodeTextWrapperSpan.onclick = (event) => { // 객체/배열 노드 클릭 시 테이블 업데이트
            event.stopPropagation();
            selectNode(nodeElementDiv);
            config.displayTableCallback(value, key, config.rootJsonData, nodePath);
        };

    } else {
        toggleIconSpan.innerHTML = '&nbsp;';
        const valueSpan = document.createElement('span');
        valueSpan.classList.add('tree-node-value');
        applyValueStyleToNode(valueSpan, value); // 스타일 적용 함수 호출
        nodeTextWrapperSpan.appendChild(valueSpan);

        nodeTextWrapperSpan.onclick = (event) => { // 기본형 값 노드 클릭 시 부모 객체/배열을 테이블에 표시
            event.stopPropagation();
            selectNode(nodeElementDiv);
            const lastDotIndex = nodePath.lastIndexOf('.');
            const parentPath = lastDotIndex === -1 ? '' : nodePath.substring(0, lastDotIndex);
            const parentKey = parentPath.split('.').pop() || (Object.keys(config.rootJsonData)[0] === key && config.depth === 0 ? 'root' : '');
            const parentObject = config.getObjectByPathCallback(config.rootJsonData, parentPath);

            if (parentObject && typeof parentObject === 'object') {
                config.displayTableCallback(parentObject, parentKey, config.rootJsonData, parentPath);
            } else { // 최상위 기본형 값 등 특별한 경우
                const singleValueDisplayData = { [key]: value };
                config.displayTableCallback(singleValueDisplayData, 'root', config.rootJsonData, nodePath); // 또는 key
            }
        };
    }
    return nodeElementDiv;
}

/** 자식 노드들을 담을 컨테이너를 생성하고 토글 기능을 설정합니다. */
function createChildrenContainer(nodeElementDiv, value, nodePath, config) {
    const hasChildren = Object.keys(value).length > 0;
    if (!hasChildren) return null;
    const childrenContainerDiv = document.createElement('div');
    childrenContainerDiv.classList.add('tree-node-children');
    childrenContainerDiv.style.display = 'none';
    const toggleIcon = nodeElementDiv.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.onclick = (event) => {
            event.stopPropagation();
            const isHidden = childrenContainerDiv.style.display === 'none';
            childrenContainerDiv.style.display = isHidden ? 'block' : 'none';
            toggleIcon.textContent = isHidden ? '▼' : '▶';
        };
    }
    // buildTree 호출 시 config 객체 전달
    buildTree(value, childrenContainerDiv, nodePath, config.rootJsonData, config.depth + 1, config);
    return childrenContainerDiv;
}

/** JSON 데이터를 기반으로 트리 뷰를 재귀적으로 생성합니다. */
export function buildTree(data, parentDomElement, currentPathString, rootJsonData, depth, config) {
    Object.keys(data).forEach(key => {
        const value = data[key];
        const nodePath = currentPathString ? `${currentPathString}.${key}` : key;
        const nodeContainerDiv = document.createElement('div');
        // createNodeElement에 config 전달
        const nodeElementDiv = createNodeElement(key, value, nodePath, { ...config, rootJsonData, depth });
        nodeContainerDiv.appendChild(nodeElementDiv);

        if (typeof value === 'object' && value !== null) {
            // createChildrenContainer에 config 전달
            const childrenContainerDiv = createChildrenContainer(nodeElementDiv, value, nodePath, { ...config, rootJsonData, depth });
            if (childrenContainerDiv) {
                nodeContainerDiv.appendChild(childrenContainerDiv);
            }
            // 객체/배열 노드의 클릭 이벤트는 createNodeElement 내부에서 이미 처리됨
        }
        // 기본형 값 노드의 클릭 이벤트도 createNodeElement 내부에서 이미 처리됨
        parentDomElement.appendChild(nodeContainerDiv);
    });
}

/** 현재 선택된 노드의 경로를 반환합니다. */
export function getSelectedNodePath() {
    return selectedNodeElement ? selectedNodeElement.dataset.path : null;
}

/** 현재 트리 뷰에서 펼쳐져 있는 노드들의 경로를 Set으로 반환합니다. */
export function getExpandedNodePaths(treeViewContainer) {
    const expandedPaths = new Set();
    const expandedToggleIcons = treeViewContainer.querySelectorAll('.tree-node .toggle-icon');
    expandedToggleIcons.forEach(icon => {
        if (icon.textContent === '▼') {
            const nodeElement = icon.closest('.tree-node');
            if (nodeElement && nodeElement.dataset.path) {
                expandedPaths.add(nodeElement.dataset.path);
            }
        }
    });
    return expandedPaths;
}

/** 주어진 경로 목록에 해당하는 노드들을 트리 뷰에서 펼칩니다. */
export function expandNodesByPath(treeViewContainer, pathsToExpand) {
    if (!pathsToExpand || pathsToExpand.size === 0) return;
    pathsToExpand.forEach(path => {
        const nodeElement = treeViewContainer.querySelector(`.tree-node[data-path="${path}"]`);
        if (nodeElement) {
            const toggleIcon = nodeElement.querySelector('.toggle-icon');
            const childrenContainer = nodeElement.nextElementSibling;
            if (toggleIcon && childrenContainer && childrenContainer.classList.contains('tree-node-children')) {
                if (childrenContainer.style.display === 'none') {
                    childrenContainer.style.display = 'block';
                    toggleIcon.textContent = '▼';
                }
            }
        }
    });
}