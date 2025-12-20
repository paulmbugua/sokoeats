// scripts/seedBrandingAssets.js
import { v2 as cloudinary } from 'cloudinary';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // or CLOUDINARY_NAME
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  await cloudinary.uploader.upload('scripts/icons/branding_logo.png', {
    public_id: 'branding/logo',
    overwrite: true,
    invalidate: true, // purge CDN cache if replacing
    resource_type: 'image',
    type: 'upload',
  });
  await cloudinary.uploader.upload('scripts/icons/branding_signature.png', {
    public_id: 'branding/signature',
    overwrite: true,
    invalidate: true,
    resource_type: 'image',
    type: 'upload',
  });
  console.log('Uploaded branding/logo and branding/signature');
}
run().catch(console.error);
