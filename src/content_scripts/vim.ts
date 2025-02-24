import { keywords, whitespace } from "../constants";

/**
 * More robust selector strategy to find Notion editable blocks
 * This tries multiple selectors to adapt to Notion's DOM changes
 */
const findNotionEditableBlocks = (): HTMLDivElement[] => {
    // Try progressively more generic selectors
    const selectors = [
        // Original selector - might still work
        ".notion-page-content [contenteditable=true]",
        // More generic selectors for newer Notion versions
        "[class*='notion'] [contenteditable=true]",
        // Most generic selector as fallback
        "[contenteditable=true]",
    ];

    for (const selector of selectors) {
        const elements = Array.from(
            document.querySelectorAll(selector)
        ) as HTMLDivElement[];
        // Only return if we found at least one element
        if (elements.length > 0) {
            console.log(
                `Vim-Notion: Found ${elements.length} editable elements with selector: ${selector}`
            );
            return elements;
        }
    }

    console.log("Vim-Notion: Couldn't find any editable elements");
    return [];
};

const createInfoContainer = () => {
    const { vim_info } = window;
    // Remove existing container if it exists
    const existingContainer = document.querySelector(".vim-info-container");
    if (existingContainer) {
        existingContainer.remove();
    }

    const infoContainer = document.createElement("div");
    infoContainer.classList.add("vim-info-container");
    const mode = document.createElement("div");
    mode.innerText = getModeText(vim_info.mode);
    mode.classList.add("vim-mode");
    infoContainer.appendChild(mode);
    document.body.appendChild(infoContainer);
};

// W
const jumpToNextWORD = (node?: HTMLElement, start_position?: number) => {
    const active_line = getActiveLine();
    const lines = getLines();
    const currentCursorPosition = start_position ?? getCursorIndex();
    const currentNode = node || (document.activeElement as HTMLElement);
    const currentLineTextContent = currentNode.innerText;

    const currentRemainingText = currentLineTextContent.slice(
        currentCursorPosition
    );

    const nextWhiteSpaceAfterCursor = currentRemainingText.search(whitespace);
    const nextWhiteSpaceIndex =
        nextWhiteSpaceAfterCursor >= 0
            ? currentCursorPosition + nextWhiteSpaceAfterCursor
            : currentLineTextContent.length;
    if (nextWhiteSpaceIndex < currentLineTextContent.length) {
        setCursorPosition(currentNode, nextWhiteSpaceIndex + 1);
        return;
    }
    // we are on the original line
    if (!node && lines[active_line + 1]?.element) {
        const new_elem = lines[active_line + 1].element;
        setActiveLine(active_line + 1);
        if (whitespace.test(new_elem.innerText[0])) {
            jumpToNextWORD(lines[active_line + 1].element, 0);
        } else {
            setCursorPosition(new_elem, 0);
        }
        return;
    }
    setCursorPosition(currentNode, nextWhiteSpaceIndex);
};

const getActiveLine = () => {
    return window.vim_info.active_line;
};

const getLines = () => {
    return window.vim_info.lines;
};

const getCursorIndex = () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    let i = 0;

    const checkElementNode = (element: Element) => {
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (checkElementNode(node as Element)) {
                    break;
                } else {
                    continue;
                }
            }
            if (node.isSameNode(range.startContainer)) {
                i += range.startOffset;
                return true;
            }
            i += node.textContent.length;
        }
        return false;
    };

    checkElementNode(document.activeElement);
    return i;
};

const getModeText = (mode: "insert" | "normal") => {
    return `-- ${mode.toUpperCase()} --`;
};

const setCursorPosition = (element: Element, index: number) => {
    let i = 0;
    const childNodes = Array.from(element.childNodes);

    for (const node of childNodes) {
        const isInRange = index >= i && index <= i + node.textContent.length;
        if (isInRange && node.nodeType === Node.ELEMENT_NODE) {
            setCursorPosition(node as Element, index - i);
            break;
        }
        if (isInRange) {
            const range = document.createRange();
            const selection = window.getSelection();

            range.setStart(node, index - i);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            break;
        }
        i += node.textContent.length;
    }
};

const handleKeydown = (e: KeyboardEvent) => {
    const { vim_info } = window;
    if (vim_info.mode === "normal") {
        normalReducer(e);
    } else {
        insertReducer(e);
    }
};

const initVimInfo = () => {
    const vim_info = {
        active_line: 0,
        cursor_position: 0,
        lines: [] as any,
        mode: "normal" as const,
    };
    window.vim_info = vim_info;
};

