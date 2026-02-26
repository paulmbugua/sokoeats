export type CloudinaryResourceType = 'image' | 'video' | 'raw';

export type ParsedCloudinaryUrl = {
  cloudName?: string;
  resourceType?: CloudinaryResourceType;
  deliveryType?: 'upload' | 'fetch' | 'private' | string;
  signature?: string;
  transformations?: string;
  versionSegment?: string;
  publicIdWithExt?: string;
  publicId?: string;
};

export type BuildOptimizedCloudinaryArgs = {
  cloudName: string;
  resourceType: 'image' | 'video';
  publicId: string;
  formatHint?: string;
  width?: number;
  height?: number;
  crop?: 'limit' | 'fill' | 'fit';
  quality?: 'auto' | number;
  format?: 'auto' | 'auto:video';
};

export type OptimizeCloudinaryOptions = {
  width?: number;
  height?: number;
  resourceTypeHint?: 'image' | 'video';
  cloudNameFallback?: string;
};

export {
  isCloudinaryUrl,
  parseCloudinaryUrl,
  buildOptimizedCloudinaryUrl,
  optimizeCloudinaryDeliveryUrl,
} from './cloudinaryDelivery.js';
