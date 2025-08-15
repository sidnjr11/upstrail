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

class NLPParser {
    constructor() {
        this.patterns = {
            quantities: ['one', 'two', 'three', 'four', 'five', 'multiple', 'several', 'many', 'a few'],
            numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
            locations: {
                suppliers: ['supplier', 'vendor', 'source'],
                production: ['plant', 'factory', 'manufacturing facility', 'production site','Manufacturing location'],
                distribution: ['distribution center', 'dc', 'warehouse', 'depot', 'hub','sales center', 'JDC'],
                retail: ['store', 'shop', 'retail', 'outlet', 'customer']
            },
            materials: ['raw material', 'finished good', 'item', 'product', 'goods', 'material', 'component', 'part', 'inventory'],
            activities: ['Bom','routing','Sent','Being Sent','consumed in a bom', 'produce', 'distributed', 'manufacturing', 'production', 'assembly', 'processing', 'transportation', 'shipping', 'delivery', 'logistics', 'distribution','Procured','produced'.'purchased']
        };
    }

    parse(text) {
        const lowerText = text.toLowerCase();
        return {
            quantities: this.extractQuantities(lowerText),
            locations: this.extractLocations(lowerText),
            materials: this.extractMaterials(lowerText),
            activities: this.extractActivities(lowerText),
            flows: this.extractFlows(lowerText)
        };
    }

    extractQuantities(text) {
        const quantities = [];
        this.patterns.quantities.forEach(q => {
            if (text.includes(q)) quantities.push(q);
        });
        this.patterns.numbers.forEach(n => {
            if (text.includes(n)) quantities.push(parseInt(n));
        });
        return quantities;
    }

    extractLocations(text) {
        const locations = { suppliers: [], production: [], distribution: [], retail: [] };
        Object.keys(this.patterns.locations).forEach(category => {
            this.patterns.locations[category].forEach(loc => {
                if (text.includes(loc)) {
                    locations[category].push(loc);
                }
            });
        });
        return locations;
    }

    extractMaterials(text) {
        const materials = [];
        this.patterns.materials.forEach(mat => {
            if (text.includes(mat)) materials.push(mat);
        });
        const itemMatches = text.match(/(item|product|material)\s+[a-z]/gi);
        if (itemMatches) {
            materials.push(...itemMatches);
        }
        return materials;
    }

    extractActivities(text) {
        const activities = [];
        this.patterns.activities.forEach(act => {
            if (text.includes(act)) activities.push(act);
        });
        return activities;
    }

    extractFlows(text) {
        const flows = [];
        if (text.includes('from') && text.includes('to')) {
            flows.push('from-to');
        }
        if (text.includes('between')) {
            flows.push('between');
        }
        if (text.includes('then')) {
            flows.push('then');
        }
        return flows;
    }
}


class SupplyChainCanvas {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.hoveredNode = null;
        this.currentTool = 'select'; // Default is always select
        this.isDragging = false;
        this.isDraggingElement = false;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null;
        this.nodeCounter = 0;
        this.contextMenuNode = null;
        this.editingNode = null;
        this.draggedToolType = null;
        this.mousePos = { x: 0, y: 0 };

        // Enhanced systems
        this.stateManager = new StateManager();
        this.nlpParser = new NLPParser();

        // Rendering optimization
        this.isRendering = false;

        // Sample data
        this.sampleData = {
            nodes: [
                {id: "m1", type: "material", label: "Raw Materials", x: 100, y: 150, shape: "triangle"},
                {id: "a1", type: "activity", label: "Manufacturing", x: 250, y: 150, shape: "circle"},
                {id: "m2", type: "material", label: "Finished Goods", x: 400, y: 150, shape: "triangle"},
                {id: "a2", type: "activity", label: "Distribution", x: 550, y: 150, shape: "circle"},
                {id: "m3", type: "material", label: "Retail Store", x: 700, y: 150, shape: "triangle"}
            ],
            connections: [
                {from: "m1", to: "a1"},
                {from: "a1", to: "m2"},
                {from: "m2", to: "a2"},
                {from: "a2", to: "m3"}
            ]
        };

