/**
 * Client-side image compression utility for user-uploaded card condition photos.
 * Reduces raw mobile photos (often 5-12 MB) down to ~150-300 KB WebP images
 * with 1600px max dimensions, preserving sharp card details and text while
 * drastically reducing upload times, bandwidth, and Supabase storage costs.
 */

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg';
}

const DEFAULT_OPTIONS: ImageCompressionOptions = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.82,
  format: 'image/webp',
};

export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  // If not in browser or not an image, return as-is
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  // Already tiny (under 80 KB) - no need to compress further
  if (file.size < 80 * 1024) {
    return file;
  }

  const { maxWidth = 1600, maxHeight = 1600, quality = 0.82, format = 'image/webp' } = options;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Calculate aspect-ratio preserved dimensions
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Smooth downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const tryExport = (mime: string, ext: string) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              if (mime !== 'image/jpeg') {
                tryExport('image/jpeg', '.jpg');
              } else {
                resolve(file);
              }
              return;
            }

            // Only use compressed if it actually reduced file size (or converted format)
            if (blob.size < file.size) {
              const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
              const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
              const compressedFile = new File([blob], `${cleanBase}${ext}`, {
                type: mime,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          mime,
          quality
        );
      };

      tryExport(format, format === 'image/webp' ? '.webp' : '.jpg');
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fallback to raw file if preview fails
    };

    img.src = objectUrl;
  });
}

/**
 * Compresses an array of image files in parallel.
 */
export async function compressImages(
  files: File[],
  options?: ImageCompressionOptions
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, options)));
}
