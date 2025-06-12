// api/download.mjs
import { Storage } from "@google-cloud/storage";
import fetch from 'node-fetch';
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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // --- END CORS HANDLING ---

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed. Only GET allowed for download.");
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

    const BUCKET_NAME = "wiking-portal"; // Ensure this matches your bucket name

    const { publicId } = req.query;

    if (!publicId) {
      return res.status(400).json({ error: 'Missing publicId for download.' });
    }

    const file = storage.bucket(BUCKET_NAME).file(publicId);

    // Retrieve metadata to get file type and original name
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    let originalFileName = publicId.includes('-') ? publicId.substring(publicId.indexOf('-') + 1) : publicId;
    
      // Try to append a file extension if missing in the original name
    if (!originalFileName.includes('.') && contentType) {
        const fileExtension = contentType.split('/')[1];
        if (fileExtension) {
            originalFileName = `${originalFileName}.${fileExtension}`;
        }
    }

    // Generate a signed URL to read the file
      const expiresAt = Date.now() + 10 * 60 * 1000; // Signed URL valid for 10 minutes
    const [gcsReadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

      console.log(`INFO: Vercel fetching file from GCS via: ${gcsReadUrl}`);

      // --- Proxy logic: fetch the file from GCS and stream to the client ---
    const gcsResponse = await fetch(gcsReadUrl);

    if (!gcsResponse.ok) {
          console.error(`ERROR: Could not fetch file from GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
          return res.status(gcsResponse.status).json({ error: `Could not fetch file from storage: ${gcsResponse.statusText}` });
    }

      // Set Content-Disposition: attachment to force the download
    res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
    res.setHeader('Content-Type', contentType);
    
      // Stream the GCS response directly to the browser
    gcsResponse.body.pipe(res);

  } catch (error) {
    console.error('Fatal error in Vercel download function:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal server error: Could not process download request.' });
  }
};
