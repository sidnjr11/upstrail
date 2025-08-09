// Vision Supply Chain Diagram Application
class VisionApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.canvasContainer = document.getElementById('canvasContainer');
        this.elementsLayer = document.getElementById('elementsLayer');
        this.connectionsLayer = document.getElementById('connectionsLayer');
        this.tempConnection = document.getElementById('tempConnection');
        this.statusText = document.getElementById('statusText');
        this.zoomLevel = document.getElementById('zoomLevel');
        
        this.currentTool = null;
        this.elements = [];
        this.connections = [];
        this.selectedElement = null;
        this.zoom = 1;
        this.isDragging = false;
        this.isConnecting = false;
        this.connectionStart = null;
        this.dragOffset = { x: 0, y: 0 };
        this.elementCounter = 0;

        this.elementTypes = {
            material: { shape: 'triangle', color: '#4CAF50', size: 40 },
            resource: { shape: 'inverted-triangle', color: '#2196F3', size: 40 },
            activity: { shape: 'circle', color: '#FF9800', size: 40 },
            bom: { shape: 'gear', color: '#9C27B0', size: 40 },
            distribution: { shape: 'truck', color: '#F44336', size: 40 }
        };

        this.nlpKeywords = {
            materials: ['material', 'raw material', 'input', 'component'],
            resources: ['resource', 'equipment', 'facility', 'tool'],
            activities: ['activity', 'process', 'operation', 'plant', 'factory', 'manufacturing'],
            bom: ['bom', 'bill of materials', 'assembly'],
            distribution: ['distribution', 'warehouse', 'distribution center', 'logistics', 'shipping', 'truck'],
            connections: ['connected to', 'supplies', 'provides', 'feeds', 'via', 'through', 'linked to']
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateStatus('Ready - Select a tool to start creating your supply chain diagram');
    }

    setupEventListeners() {
        // Tool selection
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectTool(e.target.closest('.tool-btn').dataset.tool));
        });

        // Canvas interactions
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        this.canvasContainer.addEventListener('wheel', (e) => this.handleWheel(e));

        // Clear canvas
        document.getElementById('clearCanvas').addEventListener('click', () => this.clearCanvas());

        // NLP generation
        document.getElementById('generateBtn').addEventListener('click', () => this.generateFromNLP());
        document.getElementById('nlpInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.generateFromNLP();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    selectTool(tool) {
        // Remove active class from all tools
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        
        // Add active class to selected tool
        const toolBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (toolBtn) toolBtn.classList.add('active');
        
        this.currentTool = tool;
        this.canvasContainer.className = 'canvas-container';
        this.canvasContainer.classList.add(`tool-${tool}`);
        
        this.updateStatus(`${tool.charAt(0).toUpperCase() + tool.slice(1)} tool selected - Click on canvas to place element`);
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom;
        const y = (e.clientY - rect.top) / this.zoom;

        if (this.currentTool && this.elementTypes[this.currentTool]) {
            this.createElement(this.currentTool, x, y);
        }
    }

    createElement(type, x, y) {
        const element = {
            id: `element-${++this.elementCounter}`,
            type: type,
            x: x,
            y: y,
            width: this.elementTypes[type].size,
            height: this.elementTypes[type].size,
            selected: false
        };

        this.elements.push(element);
        this.renderElement(element);
        this.updateStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} added to canvas`);
    }

    renderElement(element) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('canvas-element', `element-${element.type}`, 'element-created');
        group.dataset.elementId = element.id;
        group.setAttribute('transform', `translate(${element.x}, ${element.y})`);

        const shape = this.createShape(element);
        group.appendChild(shape);

        // Add connection points
        const points = this.getConnectionPoints(element);
        points.forEach((point, index) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.classList.add('connection-point');
            circle.setAttribute('cx', point.x - element.x);
            circle.setAttribute('cy', point.y - element.y);
            circle.setAttribute('r', 3);
            circle.dataset.pointIndex = index;
            group.appendChild(circle);
        });

        // Add event listeners
        group.addEventListener('mousedown', (e) => this.handleElementMouseDown(e, element));
        group.addEventListener('click', (e) => this.handleElementClick(e, element));

        this.elementsLayer.appendChild(group);
    }

    createShape(element) {
        const { type } = element;
        const config = this.elementTypes[type];
        const size = config.size;
        const halfSize = size / 2;

        switch (config.shape) {
            case 'triangle':
                const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                triangle.setAttribute('points', `${halfSize},${-halfSize} ${size},${halfSize} ${0},${halfSize}`);
                triangle.classList.add(`element-${type}`);
                return triangle;

            case 'inverted-triangle':
                const invTriangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                invTriangle.setAttribute('points', `${0},${-halfSize} ${size},${-halfSize} ${halfSize},${halfSize}`);
                invTriangle.classList.add(`element-${type}`);
                return invTriangle;

            case 'circle':
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', halfSize);
                circle.setAttribute('cy', 0);
                circle.setAttribute('r', halfSize);
                circle.classList.add(`element-${type}`);
                return circle;

            case 'gear':
                const gear = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const gearPath = `M${halfSize},${-halfSize} L${halfSize + 6},${-halfSize + 10} L${size},${-halfSize + 10} L${size - 6},${halfSize - 10} L${size},${halfSize} L${halfSize + 6},${halfSize - 6} L${halfSize},${halfSize} L${halfSize - 6},${halfSize - 6} L${0},${halfSize} L${6},${halfSize - 10} L${0},${-halfSize + 10} L${halfSize - 6},${-halfSize + 10} Z`;
                gear.setAttribute('d', gearPath);
                gear.classList.add(`element-${type}`);
                return gear;

            case 'truck':
                const truck = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                // Main body
                const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                body.setAttribute('x', 0);
                body.setAttribute('y', -10);
                body.setAttribute('width', 25);
                body.setAttribute('height', 15);
                body.classList.add(`element-${type}`);
                
                // Cab
                const cab = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                cab.setAttribute('x', 25);
                cab.setAttribute('y', -6);
                cab.setAttribute('width', 15);
                cab.setAttribute('height', 12);
                cab.classList.add(`element-${type}`);
                
                // Wheels
                const wheel1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                wheel1.setAttribute('cx', 8);
                wheel1.setAttribute('cy', 8);
                wheel1.setAttribute('r', 4);
                wheel1.classList.add(`element-${type}`);
                
                const wheel2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                wheel2.setAttribute('cx', 32);
                wheel2.setAttribute('cy', 8);
                wheel2.setAttribute('r', 4);
                wheel2.classList.add(`element-${type}`);
                
                truck.appendChild(body);
                truck.appendChild(cab);
                truck.appendChild(wheel1);
                truck.appendChild(wheel2);
                
                return truck;

            default:
                return circle;
        }
    }

    getConnectionPoints(element) {
        const { x, y, width, height } = element;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        return [
            { x: x + halfWidth, y: y - halfHeight }, // top
            { x: x + width, y: y }, // right
            { x: x + halfWidth, y: y + halfHeight }, // bottom
            { x: x, y: y } // left
        ];
    }

    handleElementMouseDown(e, element) {
        e.stopPropagation();
        
        if (this.currentTool === 'delete') {
            this.deleteElement(element);
            return;
        }

        if (this.currentTool === 'connect') {
            this.startConnection(element, e);
            return;
        }

        // Start dragging
        this.selectedElement = element;
        this.selectElement(element);
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / this.zoom;
        const mouseY = (e.clientY - rect.top) / this.zoom;
        
        this.dragOffset = {
            x: mouseX - element.x,
            y: mouseY - element.y
        };
        
        this.isDragging = true;
    }

    handleElementClick(e, element) {
        e.stopPropagation();
        this.selectElement(element);
    }

    selectElement(element) {
        // Deselect all elements
        this.elements.forEach(el => {
            el.selected = false;
            const group = document.querySelector(`[data-element-id="${el.id}"]`);
            if (group) group.classList.remove('selected');
        });

        // Select clicked element
        element.selected = true;
        const group = document.querySelector(`[data-element-id="${element.id}"]`);
        if (group) group.classList.add('selected');
        
        this.selectedElement = element;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / this.zoom;
        const mouseY = (e.clientY - rect.top) / this.zoom;

        if (this.isDragging && this.selectedElement) {
            const newX = mouseX - this.dragOffset.x;
            const newY = mouseY - this.dragOffset.y;
            
            this.moveElement(this.selectedElement, newX, newY);
        }

        if (this.isConnecting && this.connectionStart) {
            this.updateTempConnection(mouseX, mouseY);
        }
    }

    handleMouseUp(e) {
        if (this.isConnecting) {
            const target = e.target.closest('.canvas-element');
            if (target && target.dataset.elementId !== this.connectionStart.id) {
                const targetElement = this.elements.find(el => el.id === target.dataset.elementId);
                if (targetElement) {
                    this.createConnection(this.connectionStart, targetElement);
                }
            }
            this.endConnection();
        }

        this.isDragging = false;
        this.selectedElement = null;
    }

    moveElement(element, x, y) {
        element.x = Math.max(0, Math.min(x, 2400 - element.width));
        element.y = Math.max(0, Math.min(y, 1600 - element.height));
        
        const group = document.querySelector(`[data-element-id="${element.id}"]`);
        if (group) {
            group.setAttribute('transform', `translate(${element.x}, ${element.y})`);
        }
        
        this.updateConnections(element);
    }

    startConnection(element, e) {
        this.isConnecting = true;
        this.connectionStart = element;
        this.canvasContainer.classList.add('connecting-mode');
        
        const rect = this.canvas.getBoundingClientRect();
        const startX = element.x + element.width / 2;
        const startY = element.y;
        
        this.tempConnection.setAttribute('x1', startX);
        this.tempConnection.setAttribute('y1', startY);
        this.tempConnection.style.display = 'block';
        
        this.updateStatus('Click on another element to create connection');
    }

    updateTempConnection(mouseX, mouseY) {
        this.tempConnection.setAttribute('x2', mouseX);
        this.tempConnection.setAttribute('y2', mouseY);
    }

    endConnection() {
        this.isConnecting = false;
        this.connectionStart = null;
        this.tempConnection.style.display = 'none';
        this.canvasContainer.classList.remove('connecting-mode');
        this.updateStatus('Connection mode ended');
    }

    createConnection(startElement, endElement) {
        const connection = {
            id: `connection-${Date.now()}`,
            start: startElement.id,
            end: endElement.id,
            startPoint: this.getConnectionPoints(startElement)[1], // right
            endPoint: this.getConnectionPoints(endElement)[3] // left
        };

        this.connections.push(connection);
        this.renderConnection(connection);
        this.updateStatus(`Connection created between ${startElement.type} and ${endElement.type}`);
    }

    renderConnection(connection) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('connection-line');
        line.dataset.connectionId = connection.id;
        line.setAttribute('x1', connection.startPoint.x);
        line.setAttribute('y1', connection.startPoint.y);
        line.setAttribute('x2', connection.endPoint.x);
        line.setAttribute('y2', connection.endPoint.y);
        line.setAttribute('marker-end', 'url(#arrowhead)');
        
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectConnection(connection);
        });

        this.connectionsLayer.appendChild(line);
    }

    updateConnections(element) {
        this.connections.forEach(connection => {
            if (connection.start === element.id || connection.end === element.id) {
                const startElement = this.elements.find(el => el.id === connection.start);
                const endElement = this.elements.find(el => el.id === connection.end);
                
                if (startElement && endElement) {
                    connection.startPoint = this.getConnectionPoints(startElement)[1];
                    connection.endPoint = this.getConnectionPoints(endElement)[3];
                    
                    const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
                    if (line) {
                        line.setAttribute('x1', connection.startPoint.x);
                        line.setAttribute('y1', connection.startPoint.y);
                        line.setAttribute('x2', connection.endPoint.x);
                        line.setAttribute('y2', connection.endPoint.y);
                    }
                }
            }
        });
    }

    deleteElement(element) {
        // Remove connections
        this.connections = this.connections.filter(conn => 
            conn.start !== element.id && conn.end !== element.id
        );
        
        // Remove from DOM
        const group = document.querySelector(`[data-element-id="${element.id}"]`);
        if (group) group.remove();
        
        // Remove connection lines from DOM
        document.querySelectorAll('.connection-line').forEach(line => {
            const connection = this.connections.find(conn => conn.id === line.dataset.connectionId);
            if (!connection) line.remove();
        });
        
        // Remove from elements array
        this.elements = this.elements.filter(el => el.id !== element.id);
        
        this.updateStatus(`${element.type} deleted`);
    }

    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 3);
        this.applyZoom();
    }

    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.3);
        this.applyZoom();
    }

    applyZoom() {
        this.canvas.style.transform = `scale(${this.zoom})`;
        this.canvas.style.transformOrigin = '0 0';
        this.zoomLevel.textContent = Math.round(this.zoom * 100) + '%';
    }

    handleWheel(e) {
        e.preventDefault();
        if (e.deltaY < 0) {
            this.zoomIn();
        } else {
            this.zoomOut();
        }
    }

    clearCanvas() {
        if (this.elements.length === 0) return;
        
        if (confirm('Are you sure you want to clear the entire canvas?')) {
            this.elements = [];
            this.connections = [];
            this.elementsLayer.innerHTML = '';
            this.connectionsLayer.innerHTML = '';
            this.updateStatus('Canvas cleared');
        }
    }

    generateFromNLP() {
        const input = document.getElementById('nlpInput').value.trim();
        if (!input) return;

        this.updateStatus('Generating diagram from description...');
        document.body.classList.add('generating');

        setTimeout(() => {
            try {
                this.parseNLPInput(input);
            } finally {
                document.body.classList.remove('generating');
            }
        }, 500);
    }

    parseNLPInput(input) {
        const lowerInput = input.toLowerCase();
        const words = lowerInput.split(/\s+/);
        
        let elementsToCreate = [];
        let connectionsToCreate = [];
        
        // Find materials
        this.nlpKeywords.materials.forEach(keyword => {
            if (lowerInput.includes(keyword)) {
                elementsToCreate.push({ type: 'material', keyword });
            }
        });

        // Find resources
        this.nlpKeywords.resources.forEach(keyword => {
            if (lowerInput.includes(keyword)) {
                elementsToCreate.push({ type: 'resource', keyword });
            }
        });

        // Find activities
        this.nlpKeywords.activities.forEach(keyword => {
            if (lowerInput.includes(keyword)) {
                elementsToCreate.push({ type: 'activity', keyword });
            }
        });

        // Find BOM activities
        this.nlpKeywords.bom.forEach(keyword => {
            if (lowerInput.includes(keyword)) {
                elementsToCreate.push({ type: 'bom', keyword });
            }
        });

        // Find distribution activities
        this.nlpKeywords.distribution.forEach(keyword => {
            if (lowerInput.includes(keyword)) {
                elementsToCreate.push({ type: 'distribution', keyword });
            }
        });

        // Create elements if found
        if (elementsToCreate.length > 0) {
            this.createElementsFromNLP(elementsToCreate);
            this.updateStatus(`Generated ${elementsToCreate.length} elements from description`);
        } else {
            this.updateStatus('No recognizable elements found in description');
        }

        document.getElementById('nlpInput').value = '';
    }

    createElementsFromNLP(elementsToCreate) {
        const startX = 200;
        const startY = 200;
        const spacing = 120;
        
        elementsToCreate.forEach((elementData, index) => {
            const x = startX + (index % 4) * spacing;
            const y = startY + Math.floor(index / 4) * spacing;
            
            this.createElement(elementData.type, x, y);
        });
    }

    handleKeyboard(e) {
        if (e.key === 'Delete' && this.selectedElement) {
            this.deleteElement(this.selectedElement);
        }
        
        if (e.key === 'Escape') {
            if (this.isConnecting) {
                this.endConnection();
            }
            this.currentTool = null;
            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
            this.canvasContainer.className = 'canvas-container';
        }
    }

    updateStatus(message) {
        this.statusText.textContent = message;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new VisionApp();
});