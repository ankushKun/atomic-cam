import express, { json } from 'express';
import Arweave from 'arweave';
import { readFileSync } from 'fs';
import cors from 'cors';
import { assetSrc, getProfileByWalletAddress } from './helpers/index.js';
import { message, spawn } from '@permaweb/aoconnect';
import { createDataItemSigner } from '@permaweb/aoconnect/node';
import { AO } from './constants.js';
import multer, { memoryStorage } from 'multer';

const app = express();
const port = process.env.PORT || 3001;
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
const signer = createDataItemSigner(wallet);

// Middleware for parsing JSON bodies
app.use(json());

// Middleware for handling file uploads
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

    console.log("Fetching profile")
    const profile = await getProfileByWalletAddress({
      address: req.body.walletAddress
    });
    if (!profile.id) {
      return res.status(400).json({ error: 'Profile not found' });
    }

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

    console.log("Spawning process")
    const assetProcess = await spawn({
      module: AO.module,
      scheduler: AO.scheduler,
      signer: signer,
      tags: [
        { name: "App-Name", value: "Atomic-Cam" },
        { name: "Implements", value: "ANS-110" },
        { name: "Content-Type", value: "image/jpeg" },
        { name: "Title", value: "SAMPLE" },
        { name: "Description", value: "SAMPLE" },
        { name: "Tags", value: "SAMPLE" },
        { name: "Creator", value: metadata.profileId },
        { name: "Location", value: metadata.location },
        { name: "Minter-Name", value: metadata.name },
        { name: "Name", value: metadata.name },

      ],
      data: req.file.buffer
    })
    console.log("assetProcess", assetProcess);

    // delay 3s
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Adding code")
    while (true) {
      try {
        const msg = await message({
          process: assetProcess,
          signer: signer,
          tags: [{ name: "Action", value: "Eval" }],
          data: assetSrc.replaceAll("<NAME>", "SAMPLE").replaceAll("<TICKER>", "ATOMIC ASSET").replaceAll("<DENOMINATION>", "1").replaceAll("<BALANCE>", "1").replaceAll("<OWNER>", metadata.profileId)
        })
        // console.log(msg)

        //add asset to collection
        try {
          const updateCollectionMsg = await message({
            process: AO.collection,
            signer: signer,
            tags: [{ name: "Action", value: "Update-Assets" }],
            // data: `{AssetIds={"${assetProcess}"}, UpdateType="Add"}`
            data: JSON.stringify({ AssetIds: [assetProcess], UpdateType: "Add" })
          })
          console.log("updateCollectionMsg", updateCollectionMsg)
          res.status(200).json({
            message: 'Upload received successfully',
            ...metadata,
            id: assetProcess
          });
          break;
        } catch (error) {
          console.log(error)
          res.status(500).json({ error: 'Internal server error', details: error.message });
        }
      } catch (error) {
        console.log(error)
        console.log("Retrying...")
      } finally {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

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
