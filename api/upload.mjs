// api/upload.mjs (THE CORRECTED VERSION)

import { Storage } from "@google-cloud/storage";
import * as crypto from "crypto";
import path from 'path'; // Import Node.js path module for better path handling

export default async (req, res) => {
  // --- CORS HEADERS & PREFLIGHT HANDLING ---
  const allowedOrigins = [
    "https://www.wikingmedia.com",
    "https://wiking-media.webflow.io",
    "https://webflow-gcs-uploader.vercel.app"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // --- END CORS HANDLING ---

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed. Only POST allowed for upload.");
  }

  try {
    if (!process.env.GCS_KEY) {
      console.error('Environment variable GCS_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: GCS_KEY missing.' });
    }

    const serviceAccount = JSON.parse(process.env.GCS_KEY);
    const storage = new Storage({
      projectId: serviceAccount.project_id,
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key.replace(/\\n/g, '\n'),
      },
    });

    const BUCKET_NAME = "wiking-portal";

    const { filename, contentType, message } = req.body;

    if (!filename || !contentType) {
      return res.status(400).send("Missing fields: filename or contentType");
    }
    if (typeof message !== 'string') {
      return res.status(400).send("Invalid message format.");
    }

    // *** THE CRITICAL FIX IS HERE ***
    // Extract base name and extension correctly
    const originalBaseName = path.basename(filename, path.extname(filename)); // "remuneration-new (1)"
    const originalExtension = path.extname(filename); // ".png"

    // Generate unique ID
    const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

    // Construct gcsFileName as "basename.ext-uniqueId"
    // This ensures the extension is always before the unique identifier for easy parsing.
const gcsFileName = `${originalBaseName}-${uniqueId}${originalExtension}`;
    // Example: "remuneration-new (1).png-1749486849780-abcdef"

    const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

    const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: contentType,
      metadata: {
        'user-message': message || ''
      }
    });

    res.json({
      uploadUrl: uploadUrl,
      publicId: gcsFileName,
      message: message || ''
    });

  } catch (error) {
    console.error('FATAL ERROR in Vercel upload-function:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Please check its format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process upload request. Please try again or contact support.' });
  }
};