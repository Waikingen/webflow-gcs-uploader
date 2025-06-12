# Webflow GCS Uploader

This Vercel project exposes serverless endpoints for uploading and downloading files to Google Cloud Storage. It can be used to implement a simple "WeTransfer" style workflow.

## Endpoints

- `POST /api/upload` – Generates a signed URL for uploading a file directly to GCS. Accepts `filename`, `contentType` and optional `message` in the request body. Returns the signed `uploadUrl`, the `publicId` of the file and a `shareUrl` which can be sent to clients.
- `GET /api/download?publicId=...` – Streams the file back to the requester and forces a download.
- `GET /api/share?publicId=...` – Serves a small HTML page showing the file name and message with a link to download.

Set the service account JSON in `GCS_KEY` and optionally configure `BASE_URL` if your deployment domain differs from the request origin.

An example upload form using these endpoints is provided in [`example.html`](example.html).
