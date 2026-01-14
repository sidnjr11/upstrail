class StateManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 25;
        this.clipboard = null;
    }

    saveState(state) {
        this.history = this.history.slice(0, this.currentIndex + 1);
        this.history.push(JSON.parse(JSON.stringify(state)));
        this.currentIndex++;
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentIndex--;
        }
        this.updateUI();
    }

    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateUI();
            return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        }
        return null;
    }

    canUndo() {
        return this.currentIndex > 0;
    }

    updateUI() {
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
        }
        const historyInfo = document.getElementById('historyInfo');
        if (historyInfo) {
            historyInfo.textContent = `${this.history.length} states`;
        }
    }

    getCurrentState() {
        return this.currentIndex >= 0 ? this.history[this.currentIndex] : null;
    }
}

/**
 * @class NLPParser
 * An enhanced parser for interpreting natural language descriptions of supply chains.
 * It identifies quantities, materials, activities, and transitional phrases to
 * build a structured representation of the supply chain flow.
 */
class NLPParser {
    constructor() {
        // Dictionary to map quantity words to numbers. 'multiple' and 'several' default to 3.
        this.quantityMap = {
            'one': 1, 'a': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'multiple': 3, 'several': 3, 'many': 3, 'a few': 3
        };

        // Keywords for identifying material nodes.
        this.materialKeywords = [
            'raw material', 'raw materials', 'component', 'components', 'part', 'parts', 'ingredient', 'ingredients',
            'finished good', 'finished goods', 'finished product', 'finished products', 'product', 'products', 'item', 'items',
            'good', 'goods', 'inventory', 'materials', 'material',
            'supplier', 'suppliers', 'vendor', 'vendors', 'customer', 'customers', 'store', 'stores', 'warehouse', 'warehouses',
            'distribution center', 'dc', 'hub', 'hubs', 'depot', 'depots', 'plant'
        ];

        // Keywords for identifying activity nodes.
        this.activityKeywords = [
            'manufacturing', 'assembly', 'processing', 'production', 'produce', 'create', 'make', 'build',
            'distribution', 'shipping', 'delivery', 'logistics', 'transportation', 'distribute', 'ship', 'deliver',
            'consumed in a bom', 'consumed', 'sent', 'transported', 'shipped', 'truck'
        ];
        
        // Words that indicate a transition but don't create a node.
        this.transitionWords = ['then', 'next', 'after', 'to', 'from', 'and', 'being', 'is', 'at'];
    }

    /**
     * Parses complex sentences involving movement (e.g., from/to/via).
     * @param {string} text - The user's input string.
     * @returns {Array|null} An array of structured "step" objects or null if the pattern doesn't match.
     */
    parseMovement(text) {
        const fromPattern = /from ([\w\s]+?)(?=\sto\s|via\s|$)/;
        const toPattern = /to ([\w\s]+?)(?=\sfrom\s|via\s|$)/;
        const viaPattern = /via ([\w\s]+?)(?=\sfrom\s|to\s|$)/;
        // Pattern to capture the material, which usually comes before verbs like "sent", "transported", etc.
        const materialPattern = /([\w\s]+?)(?=\sbeing sent|\sis sent|\sbeing transported|\sis transported)/;

        const fromMatch = text.match(fromPattern);
        const toMatch = text.match(toPattern);
        let viaMatch = text.match(viaPattern);
        let materialMatch = text.match(materialPattern);
        
        // A more general material match if the specific one fails
        if (!materialMatch) {
            materialMatch = text.match(/(a|one|two|three|multiple|several)?\s?([\w\s]+?)(?=\sfrom\s)/);
        }

        const source = fromMatch ? this.findKeyword(fromMatch[1].trim()) : null;
        const destination = toMatch ? this.findKeyword(toMatch[1].trim()) : null;
        let activity = viaMatch ? this.findKeyword(viaMatch[1].trim()) : null;
        const material = materialMatch ? this.findKeyword(materialMatch[1].trim() || materialMatch[2].trim()) : null;

        // If 'via' keyword is not present, infer activity from verbs.
        if (!activity) {
            for (const verb of ['sent', 'transported', 'shipped']) {
                if (text.includes(verb)) {
                    activity = { type: 'activity', label: this.capitalize(verb) };
                    break;
                }
            }
        }
        
        if (material && source && destination && activity) {
            return [{
                material: material.label,
                source: source.label,
                destination: destination.label,
                activity: activity.label
            }];
        }
        return null;
    }

    /**
     * Finds the most specific keyword in a given phrase.
     * @param {string} phrase - A segment of the input text.
     * @returns {Object} An object with the type and capitalized label.
     */
    findKeyword(phrase) {
        const allKeywords = [...this.materialKeywords, ...this.activityKeywords];
        allKeywords.sort((a, b) => b.length - a.length);

        for (const keyword of allKeywords) {
            if (phrase.includes(keyword)) {
                const type = this.activityKeywords.includes(keyword) ? 'activity' : 'material';
                return { type, label: this.capitalize(keyword) };
            }
        }
        return { type: 'material', label: this.capitalize(phrase) };
    }

    /**
     * The main parse method. Tries complex parsing first, then falls back to simple tokenization.
     * @param {string} text - The natural language input from the user.
     * @returns {Array<Object>} A list of structured steps or simple tokens.
     */
    parse(text) {
        const movementSteps = this.parseMovement(text.toLowerCase());
        if (movementSteps) {
            return movementSteps;
        }
        return this.tokenize(text); // Fallback to simple tokenization
    }

    /**
     * Simple tokenizer for sequential supply chain descriptions.
     * @param {string} text - The user's input string.
     * @returns {Array<Object>} A list of tokens.
     */
    tokenize(text) {
        const words = text.toLowerCase().replace(/,/g, '').split(/\s+/);
        const tokens = [];
        let i = 0;

        while (i < words.length) {
            let quantity = 1;
            if (this.quantityMap[words[i]] || !isNaN(parseInt(words[i]))) {
                quantity = this.quantityMap[words[i]] || parseInt(words[i]);
                i++;
                if (i >= words.length) break;
            }

            let foundKeyword = false;
            const allKeywords = [...this.materialKeywords, ...this.activityKeywords];
            allKeywords.sort((a, b) => b.split(' ').length - a.split(' ').length);

            for (const keyword of allKeywords) {
                const keywordParts = keyword.split(' ');
                if (words.slice(i, i + keywordParts.length).join(' ') === keyword) {
                    const type = this.activityKeywords.includes(keyword) ? 'activity' : 'material';
                    tokens.push({ type, label: this.capitalize(keyword), quantity });
                    i += keywordParts.length;
                    foundKeyword = true;
                    break;
                }
            }
            
            if (!foundKeyword) {
                i++;
            }
        }
        return tokens;
    }
    
    capitalize(s) {
        if (!s) return '';
        return s.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
}


class SupplyChainCanvas {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.connections = [];
        this.selectedNodes = [];
        this.hoveredNode = null;
        this.currentTool = 'select';
        this.isDraggingElement = false;
        this.isSelecting = false;
        this.selectionRect = null;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null;
        this.nodeCounter = 0;
        this.contextMenuNode = null;
        this.contextMenuConnection = null;
        this.selectedConnection = null;
        this.editingNode = null;
        this.editingConnection = null;
        this.draggedToolType = null;
        this.mousePos = { x: 0, y: 0 };
        this.copySettings = {
            padding: 20, // Default padding in pixels
            backgroundColor: '#FFFFFF' // White background
        };
        // Freehand drawing state
        this.freehandStrokes = []; // array of { id, tool: 'pen'|'eraser', color, width, points: [{x,y}], composite }
        this._currentStroke = null;
        this.penThickness = 4;
        this.penColor = null; // resolved from theme on init

        // Offscreen canvas for strokes to allow eraser to only affect strokes layer
        this.strokesCanvas = document.createElement('canvas');
        this.strokesCtx = this.strokesCanvas.getContext('2d');

        // New properties for zoom, pan, and resize
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.isCtrlPressed = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.selectionBounds = null;
        this.stateManager = new StateManager();
        this.nlpParser = new NLPParser(); // Use the new enhanced parser
        this.isRendering = false;

        this.sampleData = {
            nodes: [
                {id: "m1", type: "material", label: "RM1, Plant", x: 100, y: 150, shape: "triangle"},
                {id: "a1", type: "activity", label: "BOM", x: 250, y: 150, shape: "circle"},
                {id: "m2", type: "material", label: "FG1, Plant", x: 400, y: 150, shape: "triangle"},
                {id: "a2", type: "activity", label: "Distribution", x: 550, y: 150, shape: "circle"},
                {id: "m3", type: "material", label: "FG1, DC", x: 700, y: 150, shape: "triangle"}
            ],
            connections: [
                {from: "m1", to: "a1"}, {from: "a1", to: "m2"}, {from: "m2", to: "a2"}, {from: "a2", to: "m3"}
            ]
        };

        this.initEventListeners();
        this.setupDragAndDrop();
        this.initTheme();
        this.updateDebugInfo();
        this.saveInitialState();
        this.queueRender();

