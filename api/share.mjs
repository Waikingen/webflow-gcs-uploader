diff --git a//dev/null b/api/share.mjs
index 0000000000000000000000000000000000000000..eb7aa3fbc9d44d50d9e862f0491de5175317ad1d 100644
--- a//dev/null
+++ b/api/share.mjs
@@ -0,0 +1,128 @@
+import { Storage } from "@google-cloud/storage";
+
+export default async (req, res) => {
+  const allowedOrigins = [
+    "https://www.wikingmedia.com",
+    "https://wiking-media.webflow.io",
+    "https://webflow-gcs-uploader.vercel.app"
+  ];
+  const origin = req.headers.origin;
+  if (allowedOrigins.includes(origin)) {
+    res.setHeader("Access-Control-Allow-Origin", origin);
+  }
+  res.setHeader("Vary", "Origin");
+  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
+  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
+  res.setHeader("Access-Control-Max-Age", "86400");
+  if (req.method === "OPTIONS") {
+    return res.status(200).end();
+  }
+
+  if (req.method !== "GET") {
+    return res.status(405).send("Method Not Allowed. Only GET allowed.");
+  }
+
+  try {
+    if (!process.env.GCS_KEY) {
+      console.error("Environment variable GCS_KEY is not set.");
+      return res.status(500).json({ error: "Server configuration error: GCS_KEY missing." });
+    }
+    const { publicId } = req.query;
+    if (!publicId) {
+      return res.status(400).json({ error: "Missing publicId" });
+    }
+    const serviceAccount = JSON.parse(process.env.GCS_KEY);
+    const storage = new Storage({
+      projectId: serviceAccount.project_id,
+      credentials: {
+        client_email: serviceAccount.client_email,
+        private_key: serviceAccount.private_key.replace(/\\n/g, "\n"),
+      },
+    });
+    const BUCKET_NAME = "wiking-portal";
+    const file = storage.bucket(BUCKET_NAME).file(publicId);
+    let metadata;
+    try {
+      [metadata] = await file.getMetadata();
+    } catch (err) {
+      if (err.code === 404) {
+        return res.status(404).send("File not found");
+      }
+      throw err;
+    }
+    const message = metadata.metadata ? metadata.metadata.message : "";
+    const originalFileName = publicId.includes("-") ? publicId.substring(publicId.indexOf("-") + 1) : publicId;
+    const baseUrl = process.env.BASE_URL || req.headers.origin || "";
+    const sanitizedBase = baseUrl.replace(/\/$/, "");
+    const downloadLink = `${sanitizedBase}/api/download?publicId=${encodeURIComponent(publicId)}`;
+
+    const escapeHtml = (str) => str.replace(/[&<>"']/g, (c) => ({
+      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
+    }[c]));
+
+    const safeName = escapeHtml(originalFileName);
+    const safeMessage = message ? escapeHtml(message) : "";
+
+    res.setHeader("Content-Type", "text/html; charset=utf-8");
+    res.end(`<!DOCTYPE html>
+<html lang="sv"><head><meta charset="utf-8"><title>${safeName}</title>
+<style>
+  .download-page-container {
+    max-width: 500px;
+    margin: 50px auto;
+    padding: 30px;
+    border: 1px solid #e0e0e0;
+    border-radius: 8px;
+    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
+    background-color: #fff;
+    text-align: center;
+    font-family: 'Inter', sans-serif;
+    color: #333;
+  }
+  .download-page-container h3 {
+    font-size: 24px;
+    color: #2c3e50;
+    margin-bottom: 20px;
+  }
+  #statusMessage {
+    margin-top: 10px;
+    font-size: 16px;
+    line-height: 1.5;
+    color: #555;
+    min-height: 20px;
+  }
+  #downloadFileBtn {
+    display: inline-block;
+    margin-top: 30px;
+    padding: 12px 25px;
+    font-size: 18px;
+    font-weight: bold;
+    color: #ffffff;
+    background-color: #007bff;
+    border: none;
+    border-radius: 5px;
+    cursor: pointer;
+    text-decoration: none;
+    transition: background-color 0.3s ease, transform 0.2s ease;
+  }
+  #downloadFileBtn:hover {
+    background-color: #0056b3;
+    transform: translateY(-2px);
+  }
+</style></head><body>
+<div class="download-page-container">
+  <h3>Din fil är redo för nedladdning</h3>
+  <p id="statusMessage"><strong>Filnamn:</strong> ${safeName}</p>
+  ${safeMessage ? `<p>${safeMessage}</p>` : ''}
+  <a id="downloadFileBtn" href="${downloadLink}">Ladda ner "${safeName}"</a>
+</div>
+</body></html>`);
+  } catch (error) {
+    console.error("Error in share endpoint", error);
+    if (error instanceof SyntaxError && error.message.includes('JSON')) {
+      return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
+    }
+    return res.status(500).json({ error: "Internal Server Error" });
+  }
+};
+
