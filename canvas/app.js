class SupplyChainCanvas {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.currentTool = 'select';
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null;
        this.nodeCounter = 0;
        this.contextMenuNode = null;
        
        // Sample data from the provided JSON
        this.sampleData = {
            nodes: [
                {id: "m1", type: "material", label: "Raw Materials", x: 150, y: 200, shape: "triangle"},
                {id: "a1", type: "activity", label: "Manufacturing", x: 300, y: 200, shape: "circle"},
                {id: "m2", type: "material", label: "Finished Goods", x: 450, y: 200, shape: "triangle"},
                {id: "a2", type: "activity", label: "Distribution", x: 600, y: 200, shape: "circle"},
                {id: "m3", type: "material", label: "Retail Store", x: 750, y: 200, shape: "triangle"}
            ],
            connections: [
                {from: "m1", to: "a1"},
                {from: "a1", to: "m2"},
                {from: "m2", to: "a2"},
                {from: "a2", to: "m3"}
            ]
        };
        
        this.initEventListeners();
        this.draw();
    }
    
    initEventListeners() {
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.updateCanvasCursor();
                this.updateStatusText();
                
                // Reset connecting state when switching tools
                if (this.currentTool !== 'connect') {
                    this.connectingFrom = null;
                }
                this.draw(); // Redraw to update visual state
            });
        });
        
        // Canvas events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Header buttons
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
        
        // Global click handler to hide context menu and modal
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');
            const editModal = document.getElementById('editModal');
            
            // Hide context menu if clicking outside of it
            if (!contextMenu.contains(e.target) && 
                !e.target.closest('canvas') && 
                !contextMenu.classList.contains('hidden')) {
                this.hideContextMenu();
            }
            
            // Hide modal if clicking outside of modal content
            if (e.target === editModal) {
                this.cancelEdit();
            }
        });
        
        // Handle Enter and Escape keys in edit modal
        document.addEventListener('keydown', (e) => {
            const editModal = document.getElementById('editModal');
            if (!editModal.classList.contains('hidden')) {
                if (e.key === 'Enter') {
                    this.saveEdit();
                } else if (e.key === 'Escape') {
                    this.cancelEdit();
                }
            }
            
            // Hide context menu on Escape
            if (e.key === 'Escape' && !document.getElementById('contextMenu').classList.contains('hidden')) {
                this.hideContextMenu();
            }
        });
    }
    
    updateCanvasCursor() {
        this.canvas.parentElement.className = `canvas-container tool-${this.currentTool}`;
    }
    
    updateStatusText() {
        const statusMap = {
            select: 'Click and drag to move nodes. Right-click for context menu. Double-click to edit labels.',
            material: 'Click to add a Material node (triangle).',
            activity: 'Click to add an Activity node (circle).',
            connect: 'Click two nodes to create a connection. Valid: Material ↔ Activity only.',
            delete: 'Click a node or connection to delete it.'
        };
        document.getElementById('statusText').textContent = statusMap[this.currentTool] || 'Ready';
    }
    
    handleMouseDown(e) {
        // Hide context menu on any click on canvas
        this.hideContextMenu();
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedNode = this.getNodeAt(x, y);
        
        switch (this.currentTool) {
            case 'select':
                if (clickedNode) {
                    this.selectedNode = clickedNode;
                    this.isDragging = true;
                    this.dragOffset = {
                        x: x - clickedNode.x,
                        y: y - clickedNode.y
                    };
                } else {
                    this.selectedNode = null;
                }
                break;
                
            case 'material':
                this.addNode('material', x, y);
                break;
                
            case 'activity':
                this.addNode('activity', x, y);
                break;
                
            case 'connect':
                if (clickedNode) {
                    if (!this.connectingFrom) {
                        this.connectingFrom = clickedNode;
                        this.selectedNode = clickedNode;
                        this.showStatus(`Selected ${clickedNode.label}. Click another node to connect.`, 'info');
                    } else if (this.connectingFrom !== clickedNode) {
                        if (this.createConnection(this.connectingFrom, clickedNode)) {
                            this.connectingFrom = null;
                            this.selectedNode = null;
                        }
                    } else {
                        // Clicked the same node, deselect
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
                    this.deleteNode(clickedNode);
                } else {
                    const connection = this.getConnectionAt(x, y);
                    if (connection) {
                        this.deleteConnection(connection);
                    }
                }
                break;
        }
        
        this.draw();
    }
    
    handleMouseMove(e) {
        if (this.isDragging && this.selectedNode && this.currentTool === 'select') {
            const rect = this.canvas.getBoundingClientRect();
            this.selectedNode.x = e.clientX - rect.left - this.dragOffset.x;
            this.selectedNode.y = e.clientY - rect.top - this.dragOffset.y;
            
            // Keep nodes within canvas bounds
            this.selectedNode.x = Math.max(30, Math.min(this.canvas.width - 30, this.selectedNode.x));
            this.selectedNode.y = Math.max(30, Math.min(this.canvas.height - 80, this.selectedNode.y));
            
            this.draw();
        }
    }
    
    handleMouseUp(e) {
        this.isDragging = false;
    }
    
    handleRightClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedNode = this.getNodeAt(x, y);
        
        if (clickedNode) {
            this.contextMenuNode = clickedNode;
            this.selectedNode = clickedNode;
            this.showContextMenu(e.clientX, e.clientY);
            this.draw();
        } else {
            this.hideContextMenu();
        }
    }
    
    handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedNode = this.getNodeAt(x, y);
        if (clickedNode) {
            this.selectedNode = clickedNode;
            this.contextMenuNode = clickedNode;
            this.editLabel();
            this.draw();
        }
    }
    
    addNode(type, x, y, label = null) {
        const defaultLabels = {
            material: `Material ${this.nodeCounter + 1}`,
            activity: `Activity ${this.nodeCounter + 1}`
        };
        
        const node = {
            id: `node_${++this.nodeCounter}`,
            type: type,
            shape: type === 'material' ? 'triangle' : 'circle',
            label: label || defaultLabels[type],
            x: x,
            y: y
        };
        
        this.nodes.push(node);
        this.selectedNode = node;
        this.showStatus(`Added ${node.label}`, 'success');
        this.draw();
        return node;
    }
    
    createConnection(fromNode, toNode) {
        if (!this.canConnect(fromNode, toNode)) {
            this.showStatus(`Invalid connection! ${fromNode.type} cannot connect to ${toNode.type}`, 'error');
            return false;
        }
        
        // Check if connection already exists
        const existingConnection = this.connections.find(conn => 
            (conn.from === fromNode.id && conn.to === toNode.id) ||
            (conn.from === toNode.id && conn.to === fromNode.id)
        );
        
        if (existingConnection) {
            this.showStatus('Connection already exists!', 'warning');
            return false;
        }
        
        this.connections.push({
            from: fromNode.id,
            to: toNode.id
        });
        
        this.showStatus(`Connected ${fromNode.label} → ${toNode.label}`, 'success');
        return true;
    }
    
    canConnect(nodeA, nodeB) {
        return nodeA.type !== nodeB.type;
    }
    
    getNodeAt(x, y) {
        const nodeRadius = 30; // Increased hit area
        return this.nodes.find(node => {
            const dx = x - node.x;
            const dy = y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= nodeRadius;
        });
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
        this.draw();
    }
    
    deleteConnection(connection) {
        const fromNode = this.nodes.find(n => n.id === connection.from);
        const toNode = this.nodes.find(n => n.id === connection.to);
        this.connections = this.connections.filter(conn => conn !== connection);
        this.showStatus(`Deleted connection ${fromNode?.label} → ${toNode?.label}`, 'success');
        this.draw();
    }
    
    showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');
        
        // Ensure menu stays within viewport
        const menuWidth = 180;
        const menuHeight = 120;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let menuX = x;
        let menuY = y;
        
        if (x + menuWidth > viewportWidth) {
            menuX = x - menuWidth;
        }
        if (y + menuHeight > viewportHeight) {
            menuY = y - menuHeight;
        }
        
        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.classList.remove('hidden');
        
        // Update menu items based on node type
        const materialItem = document.getElementById('addConnectedMaterial');
        const activityItem = document.getElementById('addConnectedActivity');
        
        if (this.contextMenuNode) {
            materialItem.style.display = this.contextMenuNode.type === 'activity' ? 'block' : 'none';
            activityItem.style.display = this.contextMenuNode.type === 'material' ? 'block' : 'none';
        }
    }
    
    hideContextMenu() {
        const menu = document.getElementById('contextMenu');
        if (!menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    }
    
    addConnectedMaterial() {
        if (!this.contextMenuNode) return;
        
        const baseNode = this.contextMenuNode;
        const newX = baseNode.x + 150;
        const newY = baseNode.y;
        
        const newNode = this.addNode('material', newX, newY);
        
        if (baseNode.type === 'activity') {
            this.createConnection(baseNode, newNode);
        }
        
        this.hideContextMenu();
    }
    
    addConnectedActivity() {
        if (!this.contextMenuNode) return;
        
        const baseNode = this.contextMenuNode;
        const newX = baseNode.x + 150;
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
        
        input.value = this.contextMenuNode.label;
        modal.classList.remove('hidden');
        
        // Focus and select text after a brief delay to ensure modal is visible
        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);
        
        this.hideContextMenu();
    }
    
    saveEdit() {
        if (this.contextMenuNode) {
            const newLabel = document.getElementById('editInput').value.trim();
            if (newLabel) {
                const oldLabel = this.contextMenuNode.label;
                this.contextMenuNode.label = newLabel;
                this.showStatus(`Renamed "${oldLabel}" to "${newLabel}"`, 'success');
                this.draw();
            }
        }
        this.cancelEdit();
    }
    
    cancelEdit() {
        const modal = document.getElementById('editModal');
        modal.classList.add('hidden');
    }
    
    deleteSelectedNode() {
        if (this.contextMenuNode) {
            this.deleteNode(this.contextMenuNode);
        }
        this.hideContextMenu();
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections first (behind nodes)
        this.drawConnections();
        
        // Draw nodes
        this.drawNodes();
    }
    
    drawNodes() {
        this.nodes.forEach(node => {
            this.ctx.save();
            
            // Set colors based on type and state
            const isSelected = this.selectedNode === node;
            const isConnecting = this.connectingFrom === node;
            
            if (node.type === 'material') {
                this.ctx.fillStyle = isSelected || isConnecting ? '#21808d' : '#1fb8cd';
                this.ctx.strokeStyle = '#127681';
            } else {
                this.ctx.fillStyle = isSelected || isConnecting ? '#d45b3a' : '#ffc185';
                this.ctx.strokeStyle = '#b4413c';
            }
            
            this.ctx.lineWidth = isSelected || isConnecting ? 3 : 2;
            
            // Draw shape
            this.ctx.beginPath();
            if (node.shape === 'triangle') {
                this.drawTriangle(node.x, node.y, 25);
            } else {
                this.drawCircle(node.x, node.y, 25);
            }
            this.ctx.fill();
            this.ctx.stroke();
            
            // Draw label
            this.ctx.fillStyle = '#13343b';
            this.ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Simple text wrapping
            const maxWidth = 100;
            const words = node.label.split(' ');
            const lines = [];
            let currentLine = words[0] || '';
            
            for (let i = 1; i < words.length; i++) {
                const testLine = currentLine + ' ' + words[i];
                const metrics = this.ctx.measureText(testLine);
                if (metrics.width > maxWidth) {
                    lines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);
            
            const lineHeight = 14;
            const totalHeight = lines.length * lineHeight;
            const startY = node.y + 40;
            
            lines.forEach((line, index) => {
                this.ctx.fillText(line, node.x, startY + index * lineHeight);
            });
            
            this.ctx.restore();
        });
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
        
        // Adjust start and end points to node edges
        const nodeRadius = 27;
        const adjustedFromX = fromX + nodeRadius * Math.cos(angle);
        const adjustedFromY = fromY + nodeRadius * Math.sin(angle);
        const adjustedToX = toX - nodeRadius * Math.cos(angle);
        const adjustedToY = toY - nodeRadius * Math.sin(angle);
        
        this.ctx.save();
        this.ctx.strokeStyle = '#626c71';
        this.ctx.lineWidth = 2;
        
        // Draw line
        this.ctx.beginPath();
        this.ctx.moveTo(adjustedFromX, adjustedFromY);
        this.ctx.lineTo(adjustedToX, adjustedToY);
        this.ctx.stroke();
        
        // Draw arrowhead
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
        const input = document.getElementById('nlInput').value.toLowerCase().trim();
        if (!input) {
            this.showStatus('Please enter a description first!', 'warning');
            return;
        }
        
        this.clear();
        
        // Parse natural language input
        if (input.includes('two plants') && input.includes('distribution center')) {
            this.generateTwoPlantsToDC();
        } else if (input.includes('plant') && input.includes('warehouse')) {
            this.generatePlantToWarehouse();
        } else if (input.includes('supplier') && input.includes('manufacturer')) {
            this.generateSupplierToManufacturer();
        } else if (input.includes('factory') || input.includes('manufacturing')) {
            this.generateManufacturingChain();
        } else {
            this.generateGenericChain();
        }
        
        this.showStatus('Diagram generated from natural language!', 'success');
        document.getElementById('nlInput').value = ''; // Clear input
    }
    
    generateTwoPlantsToDC() {
        // Create two plants
        const plant1 = this.addNode('material', 100, 150, 'Item A @ Plant 1');
        const plant2 = this.addNode('material', 100, 300, 'Item A @ Plant 2');
        
        // Create transportation
        const truck1 = this.addNode('activity', 300, 150, 'Truck 1');
        const truck2 = this.addNode('activity', 300, 300, 'Truck 2');
        
        // Create DC
        const dc = this.addNode('material', 500, 225, 'Item A @ DC');
        
        // Create connections
        this.createConnection(plant1, truck1);
        this.createConnection(plant2, truck2);
        this.createConnection(truck1, dc);
        this.createConnection(truck2, dc);
        
        this.draw();
    }
    
    generatePlantToWarehouse() {
        const plant = this.addNode('material', 100, 200, 'Raw Materials @ Plant');
        const manufacturing = this.addNode('activity', 250, 200, 'Manufacturing');
        const finished = this.addNode('material', 400, 200, 'Finished Goods');
        const shipping = this.addNode('activity', 550, 200, 'Shipping');
        const warehouse = this.addNode('material', 700, 200, 'Warehouse');
        
        this.createConnection(plant, manufacturing);
        this.createConnection(manufacturing, finished);
        this.createConnection(finished, shipping);
        this.createConnection(shipping, warehouse);
        
        this.draw();
    }
    
    generateSupplierToManufacturer() {
        const supplier = this.addNode('material', 100, 200, 'Supplier Materials');
        const procurement = this.addNode('activity', 250, 200, 'Procurement');
        const received = this.addNode('material', 400, 200, 'Received Goods');
        const manufacturing = this.addNode('activity', 550, 200, 'Manufacturing');
        const finished = this.addNode('material', 700, 200, 'Finished Product');
        
        this.createConnection(supplier, procurement);
        this.createConnection(procurement, received);
        this.createConnection(received, manufacturing);
        this.createConnection(manufacturing, finished);
        
        this.draw();
    }
    
    generateManufacturingChain() {
        const rawMat = this.addNode('material', 100, 200, 'Raw Materials');
        const processing = this.addNode('activity', 250, 200, 'Processing');
        const wip = this.addNode('material', 400, 200, 'WIP Inventory');
        const assembly = this.addNode('activity', 550, 200, 'Assembly');
        const final = this.addNode('material', 700, 200, 'Final Products');
        
        this.createConnection(rawMat, processing);
        this.createConnection(processing, wip);
        this.createConnection(wip, assembly);
        this.createConnection(assembly, final);
        
        this.draw();
    }
    
    generateGenericChain() {
        const input = this.addNode('material', 150, 200, 'Input Materials');
        const process = this.addNode('activity', 350, 200, 'Processing');
        const output = this.addNode('material', 550, 200, 'Output Products');
        
        this.createConnection(input, process);
        this.createConnection(process, output);
        
        this.draw();
    }
    
    loadExample() {
        this.clear();
        
        // Load sample data
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
            this.nodes.push(node);
            this.nodeCounter++;
        });
        
        this.connections = [...this.sampleData.connections];
        
        this.draw();
        this.showStatus('Sample supply chain loaded!', 'success');
    }
    
    clear() {
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.connectingFrom = null;
        this.contextMenuNode = null;
        this.nodeCounter = 0;
        this.hideContextMenu();
        this.cancelEdit();
        this.draw();
        this.showStatus('Canvas cleared!', 'info');
    }
    
    save() {
        const data = {
            nodes: this.nodes,
            connections: this.connections,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        localStorage.setItem('supplyChainDiagram', JSON.stringify(data));
        this.showStatus('Diagram saved to browser storage!', 'success');
    }
    
    load() {
        const saved = localStorage.getItem('supplyChainDiagram');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.nodes = data.nodes || [];
                this.connections = data.connections || [];
                this.nodeCounter = this.nodes.length;
                this.selectedNode = null;
                this.connectingFrom = null;
                this.draw();
                this.showStatus('Diagram loaded from browser storage!', 'success');
            } catch (error) {
                this.showStatus('Error loading saved diagram!', 'error');
            }
        } else {
            // If no saved data, trigger file input
            document.getElementById('fileInput').click();
        }
    }
    
    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.nodes = data.nodes || [];
                this.connections = data.connections || [];
                this.nodeCounter = this.nodes.length;
                this.selectedNode = null;
                this.connectingFrom = null;
                this.draw();
                this.showStatus('Diagram loaded from file!', 'success');
            } catch (error) {
                this.showStatus('Error loading file! Please check file format.', 'error');
            }
        };
        reader.readAsText(file);
        
        // Reset file input
        e.target.value = '';
    }
    
    exportPNG() {
        // Create download link
        const link = document.createElement('a');
        link.download = `supply-chain-diagram-${new Date().toISOString().split('T')[0]}.png`;
        link.href = this.canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showStatus('Diagram exported as PNG!', 'success');
    }
    
    showStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        const originalColor = statusText.style.color;
        
        statusText.textContent = message;
        
        const colors = {
            error: '#c0152f',
            warning: '#a84b2f',
            success: '#21808d',
            info: ''
        };
        
        statusText.style.color = colors[type] || '';
        
        // Reset status after 4 seconds
        setTimeout(() => {
            this.updateStatusText();
            statusText.style.color = originalColor;
        }, 4000);
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.supplyChainCanvas = new SupplyChainCanvas();
});