        // Global mouseup to always reset cursor and flags
        document.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                if (this.currentTool === 'pan') {
                    this.setTool('select');
                }
            }
            if (this.isDraggingElement) {
                this.isDraggingElement = false;
                this.updateDragStatus('Ready');
            }
            if (this.isResizing) {
                this.isResizing = false;
            }
            this.updateCanvasCursor();
        });
    }

    saveInitialState() {
        this.stateManager.saveState({
            nodes: this.nodes,
            connections: this.connections,
            nodeCounter: this.nodeCounter,
            freehandStrokes: this.freehandStrokes
        });
    }

    saveState() {
        this.stateManager.saveState({
            nodes: this.nodes,
            connections: this.connections,
            nodeCounter: this.nodeCounter,
            freehandStrokes: this.freehandStrokes
        });
    }

    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        return {
            x: (screenX - this.camera.x) / this.camera.zoom,
            y: (screenY - this.camera.y) / this.camera.zoom
        };
    }

    updateDebugInfo() {
        document.getElementById('canvasSize').textContent = `${this.canvas.width}×${this.canvas.height}`;
        this.canvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(e);
            this.mousePos = pos;
            document.getElementById('mouseCoords').textContent = `${Math.round(pos.x)}, ${Math.round(pos.y)}`;
        });
        this.canvas.addEventListener('mouseleave', () => {
            document.getElementById('mouseCoords').textContent = '-';
            this.hoveredNode = null;
            this.queueRender();
        });
    }

    setupDragAndDrop() {
        ['material', 'activity', 'textbox'].forEach(toolType => {
            const toolBtn = document.getElementById(`${toolType}Tool`);
            toolBtn.addEventListener('click', (e) => e.preventDefault());
            toolBtn.addEventListener('dragstart', (e) => {
                this.draggedToolType = toolType;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/json', JSON.stringify({ type: toolType, label: this.getDefaultLabel(toolType) }));
                this.showStatus(`Dragging ${toolType}. Drop on canvas to create.`, 'info');
            });
            toolBtn.addEventListener('dragend', () => {
                this.draggedToolType = null;
                this.canvas.parentElement.parentElement.classList.remove('drag-over');
            });
        });

        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.canvas.parentElement.parentElement.classList.add('drag-over');
        });

        this.canvas.addEventListener('dragleave', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                this.canvas.parentElement.parentElement.classList.remove('drag-over');
            }
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            this.canvas.parentElement.parentElement.classList.remove('drag-over');
            if (this.draggedToolType) {
                const pos = this.getMousePos(e);
                this.saveState();
                const newNode = this.addNode(this.draggedToolType, pos.x, pos.y);
                this.draggedToolType = null;
                this.showStatus(`Created ${newNode.label}`, 'success');
            }
        });
    }

    getDefaultLabel(type) {
        const labels = { material: `Material ${this.nodeCounter + 1}`, activity: `Activity ${this.nodeCounter + 1}`, textbox: 'Click to edit text' };
        return labels[type];
    }

    initEventListeners() {
        // Theme toggle button (added in index.html)
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

        const panToolEl = document.getElementById('panTool');
        if (panToolEl) panToolEl.addEventListener('click', () => this.setTool('pan'));
        const penToolEl = document.getElementById('penTool');
        if (penToolEl) penToolEl.addEventListener('click', () => this.setTool('pen'));
        const eraserToolEl = document.getElementById('eraserTool');
        if (eraserToolEl) eraserToolEl.addEventListener('click', () => this.setTool('eraser'));
        const connectToolEl = document.getElementById('connectTool');
        if (connectToolEl) connectToolEl.addEventListener('click', () => this.setTool('connect'));
        const deleteToolEl = document.getElementById('deleteTool');
        if (deleteToolEl) deleteToolEl.addEventListener('click', () => this.setTool('delete'));

        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', (e) => { if (e.key === 'Control') this.isCtrlPressed = false; });

        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) undoBtn.addEventListener('click', this.undo.bind(this));
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', this.save.bind(this));
        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) loadBtn.addEventListener('click', this.load.bind(this));
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', this.exportPNG.bind(this));
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.addEventListener('click', this.clear.bind(this));
        const loadExampleBtn = document.getElementById('loadExampleBtn');
        if (loadExampleBtn) loadExampleBtn.addEventListener('click', this.loadExample.bind(this));
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) generateBtn.addEventListener('click', this.generateFromNL.bind(this));

        // Pen thickness control
        const penThicknessEl = document.getElementById('penThickness');
        const penThicknessVal = document.getElementById('penThicknessVal');
        if (penThicknessEl) {
            this.penThickness = parseInt(penThicknessEl.value, 10) || this.penThickness;
            if (penThicknessVal) penThicknessVal.textContent = this.penThickness;
            penThicknessEl.addEventListener('input', (ev) => {
                this.penThickness = parseInt(ev.target.value, 10) || this.penThickness;
                if (penThicknessVal) penThicknessVal.textContent = this.penThickness;
            });
        }

        // Context menu event listeners
        document.getElementById('addConnectedMaterial').addEventListener('click', this.addConnectedMaterial.bind(this));
        document.getElementById('addConnectedActivity').addEventListener('click', this.addConnectedActivity.bind(this));
        document.getElementById('editLabel').addEventListener('click', this.editLabel.bind(this));
        document.getElementById('deleteNode').addEventListener('click', this.deleteSelectedNode.bind(this));
        document.getElementById('duplicateSelection').addEventListener('click', this.duplicateSelection.bind(this));
        document.getElementById('deleteSelection').addEventListener('click', this.deleteSelection.bind(this));

        // New context menu item for simple copy (stores to internal clipboard)
        const copySelectionEl = document.getElementById('copySelection');
        if (copySelectionEl) copySelectionEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.copySelectionToClipboard(); this.hideContextMenu(); });
        const pasteSelectionEl = document.getElementById('pasteSelection');
        if (pasteSelectionEl) pasteSelectionEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.pasteFromClipboard(); this.hideContextMenu(); });
        const copyForExcelEl = document.getElementById('copyForExcel');
        if (copyForExcelEl) copyForExcelEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.copySelectionForExcel(); this.hideContextMenu(); });
        const deleteConnectionEl = document.getElementById('deleteConnection');
        if (deleteConnectionEl) deleteConnectionEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.deleteConnectionFromContext(); });
        const connectFromEl = document.getElementById('connectFromNode');
        if (connectFromEl) connectFromEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation();
            if (this.contextMenuNode) {
                this.connectingFrom = this.contextMenuNode;
                this.setTool('connect');
                this.showStatus(`Connecting from ${this.contextMenuNode.label}. Click another node to connect.`, 'info');
            }
            this.hideContextMenu();
        });

        document.getElementById('saveEditBtn').addEventListener('click', this.saveEdit.bind(this));
        document.getElementById('cancelEditBtn').addEventListener('click', this.cancelEdit.bind(this));
        document.getElementById('fileInput').addEventListener('change', this.handleFileLoad.bind(this));

        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');
            const editModal = document.getElementById('editModal');
            if (!contextMenu.contains(e.target) && !e.target.closest('canvas') && !contextMenu.classList.contains('hidden')) this.hideContextMenu();
            if (e.target === editModal) this.cancelEdit();
        });

        // Zoom listeners
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoom(0.8));
        document.getElementById('zoomResetBtn').addEventListener('click', this.resetZoom.bind(this));
    }

    handleKeyDown(e) {
        if (e.key === 'Control') this.isCtrlPressed = true;

        const editModal = document.getElementById('editModal');
        if (!editModal.classList.contains('hidden')) {
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                this.saveEdit(); 
            } else if (e.key === 'Escape') {
                this.cancelEdit();
            }
            return;
        }

        // Don't handle shortcuts when typing in text inputs
        if (e.target.id === 'nlInput' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + shortcuts
            switch (e.key.toLowerCase()) {
                case 'z': 
                    e.preventDefault(); 
                    this.undo(); 
                    break;
                case 'x': 
                    e.preventDefault(); 
                    this.cutSelected(); 
                    break;
                case 'c':
                    // Ctrl+C: export image for Excel AND copy selection to internal clipboard
                    e.preventDefault();
                    if (this.selectedNodes.length > 0) {
                        // trigger image copy (async)
                        this.copySelectionForExcel();
                        // also copy to internal clipboard for canvas paste
                        this.copySelectionToClipboard();
                    } else {
                        this.showStatus('Select elements to copy', 'warning');
                    }
                    break;
                case 'v':
                    // Ctrl+V -> paste from internal clipboard (duplicate on canvas)
                    e.preventDefault();
                    this.pasteFromClipboard();
                    break;
            }
            return;
        }

        switch (e.key) {
            case 'Delete': 
            case 'Backspace': 
                e.preventDefault(); 
                this.deleteSelected(); 
                break;
            case 'Escape': 
                this.deselectAll(); 
                this.setTool('select'); 
                break;
        }

        // Quick theme toggle when pressing 'T' (not while typing)
        if (!e.ctrlKey && !e.metaKey && e.key && e.key.toLowerCase() === 't') {
            this.toggleTheme();
        }
    }

    setTool(toolName) {
        document.querySelectorAll('#panTool, #connectTool, #deleteTool, #penTool, #eraserTool, #materialTool, #activityTool, #textboxTool').forEach(btn => btn.classList.remove('active'));
        if (toolName !== 'select') {
            const toolBtn = document.getElementById(`${toolName}Tool`);
            if (toolBtn) toolBtn.classList.add('active');
        }
        this.currentTool = toolName;
        // Preserve an existing `connectingFrom` when switching to the connect tool
        if (toolName !== 'connect') this.connectingFrom = null;
        this.updateCanvasCursor();
        this.updateStatusText();
        this.queueRender();
    }

    deselectAll() {
        this.selectedNodes = [];
        this.connectingFrom = null;
        this.selectedConnection = null;
        this.contextMenuConnection = null;
        this.contextMenuNode = null;
        this.hideContextMenu();
        this.queueRender();
    }

    deleteSelected() {
        if (this.selectedConnection) {
            this.saveState();
            this.deleteConnection(this.selectedConnection);
            this.selectedConnection = null;
            this.queueRender();
            return;
        }

        if (this.selectedNodes.length > 0) {
            this.saveState();
            this.selectedNodes.forEach(node => this.deleteNode(node, false));
            this.selectedNodes = [];
            this.queueRender();
        }
    }

    cutSelected() {
        if (this.selectedNodes.length > 0) {
            // Copy selected nodes and their internal connections to clipboard
            const nodesCopy = JSON.parse(JSON.stringify(this.selectedNodes));
            const selectedIds = new Set(this.selectedNodes.map(n => n.id));
            const connsCopy = this.connections.filter(c => selectedIds.has(c.from) && selectedIds.has(c.to)).map(c => JSON.parse(JSON.stringify(c)));
            this.stateManager.clipboard = { nodes: nodesCopy, connections: connsCopy };
            this.saveState();
            this.selectedNodes.forEach(node => this.deleteNode(node, false));
            this.selectedNodes = [];
            this.showStatus('Selection cut to clipboard', 'success');
            this.queueRender();
        }
    }

    undo() {
        const previousState = this.stateManager.undo();
        if (previousState) {
            this.nodes = JSON.parse(JSON.stringify(previousState.nodes));
            this.connections = JSON.parse(JSON.stringify(previousState.connections));
            this.nodeCounter = previousState.nodeCounter;
            this.freehandStrokes = JSON.parse(JSON.stringify(previousState.freehandStrokes || []));
            this.selectedNodes = [];
            this.connectingFrom = null;
            this.hideContextMenu();
            this.queueRender();
            this.showStatus('Action undone', 'info');
        } else {
            this.showStatus('Nothing to undo', 'warning');
        }
    }

    updateCanvasCursor() {
        const container = this.canvas.parentElement.parentElement;
        // Clear all tool classes first
        container.className = container.className.replace(/tool-\w+/g, '').replace(/dragging/g, '');
        // Reset to default first
        this.canvas.style.cursor = 'default';
        // Then apply the appropriate cursor based on state
        if (this.isPanning) {
            this.canvas.style.cursor = 'grabbing';
        } else if (this.isDraggingElement) {
            this.canvas.style.cursor = 'move';
            container.classList.add('dragging');
        } else if (this.currentTool === 'pan') {
            this.canvas.style.cursor = 'grab';
        } else if (this.currentTool === 'pen') {
            this.canvas.style.cursor = 'crosshair';
            container.classList.add('tool-pen');
        } else if (this.currentTool === 'eraser') {
            this.canvas.style.cursor = 'crosshair';
            container.classList.add('tool-eraser');
        } else if (this.currentTool === 'connect') {
            container.classList.add('tool-connect');
        } else if (this.currentTool === 'delete') {
            container.classList.add('tool-delete');
        }
    }

    updateStatusText() {
        const statusMap = {
            select: 'Default mode: Drag elements or create a selection window. Hold Ctrl + Drag to pan.',
            pan: 'Pan mode: Drag the canvas to move your view.',
            connect: 'Connect mode: Click one element and then another to create a connection.',
            delete: 'Delete mode: Click elements or connections to delete them.'
        };
        document.getElementById('statusText').textContent = statusMap[this.currentTool] || statusMap.select;
    }

    updateDragStatus(status) {
        document.getElementById('dragStatus').textContent = status;
    }

    handleMouseDown(e) {
        this.hideContextMenu();
        // clear any selected connection when interacting with canvas
        this.selectedConnection = null;
        this.contextMenuConnection = null;
        // Freehand pen/eraser start
        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            const pos = this.getMousePos(e);
            const stroke = {
                id: `stroke_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                tool: this.currentTool,
                color: this.penColor || (this.themeColors && this.themeColors.text) || '#000',
                width: this.penThickness || 4,
                points: [pos]
            };
            this._currentStroke = stroke;
            this.freehandStrokes.push(stroke);
            // prevent other interactions while drawing
            e.preventDefault();
            this.queueRender();
            return;
        }
        // Reset all interaction flags first
        this.isPanning = false;
        this.isDraggingElement = false;
        this.isResizing = false;

        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);
        const clickedHandle = this.getResizeHandleAt(pos.x, pos.y);
        const clickedConn = this.getConnectionAt(pos.x, pos.y);

        if (this.isCtrlPressed || this.currentTool === 'pan') {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.updateCanvasCursor();
            return;
        }

        switch (this.currentTool) {
            case 'select':
                if (clickedHandle) {
                    this.isResizing = true;
                    this.resizeHandle = clickedHandle;
                    this.selectionBounds.original = { ...this.selectionBounds };
                    this.selectedNodes.forEach(n => n.original = { x: n.x, y: n.y });
                } else if (clickedNode) {
                    if (this.isClickOnLabel(pos, clickedNode)) { 
                        this.enterLabelEditMode(clickedNode); 
                        return; 
                    }
                    if (!this.selectedNodes.includes(clickedNode)) this.selectedNodes = [clickedNode];
                    this.isDraggingElement = true;
                    this.dragOffset = { x: pos.x, y: pos.y };
                    this.selectedNodes.forEach(n => n.dragStart = { x: n.x, y: n.y });
                    this.updateCanvasCursor();
                    this.updateDragStatus(`Moving ${this.selectedNodes.length} element(s)`);
                } else if (clickedConn) {
                    // select connection on left click when in select mode
                    this.selectedConnection = clickedConn;
                    this.selectedNodes = [];
                    this.updateCanvasCursor();
                    this.updateDragStatus(`Selected 1 connection`);
                    this.queueRender();
                    return;
                } else {
                    this.isSelecting = true;
                    this.selectionRect = { startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y };
                    this.selectedNodes = [];
                }
                break;
            case 'connect':
                if (clickedNode) {
                    if (!this.connectingFrom) {
                        this.connectingFrom = clickedNode;
                        this.showStatus(`Connecting from ${clickedNode.label}. Click another node.`, 'info');
                    } else if (this.connectingFrom !== clickedNode) {
                        if (this.createConnection(this.connectingFrom, clickedNode)) this.setTool('select');
                        this.connectingFrom = null;
                    }
                } else {
                    this.connectingFrom = null;
                    this.deselectAll();
                }
                break;
            case 'delete':
                if (clickedNode) {
                    this.saveState();
                    this.deleteNode(clickedNode);
                    this.setTool('select');
                } else {
                    const connection = this.getConnectionAt(pos.x, pos.y);
                    if (connection) {
                        this.saveState();
                        this.deleteConnection(connection);
                        this.setTool('select');
                    }
                }
                break;
        }
        this.queueRender();
    }

    isClickOnLabel(pos, node) {
        if (node.type === 'textbox') return false;
        const labelY = node.y + 40;
        const labelHeight = 20;
        const labelWidth = 100;
        return pos.x >= node.x - labelWidth / 2 && pos.x <= node.x + labelWidth / 2 &&
               pos.y >= labelY - labelHeight / 2 && pos.y <= labelY + labelHeight / 2;
    }

    isInsideTextBox(pos, node) {
        if (node.type !== 'textbox') return false;
        return pos.x >= node.x - node.width / 2 && pos.x <= node.x + node.width / 2 &&
               pos.y >= node.y - node.height / 2 && pos.y <= node.y + node.height / 2;
    }

    enterLabelEditMode(node) {
        this.editingNode = node;
        this.selectedNodes = [node];
        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');
        document.querySelector('#editModal h3').textContent = 'Edit Label';
        input.value = node.label;
        modal.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 10);
        this.queueRender();
    }

    enterConnectionEditMode(connection) {
        this.editingConnection = connection;
        // Deselect nodes to focus editing on connection
        this.selectedNodes = [];
        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');
        document.querySelector('#editModal h3').textContent = 'Edit Connection Label';
        input.value = connection.label || '';
        modal.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 10);
        this.queueRender();
    }

    enterTextEditMode(node) {
        this.editingNode = node;
        this.selectedNodes = [node];
        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');
        document.querySelector('#editModal h3').textContent = 'Edit Text Content';
        input.value = node.label === 'Click to edit text' ? '' : node.label;
        // Size the modal and textarea to visually match the node, but constrain to sensible min/max
        const modalContent = modal.querySelector('.modal-content');
        // compute node dims (fallback to defaults)
        const fontSize = node.fontSize || 12;
        const dims = this.computeTextBoxDimensions(node.label || '', fontSize);
        const nodeW = node.width || dims.width || 120;
        const nodeH = node.height || dims.height || 40;

        // Constrain modal width between 420px and viewport width-40 (bigger edit area)
        const viewportW = Math.max(320, window.innerWidth || 800);
        const desiredModalMin = Math.min(Math.max(nodeW + 80, 420), viewportW - 40);
        if (modalContent) modalContent.style.minWidth = `${desiredModalMin}px`;

        // Set textarea width/height but keep it responsive inside modal
        input.style.width = `${Math.min(nodeW, desiredModalMin - 80)}px`;
        input.style.maxWidth = '100%';
        input.style.height = `${Math.max(nodeH, 120)}px`;
        // Attach live input handler to update the node while editing
        this._editInputHandler = (e) => {
            const newContent = e.target.value;
            if (this.editingNode) {
                this.editingNode.label = newContent === '' ? 'Click to edit text' : newContent;
                const dimsLive = this.computeTextBoxDimensions(this.editingNode.label, this.editingNode.fontSize || 12);
                this.editingNode.width = dimsLive.width;
                this.editingNode.height = dimsLive.height;
                // update textarea size responsively (use larger minimum)
                const desiredModalMinLive = Math.min(Math.max(dimsLive.width + 80, 420), viewportW - 40);
                if (modalContent) modalContent.style.minWidth = `${desiredModalMinLive}px`;
                input.style.width = `${Math.min(dimsLive.width, desiredModalMinLive - 80)}px`;
                input.style.height = `${Math.max(dimsLive.height, 120)}px`;
                this.queueRender();
            }
        };
        input.addEventListener('input', this._editInputHandler);
        modal.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 10);
        this.queueRender();
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);

        // Freehand drawing in progress
        if (this._currentStroke) {
            this._currentStroke.points.push(pos);
            this.queueRender();
            return;
        }
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            this.camera.x += dx;
            this.camera.y += dy;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.queueRender();
            return;
        }

        if (this.isResizing) {
            this.resizeSelection(pos);
            this.queueRender();
            return;
        }

        if (this.isSelecting) {
            this.selectionRect.endX = pos.x;
            this.selectionRect.endY = pos.y;
            this.queueRender();
            return;
        }

        if (this.isDraggingElement && this.selectedNodes.length > 0) {
            const dx = pos.x - this.dragOffset.x;
            const dy = pos.y - this.dragOffset.y;
            this.selectedNodes.forEach(node => {
                node.x = node.dragStart.x + dx;
                node.y = node.dragStart.y + dy;
            });
            this.queueRender();
        }
    }

    handleMouseUp(e) {
        // If finishing a freehand stroke, finalize it and save
        if (this._currentStroke) {
            // finalize current stroke
            this._currentStroke = null;
            this.saveState();
            this.queueRender();
            return;
        }

        // First reset all interaction states
        const wasInteracting = this.isPanning || this.isDraggingElement || this.isResizing || this.isSelecting;
        this.isPanning = false;
        this.isDraggingElement = false;
        this.isResizing = false;

        if (this.isSelecting) {
            this.isSelecting = false;
            this.selectNodesInRect();
            this.selectionRect = null;
            this.queueRender();
        }

        if (wasInteracting && this.selectedNodes.length > 0) {
            this.saveState();
        }

        if (this.currentTool === 'pan') {
            this.setTool('select');
        }

        this.updateDragStatus('Ready');
        // Force cursor update after ALL state changes
        setTimeout(() => this.updateCanvasCursor(), 0);
        this.updateCanvasCursor();
    }

    selectNodesInRect() {
        if (!this.selectionRect) return;
        this.selectedNodes = [];
        const x1 = Math.min(this.selectionRect.startX, this.selectionRect.endX);
        const y1 = Math.min(this.selectionRect.startY, this.selectionRect.endY);
        const x2 = Math.max(this.selectionRect.startX, this.selectionRect.endX);
        const y2 = Math.max(this.selectionRect.startY, this.selectionRect.endY);

        this.nodes.forEach(node => {
            if (node.x > x1 && node.x < x2 && node.y > y1 && node.y < y2) {
                this.selectedNodes.push(node);
            }
        });
        this.updateSelectionBounds();
    }

    handleRightClick(e) {
        e.preventDefault();
        e.stopPropagation();
        // Reset all interaction states
        this.isPanning = false;
        this.isDraggingElement = false;
        this.isResizing = false;

        if (this.isPanning) return;

        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);
        const clickedConn = this.getConnectionAt(pos.x, pos.y);

        if (clickedNode) {
            if (!this.selectedNodes.includes(clickedNode)) this.selectedNodes = [clickedNode];
            this.contextMenuNode = clickedNode;
            this.contextMenuConnection = null;
            this.selectedConnection = null;
            this.showContextMenu(e.clientX, e.clientY);
            this.queueRender();
        } else if (clickedConn) {
            // select the connection for possible deletion
            this.selectedNodes = [];
            this.selectedConnection = clickedConn;
            this.contextMenuConnection = clickedConn;
            this.contextMenuNode = null;
            this.showContextMenu(e.clientX, e.clientY);
            this.queueRender();
        } else {
            // Right-click on blank canvas: show context menu so paste (if present) is available
            this.selectedNodes = [];
            this.contextMenuNode = null;
            this.contextMenuConnection = null;
            this.selectedConnection = null;
            this.showContextMenu(e.clientX, e.clientY);
        }

        // Ensure cursor is reset
        this.updateCanvasCursor();
    }

    handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);
        const clickedConn = this.getConnectionAt(pos.x, pos.y);

        if (clickedNode) {
            if (clickedNode.type === 'textbox') this.enterTextEditMode(clickedNode);
            else this.enterLabelEditMode(clickedNode);
            return;
        }

        if (clickedConn) {
            this.enterConnectionEditMode(clickedConn);
            return;
        }
    }

    addNode(type, x, y, label = null) {
        const defaultLabels = { 
            material: `Material ${this.nodeCounter + 1}`, 
            activity: `Activity ${this.nodeCounter + 1}`, 
            textbox: 'Click to edit text' 
        };
        const node = {
            id: `node_${++this.nodeCounter}`, 
            type, 
            shape: this.getNodeShape(type), 
            label: label || defaultLabels[type], 
            x, 
            y
        };
        if (type === 'textbox') { 
            node.width = 120; 
            node.height = 40; 
            node.fontSize = 12; 
            // Compute size to fit label
            const dims = this.computeTextBoxDimensions(node.label, node.fontSize);
            node.width = dims.width;
            node.height = dims.height;
        }
        this.nodes.push(node);
        this.selectedNodes = [node];
        this.queueRender();
        return node;
    }

    getNodeShape(type) {
        const shapes = { material: 'triangle', activity: 'circle', textbox: 'rectangle' };
        return shapes[type] || 'circle';
    }

    createConnection(fromNode, toNode) {
        if (!this.canConnect(fromNode, toNode)) {
            this.showStatus(`Invalid connection! ${fromNode.type} cannot connect to ${toNode.type}`, 'error');
            return false;
        }

        const existing = this.connections.find(c => 
            (c.from === fromNode.id && c.to === toNode.id) || 
            (c.from === toNode.id && c.to === fromNode.id)
        );
        if (existing) {
            this.showStatus('Connection already exists!', 'warning');
            return false;
        }

        this.saveState();
        this.connections.push({ from: fromNode.id, to: toNode.id, label: '' });
        this.showStatus(`Connected ${fromNode.label} → ${toNode.label}`, 'success');
        this.connectingFrom = null;
        return true;
    }

    canConnect(nodeA, nodeB) {
        // Enforce alternating pattern for material and activity nodes
        if (nodeA.id === nodeB.id) return false;
        if (nodeA.type === 'textbox' || nodeB.type === 'textbox') return true;
        return nodeA.type !== nodeB.type;
    }

    getNodeAt(x, y) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (node.type === 'textbox') {
                if (x >= node.x - node.width / 2 && x <= node.x + node.width / 2 && 
                    y >= node.y - node.height / 2 && y <= node.y + node.height / 2) return node;
            } else {
                const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
                if (dist <= 32) return node;
            }
        }
        return null;
    }

    getConnectionAt(x, y) {
        return this.connections.find(conn => {
            const from = this.nodes.find(n => n.id === conn.from);
            const to = this.nodes.find(n => n.id === conn.to);
            if (!from || !to) return false;
            return this.distanceToLine(x, y, from.x, from.y, to.x, to.y) <= 10;
        });
    }

    distanceToLine(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }

    deleteNode(node, shouldRender = true) {
        this.nodes = this.nodes.filter(n => n.id !== node.id);
        this.connections = this.connections.filter(c => c.from !== node.id && c.to !== node.id);
        if (shouldRender) {
            this.showStatus(`Deleted ${node.label}`, 'success');
            this.queueRender();
        }
    }

    deleteConnection(connection) {
        this.connections = this.connections.filter(c => c !== connection);
        this.showStatus(`Deleted connection`, 'success');
        this.queueRender();
    }

    queueRender() {
        if (!this.isRendering) {
            this.isRendering = true;
            requestAnimationFrame(() => { 
                this.render(); 
                this.isRendering = false; 
            });
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);

        this.drawGrid();
        this.drawConnections();
        this.drawNodes();
        this.drawConnectionPreview();
        this.drawSelectionBounds();
        this.drawSelectionRect();

        this.ctx.restore();
        // Ensure strokes canvas size matches main canvas
        this.updateStrokesCanvasSize();
        // Render stroke layer (draws onto strokesCanvas)
        this.drawStrokes();
        // Composite stroke layer on top of main canvas (screen coords)
        this.ctx.drawImage(this.strokesCanvas, 0, 0);
    }

    drawGrid() {
        this.ctx.save();
        this.ctx.strokeStyle = this.themeColors && this.themeColors.grid ? this.themeColors.grid : 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1 / this.camera.zoom;

        const gridSize = 20;
        const left = -this.camera.x / this.camera.zoom;
        const top = -this.camera.y / this.camera.zoom;
        const right = (this.canvas.width - this.camera.x) / this.camera.zoom;
        const bottom = (this.canvas.height - this.camera.y) / this.camera.zoom;

        const startX = Math.floor(left / gridSize) * gridSize;
        const startY = Math.floor(top / gridSize) * gridSize;

        for (let x = startX; x < right; x += gridSize) {
            this.ctx.beginPath(); 
            this.ctx.moveTo(x, top); 
            this.ctx.lineTo(x, bottom); 
            this.ctx.stroke();
        }

        for (let y = startY; y < bottom; y += gridSize) {
            this.ctx.beginPath(); 
            this.ctx.moveTo(left, y); 
            this.ctx.lineTo(right, y); 
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawSelectionRect() {
        if (this.isSelecting && this.selectionRect) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0, 123, 255, 0.2)';
            this.ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
            this.ctx.lineWidth = 1 / this.camera.zoom;

            const { startX, startY, endX, endY } = this.selectionRect;
            this.ctx.fillRect(startX, startY, endX - startX, endY - startY);
            this.ctx.strokeRect(startX, startY, endX - startX, endY - startY);
            this.ctx.restore();
        }
    }

    drawConnectionPreview() {
        if (this.currentTool === 'connect' && this.connectingFrom) {
            this.ctx.save();
            this.ctx.strokeStyle = this.themeColors.primary || '#007bff';
            this.ctx.lineWidth = 2 / this.camera.zoom;
            this.ctx.setLineDash([5 / this.camera.zoom, 5 / this.camera.zoom]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.connectingFrom.x, this.connectingFrom.y);
            this.ctx.lineTo(this.mousePos.x, this.mousePos.y);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    drawNodes() {
        this.nodes.forEach(node => {
            this.ctx.save();
            const isSelected = this.selectedNodes.includes(node);
            const isConnecting = this.connectingFrom === node;

            if (node.type === 'textbox') this.drawTextBox(node, isSelected);
            else this.drawRegularNode(node, isSelected, isConnecting);

            this.ctx.restore();
        });
    }

    drawTextBox(node, isSelected) {
        this.ctx.strokeStyle = this.themeColors.text || '#000000';
        this.ctx.lineWidth = (isSelected ? 3 : 2) / this.camera.zoom;
        if (isSelected) { 
            this.ctx.shadowColor = this.themeColors.text || '#000000'; 
            this.ctx.shadowBlur = 10; 
        }
        this.ctx.strokeRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height);
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = this.themeColors.text || '#000000';
        this.ctx.font = `${node.fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.wrapText(node.label, node.width - 10);
        const lineHeight = node.fontSize + 2;
        const startY = node.y - (lines.length - 1) * lineHeight / 2;
        lines.forEach((line, index) => this.ctx.fillText(line, node.x, startY + index * lineHeight));
    }

    drawRegularNode(node, isSelected, isConnecting) {
        const matFill = this.themeColors.nodeMaterialFill || '#1fb8cd';
        const actFill = this.themeColors.nodeActivityFill || '#ffc185';
        const matStroke = this.themeColors.nodeMaterialStroke || '#127681';
        const actStroke = this.themeColors.nodeActivityStroke || '#b4413c';
        this.ctx.fillStyle = node.type === 'material' ? (isSelected || isConnecting ? matFill : matFill) : (isSelected || isConnecting ? actFill : actFill);
        this.ctx.strokeStyle = node.type === 'material' ? matStroke : actStroke;
        this.ctx.lineWidth = (isSelected || isConnecting ? 3 : 2) / this.camera.zoom;

        if (isSelected || isConnecting) { 
            this.ctx.shadowColor = this.ctx.fillStyle; 
            this.ctx.shadowBlur = 10; 
        }

        this.ctx.beginPath();
        if (node.shape === 'triangle') this.drawTriangle(node.x, node.y, 32);
        else this.drawCircle(node.x, node.y, 25);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        this.ctx.fillStyle = this.themeColors.text || '#13343b';
        this.ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.wrapText(node.label, 100);
        const lineHeight = 14;
        const startY = node.y + 40;
        lines.forEach((line, index) => this.ctx.fillText(line, node.x, startY + index * lineHeight));
    }

    wrapText(text, maxWidth) {
        const manualLines = text.split('\n');
        const finalLines = [];

        manualLines.forEach(manualLine => {
            const words = manualLine.split(' ');
            let currentLine = words[0] || '';

            for (let i = 1; i < words.length; i++) {
                const testLine = currentLine + ' ' + words[i];
                if (this.ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
                    finalLines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            finalLines.push(currentLine);
        });
        
        return finalLines;
    }

    drawConnections() {
        this.connections.forEach(conn => {
            const from = this.nodes.find(n => n.id === conn.from);
            const to = this.nodes.find(n => n.id === conn.to);
            if (!from || !to) return;

            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const nodeRadius = 30;
            const adjFromX = from.x + nodeRadius * Math.cos(angle);
            const adjFromY = from.y + nodeRadius * Math.sin(angle);
            const adjToX = to.x - nodeRadius * Math.cos(angle);
            const adjToY = to.y - nodeRadius * Math.sin(angle);

            // Draw the connection line / arrow
            if (this.selectedConnection && this.selectedConnection.from === conn.from && this.selectedConnection.to === conn.to) {
                // Highlighted
                this.ctx.save();
                this.ctx.strokeStyle = this.themeColors.primary || '#007bff';
                this.ctx.lineWidth = 4 / this.camera.zoom;
                this.ctx.lineCap = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(adjFromX, adjFromY);
                this.ctx.lineTo(adjToX, adjToY);
                this.ctx.stroke();

                const headLength = 12 / this.camera.zoom;
                this.ctx.fillStyle = this.themeColors.primary || '#007bff';
                this.ctx.beginPath();
                this.ctx.moveTo(adjToX, adjToY);
                this.ctx.lineTo(
                    adjToX - headLength * Math.cos(angle - Math.PI / 6),
                    adjToY - headLength * Math.sin(angle - Math.PI / 6)
                );
                this.ctx.lineTo(
                    adjToX - headLength * Math.cos(angle + Math.PI / 6),
                    adjToY - headLength * Math.sin(angle + Math.PI / 6)
                );
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.restore();
            } else {
                this.drawArrow(from.x, from.y, to.x, to.y);
            }

            // Draw connection label if present
            if (conn.label) {
                const midX = (adjFromX + adjToX) / 2;
                const midY = (adjFromY + adjToY) / 2;
                this.ctx.save();
                this.ctx.translate(midX, midY);
                this.ctx.rotate(angle);
                this.ctx.fillStyle = this.themeColors.textSecondary || this.themeColors.text || '#626c71';
                this.ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(conn.label, 0, -8);
                this.ctx.restore();
            }
        });
    }

    drawTriangle(x, y, size) {
        const h = size * Math.sqrt(3) / 2;
        this.ctx.moveTo(x, y - h / 2);
        this.ctx.lineTo(x - size / 2, y + h / 2);
        this.ctx.lineTo(x + size / 2, y + h / 2);
        this.ctx.closePath();
    }

    drawCircle(x, y, radius) {
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    }

    drawArrow(fromX, fromY, toX, toY) {
        const headLength = 12 / this.camera.zoom;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const nodeRadius = 30;

        const adjFromX = fromX + nodeRadius * Math.cos(angle);
        const adjFromY = fromY + nodeRadius * Math.sin(angle);
        const adjToX = toX - nodeRadius * Math.cos(angle);
        const adjToY = toY - nodeRadius * Math.sin(angle);

        this.ctx.save();
        this.ctx.strokeStyle = this.themeColors.arrow || '#626c71';
        this.ctx.lineWidth = 2 / this.camera.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(adjFromX, adjFromY);
        this.ctx.lineTo(adjToX, adjToY);
        this.ctx.stroke();

        this.ctx.fillStyle = this.themeColors.arrow || '#626c71';
        this.ctx.beginPath();
        this.ctx.moveTo(adjToX, adjToY);
        this.ctx.lineTo(adjToX - headLength * Math.cos(angle - Math.PI / 6), adjToY - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(adjToX - headLength * Math.cos(angle + Math.PI / 6), adjToY - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    updateSelectionBounds() {
        if (this.selectedNodes.length > 1) {
            this.selectionBounds = this.calculateSelectionBounds();
        } else {
            this.selectionBounds = null;
        }
    }

    drawSelectionBounds() {
        if (this.selectionBounds) {
            const bounds = this.selectionBounds;
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
            this.ctx.lineWidth = 1 / this.camera.zoom;
            this.ctx.setLineDash([5 / this.camera.zoom, 5 / this.camera.zoom]);
            this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.ctx.restore();
            this.drawResizeHandles(bounds);
        }
    }

    calculateSelectionBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const padding = 40;

        this.selectedNodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        });

        return {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + 2 * padding,
            height: (maxY - minY) + 2 * padding
        };
    }

    drawResizeHandles(bounds) {
        const handleSize = 8 / this.camera.zoom;
        const handles = this.getResizeHandles(bounds);

        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 123, 255, 1)';
        Object.values(handles).forEach(handle => {
            this.ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        });
        this.ctx.restore();
    }

    updateStrokesCanvasSize() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (!this.strokesCanvas) return;
        if (this.strokesCanvas.width !== w || this.strokesCanvas.height !== h) {
            this.strokesCanvas.width = w;
            this.strokesCanvas.height = h;
            // When resizing, keep existing strokes (we re-render from stroke data each frame)
        }
    }

    drawStrokes() {
        // Draw strokes onto the offscreen strokes canvas in screen coordinates
        const sc = this.strokesCanvas;
        const sctx = this.strokesCtx;
        if (!sctx) return;
        // Clear strokes canvas
        sctx.clearRect(0, 0, sc.width, sc.height);

        if (!this.freehandStrokes || this.freehandStrokes.length === 0) return;
        this.freehandStrokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            // Convert world points to screen coords
            const pts = stroke.points.map(p => ({ x: Math.round(p.x * this.camera.zoom + this.camera.x), y: Math.round(p.y * this.camera.zoom + this.camera.y) }));
            sctx.save();
            if (stroke.tool === 'eraser') {
                sctx.globalCompositeOperation = 'destination-out';
                sctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                sctx.globalCompositeOperation = 'source-over';
                sctx.strokeStyle = stroke.color || (this.themeColors && this.themeColors.text) || '#000000';
            }
            // When drawing onto screen coordinate canvas, use stroke width as visual pixels
            sctx.lineWidth = (stroke.width || this.penThickness || 4);
            sctx.lineCap = 'round';
            sctx.lineJoin = 'round';
            sctx.beginPath();
            sctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y);
            sctx.stroke();
            sctx.restore();
        });
    }

    getResizeHandles(bounds) {
        if (!bounds) return {};
        return {
            'top-left': { x: bounds.x, y: bounds.y },
            'top-right': { x: bounds.x + bounds.width, y: bounds.y },
            'bottom-left': { x: bounds.x, y: bounds.y + bounds.height },
            'bottom-right': { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
        };
    }

    getResizeHandleAt(x, y) {
        if (!this.selectionBounds) return null;
        const handles = this.getResizeHandles(this.selectionBounds);
        const handleSize = 10 / this.camera.zoom;

        for (const [pos, handle] of Object.entries(handles)) {
            if (x >= handle.x - handleSize / 2 && x <= handle.x + handleSize / 2 &&
                y >= handle.y - handleSize / 2 && y <= handle.y + handleSize / 2) {
                return pos;
            }
        }
        return null;
    }

    resizeSelection(pos) {
        if (!this.isResizing || !this.selectionBounds || !this.selectionBounds.original) return;

        const orig = this.selectionBounds.original;
        let scaleX = 1, scaleY = 1;

        if (orig.width > 0) {
            if (this.resizeHandle.includes('right')) scaleX = (pos.x - orig.x) / orig.width;
            if (this.resizeHandle.includes('left')) scaleX = (orig.x + orig.width - pos.x) / orig.width;
        }

        if (orig.height > 0) {
            if (this.resizeHandle.includes('bottom')) scaleY = (pos.y - orig.y) / orig.height;
            if (this.resizeHandle.includes('top')) scaleY = (orig.y + orig.height - pos.y) / orig.height;
        }

        const anchor = {
            x: this.resizeHandle.includes('left') ? orig.x + orig.width : orig.x,
            y: this.resizeHandle.includes('top') ? orig.y + orig.height : orig.y
        };

        this.selectedNodes.forEach(node => {
            const relX = (node.original.x - anchor.x) * scaleX;
            const relY = (node.original.y - anchor.y) * scaleY;
            node.x = anchor.x + relX;
            node.y = anchor.y + relY;
        });
    }

    handleWheel(e) {
        e.preventDefault();
        const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(zoomAmount, e.clientX, e.clientY);
    }

    zoom(factor, clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = clientX ? clientX - rect.left : this.canvas.width / 2;
        const mouseY = clientY ? clientY - rect.top : this.canvas.height / 2;

        const worldMouseX = (mouseX - this.camera.x) / this.camera.zoom;
        const worldMouseY = (mouseY - this.camera.y) / this.camera.zoom;

        const newZoom = Math.max(0.1, Math.min(5, this.camera.zoom * factor));
        this.camera.x = mouseX - worldMouseX * newZoom;
        this.camera.y = mouseY - worldMouseY * newZoom;
        this.camera.zoom = newZoom;

        this.updateZoomDisplay();
        this.queueRender();
    }

    resetZoom() {
        this.camera.x = 0;
        this.camera.y = 0;
        this.camera.zoom = 1;
        this.updateZoomDisplay();
        this.queueRender();
    }

    updateZoomDisplay() {
        document.getElementById('zoomLevel').textContent = `${Math.round(this.camera.zoom * 100)}%`;
    }

    // Theme handling: read CSS variables and apply to canvas rendering
    initTheme() {
        const saved = localStorage.getItem('scc-theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.theme = saved || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-color-scheme', this.theme);
        const label = document.getElementById('themeToggleLabel');
        if (label) label.textContent = this.theme === 'dark' ? 'Day' : 'Night';
        this.buildThemeColors();
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', this.theme);
        localStorage.setItem('scc-theme', this.theme);
        const label = document.getElementById('themeToggleLabel');
        if (label) label.textContent = this.theme === 'dark' ? 'Day' : 'Night';
        this.buildThemeColors();
        this.queueRender();
        this.showStatus(`${this.theme === 'dark' ? 'Night' : 'Day'} mode enabled`, 'info');
    }

    buildThemeColors() {
        const s = getComputedStyle(document.documentElement);
        const read = (name) => s.getPropertyValue(name).trim() || null;
        this.themeColors = {
            primary: read('--color-primary') || '#1fb8cd',
            primaryText: read('--color-btn-primary-text') || '#FFFFFF',
            nodeMaterialFill: read('--color-success') || '#1fb8cd',
            nodeActivityFill: read('--color-warning') || '#ffc185',
            nodeMaterialStroke: read('--color-primary') || '#127681',
            nodeActivityStroke: read('--color-error') || '#b4413c',
            text: read('--color-text') || '#13343b',
            textSecondary: read('--color-text-secondary') || '#626c71',
            grid: read('--color-border') || 'rgba(0,0,0,0.08)',
            arrow: read('--color-info') || '#626c71',
            canvasSurface: read('--color-surface') || '#ffffff'
        };
        // Pen color default
        this.penColor = this.themeColors.text || '#000000';
        // Ensure proper defaults for transparency tokens
        if (!this.copySettings.backgroundColor) this.copySettings.backgroundColor = this.themeColors.canvasSurface;
    }

    // Read theme CSS variables for a specific scheme ('light' or 'dark') without permanently changing UI
    getThemeColorsForScheme(scheme = 'light') {
        const el = document.documentElement;
        const prev = el.getAttribute('data-color-scheme');
        try {
            el.setAttribute('data-color-scheme', scheme);
            const s = getComputedStyle(document.documentElement);
            const read = (name) => s.getPropertyValue(name).trim() || null;
            const colors = {
                primary: read('--color-primary') || '#1fb8cd',
                primaryText: read('--color-btn-primary-text') || '#FFFFFF',
                nodeMaterialFill: read('--color-success') || '#1fb8cd',
                nodeActivityFill: read('--color-warning') || '#ffc185',
                nodeMaterialStroke: read('--color-primary') || '#127681',
                nodeActivityStroke: read('--color-error') || '#b4413c',
                text: read('--color-text') || '#13343b',
                textSecondary: read('--color-text-secondary') || '#626c71',
                grid: read('--color-border') || 'rgba(0,0,0,0.08)',
                arrow: read('--color-info') || '#626c71',
                canvasSurface: read('--color-surface') || '#ffffff'
            };
            return colors;
        } finally {
            if (prev) el.setAttribute('data-color-scheme', prev);
            else el.removeAttribute('data-color-scheme');
        }
    }

    /**
     * Main function to generate a diagram from a natural language description.
     */
    generateFromNL() {
        const input = document.getElementById('nlInput').value.trim();
        if (window && window.console && window.console.debug) console.debug('generateFromNL -> input', input);
        if (!input) {
            this.showStatus('Please enter a description first!', 'warning');
            return;
        }

        this.saveState();
        this.nodes = [];
        this.connections = [];
        this.selectedNodes = [];
        this.connectingFrom = null;
        this.nodeCounter = 0;

        const result = this.nlpParser.parse(input);
        if (!result || result.length === 0) {
            this.showStatus('Could not understand the description. Please try different wording.', 'error');
            this.undo();
            return;
        }

        // Check if the parser returned structured steps or simple tokens
        if (result[0].source && result[0].destination) {
            this.buildDiagramFromSteps(result);
        } else {
            this.buildDiagramFromTokens(result);
        }

        this.queueRender();
        this.showStatus('Diagram generated from description!', 'success');
        document.getElementById('nlInput').value = '';
    }

    /**
     * Builds a diagram from structured movement steps.
     * @param {Array<Object>} steps - The structured steps from the NLP parser.
     */
    buildDiagramFromSteps(steps) {
        let lastNode = null;
        let currentX = 150;
        const xIncrement = 250;
        const yPos = 250;

        for (const step of steps) {
            const sourceLabel = `${step.material}\nat ${step.source}`;
            const sourceNode = this.addNode('material', currentX, yPos, sourceLabel);

            if (lastNode) {
                this.createConnectionDirect(lastNode, sourceNode);
            }

            currentX += xIncrement;
            const activityNode = this.addNode('activity', currentX, yPos, step.activity);
            this.createConnectionDirect(sourceNode, activityNode);

            currentX += xIncrement;
            const destLabel = `${step.material}\nat ${step.destination}`;
            const destNode = this.addNode('material', currentX, yPos, destLabel);
            this.createConnectionDirect(activityNode, destNode);

            lastNode = destNode;
        }
    }

    /**
     * Constructs the supply chain diagram step-by-step from simple parsed tokens.
     * @param {Array<Object>} tokens - The sequence of parsed tokens from NLPParser.
     */
    buildDiagramFromTokens(tokens) {
        let lastNodes = [];
        let lastNodeType = null;
        let currentX = 150;
        const xIncrement = 200;
        const yStart = 250;
        const ySpacing = 120;

        for (const token of tokens) {
            if (lastNodeType && token.type === lastNodeType) {
                console.warn(`Skipping token of type '${token.type}' to enforce alternating pattern.`);
                continue;
            }

            const newNodes = [];
            const yOffset = (token.quantity - 1) * ySpacing / 2;

            for (let i = 0; i < token.quantity; i++) {
                const yPos = yStart + (i * ySpacing) - yOffset;
                const label = token.quantity > 1 ? `${token.label} ${i + 1}` : token.label;
                const newNode = this.addNode(token.type, currentX, yPos, label);
                newNodes.push(newNode);
            }

            if (lastNodes.length > 0) {
                for (const fromNode of lastNodes) {
                    for (const toNode of newNodes) {
                         if (this.canConnect(fromNode, toNode)) {
                            this.createConnectionDirect(fromNode, toNode);
                         }
                    }
                }
            }

            lastNodes = newNodes;
            lastNodeType = token.type;
            currentX += xIncrement;
        }
    }


    createConnectionDirect(fromNode, toNode) {
        this.connections.push({ from: fromNode.id, to: toNode.id, label: '' });
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');
        const menuWidth = 200, menuHeight = 200; // Increased height for more items
        const vpWidth = window.innerWidth, vpHeight = window.innerHeight;

        menu.style.left = `${Math.min(x, vpWidth - menuWidth)}px`;
        menu.style.top = `${Math.min(y, vpHeight - menuHeight)}px`;
        menu.classList.remove('hidden');

        const singleItems = menu.querySelectorAll('.single-node-item');
        const multiItems = menu.querySelectorAll('.multi-node-item');
        const copyForExcel = document.getElementById('copyForExcel');
        const copySelection = document.getElementById('copySelection');
        const pasteSelection = document.getElementById('pasteSelection');
        const deleteConnection = document.getElementById('deleteConnection');

        // Show/hide items based on selection count
        if (this.selectedNodes.length > 1) {
            singleItems.forEach(item => item.style.display = 'none');
            multiItems.forEach(item => item.style.display = 'block');
            if (copyForExcel) copyForExcel.style.display = 'block'; // Always show for multiple selection
            if (copySelection) copySelection.style.display = 'block';
            if (deleteConnection) deleteConnection.style.display = 'none';
        } else if (this.selectedNodes.length === 1) {
            singleItems.forEach(item => item.style.display = 'block');
            multiItems.forEach(item => {
                if (item.id === 'copyForExcel') {
                    item.style.display = 'block'; // Show copy for single selection too
                } else {
                    item.style.display = 'none';
                }
            });

            if (copySelection) copySelection.style.display = 'block';
            if (deleteConnection) deleteConnection.style.display = 'none';

            // Show/hide specific items based on node type
            const matItem = document.getElementById('addConnectedMaterial');
            const actItem = document.getElementById('addConnectedActivity');
            if (this.contextMenuNode) {
                matItem.style.display = this.contextMenuNode.type === 'activity' ? 'block' : 'none';
                actItem.style.display = this.contextMenuNode.type === 'material' ? 'block' : 'none';
            }
        } else {
            // No selection
            singleItems.forEach(item => item.style.display = 'none');
            multiItems.forEach(item => item.style.display = 'none');
            if (copyForExcel) copyForExcel.style.display = 'none'; // Hide other copy when nothing selected
            if (copySelection) copySelection.style.display = 'none';
            if (deleteConnection) deleteConnection.style.display = 'none';
            // Show paste if clipboard has items
            const clip = this.internalClipboard || this.stateManager.clipboard;
            if (pasteSelection) {
                // Always show the Paste entry on blank canvas, but mark disabled when clipboard empty
                pasteSelection.style.display = 'block';
                if (clip && clip.nodes && clip.nodes.length > 0) pasteSelection.classList.remove('disabled');
                else pasteSelection.classList.add('disabled');
            }
        }

        // If a connection was right-clicked, show connection-specific items
        if (this.contextMenuConnection) {
            // hide node-specific single-node items
            singleItems.forEach(item => item.style.display = 'none');
            multiItems.forEach(item => item.style.display = 'none');
            if (copySelection) copySelection.style.display = 'none';
            if (copyForExcel) copyForExcel.style.display = 'none';
            if (deleteConnection) deleteConnection.style.display = 'block';
            if (pasteSelection) pasteSelection.style.display = 'none';
        }
    }

    hideContextMenu() {
        document.getElementById('contextMenu').classList.add('hidden');
        this.updateCanvasCursor();
    }

    addConnectedMaterial() {
        if (!this.contextMenuNode) return;
        this.saveState();
        const base = this.contextMenuNode;
        const newNode = this.addNode('material', base.x + 150, base.y);
        if (base.type === 'activity') this.createConnection(base, newNode);
        this.hideContextMenu();
    }

    addConnectedActivity() {
        if (!this.contextMenuNode) return;
        this.saveState();
        const base = this.contextMenuNode;
        const newNode = this.addNode('activity', base.x + 150, base.y);
        if (base.type === 'material') this.createConnection(base, newNode);
        this.hideContextMenu();
    }

    editLabel() {
        if (this.contextMenuNode) {
            this.enterLabelEditMode(this.contextMenuNode);
            this.hideContextMenu();
            return;
        }
        if (this.contextMenuConnection) {
            this.enterConnectionEditMode(this.contextMenuConnection);
            this.hideContextMenu();
            return;
        }
    }

    saveEdit() {
        if (this.editingNode) {
            const input = document.getElementById('editInput');
            const newContent = input.value.trim();
            // Always apply (allow empty to become placeholder)
            const finalContent = newContent === '' ? 'Click to edit text' : newContent;
            // Compute new dimensions for textbox nodes
            if (this.editingNode.type === 'textbox') {
                const fontSize = this.editingNode.fontSize || 12;
                const dims = this.computeTextBoxDimensions(finalContent, fontSize);
                this.saveState();
                this.editingNode.label = finalContent;
                this.editingNode.width = dims.width;
                this.editingNode.height = dims.height;
                this.showStatus(`Updated content`, 'success');
                this.queueRender();
            } else {
                if (finalContent) {
                    this.saveState();
                    this.editingNode.label = finalContent;
                    this.showStatus(`Updated content`, 'success');
                    this.queueRender();
                }
            }
            // Remove live handler if present
            if (this._editInputHandler) {
                input.removeEventListener('input', this._editInputHandler);
                this._editInputHandler = null;
            }
        }
        // Handle editing a connection label
        else if (this.editingConnection) {
            const input = document.getElementById('editInput');
            const newContent = input.value.trim();
            this.saveState();
            this.editingConnection.label = newContent;
            this.showStatus('Updated connection label', 'success');
            this.queueRender();
        }
        this.cancelEdit();
    }

    cancelEdit() {
        const input = document.getElementById('editInput');
        if (this._editInputHandler && input) {
            input.removeEventListener('input', this._editInputHandler);
            this._editInputHandler = null;
        }
        const modal = document.getElementById('editModal');
        const modalContent = modal ? modal.querySelector('.modal-content') : null;
        if (modalContent) modalContent.style.minWidth = '';
        document.getElementById('editModal').classList.add('hidden');
        this.editingNode = null;
        this.editingConnection = null;
    }

    deleteSelectedNode() {
        if (this.contextMenuNode) {
            this.saveState();
            this.deleteNode(this.contextMenuNode);
            this.selectedNodes = this.selectedNodes.filter(n => n.id !== this.contextMenuNode.id);
        }
        this.contextMenuNode = null;
        this.hideContextMenu();
    }

    deleteConnectionFromContext() {
        if (this.contextMenuConnection) {
            this.saveState();
            this.deleteConnection(this.contextMenuConnection);
            if (this.selectedConnection && this.selectedConnection === this.contextMenuConnection) this.selectedConnection = null;
            this.contextMenuConnection = null;
        }
        this.hideContextMenu();
    }

    duplicateSelection() {
        if (this.selectedNodes.length === 0) return;
        this.saveState();

        const newNodes = [];
        const idMap = {};

        this.selectedNodes.forEach(node => {
            const newNode = JSON.parse(JSON.stringify(node));
            newNode.id = `node_${++this.nodeCounter}`;
            newNode.x += 20;
            newNode.y += 20;
            this.nodes.push(newNode);
            newNodes.push(newNode);
            idMap[node.id] = newNode.id;
        });

        this.connections.forEach(conn => {
            if (idMap[conn.from] && idMap[conn.to]) {
                this.connections.push({ from: idMap[conn.from], to: idMap[conn.to], label: conn.label || '' });
            }
        });

        this.selectedNodes = newNodes;
        this.hideContextMenu();
        this.queueRender();
    }

    // Copy selected nodes + internal connections to internal clipboard (for paste)
    copySelectionToClipboard() {
        if (this.selectedNodes.length === 0) {
            this.showStatus('Nothing selected to copy', 'warning');
            return;
        }
        const nodesCopy = JSON.parse(JSON.stringify(this.selectedNodes));
        const selectedIds = new Set(this.selectedNodes.map(n => n.id));
        const connsCopy = this.connections.filter(c => selectedIds.has(c.from) && selectedIds.has(c.to)).map(c => JSON.parse(JSON.stringify(c)));
        const clip = { nodes: nodesCopy, connections: connsCopy };
        // Store in both stateManager (for persistence) and local property for immediate access
        this.stateManager.clipboard = clip;
        this.internalClipboard = clip;
        // Debug info for developer troubleshooting
        if (window && window.console) console.debug('copySelectionToClipboard -> stored', clip);
        this.showStatus(`Copied ${nodesCopy.length} element(s) to clipboard`, 'success');
    }

    // Paste from internal clipboard, duplicating nodes and connections
    pasteFromClipboard() {
        const clip = this.internalClipboard || this.stateManager.clipboard;
        if (!clip || !clip.nodes || clip.nodes.length === 0) {
            this.showStatus('Clipboard is empty', 'warning');
            return;
        }

        if (window && window.console) console.debug('pasteFromClipboard -> clipboard', clip);
        this.saveState();
        const idMap = {};
        const newNodes = [];
        // Offset pasted nodes slightly so user can see duplication
        const offsetX = 20, offsetY = 20;

        clip.nodes.forEach(orig => {
            const newId = `node_${++this.nodeCounter}`;
            idMap[orig.id] = newId;
            const newNode = JSON.parse(JSON.stringify(orig));
            newNode.id = newId;
            newNode.x = (orig.x || 0) + offsetX;
            newNode.y = (orig.y || 0) + offsetY;
            this.nodes.push(newNode);
            newNodes.push(newNode);
        });

        // Recreate internal connections among pasted nodes
        if (clip.connections && clip.connections.length > 0) {
            clip.connections.forEach(c => {
                const fromNew = idMap[c.from];
                const toNew = idMap[c.to];
                if (fromNew && toNew) {
                    this.connections.push({ from: fromNew, to: toNew, label: c.label || '' });
                }
            });
        }

        this.selectedNodes = newNodes;
        this.queueRender();
        this.showStatus(`Pasted ${newNodes.length} element(s)`, 'success');
        this.saveState();
    }

    deleteSelection() {
        this.deleteSelected();
        this.hideContextMenu();
    }

    loadExample() {
        this.saveState();
        this.nodes = [];
        this.connections = [];
        this.selectedNodes = [];
        this.nodeCounter = 0;

        this.sampleData.nodes.forEach(nodeData => {
            const node = { ...nodeData };
            if (node.type === 'textbox') { 
                node.width = 120; 
                node.height = 40; 
                node.fontSize = 12; 
            }
            this.nodes.push(node);
            this.nodeCounter++;
        });

        this.connections = [...this.sampleData.connections];
        // Ensure any textboxes have computed sizes
        this.nodes.forEach(n => {
            if (n.type === 'textbox') {
                n.fontSize = n.fontSize || 12;
                const dims = this.computeTextBoxDimensions(n.label || 'Click to edit text', n.fontSize);
                n.width = dims.width;
                n.height = dims.height;
            }
        });
        this.resetZoom();
        this.showStatus('Sample supply chain loaded!', 'success');
    }

    clear() {
        this.saveState();
        this.nodes = [];
        this.connections = [];
        this.selectedNodes = [];
        this.nodeCounter = 0;
        this.resetZoom();
        this.showStatus('Canvas cleared!', 'info');
    }

    save() {
        const data = { 
            nodes: this.nodes, 
            connections: this.connections, 
            timestamp: new Date().toISOString(), 
            version: '4.0' 
        };
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `supply-chain-diagram-${new Date().toISOString().split('T')[0]}.json`);
        link.click();
        this.showStatus('Diagram saved!', 'success');
    }

    load() {
        document.getElementById('fileInput').click();
    }

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.saveState();
                const data = JSON.parse(e.target.result);
                this.nodes = data.nodes || [];
                this.connections = data.connections || [];
                
                // Fix: Calculate max ID instead of length to prevent ID collisions
                let maxId = 0;
                this.nodes.forEach(node => {
                    if (node.id && node.id.startsWith('node_')) {
                        const num = parseInt(node.id.split('_')[1], 10);
                        if (!isNaN(num) && num > maxId) {
                            maxId = num;
                        }
                    }
                });
                this.nodeCounter = maxId;

                // Ensure textboxes have computed dimensions
                this.nodes.forEach(n => {
                    if (n.type === 'textbox') {
                        n.fontSize = n.fontSize || 12;
                        const dims = this.computeTextBoxDimensions(n.label || 'Click to edit text', n.fontSize);
                        n.width = dims.width;
                        n.height = dims.height;
                    }
                });
                this.selectedNodes = [];
                this.resetZoom();
                this.showStatus('Diagram loaded successfully!', 'success');
            } catch (error) {
                this.showStatus('Error loading file! Please check file format.', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    exportPNG() {
        // Render the full canvas to an offscreen high-res canvas using the day/light theme
        const exportColors = this.getThemeColorsForScheme('light') || this.themeColors || {};

        // Create offscreen canvas
        const scaleFactor = 2; // export at higher resolution
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, Math.floor(this.canvas.width * scaleFactor));
        tempCanvas.height = Math.max(1, Math.floor(this.canvas.height * scaleFactor));
        const tctx = tempCanvas.getContext('2d');

        // High-res scaling
        tctx.scale(scaleFactor, scaleFactor);

        // Fill background using export colors
        tctx.fillStyle = exportColors.canvasSurface || '#ffffff';
        tctx.fillRect(0, 0, tempCanvas.width / scaleFactor, tempCanvas.height / scaleFactor);

        // Apply camera transform to match on-screen view
        tctx.translate(this.camera.x, this.camera.y);
        tctx.scale(this.camera.zoom, this.camera.zoom);

        // Draw grid using export colors
        this.drawGridForExport(tctx, exportColors);

        // Draw connections
        this.connections.forEach(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);
            if (fromNode && toNode) this.drawConnectionForExport(tctx, fromNode, toNode, exportColors);
        });

        // Draw nodes
        this.nodes.forEach(node => this.drawNodeForExport(tctx, node, exportColors));

        // Trigger download
        tempCanvas.toBlob(blob => {
            if (!blob) {
                this.showStatus('Failed to export PNG', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `supply-chain-diagram-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.showStatus('Diagram exported as PNG!', 'success');
        }, 'image/png', 1.0);
    }

    // Draw grid for export using explicit colors map
    drawGridForExport(ctx, colors = null) {
        const theme = colors || this.themeColors || {};
        ctx.save();
        ctx.strokeStyle = theme.grid || (this.themeColors && this.themeColors.grid) || 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;

        const gridSize = 20;
        const left = -this.camera.x / this.camera.zoom;
        const top = -this.camera.y / this.camera.zoom;
        const right = (this.canvas.width - this.camera.x) / this.camera.zoom;
        const bottom = (this.canvas.height - this.camera.y) / this.camera.zoom;

        const startX = Math.floor(left / gridSize) * gridSize;
        const startY = Math.floor(top / gridSize) * gridSize;

        for (let x = startX; x < right; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
        }

        for (let y = startY; y < bottom; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    showStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        statusText.textContent = message;
        statusText.className = `status-${type}`;
        setTimeout(() => {
            this.updateStatusText();
            statusText.className = '';
        }, 4000);
    }

    // Enhanced Copy for Excel Implementation
    getSelectionBounds() {
        if (this.selectedNodes.length === 0) return null;
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.selectedNodes.forEach(node => {
            if (node.type === 'textbox') {
                // For textboxes, use their width and height
                const halfWidth = node.width / 2;
                const halfHeight = node.height / 2;
                minX = Math.min(minX, node.x - halfWidth);
                minY = Math.min(minY, node.y - halfHeight);
                maxX = Math.max(maxX, node.x + halfWidth);
                maxY = Math.max(maxY, node.y + halfHeight);
            } else {
                // For regular nodes (circles, triangles)
                const radius = node.shape === 'circle' ? 25 : 32;
                minX = Math.min(minX, node.x - radius);
                minY = Math.min(minY, node.y - radius);
                maxX = Math.max(maxX, node.x + radius);
                maxY = Math.max(maxY, node.y + radius);
                
                // Include label area for regular nodes
                const labelY = node.y + 40;
                const labelHeight = 20;
                minY = Math.min(minY, labelY - labelHeight / 2);
                maxY = Math.max(maxY, labelY + labelHeight / 2);
            }
        });
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    copySelectionForExcel() {
        if (this.selectedNodes.length === 0) {
            this.showStatus('No elements selected to copy', 'warning');
            return;
        }

        // Calculate bounds of selection
        const bounds = this.getSelectionBounds();
        if (!bounds) return;

        // Hide context menu immediately so the user sees feedback
        this.hideContextMenu();

        // Create a temporary canvas with padding
        const tempCanvas = document.createElement('canvas');
        const padding = this.copySettings.padding;
        const scaleFactor = 2; // For high resolution output
        
        tempCanvas.width = (bounds.width + (padding * 2)) * scaleFactor;
        tempCanvas.height = (bounds.height + (padding * 2)) * scaleFactor;
        
        const tempCtx = tempCanvas.getContext('2d');
        
        // Scale for high resolution
        tempCtx.scale(scaleFactor, scaleFactor);
        
        // Use explicit light-theme colors for export so copied image matches day mode visuals
        const exportColors = this.getThemeColorsForScheme('light') || {};
        // Set white/background (no transparency) according to light theme
        tempCtx.fillStyle = exportColors.canvasSurface || this.copySettings.backgroundColor;
        tempCtx.fillRect(0, 0, tempCanvas.width / scaleFactor, tempCanvas.height / scaleFactor);
        
        // Set up transform for drawing (translate to center the selection with padding)
        tempCtx.translate(padding - bounds.x, padding - bounds.y);
        
        // Draw connections first (so they appear under nodes)
        this.connections.forEach(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);
            
         // Only draw connections where both nodes are selected
            if (fromNode && toNode && 
                this.selectedNodes.includes(fromNode) && 
                this.selectedNodes.includes(toNode)) {
                this.drawConnectionForExport(tempCtx, fromNode, toNode, conn, exportColors);
            }
        });
        
        // Draw nodes
        this.selectedNodes.forEach(node => {
            this.drawNodeForExport(tempCtx, node, exportColors);
        });
        
        // Copy to clipboard
        tempCanvas.toBlob(blob => {
            try {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    this.showStatus(`Copied ${this.selectedNodes.length} element(s) to clipboard for Excel`, 'success');
                    // ensure context menu hidden in case it was re-opened
                    this.hideContextMenu();
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                    this.showStatus('Failed to copy to clipboard. Try using a supported browser.', 'error');
                    this.hideContextMenu();
                });
            } catch (err) {
                console.error('Failed to create clipboard item:', err);
                this.showStatus('Clipboard API not supported in this browser', 'error');
                this.hideContextMenu();
            }
        }, 'image/png', 1.0);
    }

    // Helper method to draw connections for export
    drawConnectionForExport(ctx, fromNode, toNode, conn, colors = null) {
        const headLength = 12;
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        const nodeRadius = 30;
        
        // Calculate connection points
        const adjFromX = fromNode.x + nodeRadius * Math.cos(angle);
        const adjFromY = fromNode.y + nodeRadius * Math.sin(angle);
        const adjToX = toNode.x - nodeRadius * Math.cos(angle);
        const adjToY = toNode.y - nodeRadius * Math.sin(angle);
        
        const theme = colors || this.themeColors || {};
        ctx.save();
        ctx.strokeStyle = theme.arrow || (this.themeColors && this.themeColors.arrow) || '#626c71';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(adjFromX, adjFromY);
        ctx.lineTo(adjToX, adjToY);
        ctx.stroke();
        
        // Draw arrowhead
        ctx.fillStyle = theme.arrow || (this.themeColors && this.themeColors.arrow) || '#626c71';
        ctx.beginPath();
        ctx.moveTo(adjToX, adjToY);
        ctx.lineTo(
            adjToX - headLength * Math.cos(angle - Math.PI / 6),
            adjToY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            adjToX - headLength * Math.cos(angle + Math.PI / 6),
            adjToY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        // --- NEW: Draw Label Text ---
        if (conn && conn.label) {
            const midX = (adjFromX + adjToX) / 2;
            const midY = (adjFromY + adjToY) / 2;
            
            ctx.translate(midX, midY);
            ctx.rotate(angle);
            
            ctx.fillStyle = theme.text || (this.themeColors && this.themeColors.text) || '#000000';
            ctx.font = '12px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(conn.label, 0, -8);
        }
        // -----------------------------
        
        ctx.restore();
    }

    // Helper method to draw nodes for export (accept explicit colors map)
    drawNodeForExport(ctx, node, colors = null) {
        ctx.save();
        const theme = colors || this.themeColors || {};

        if (node.type === 'textbox') {
            this.drawTextBoxForExport(ctx, node, theme);
        } else {
            this.drawRegularNodeForExport(ctx, node, theme);
        }

        ctx.restore();
    }

    // Helper method to draw textboxes for export (accept explicit colors map)
    drawTextBoxForExport(ctx, node, colors = null) {
        const theme = colors || this.themeColors || {};
        // Draw textbox border
        ctx.strokeStyle = theme.text || (this.themeColors && this.themeColors.text) || '#000000';
        ctx.lineWidth = 2;
        ctx.fillStyle = theme.canvasSurface || (this.themeColors && this.themeColors.canvasSurface) || '#ffffff';

        // Draw rectangle
        ctx.fillRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height);
        ctx.strokeRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height);

        // Draw text
        ctx.fillStyle = theme.text || (this.themeColors && this.themeColors.text) || '#000000';
        ctx.font = `${node.fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Handle text wrapping
        const lines = this.wrapTextForExport(ctx, node.label, node.width - 10);
        const lineHeight = node.fontSize + 2;
        const startY = node.y - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, index) => {
            ctx.fillText(line, node.x, startY + index * lineHeight);
        });
    }

    // Helper method to draw regular nodes for export (accept explicit colors map)
    drawRegularNodeForExport(ctx, node, colors = null) {
        const theme = colors || this.themeColors || {};
        // Set colors based on node type
        const isMaterial = node.type === 'material';
        const matFill = theme.nodeMaterialFill || (this.themeColors && this.themeColors.nodeMaterialFill) || '#1fb8cd';
        const actFill = theme.nodeActivityFill || (this.themeColors && this.themeColors.nodeActivityFill) || '#ffc185';
        const matStroke = theme.nodeMaterialStroke || (this.themeColors && this.themeColors.nodeMaterialStroke) || '#127681';
        const actStroke = theme.nodeActivityStroke || (this.themeColors && this.themeColors.nodeActivityStroke) || '#b4413c';
        ctx.fillStyle = isMaterial ? matFill : actFill;
        ctx.strokeStyle = isMaterial ? matStroke : actStroke;
        ctx.lineWidth = 2;

        // Draw node shape
        ctx.beginPath();
        if (node.shape === 'triangle') {
            this.drawTriangleForExport(ctx, node.x, node.y, 32);
        } else {
            ctx.arc(node.x, node.y, 25, 0, 2 * Math.PI);
        }
        ctx.fill();
        ctx.stroke();

        // Draw label
        ctx.fillStyle = theme.text || (this.themeColors && this.themeColors.text) || '#13343b';
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Handle text wrapping for labels
        const lines = this.wrapTextForExport(ctx, node.label, 100);
        const lineHeight = 14;
        const startY = node.y + 40;

        lines.forEach((line, index) => {
            ctx.fillText(line, node.x, startY + index * lineHeight);
        });
    }

    // Helper method to draw triangles for export
    drawTriangleForExport(ctx, x, y, size) {
        const h = size * Math.sqrt(3) / 2;
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x - size / 2, y + h / 2);
        ctx.lineTo(x + size / 2, y + h / 2);
        ctx.closePath();
    }

    // Helper method for text wrapping in export
    wrapTextForExport(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    // Compute width/height for a textbox given its text and font size.
    computeTextBoxDimensions(text, fontSize = 12, maxWidth = 420) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = `${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
        ctx.font = font;

        // Break into manual lines, then wrap each according to maxWidth
        const manualLines = text.split('\n');
        const padding = 10; // internal padding left/right
        let measuredMax = 0;
        let totalLines = 0;

        for (const manual of manualLines) {
            const lines = this.wrapTextForExport(ctx, manual, maxWidth - padding * 2);
            totalLines += lines.length;
            for (const l of lines) measuredMax = Math.max(measuredMax, ctx.measureText(l).width);
        }

        const finalWidth = Math.max(80, Math.min(maxWidth, Math.ceil(measuredMax + padding * 2)));
        const lineHeight = fontSize + 2;
        const finalHeight = Math.max(28, Math.ceil(totalLines * lineHeight + padding * 2));

        const result = { width: finalWidth, height: finalHeight, lineHeight, lines: totalLines };
        // Small debug log to help verify resizing behavior in the browser console
        if (window && window.console && window.console.debug) {
            console.debug('computeTextBoxDimensions', { text, fontSize, result });
        }
        return result;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.supplyChainCanvas = new SupplyChainCanvas();
});
