let walletManager;

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

        // Add show/hide utility methods
        this.showElement = this.showElement.bind(this);
        this.hideElement = this.hideElement.bind(this);

        this.initialize();
    }

    showElement(element) {
        element.classList.remove('hidden');
        element.classList.add('fade-in');
    }

    hideElement(element) {
        element.classList.add('fade-out');
        setTimeout(() => {
            element.classList.add('hidden');
            element.classList.remove('fade-out');
        }, 300);
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
            
            // Show only necessary elements at start
            this.showElement(this.elements.startBtn);
            this.showElement(this.elements.statusMessage);
            
            this.updateStatus('Scanner ready. Point camera at a document and hold still.');
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
            
            this.hideElement(this.elements.startBtn);
            this.showElement(this.elements.cameraContainer);
            this.showElement(this.elements.restartBtn);
            
            this.updateStatus('Starting detection...');
            await this.router.startCapturing("DetectDocumentBoundaries_Default");
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
        
        // Hide camera container with fade
        this.hideElement(this.elements.cameraContainer);
        
        // Show editor after camera fade
        setTimeout(() => {
            this.showElement(this.elements.editorContainer);
            this.showElement(this.elements.normalizeBtn);
            
            this.imageEditorView.setOriginalImage(this.originalImageData);
            
            this.quads = [];
            for (const item of result.items) {
                if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE) continue;
                
                const quad = new Dynamsoft.DCE.QuadDrawingItem({ points: item.location.points });
                this.quads.push(quad);
            }
            
            this.layer.addDrawingItems(this.quads);
            
            this.updateStatus('Document detected. Adjust corners if needed, then click "Next".');
        }, 300);
    }

    async normalizeDocument() {
        try {
            const selectedItems = this.imageEditorView.getSelectedDrawingItems();
            const quad = selectedItems.length ? 
                selectedItems[0].getQuad() : 
                this.items[1].location;

            this.hideElement(this.elements.editorContainer);
            this.hideElement(this.elements.normalizeBtn);
            this.showElement(this.elements.resultContainer);

            this.elements.resultContainer.innerHTML = '';

            const settings = await this.router.getSimplifiedSettings("NormalizeDocument_Default");
            settings.roiMeasuredInPercentage = 0;
            settings.roi.points = quad.points;
            await this.router.updateSettings("NormalizeDocument_Default", settings);

            const normalizeResult = await this.router.capture(this.originalImageData, "NormalizeDocument_Default");
            
            if (normalizeResult.items[0]) {
                const canvas = normalizeResult.items[0].toCanvas();
                canvas.style.maxWidth = '100%';
                canvas.style.height = 'auto';
                canvas.style.borderRadius = '8px';
                canvas.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                canvas.classList.add('fade-in');
                
                // Create container for canvas and download button
                const resultWrapper = document.createElement('div');
                resultWrapper.className = 'result-wrapper';
                
                // Add canvas to wrapper
                resultWrapper.appendChild(canvas);
                
                // Create download button
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'btn btn-download';
                downloadBtn.innerHTML = '<span>💾 Save Image</span>';
                downloadBtn.onclick = () => {
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const link = document.createElement('a');
                        link.href = dataUrl;
                        link.download = `document-${timestamp}.png`;
                        link.click();
                        this.updateStatus('Document saved successfully.');
                    } catch (error) {
                        console.error('Failed to save PNG:', error);
                        this.updateStatus('Failed to save document.');
                    }
                };
                
                resultWrapper.appendChild(downloadBtn);
                this.elements.resultContainer.appendChild(resultWrapper);
                
                this.updateStatus('Document normalized successfully.');
                console.log(normalizeResult.items[0]);

                if (walletManager.connected) {
                    try {
                        await walletManager.uploadToArweave(normalizeResult.items[0]);
                        this.updateStatus('Document normalized and prepared for upload.');
                    } catch (error) {
                        console.error('Failed to prepare upload:', error);
                        this.updateStatus('Document normalized. Upload preparation failed.');
                    }
                }
            }

            this.layer.clearDrawingItems();
        } catch (error) {
            this.updateStatus(`Normalization failed: ${error.message}`);
            console.error(error);
        }
    }

    async restartDetecting() {
        this.hideElement(this.elements.editorContainer);
        this.hideElement(this.elements.resultContainer);
        this.hideElement(this.elements.restartBtn);
        this.hideElement(this.elements.normalizeBtn);
        
        setTimeout(() => {
            this.elements.resultContainer.innerHTML = '';
            this.showElement(this.elements.cameraContainer);
            this.showElement(this.elements.restartBtn);
            
            this.layer.clearDrawingItems();
            this.router.startCapturing("DetectDocumentBoundaries_Default");
            
            this.updateStatus('Scanner restarted. Point camera at a document and hold still.');
        }, 300);
    }

    updateStatus(message) {
        if (message) {
            this.elements.statusMessage.textContent = message;
            this.showElement(this.elements.statusMessage);
        } else {
            this.hideElement(this.elements.statusMessage);
        }
    }
}

// Initialize the scanner when the page loads
window.addEventListener('DOMContentLoaded', () => {
    walletManager = new WalletManager();
    new DocumentScanner();
}); 