# Private delivery-partner documents

Delivery-partner identity files must use a dedicated, non-public Cloudflare R2 bucket.

Set `R2_BUCKET_DOCS` in every backend environment. `R2_BUCKET_DOCUMENTS` remains accepted as a backwards-compatible alias. The value is the bucket name, currently `sokoeats-docs`, not a URL.

Do not attach an R2 public development URL or custom public domain such as `docs.sokoeats.co.ke` to this bucket. The backend issues ten-minute upload URLs and five-minute review URLs after authenticating the applicant or administrator.

The existing `R2_BUCKET_IMAGES` and `R2_PUBLIC_BASE_URL_IMAGES` settings remain for public catalogue images only. Never point `R2_BUCKET_DOCS` at that public bucket.
