# Document Scanner

A web-based document scanning application that uses Dynamsoft Document Normalizer to detect and normalize document images.

## Features

- Real-time document boundary detection
- Manual boundary adjustment
- Document normalization
- Simple and intuitive UI

## Setup

1. Clone this repository
2. Replace the license key in `js/config.js` with your own Dynamsoft license
3. Serve the files using a web server (required for camera access)
4. Open in a supported browser (Chrome 78+, Firefox 68+, Safari 14+, Edge 79+)

## Usage

1. Click "Start Scanning" to begin document detection
2. Point your camera at a document
3. Once detected, adjust the corners if needed
4. Click "Normalize" to process the document
5. Use "Restart" to scan another document

## Requirements

- HTTPS connection (for production)
- Modern browser with WebAssembly support
- Camera access 