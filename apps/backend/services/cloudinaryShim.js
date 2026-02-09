import { createReadStream } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import {
  deleteObject,
  getBucketForKind,
  headObject,
  putObject,
  resolvePublicUrl,
} from './r2UploadService.js';
import { isLegacyCloudinaryUrl, resolveLegacyCloudinaryUrl } from '../utils/legacyCloudinary.js';

const configState = {
  cloud_name: process.env.LEGACY_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
};

function config(next) {
  if (next && typeof next === 'object') {
    Object.assign(configState, next);
  }
  return { ...configState };
}

function mapKind(resourceType, publicId) {
  const id = String(publicId || '');
  if (id.startsWith('tts/')) return 'tts';
  if (resourceType === 'image') return 'image';
  if (resourceType === 'raw') return 'doc';
  if (resourceType === 'video') return 'video';
  return 'doc';
}

function resolveObjectPath(publicId, opts = {}) {
  let key = String(publicId || '').replace(/^\/+/, '');
  if (!key) return '';
  const format = opts.format || opts?.transformation?.format;
  if (format && !key.endsWith(`.${format}`) && !key.includes('.')) {
    key = `${key}.${format}`;
  }
  return key;
}

function resolveUrl(publicId, opts = {}) {
  if (!publicId) return '';
  if (/^https?:\/\//i.test(publicId)) return publicId;
  if (isLegacyCloudinaryUrl(publicId)) return publicId;
  const kind = mapKind(opts.resource_type, publicId);
  const bucket = getBucketForKind(kind);
  const objectPath = resolveObjectPath(publicId, opts);
  return resolvePublicUrl({ bucket, objectPath, kind });
}

async function uploadBuffer(buffer, opts = {}) {
  const publicId = opts.public_id || '';
  const fallback =
    opts.folder && publicId ? `${opts.folder}/${publicId}` : publicId;
  const objectPath =
    resolveObjectPath(fallback, opts) ||
    resolveObjectPath(`${opts.folder || 'uploads'}/${Date.now()}`, opts);
  const kind = mapKind(opts.resource_type, publicId);
  const bucket = getBucketForKind(kind);
  await putObject({
    bucket,
    objectPath,
    body: buffer,
    contentType: opts?.contentType || (opts?.resource_type === 'video' ? 'video/mp4' : undefined),
    cacheControl: opts.cacheControl || 'public, max-age=31536000, immutable',
  });
  return {
    secure_url: resolvePublicUrl({ bucket, objectPath, kind }),
    public_id: opts.public_id,
  };
}

async function uploadFile(filePath, opts = {}) {
  const base = path.basename(filePath);
  const noExt = base.replace(/\.[^/.]+$/, '');
  const publicId = opts.public_id || `${opts.folder || 'uploads'}/${noExt}-${Date.now()}`;
  const objectPath = resolveObjectPath(publicId, opts);
  const kind = mapKind(opts.resource_type, publicId);
  const bucket = getBucketForKind(kind);
  await putObject({
    bucket,
    objectPath,
    body: createReadStream(filePath),
    contentType: opts?.contentType,
    cacheControl: opts.cacheControl || 'public, max-age=31536000, immutable',
  });
  return {
    secure_url: resolvePublicUrl({ bucket, objectPath, kind }),
    public_id: publicId,
  };
}

const uploader = {
  upload_stream(opts = {}, cb) {
    const pass = new PassThrough();
    const chunks = [];
    pass.on('data', (chunk) => chunks.push(chunk));
    pass.on('finish', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const res = await uploadBuffer(buffer, opts);
        cb?.(null, res);
      } catch (err) {
        cb?.(err);
      }
    });
    return pass;
  },
  async upload(filePath, opts = {}) {
    return uploadFile(filePath, opts);
  },
  async upload_large(filePath, opts = {}) {
    return uploadFile(filePath, opts);
  },
};

const api = {
  async resource(publicId, opts = {}) {
    const kind = mapKind(opts.resource_type, publicId);
    const bucket = getBucketForKind(kind);
    const objectPath = resolveObjectPath(publicId, opts);
    await headObject({ bucket, objectPath });
    return {
      secure_url: resolvePublicUrl({ bucket, objectPath, kind }),
      public_id: publicId,
    };
  },
  async delete_resources(publicIds = [], opts = {}) {
    const kind = mapKind(opts.resource_type, publicIds?.[0]);
    const bucket = getBucketForKind(kind);
    await Promise.all(
      (publicIds || []).map((id) => {
        const objectPath = resolveObjectPath(id, opts);
        return deleteObject({ bucket, objectPath }).catch(() => null);
      }),
    );
    return { deleted: publicIds };
  },
};

const utils = {
  generate_auth_token() {
    return null;
  },
  api_sign_request() {
    return '';
  },
  private_download_url(publicId) {
    return resolveLegacyCloudinaryUrl(publicId) || '';
  },
  url(publicId, opts = {}) {
    return resolveUrl(publicId, opts);
  },
};

const cloudinaryShim = {
  config,
  uploader,
  api,
  utils,
  url(publicId, opts = {}) {
    return resolveUrl(publicId, opts);
  },
};

export default cloudinaryShim;
export { config, uploader, api, utils };