const insertReducer = (e: KeyboardEvent) => {
    switch (e.key) {
        case "Escape":
            e.preventDefault();
            e.stopPropagation();
            window.vim_info.mode = "normal";
            updateInfoContainer();
            break;
        default:
            break;
    }
    return;
};

const moveCursorBackwards = () => {
    const currentCursorPosition = getCursorIndex();
    if (currentCursorPosition === 0) return;
    setCursorPosition(document.activeElement, currentCursorPosition - 1);
};

const moveCursorForwards = () => {
    const currentCursorPosition = getCursorIndex();
    if (currentCursorPosition >= document.activeElement.textContent.length)
        return;
    setCursorPosition(document.activeElement, currentCursorPosition + 1);
};

const normalReducer = (e: KeyboardEvent) => {
    const {
        vim_info: { active_line },
    } = window;
    switch (e.key) {
        case "a":
        case "i":
            e.preventDefault();
            window.vim_info.mode = "insert";
            updateInfoContainer();
            break;
        case "h":
            e.preventDefault();
            moveCursorBackwards();
            break;
        case "j":
            e.preventDefault();
            setActiveLine(active_line + 1);
            break;
        case "k":
            e.preventDefault();
            setActiveLine(active_line - 1);
            break;
        case "l":
            e.preventDefault();
            moveCursorForwards();
            break;
        case "W":
            e.preventDefault();
            jumpToNextWORD();
            break;
        default:
            e.preventDefault();
            break;
    }
};

const setActiveLine = (idx: number) => {
    const {
        vim_info: { lines },
    } = window;
    const active_line = getActiveLine();
    let i = idx;

    if (idx >= lines.length) i = lines.length - 1;
    if (i < 0) i = 0;

    // Only try to remove listener if we have an active element
    if (lines[active_line] && lines[active_line].element) {
        lines[active_line].element.removeEventListener(
            "keydown",
            handleKeydown
        );
    }

    // Only try to add listener and click if we have a valid element
    if (lines[i] && lines[i].element) {
        lines[i].element.click();
        lines[i].element.addEventListener("keydown", handleKeydown);
        window.vim_info.active_line = i;
    }
};

const setLines = (f: HTMLDivElement[]) => {
    const { vim_info } = window;
    vim_info.lines = f.map((elem) => ({
        cursor_position: 0,
        element: elem as HTMLDivElement,
    }));
    setActiveLine(vim_info.active_line || 0);
};

const updateInfoContainer = () => {
    const mode = document.querySelector(".vim-mode") as HTMLDivElement;
    if (mode) {
        mode.innerText = getModeText(window.vim_info.mode);
    }
};

/**
 * Try to initialize the extension with retry logic
 */
const initializeWithRetry = () => {
    initVimInfo();
    createInfoContainer();

    let attempts = 0;
    const maxAttempts = 10;
    const interval = 500; // 500ms between attempts

    const attemptToFindElements = () => {
        attempts++;
        const editableElements = findNotionEditableBlocks();

        if (editableElements.length > 0) {
            console.log(
                `Vim-Notion: Successfully initialized after ${attempts} attempts`
            );
            setLines(editableElements);
            return true;
        }

        if (attempts >= maxAttempts) {
            console.log(
                "Vim-Notion: Failed to find editable elements after maximum attempts"
            );
            return false;
        }

        return false;
    };

    // Try immediately first
    if (attemptToFindElements()) return;

    // Set up polling interval
    const poll = setInterval(() => {
        if (attemptToFindElements() || attempts >= maxAttempts) {
            clearInterval(poll);
        }
    }, interval);

    // Also setup mutation observer to detect when Notion adds new blocks
    setupMutationObserver();
};

/**
 * Set up a mutation observer to refresh our element list when Notion adds new blocks
 */
const setupMutationObserver = () => {
    // Wait for the page to be a bit more loaded
    setTimeout(() => {
        const notionApp =
            document.querySelector("#notion-app") || document.body;

        const observer = new MutationObserver((mutations) => {
            let shouldRefresh = false;

            for (const mutation of mutations) {
                // If nodes were added or removed
                if (
                    mutation.addedNodes.length > 0 ||
                    mutation.removedNodes.length > 0
                ) {
                    shouldRefresh = true;
                    break;
                }
            }

            if (shouldRefresh) {
                const editableElements = findNotionEditableBlocks();
                if (editableElements.length > 0) {
                    console.log(
                        "Vim-Notion: Refreshing editable elements after DOM change"
                    );
                    setLines(editableElements);
                }
            }
        });

        // Start observing
        observer.observe(notionApp, {
            childList: true,
            subtree: true,
        });
    }, 2000);
};

// Start the initialization process
(() => {
    console.log("Vim-Notion: Extension starting");
    initializeWithRetry();
})();
