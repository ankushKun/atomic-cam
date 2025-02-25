class WalletManager {
    constructor() {
        this.address = null;
        this.connected = false;

        this.connectButton = document.getElementById('wallet-connect');
        this.setupEventListeners();
        this.checkConnection();
        this.setupConfirmationDialog();
    }

    setupEventListeners() {
        this.connectButton.addEventListener('click', () => this.toggleConnection());

        // Listen for ArConnect events
        window.addEventListener('arweaveWalletLoaded', () => {
            this.checkConnection();
        });

        window.addEventListener('walletSwitch', (e) => {
            this.address = e.detail.address;
            this.updateButtonState();
        });
    }

    async checkConnection() {
        try {
            const permissions = ['ACCESS_ADDRESS', 'SIGN_TRANSACTION'];

            if (window.arweaveWallet) {
                this.connected = await window.arweaveWallet.getPermissions()
                    .then(perms => permissions.every(p => perms.includes(p)))
                    .catch(() => false);

                if (this.connected) {
                    this.address = await window.arweaveWallet.getActiveAddress();
                }
            } else {
                this.connected = false;
            }

            this.updateButtonState();
        } catch (error) {
            console.error('Wallet connection check failed:', error);
            this.connected = false;
            this.updateButtonState();
        }
    }

    setupConfirmationDialog() {
        // Create and append the dialog HTML
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay hidden';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Disconnect Wallet</h3>
                <p>Are you sure you want to disconnect your wallet?</p>
                <div class="dialog-buttons">
                    <button class="btn btn-secondary" id="dialog-cancel">Cancel</button>
                    <button class="btn btn-danger" id="dialog-confirm">Disconnect</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Store dialog elements
        this.dialog = {
            overlay: dialog,
            cancelBtn: dialog.querySelector('#dialog-cancel'),
            confirmBtn: dialog.querySelector('#dialog-confirm')
        };

        // Setup dialog event listeners
        this.dialog.cancelBtn.addEventListener('click', () => this.hideDialog());
        this.dialog.confirmBtn.addEventListener('click', () => this.confirmDisconnect());
        this.dialog.overlay.addEventListener('click', (e) => {
            if (e.target === this.dialog.overlay) this.hideDialog();
        });
    }

    showDialog() {
        document.body.classList.add('dialog-open');
        this.dialog.overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            this.dialog.overlay.classList.add('dialog-visible');
        });
    }

    hideDialog() {
        this.dialog.overlay.classList.remove('dialog-visible');
        setTimeout(() => {
            this.dialog.overlay.classList.add('hidden');
            document.body.classList.remove('dialog-open');
        }, 300);
    }

    async confirmDisconnect() {
        this.hideDialog();
        await window.arweaveWallet.disconnect();
        this.address = null;
        this.connected = false;
        this.updateButtonState();
    }

    async toggleConnection() {
        if (!window.arweaveWallet) {
            window.open('https://arconnect.io', '_blank');
            return;
        }

        try {
            if (!this.connected) {
                await window.arweaveWallet.connect([
                    'ACCESS_ADDRESS',
                    'SIGN_TRANSACTION'
                ]);

                this.address = await window.arweaveWallet.getActiveAddress();
                this.connected = true;
                this.updateButtonState();
            } else {
                // Show confirmation dialog instead of disconnecting immediately
                this.showDialog();
            }
        } catch (error) {
            console.error('Wallet connection failed:', error);
        }
    }

    updateButtonState() {
        if (this.connected && this.address) {
            const shortAddress = `${this.address.slice(0, 4)}...${this.address.slice(-4)}`;
            this.connectButton.innerHTML = `<span>${shortAddress}</span>`;
            this.connectButton.classList.add('connected');
        } else {
            this.connectButton.innerHTML = '<span>Connect Wallet</span>';
            this.connectButton.classList.remove('connected');
        }
    }

    async mintAsset(imageFile, metadata) {
        try {
            const formData = new FormData();
            formData.append('image', imageFile);
            formData.append('location', metadata.location);
            formData.append('walletAddress', this.address);
            formData.append('name', metadata.name);

            const response = await fetch('https://api.betteridea.dev/api/upload', {
                // const response = await fetch('http://localhost:3001/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const result = await response.json();
            console.log('Asset minted successfully:', result);
            console.log("result", result.id)
            return result;


        } catch (error) {
            console.error('Error minting asset:', error);
            throw error;
        }
    }
} 