        this.initEventListeners();
        this.setupDragAndDrop();
        this.updateDebugInfo();
        this.saveInitialState();
        this.queueRender();
    }

    saveInitialState() {
        this.stateManager.saveState({
            nodes: this.nodes,
            connections: this.connections,
            nodeCounter: this.nodeCounter
        });
    }

    saveState() {
        this.stateManager.saveState({
            nodes: this.nodes,
            connections: this.connections,
            nodeCounter: this.nodeCounter
        });
    }

    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
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
        // Set up drag-only tools - FIXED: Remove all click handlers
        ['material', 'activity', 'textbox'].forEach(toolType => {
            const toolBtn = document.getElementById(`${toolType}Tool`);

            // FIXED: Prevent any click behavior
            toolBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            });

            toolBtn.addEventListener('dragstart', (e) => {
                this.draggedToolType = toolType;
                e.dataTransfer.effectAllowed = 'copy';

                // Create drag data
                const dragData = {
                    type: toolType,
                    label: this.getDefaultLabel(toolType)
                };
                e.dataTransfer.setData('application/json', JSON.stringify(dragData));

                this.showStatus(`Dragging ${toolType}. Drop on canvas to create.`, 'info');
            });

            toolBtn.addEventListener('dragend', () => {
                this.draggedToolType = null;
                this.canvas.parentElement.parentElement.classList.remove('drag-over');
            });
        });

        // Set up canvas drop zone - FIXED: Proper event handling
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.canvas.parentElement.parentElement.classList.add('drag-over');
        });

        this.canvas.addEventListener('dragleave', (e) => {
            // Only remove drag-over if we're actually leaving the canvas
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
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
                this.showStatus(`Created ${newNode.label} at (${Math.round(pos.x)}, ${Math.round(pos.y)})`, 'success');
            }
        });
    }

    getDefaultLabel(type) {
        const labels = {
            material: `Material ${this.nodeCounter + 1}`,
            activity: `Activity ${this.nodeCounter + 1}`,
            textbox: 'Click to edit text'
        };
        return labels[type];
    }

    initEventListeners() {
        // Only clickable tools - Connect and Delete
        document.getElementById('connectTool').addEventListener('click', () => {
            this.setTool('connect');
        });

        document.getElementById('deleteTool').addEventListener('click', () => {
            this.setTool('delete');
        });

        // Canvas events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Header buttons
        document.getElementById('undoBtn').addEventListener('click', this.undo.bind(this));
        document.getElementById('saveBtn').addEventListener('click', this.save.bind(this));
        document.getElementById('loadBtn').addEventListener('click', this.load.bind(this));
        document.getElementById('exportBtn').addEventListener('click', this.exportPNG.bind(this));
        document.getElementById('clearBtn').addEventListener('click', this.clear.bind(this));
        document.getElementById('loadExampleBtn').addEventListener('click', this.loadExample.bind(this));
        document.getElementById('generateBtn').addEventListener('click', this.generateFromNL.bind(this));

        // Context menu
        document.getElementById('addConnectedMaterial').addEventListener('click', this.addConnectedMaterial.bind(this));
        document.getElementById('addConnectedActivity').addEventListener('click', this.addConnectedActivity.bind(this));
        document.getElementById('editLabel').addEventListener('click', this.editLabel.bind(this));
        document.getElementById('deleteNode').addEventListener('click', this.deleteSelectedNode.bind(this));

        // Edit modal
        document.getElementById('saveEditBtn').addEventListener('click', this.saveEdit.bind(this));
        document.getElementById('cancelEditBtn').addEventListener('click', this.cancelEdit.bind(this));

        // File input
        document.getElementById('fileInput').addEventListener('change', this.handleFileLoad.bind(this));

        // Global click handler
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');
            const editModal = document.getElementById('editModal');

            if (!contextMenu.contains(e.target) && !e.target.closest('canvas') && !contextMenu.classList.contains('hidden')) {
                this.hideContextMenu();
            }

            if (e.target === editModal) {
                this.cancelEdit();
            }
        });
    }

    handleKeyDown(e) {
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

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    this.undo();
                    break;
                case 'x':
                    e.preventDefault();
                    this.cutSelected();
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
    }

    setTool(toolName) {
        // Remove active state from all clickable tools
        document.querySelectorAll('#connectTool, #deleteTool').forEach(btn => {
            btn.classList.remove('active');
        });

        // Set active state for current tool
        if (toolName !== 'select') {
            const toolBtn = document.getElementById(`${toolName}Tool`);
            if (toolBtn) {
                toolBtn.classList.add('active');
            }
        }

        this.currentTool = toolName;
        this.connectingFrom = null;
        this.updateCanvasCursor();
        this.updateStatusText();
        this.queueRender();
    }

    deselectAll() {
        this.selectedNode = null;
        this.connectingFrom = null;
        this.hideContextMenu();
        this.queueRender();
    }

    deleteSelected() {
        if (this.selectedNode) {
            this.saveState();
            this.deleteNode(this.selectedNode);
            this.selectedNode = null;
        }
    }

    cutSelected() {
        if (this.selectedNode) {
            this.stateManager.clipboard = JSON.parse(JSON.stringify(this.selectedNode));
            this.saveState();
            this.deleteNode(this.selectedNode);
            this.selectedNode = null;
            this.showStatus('Element cut to clipboard', 'success');
        }
    }

    undo() {
        const previousState = this.stateManager.undo();
        if (previousState) {
            this.nodes = JSON.parse(JSON.stringify(previousState.nodes));
            this.connections = JSON.parse(JSON.stringify(previousState.connections));
            this.nodeCounter = previousState.nodeCounter;
            this.selectedNode = null;
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
        container.className = container.className.replace(/tool-\w+/g, '');

        if (this.currentTool === 'connect') {
            container.classList.add('tool-connect');
        } else if (this.currentTool === 'delete') {
            container.classList.add('tool-delete');
        }

        if (this.isDraggingElement) {
            container.classList.add('dragging');
        }
    }

    updateStatusText() {
        const statusMap = {
            select: 'Default mode: Click and drag elements to move. Click element labels to edit names. Click inside text boxes to edit content.',
            connect: 'Connect mode: Click and drag between elements to create connections. Valid: Material ↔ Activity only.',
            delete: 'Delete mode: Click elements or connections to delete them.'
        };
        document.getElementById('statusText').textContent = statusMap[this.currentTool] || statusMap.select;
    }

    updateDragStatus(status) {
        document.getElementById('dragStatus').textContent = status;
    }

    handleMouseDown(e) {
        this.hideContextMenu();

        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);

        switch (this.currentTool) {
            case 'select':
                if (clickedNode) {
                    // Check if clicking on label area for editing
                    if (this.isClickOnLabel(pos, clickedNode)) {
                        this.enterLabelEditMode(clickedNode);
                        return;
                    }

                    // Normal selection and dragging - FIXED
                    this.selectedNode = clickedNode;
                    this.isDraggingElement = true;

                    this.dragOffset = {
                        x: pos.x - clickedNode.x,
                        y: pos.y - clickedNode.y
                    };

                    this.updateCanvasCursor();
                    this.updateDragStatus('Moving: ' + clickedNode.label);
                } else {
                    this.selectedNode = null;
                    this.connectingFrom = null;
                    this.updateDragStatus('Ready');
                }
                break;

            case 'connect':
                if (clickedNode) {
                    if (!this.connectingFrom) {
                        this.connectingFrom = clickedNode;
                        this.selectedNode = clickedNode;
                        this.isDragging = true;
                        this.showStatus(`Selected ${clickedNode.label}. Drag to another node to connect.`, 'info');
                    } else if (this.connectingFrom !== clickedNode) {
                        if (this.createConnection(this.connectingFrom, clickedNode)) {
                            this.setTool('select'); // Return to select after connecting
                        }
                    } else {
                        this.connectingFrom = null;
                        this.selectedNode = null;
                        this.showStatus('Connection cancelled.', 'info');
                    }
                } else {
                    this.connectingFrom = null;
                    this.selectedNode = null;
                }
                break;

            case 'delete':
                if (clickedNode) {
                    this.saveState();
                    this.deleteNode(clickedNode);
                    this.setTool('select'); // Return to select after deleting
                } else {
                    const connection = this.getConnectionAt(pos.x, pos.y);
                    if (connection) {
                        this.saveState();
                        this.deleteConnection(connection);
                        this.setTool('select'); // Return to select after deleting
                    }
                }
                break;
        }

        this.queueRender();
    }

    isClickOnLabel(pos, node) {
        if (node.type === 'textbox') return false; // Textbox labels aren't editable via this method

        const labelY = node.y + 40;
        const labelHeight = 20;
        const labelWidth = 100;

        return pos.x >= node.x - labelWidth/2 &&
               pos.x <= node.x + labelWidth/2 &&
               pos.y >= labelY - labelHeight/2 &&
               pos.y <= labelY + labelHeight/2;
    }

    isInsideTextBox(pos, node) {
        if (node.type !== 'textbox') return false;

        return pos.x >= node.x - node.width/2 &&
               pos.x <= node.x + node.width/2 &&
               pos.y >= node.y - node.height/2 &&
               pos.y <= node.y + node.height/2;
    }

    enterLabelEditMode(node) {
        this.editingNode = node;
        this.selectedNode = node;

        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');

        document.querySelector('#editModal h3').textContent = 'Edit Label';
        input.value = node.label;
        modal.classList.remove('hidden');

        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);

        this.queueRender();
    }

    enterTextEditMode(node) {
        this.editingNode = node;
        this.selectedNode = node;

        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');

        document.querySelector('#editModal h3').textContent = 'Edit Text Content';
        input.value = node.label === 'Click to edit text' ? '' : node.label;
        modal.classList.remove('hidden');

        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);

        this.queueRender();
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        const hoveredNode = this.getNodeAt(pos.x, pos.y);

        if (this.hoveredNode !== hoveredNode) {
            this.hoveredNode = hoveredNode;
            this.queueRender();
        }

        // Handle dragging in connect mode
        if (this.currentTool === 'connect' && this.connectingFrom && this.isDragging) {
            this.queueRender();
            return;
        }

        // Handle node dragging in select mode - FIXED
        if (this.isDraggingElement && this.selectedNode && this.currentTool === 'select') {
            this.selectedNode.x = pos.x - this.dragOffset.x;
            this.selectedNode.y = pos.y - this.dragOffset.y;

            // Keep nodes within canvas bounds
            const margin = this.selectedNode.type === 'textbox' ? 60 : 32;
            this.selectedNode.x = Math.max(margin, Math.min(this.canvas.width - margin, this.selectedNode.x));
            this.selectedNode.y = Math.max(margin, Math.min(this.canvas.height - margin, this.selectedNode.y));

            this.queueRender();
        }
    }

    handleMouseUp(e) {
        // Save state after moving in select mode - FIXED
        if (this.isDraggingElement && this.selectedNode && this.currentTool === 'select') {
            this.saveState();
        }

        // Handle connection creation in connect mode
        if (this.currentTool === 'connect' && this.connectingFrom && this.isDragging) {
            const pos = this.getMousePos(e);
            const targetNode = this.getNodeAt(pos.x, pos.y);

            if (targetNode && targetNode !== this.connectingFrom) {
                if (this.createConnection(this.connectingFrom, targetNode)) {
                    this.setTool('select'); // Return to select after connecting
                }
            }
            this.isDragging = false;
        }

        this.isDraggingElement = false;
        this.updateCanvasCursor();
        this.updateDragStatus('Ready');
    }

    handleRightClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);

        if (clickedNode) {
            this.contextMenuNode = clickedNode;
            this.selectedNode = clickedNode;
            this.showContextMenu(e.clientX, e.clientY);
            this.queueRender();
        } else {
            this.deselectAll();
            this.showStatus('Right-click on elements for options. Drag tools from sidebar to create new elements.', 'info');
        }
    }

    handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos.x, pos.y);

        if (clickedNode) {
            if (clickedNode.type === 'textbox') {
                this.enterTextEditMode(clickedNode);
            } else {
                this.enterLabelEditMode(clickedNode);
            }
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
            type: type,
            shape: this.getNodeShape(type),
            label: label || defaultLabels[type],
            x: x,
            y: y
        };

        if (type === 'textbox') {
            node.width = 120;
            node.height = 40;
            node.fontSize = 12;
        }

        this.nodes.push(node);
        this.selectedNode = node;
        this.queueRender();
        return node;
    }

    getNodeShape(type) {
        const shapes = {
            material: 'triangle',
            activity: 'circle',
            textbox: 'rectangle'
        };
        return shapes[type] || 'circle';
    }

    createConnection(fromNode, toNode) {
        if (!this.canConnect(fromNode, toNode)) {
            this.showStatus(`Invalid connection! ${fromNode.type} cannot connect to ${toNode.type}`, 'error');
            return false;
        }

        const existingConnection = this.connections.find(conn =>
            (conn.from === fromNode.id && conn.to === toNode.id) ||
            (conn.from === toNode.id && conn.to === fromNode.id)
        );

        if (existingConnection) {
            this.showStatus('Connection already exists!', 'warning');
            return false;
        }

        this.saveState();
        this.connections.push({
            from: fromNode.id,
            to: toNode.id
        });

        this.showStatus(`Connected ${fromNode.label} → ${toNode.label}`, 'success');
        this.connectingFrom = null;
        return true;
    }

    canConnect(nodeA, nodeB) {
        if (nodeA.type === 'textbox' || nodeB.type === 'textbox') {
            return true;
        }
        return nodeA.type !== nodeB.type;
    }

    getNodeAt(x, y) {
        // Check in reverse order to get topmost elements first
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (node.type === 'textbox') {
                if (x >= node.x - node.width/2 && x <= node.x + node.width/2 &&
                    y >= node.y - node.height/2 && y <= node.y + node.height/2) {
                    return node;
                }
            } else {
                const dx = x - node.x;
                const dy = y - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= 32) { // Larger triangles
                    return node;
                }
            }
        }
        return null;
    }

    getConnectionAt(x, y) {
        const threshold = 10;
        return this.connections.find(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return false;

            const distance = this.distanceToLine(x, y, fromNode.x, fromNode.y, toNode.x, toNode.y);
            return distance <= threshold;
        });
    }

    distanceToLine(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        const param = lenSq !== 0 ? dot / lenSq : -1;

        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    deleteNode(node) {
        this.nodes = this.nodes.filter(n => n.id !== node.id);
        this.connections = this.connections.filter(conn =>
            conn.from !== node.id && conn.to !== node.id
        );
        this.selectedNode = null;
        this.showStatus(`Deleted ${node.label}`, 'success');
        this.queueRender();
    }

    deleteConnection(connection) {
        const fromNode = this.nodes.find(n => n.id === connection.from);
        const toNode = this.nodes.find(n => n.id === connection.to);
        this.connections = this.connections.filter(conn => conn !== connection);
        this.showStatus(`Deleted connection ${fromNode?.label} → ${toNode?.label}`, 'success');
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

        this.drawGrid();
        this.drawConnections();
        this.drawNodes();
        this.drawConnectionPreview();
    }

    drawGrid() {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;

        const gridSize = 20;

        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawConnectionPreview() {
        if (this.currentTool === 'connect' && this.connectingFrom && this.isDragging) {
            this.ctx.save();
            this.ctx.strokeStyle = '#007bff';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);

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

            const isSelected = this.selectedNode === node;
            const isConnecting = this.connectingFrom === node;

            if (node.type === 'textbox') {
                this.drawTextBox(node, isSelected);
            } else {
                this.drawRegularNode(node, isSelected, isConnecting);
            }

            this.ctx.restore();
        });
    }

    drawTextBox(node, isSelected) {
        // Transparent background with black outline
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = isSelected ? 3 : 2;

        if (isSelected) {
            this.ctx.shadowColor = '#000000';
            this.ctx.shadowBlur = 10;
        }

        this.ctx.strokeRect(
            node.x - node.width/2,
            node.y - node.height/2,
            node.width,
            node.height
        );

        // Draw text
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${node.fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.wrapText(node.label, node.width - 10);
        const lineHeight = node.fontSize + 2;
        const startY = node.y - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, index) => {
            this.ctx.fillText(line, node.x, startY + index * lineHeight);
        });
    }

    drawRegularNode(node, isSelected, isConnecting) {
        if (node.type === 'material') {
            this.ctx.fillStyle = isSelected || isConnecting ? '#21808d' : '#1fb8cd';
            this.ctx.strokeStyle = '#127681';
        } else {
            this.ctx.fillStyle = isSelected || isConnecting ? '#d45b3a' : '#ffc185';
            this.ctx.strokeStyle = '#b4413c';
        }

        this.ctx.lineWidth = isSelected || isConnecting ? 3 : 2;

        if (isSelected || isConnecting) {
            this.ctx.shadowColor = this.ctx.fillStyle;
            this.ctx.shadowBlur = 10;
        }

        this.ctx.beginPath();
        if (node.shape === 'triangle') {
            this.drawTriangle(node.x, node.y, 32); // Larger triangles
        } else {
            this.drawCircle(node.x, node.y, 25);
        }
        this.ctx.fill();
        this.ctx.stroke();

        // Draw label
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#13343b';
        this.ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.wrapText(node.label, 100);
        const lineHeight = 14;
        const startY = node.y + 40;

        lines.forEach((line, index) => {
            this.ctx.fillText(line, node.x, startY + index * lineHeight);
        });
    }

    wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = this.ctx.measureText(testLine);
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

    drawConnections() {
        this.connections.forEach(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);

            if (fromNode && toNode) {
                this.drawArrow(fromNode.x, fromNode.y, toNode.x, toNode.y);
            }
        });
    }

    drawTriangle(x, y, size) {
        const height = size * Math.sqrt(3) / 2;
        this.ctx.moveTo(x, y - height / 2);
        this.ctx.lineTo(x - size / 2, y + height / 2);
        this.ctx.lineTo(x + size / 2, y + height / 2);
        this.ctx.closePath();
    }

    drawCircle(x, y, radius) {
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    }

    drawArrow(fromX, fromY, toX, toY) {
        const headLength = 12;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        const nodeRadius = 30;
        const adjustedFromX = fromX + nodeRadius * Math.cos(angle);
        const adjustedFromY = fromY + nodeRadius * Math.sin(angle);
        const adjustedToX = toX - nodeRadius * Math.cos(angle);
        const adjustedToY = toY - nodeRadius * Math.sin(angle);

        this.ctx.save();
        this.ctx.strokeStyle = '#626c71';
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        this.ctx.moveTo(adjustedFromX, adjustedFromY);
        this.ctx.lineTo(adjustedToX, adjustedToY);
        this.ctx.stroke();

        this.ctx.fillStyle = '#626c71';
        this.ctx.beginPath();
        this.ctx.moveTo(adjustedToX, adjustedToY);
        this.ctx.lineTo(
            adjustedToX - headLength * Math.cos(angle - Math.PI / 6),
            adjustedToY - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            adjustedToX - headLength * Math.cos(angle + Math.PI / 6),
            adjustedToY - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }

    generateFromNL() {
        const input = document.getElementById('nlInput').value.trim();
        if (!input) {
            this.showStatus('Please enter a description first!', 'warning');
            return;
        }

        this.saveState();

        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.connectingFrom = null;
        this.nodeCounter = 0;

												   
        this.generateFromParsedData(input);

        this.queueRender();
        this.showStatus('Enhanced diagram generated from natural language!', 'success');
        document.getElementById('nlInput').value = '';
    }

    generateFromParsedData(originalInput) {
        const lowerInput = originalInput.toLowerCase();

        if (lowerInput.includes('two raw materials') && lowerInput.includes('consumed in a bom to produce a finished good') && lowerInput.includes('distributed to a dc')) {
            const rawMaterial1 = this.addNode('material', 100, 150, 'Raw Material 1');
            const rawMaterial2 = this.addNode('material', 100, 300, 'Raw Material 2');
            const production = this.addNode('activity', 300, 225, 'Production');
            const finishedGood = this.addNode('material', 500, 225, 'Finished Good');
            const distribution = this.addNode('activity', 700, 225, 'Distribution');
            const dc = this.addNode('material', 900, 225, 'Distribution Center');
												
												
																															
		 

            this.createConnectionDirect(rawMaterial1, production);
            this.createConnectionDirect(rawMaterial2, production);
            this.createConnectionDirect(production, finishedGood);
            this.createConnectionDirect(finishedGood, distribution);
            this.createConnectionDirect(distribution, dc);
														 
        } else {
            const parsed = this.nlpParser.parse(lowerInput);
            let quantity = 2;
            if (parsed.quantities.length > 0) {
                const q = parsed.quantities[0];
                if (typeof q === 'number') quantity = q;
                else if (q === 'one') quantity = 1;
                else if (q === 'two') quantity = 2;
                else if (q === 'three') quantity = 3;
                else if (q === 'four') quantity = 4;
                else if (q === 'five') quantity = 5;
                else if (['multiple', 'several', 'many'].includes(q)) quantity = Math.max(2, Math.floor(Math.random() * 4) + 2);
            }

            if (lowerInput.includes('two plants') && lowerInput.includes('distribution')) {
                this.generateTwoPlantsToDC();
            } else if (lowerInput.includes('supplier') && lowerInput.includes('factories')) {
                this.generateSupplierToFactories(quantity);
            } else if (lowerInput.includes('transportation') && lowerInput.includes('multiple')) {
                this.generateTransportationNetwork(quantity);
            } else {
                this.generateVariedChain(quantity);
            }
        }
    }

    generateTwoPlantsToDC() {
        const plant1 = this.addNode('material', 100, 150, 'Item A @ Plant 1');
        const plant2 = this.addNode('material', 100, 300, 'Item A @ Plant 2');

        const truck1 = this.addNode('activity', 300, 150, 'Transport 1');
        const truck2 = this.addNode('activity', 300, 300, 'Transport 2');

        const dc = this.addNode('material', 500, 225, 'Items @ DC');

        this.createConnectionDirect(plant1, truck1);
        this.createConnectionDirect(plant2, truck2);
        this.createConnectionDirect(truck1, dc);
        this.createConnectionDirect(truck2, dc);
    }

    createConnectionDirect(fromNode, toNode) {
        this.connections.push({
            from: fromNode.id,
            to: toNode.id
        });
    }

    generateSupplierToFactories(count) {
        const supplier = this.addNode('material', 100, 200, 'Supplier Materials');
        const procurement = this.addNode('activity', 250, 200, 'Procurement');

        this.createConnectionDirect(supplier, procurement);

        for (let i = 0; i < Math.min(count, 4); i++) {
            const y = 120 + i * 80;
            const factory = this.addNode('material', 400, y, `Factory ${i + 1}`);
            const manufacturing = this.addNode('activity', 550, y, `Manufacturing ${i + 1}`);
            const product = this.addNode('material', 700, y, `Product ${i + 1}`);

            this.createConnectionDirect(procurement, factory);
            this.createConnectionDirect(factory, manufacturing);
            this.createConnectionDirect(manufacturing, product);
        }
    }

    generateTransportationNetwork(count) {
        const warehouse = this.addNode('material', 150, 200, 'Central Warehouse');
        const shipping = this.addNode('activity', 300, 200, 'Shipping Hub');

        this.createConnectionDirect(warehouse, shipping);

        for (let i = 0; i < Math.min(count, 5); i++) {
            const angle = (i / count) * 2 * Math.PI;
            const radius = 150;
            const x = 500 + radius * Math.cos(angle);
            const y = 200 + radius * Math.sin(angle);

            const transport = this.addNode('activity', x - 50, y, `Transport ${i + 1}`);
            const store = this.addNode('material', x + 50, y, `Store ${i + 1}`);

            this.createConnectionDirect(shipping, transport);
            this.createConnectionDirect(transport, store);
        }
    }

    generateVariedChain(quantity) {
        let x = 100;
        let lastNode = null;

        for (let i = 0; i < quantity + 2; i++) {
            const nodeType = i % 2 === 0 ? 'material' : 'activity';
            const node = this.addNode(nodeType, x, 200);

            if (lastNode) {
                this.createConnectionDirect(lastNode, node);
            }

            lastNode = node;
            x += 150;
        }
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');

        const menuWidth = 180;
        const menuHeight = 120;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let menuX = Math.min(x, viewportWidth - menuWidth);
        let menuY = Math.min(y, viewportHeight - menuHeight);

        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.classList.remove('hidden');

        const materialItem = document.getElementById('addConnectedMaterial');
        const activityItem = document.getElementById('addConnectedActivity');

        if (this.contextMenuNode) {
            materialItem.style.display = this.contextMenuNode.type === 'activity' ? 'block' : 'none';
            activityItem.style.display = this.contextMenuNode.type === 'material' ? 'block' : 'none';
        }
    }

    hideContextMenu() {
        document.getElementById('contextMenu').classList.add('hidden');
    }

    addConnectedMaterial() {
        if (!this.contextMenuNode) return;

        this.saveState();
        const baseNode = this.contextMenuNode;
        const newX = Math.min(baseNode.x + 150, this.canvas.width - 50);
        const newY = baseNode.y;

        const newNode = this.addNode('material', newX, newY);

        if (baseNode.type === 'activity') {
            this.createConnection(baseNode, newNode);
        }

        this.hideContextMenu();
    }

    addConnectedActivity() {
        if (!this.contextMenuNode) return;

        this.saveState();
        const baseNode = this.contextMenuNode;
        const newX = Math.min(baseNode.x + 150, this.canvas.width - 50);
        const newY = baseNode.y;

        const newNode = this.addNode('activity', newX, newY);

        if (baseNode.type === 'material') {
            this.createConnection(baseNode, newNode);
        }

        this.hideContextMenu();
    }

    editLabel() {
        if (!this.contextMenuNode) return;

        const modal = document.getElementById('editModal');
        const input = document.getElementById('editInput');

        this.editingNode = this.contextMenuNode;
        input.value = this.contextMenuNode.label;
        modal.classList.remove('hidden');

        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);

        this.hideContextMenu();
    }

    saveEdit() {
        if (this.editingNode) {
            const newContent = document.getElementById('editInput').value.trim();
            if (newContent) {
                this.saveState();
                const oldContent = this.editingNode.label;
                this.editingNode.label = newContent;
                this.showStatus(`Updated content`, 'success');
                this.queueRender();
            }
        }
        this.cancelEdit();
    }

    cancelEdit() {
        document.getElementById('editModal').classList.add('hidden');
        this.editingNode = null;
    }

    deleteSelectedNode() {
        if (this.contextMenuNode) {
            this.saveState();
            this.deleteNode(this.contextMenuNode);
        }
        this.hideContextMenu();
    }

    loadExample() {
        this.saveState();

        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.connectingFrom = null;
        this.contextMenuNode = null;
        this.nodeCounter = 0;

        this.sampleData.nodes.forEach(nodeData => {
            const node = {
                id: nodeData.id,
                type: nodeData.type,
                shape: nodeData.shape,
                label: nodeData.label,
                x: nodeData.x,
                y: nodeData.y
            };

            if (nodeData.type === 'textbox') {
                node.width = 120;
                node.height = 40;
                node.fontSize = 12;
            }

            this.nodes.push(node);
            this.nodeCounter++;
        });

        this.connections = [...this.sampleData.connections];

        this.updateCanvasCursor();
        this.updateDragStatus('Ready');
        this.queueRender();
        this.showStatus('Sample supply chain loaded!', 'success');
    }

    clear() {
        this.saveState();
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.connectingFrom = null;
        this.contextMenuNode = null;
        this.editingNode = null;
        this.nodeCounter = 0;
        this.isDraggingElement = false;
        this.setTool('select');
        this.hideContextMenu();
        this.cancelEdit();
        this.updateDragStatus('Ready');
        this.updateCanvasCursor();
        this.queueRender();
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
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

        const exportFileDefaultName = `enhanced-supply-chain-${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        this.showStatus('Enhanced diagram saved!', 'success');
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
                this.nodeCounter = this.nodes.length;
                this.selectedNode = null;
                this.connectingFrom = null;
                this.queueRender();
                this.showStatus('Diagram loaded successfully!', 'success');
            } catch (error) {
                this.showStatus('Error loading file! Please check file format.', 'error');
            }
        };
        reader.readAsText(file);

        e.target.value = '';
    }

    exportPNG() {
        const link = document.createElement('a');
        link.download = `enhanced-supply-chain-${new Date().toISOString().split('T')[0]}.png`;
        link.href = this.canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showStatus('Enhanced diagram exported as PNG!', 'success');
    }

    showStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        const originalClass = statusText.className;

        statusText.textContent = message;
        statusText.className = `status-${type}`;

        setTimeout(() => {
            this.updateStatusText();
            statusText.className = originalClass;
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.supplyChainCanvas = new SupplyChainCanvas();
});
