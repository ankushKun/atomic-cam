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
                // Create initial canvas from normalized result
                const originalCanvas = normalizeResult.items[0].toCanvas();

                // Create a new canvas with 1024x1024 dimensions
                const scaledCanvas = document.createElement('canvas');
                scaledCanvas.width = 1024;
                scaledCanvas.height = 1024;

                // Get the 2D context
                const ctx = scaledCanvas.getContext('2d');

                // Enable image smoothing for better quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Calculate scaling to maintain aspect ratio
                const scale = Math.min(1024 / originalCanvas.width, 1024 / originalCanvas.height);
                const scaledWidth = originalCanvas.width * scale;
                const scaledHeight = originalCanvas.height * scale;

                // Calculate centering offsets
                const offsetX = (1024 - scaledWidth) / 2;
                const offsetY = (1024 - scaledHeight) / 2;

                // Fill background with white instead of black
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, 1024, 1024);

                // Draw the scaled image centered
                ctx.drawImage(
                    originalCanvas,
                    0, 0, originalCanvas.width, originalCanvas.height,
                    offsetX, offsetY, scaledWidth, scaledHeight
                );

                // Get JPEG data with optimal quality (0.92 is a good balance)
                const imageData = {
                    dataUrl: scaledCanvas.toDataURL('image/jpeg', 0.92),
                    get size() {
                        return (this.dataUrl.length * 3) / 4 / 1024 / 1024;
                    }
                };

                // Style the canvas for display
                scaledCanvas.style.maxWidth = '100%';
                scaledCanvas.style.height = 'auto';
                scaledCanvas.style.borderRadius = '8px';
                scaledCanvas.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                scaledCanvas.classList.add('fade-in');

                // Create container for canvas and buttons
                const resultWrapper = document.createElement('div');
                resultWrapper.className = 'result-wrapper';

                // Add canvas to wrapper
                resultWrapper.appendChild(scaledCanvas);

                // Create buttons container
                const buttonsContainer = document.createElement('div');
                buttonsContainer.className = 'result-buttons';

                // Create download button
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'btn btn-download';
                downloadBtn.innerHTML = '<span>💾 Save Image</span>';
                downloadBtn.onclick = () => {
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const link = document.createElement('a');
                        link.href = imageData.dataUrl;
                        link.download = `document-${timestamp}.jpg`;
                        link.click();
                        this.updateStatus(`Document saved successfully (${imageData.size.toFixed(2)}MB)`);
                    } catch (error) {
                        console.error('Failed to save image:', error);
                        this.updateStatus('Failed to save document.');
                    }
                };

                buttonsContainer.appendChild(downloadBtn);

                // Add mint button if wallet is connected
                if (walletManager.connected) {
                    const mintBtn = document.createElement('button');
                    mintBtn.className = 'btn btn-mint';
                    mintBtn.innerHTML = '<span>🖼️ Mint NFT</span>';
                    mintBtn.onclick = async () => {
                        try {
                            const nameModal = document.getElementById('name-modal');
                            const userNameInput = document.getElementById('user-name');
                            const confirmMintBtn = document.getElementById('confirm-mint');
                            const cancelMintBtn = document.getElementById('cancel-mint');

                            // Show the modal
                            nameModal.classList.remove('hidden');
                            userNameInput.focus();

                            // Handle mint confirmation
                            const handleMint = async () => {
                                const userName = userNameInput.value.trim();
                                if (!userName) {
                                    this.updateStatus('Please enter your name.');
                                    return;
                                }

                                // Disable buttons and show loading state
                                confirmMintBtn.disabled = true;
                                cancelMintBtn.disabled = true;
                                mintBtn.disabled = true;
                                downloadBtn.disabled = true;

                                // Add loader to confirm button
                                confirmMintBtn.innerHTML = '<span class="loader"></span>Minting...';

                                nameModal.classList.add('hidden');
                                this.updateStatus('Minting in progress...');

                                try {
                                    // Convert the canvas to a Blob
                                    const canvas = scaledCanvas;
                                    canvas.toBlob(async (blob) => {
                                        try {
                                            const imageFile = new File([blob], 'document.jpg', { type: 'image/jpeg' });
                                            const path = window.location.pathname;
                                            let location;

                                            switch (path) {
                                                case '/CHD': case '/CHD.html':
                                                    location = 'CHD';
                                                    break;
                                                case '/BDQ': case '/BDQ.html':
                                                    location = 'BDQ';
                                                    break;
                                                case '/BLR': case '/BLR.html':
                                                    location = 'BLR';
                                                    break;
                                                case '/DEL': case '/DEL.html':
                                                    location = 'DEL';
                                                    break;
                                                default:
                                                    location = 'Unknown';
                                            }

                                            if (location === "Unknown") {
                                                this.updateStatus('Unknown location. Please try again.');
                                                return;
                                            }

                                            const res = await walletManager.mintAsset(imageFile, {
                                                location: location,
                                                name: userName
                                            });
                                            console.log("res", res)
                                            console.log("res.id", res.id)
                                            // eg. https://bazar.arweave.net/#/asset/hVnCLajwU9XJ4ENTdA7KUl0JTJrmrsaEHMbgfl66h10
                                            window.open(`https://bazar.arweave.net/#/asset/${res.id}`, '_blank');
                                            this.updateStatus('Document minted successfully.');
                                        } catch (error) {
                                            console.error('Failed to mint:', error);
                                            this.updateStatus('Failed to mint document.');
                                        } finally {
                                            // Re-enable buttons and restore original state
                                            confirmMintBtn.disabled = false;
                                            cancelMintBtn.disabled = false;
                                            mintBtn.disabled = false;
                                            downloadBtn.disabled = false;
                                            confirmMintBtn.innerHTML = 'Confirm';
                                            userNameInput.value = ''; // Clear the input
                                        }
                                    }, 'image/jpeg');
                                } catch (error) {
                                    console.error('Failed to prepare image:', error);
                                    this.updateStatus('Failed to prepare image for minting.');
                                    // Re-enable buttons and restore original state
                                    confirmMintBtn.disabled = false;
                                    cancelMintBtn.disabled = false;
                                    mintBtn.disabled = false;
                                    downloadBtn.disabled = false;
                                    confirmMintBtn.innerHTML = 'Confirm';
                                    userNameInput.value = ''; // Clear the input
                                }
                            };

                            // Set up event listeners
                            confirmMintBtn.onclick = handleMint;
                            cancelMintBtn.onclick = () => {
                                nameModal.classList.add('hidden');
                                userNameInput.value = '';
                            };

                            // Handle Enter key
                            userNameInput.onkeypress = (e) => {
                                if (e.key === 'Enter') {
                                    handleMint();
                                }
                            };

                        } catch (error) {
                            console.error('Failed to prepare for minting:', error);
                            this.updateStatus('Failed to prepare for minting.');
                        }
                    };
                    buttonsContainer.appendChild(mintBtn);
                }

                resultWrapper.appendChild(buttonsContainer);
                this.elements.resultContainer.appendChild(resultWrapper);

                this.updateStatus('Document normalized successfully.');
                console.log(normalizeResult.items[0]);
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