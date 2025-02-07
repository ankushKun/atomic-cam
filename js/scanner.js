class DocumentScanner {
    constructor() {
        this.router = null;
        this.cameraEnhancer = null;
        this.imageEditorView = null;
        this.layer = null;
        this.items = null;
        this.originalImageData = null;
        this.frameCount = 0;
        this.quads = [];

        // DOM elements
        this.elements = {
            startBtn: document.getElementById('start-detecting'),
            restartBtn: document.getElementById('restart-detecting'),
            normalizeBtn: document.getElementById('normalize-with-confirmed-quad'),
            cameraContainer: document.getElementById('camera-container'),
            editorContainer: document.getElementById('editor-container'),
            resultContainer: document.getElementById('result-container'),
            statusMessage: document.getElementById('status-message')
        };

        this.initialize();
    }

    async initialize() {
        try {
            // Initialize license
            await Dynamsoft.License.LicenseManager.initLicense(CONFIG.license);
            
            // Preload Document Normalizer module
            await Dynamsoft.Core.CoreModule.loadWasm(["DDN"]);
            
            // Initialize camera and editor views
            await this.initializeViews();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Automatically start scanning
            await this.startDetecting();
            
            this.updateStatus('Scanner started. Point camera at a document.');
        } catch (error) {
            this.updateStatus(`Initialization failed: ${error.message}`);
            console.error(error);
        }
    }

    async initializeViews() {
        // Initialize camera view
        const cameraView = await Dynamsoft.DCE.CameraView.createInstance();
        this.cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);
        this.elements.cameraContainer.append(cameraView.getUIElement());

        // Initialize editor view
        this.imageEditorView = await Dynamsoft.DCE.ImageEditorView.createInstance(this.elements.editorContainer);
        this.layer = this.imageEditorView.createDrawingLayer();

        // Initialize router
        this.router = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        this.router.setInput(this.cameraEnhancer);

        // Configure settings
        const settings = await this.router.getSimplifiedSettings("DetectDocumentBoundaries_Default");
        settings.capturedResultItemTypes = 
            Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD | 
            Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE;
        await this.router.updateSettings("DetectDocumentBoundaries_Default", settings);

        // Set up result receiver
        const resultReceiver = new Dynamsoft.CVR.CapturedResultReceiver();
        resultReceiver.onCapturedResultReceived = this.handleCapturedResult.bind(this);
        this.router.addResultReceiver(resultReceiver);
    }

    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startDetecting());
        this.elements.restartBtn.addEventListener('click', () => this.restartDetecting());
        this.elements.normalizeBtn.addEventListener('click', () => this.normalizeDocument());
    }

    async startDetecting() {
        try {
            this.updateStatus('Opening camera...');
            await this.cameraEnhancer.open();
            
            this.updateStatus('Starting detection...');
            await this.router.startCapturing("DetectDocumentBoundaries_Default");
            
            this.elements.startBtn.style.display = 'none';
            this.elements.restartBtn.style.display = 'inline';
        } catch (error) {
            this.updateStatus(`Failed to start detection: ${error.message}`);
            console.error(error);
        }
    }

    async handleCapturedResult(result) {
        this.items = result.items;
        
        const originalImage = result.items.find(item => item.type === 1);
        this.originalImageData = originalImage?.imageData;

        if (this.originalImageData) {
            if (result.items.length <= 1) {
                this.frameCount = 0;
                return;
            }

            this.frameCount++;
            
            if (this.frameCount === CONFIG.frameCountThreshold) {
                await this.handleGoodDetection(result);
            }
        }
    }

    async handleGoodDetection(result) {
        this.frameCount = 0;
        await this.router.stopCapturing();
        
        this.elements.cameraContainer.style.display = 'none';
        this.elements.editorContainer.style.display = 'block';
        
        this.imageEditorView.setOriginalImage(this.originalImageData);
        
        this.quads = [];
        for (const item of result.items) {
            if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE) continue;
            
            const quad = new Dynamsoft.DCE.QuadDrawingItem({ points: item.location.points });
            this.quads.push(quad);
        }
        
        this.layer.addDrawingItems(this.quads);
        this.elements.normalizeBtn.disabled = false;
        this.updateStatus('Document detected. Adjust corners if needed, then click "Normalize".');
    }

    async normalizeDocument() {
        try {
            const selectedItems = this.imageEditorView.getSelectedDrawingItems();
            const quad = selectedItems.length ? 
                selectedItems[0].getQuad() : 
                this.items[1].location;

            this.elements.editorContainer.style.display = 'none';
            this.elements.resultContainer.innerHTML = '';

            const settings = await this.router.getSimplifiedSettings("NormalizeDocument_Default");
            settings.roiMeasuredInPercentage = 0;
            settings.roi.points = quad.points;
            await this.router.updateSettings("NormalizeDocument_Default", settings);

            const normalizeResult = await this.router.capture(this.originalImageData, "NormalizeDocument_Default");
            
            if (normalizeResult.items[0]) {
                const canvas = normalizeResult.items[0].toCanvas();
                this.elements.resultContainer.appendChild(canvas);
                this.updateStatus('Document normalized successfully.');
            }

            this.layer.clearDrawingItems();
            this.elements.normalizeBtn.disabled = true;
        } catch (error) {
            this.updateStatus(`Normalization failed: ${error.message}`);
            console.error(error);
        }
    }

    async restartDetecting() {
        this.elements.editorContainer.style.display = 'none';
        this.elements.resultContainer.innerHTML = '';
        this.elements.cameraContainer.style.display = 'block';
        
        this.elements.startBtn.style.display = 'inline';
        this.elements.restartBtn.style.display = 'none';
        this.elements.normalizeBtn.disabled = true;
        
        this.layer.clearDrawingItems();
        await this.router.startCapturing("DetectDocumentBoundaries_Default");
        
        this.updateStatus('Scanner restarted. Point camera at a document.');
    }

    updateStatus(message) {
        this.elements.statusMessage.textContent = message;
    }
}

// Initialize the scanner when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new DocumentScanner();
}); 