import express, { json } from 'express';
import Arweave from 'arweave';
import { readFileSync } from 'fs';
import cors from 'cors';
const app = express();
const port = process.env.PORT || 3000;

import { getProfileByWalletAddress } from './helpers/index.js';

// Development-only CORS configuration
app.use(cors());

// Initialize Arweave
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

// Load wallet
let wallet;
try {
  const walletFile = readFileSync('./wallet.json');
  wallet = JSON.parse(walletFile);
  console.log('Arweave wallet loaded successfully');
} catch (error) {
  console.error('Error loading wallet:', error);
  process.exit(1);
}

// Middleware for parsing JSON bodies
app.use(json());

// Middleware for handling file uploads
import multer, { memoryStorage } from 'multer';
const upload = multer({
  storage: memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB limit
  }
});

// API endpoint for uploading image with metadata
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    // Check if all required fields are present
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    if (!req.body.location) {
      return res.status(400).json({ error: 'Location is required' });
    }
    if (!req.body.walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    if (!req.body.name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const profile = await getProfileByWalletAddress({
      address: req.body.walletAddress
    });
    if (!profile) {
      return res.status(400).json({ error: 'Profile not found' });
    }
    console.log(profile);

    // Create metadata object
    const metadata = {
      location: req.body.location,
      walletAddress: req.body.walletAddress,
      profileId: profile.id,
      name: req.body.name,
      timestamp: new Date().toISOString(),
      contentType: req.file.mimetype
    };

    // Log the received data
    console.log('Received upload:', {
      imageSize: req.file.size,
      ...metadata
    });

    res.status(200).json({
      message: 'Upload received successfully',
      metadata
    });

    // Upload image to Arweave
    // const imageTransaction = await arweave.createTransaction({
    //   data: req.file.buffer
    // }, wallet);

    // imageTransaction.addTag('Content-Type', req.file.mimetype);
    // await arweave.transactions.sign(imageTransaction, wallet);

    // // Post the image transaction
    // const imageUploadResponse = await arweave.transactions.post(imageTransaction);

    // if (imageUploadResponse.status !== 200) {
    //   throw new Error('Failed to upload image to Arweave');
    // }

    // console.log('Image uploaded successfully:', imageTransaction.id);
    // metadata.id = imageTransaction.id;

    // res.status(200).json({
    //   message: 'Upload received successfully',
    //   metadata
    // });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Basic route
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
