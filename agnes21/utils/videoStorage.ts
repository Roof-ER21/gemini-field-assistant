/**
 * IndexedDB Video Storage System for Agnes-21
 * Handles large video file storage with metadata
 */

const DB_VERSION = 1;
const VIDEO_STORE = 'recordings';
const MAX_VIDEOS = 20; // Limit storage to prevent quota issues

/**
 * Generates a database name specific to a user
 * @param userId - User ID to scope the database to
 * @returns User-specific database name
 */
const getDBName = (userId?: string): string => {
  if (!userId) {
    return 'agnes_videos'; // Legacy database name for backward compatibility
  }
  return `agnes_videos_${userId}`;
};

export interface VideoRecording {
  sessionId: string;
  recordedAt: Date;
  duration: number; // in seconds
  size: number; // in bytes
  mimeType: string;
  videoBlob: Blob;
  thumbnail?: string; // base64 encoded thumbnail
  metadata?: {
    difficulty?: string;
    mode?: string;
    finalScore?: number;
  };
  userId?: string; // Track which user owns this recording
}

export interface VideoMetadata {
  sessionId: string;
  recordedAt: Date;
  duration: number;
  size: number;
  mimeType: string;
  thumbnail?: string;
  metadata?: {
    difficulty?: string;
    mode?: string;
    finalScore?: number;
  };
  userId?: string; // Track which user owns this recording
}

/**
 * Opens IndexedDB connection
 * @param userId - Optional user ID to scope the database to
 */
const openDB = (userId?: string): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const dbName = getDBName(userId);
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create video store if it doesn't exist
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const store = db.createObjectStore(VIDEO_STORE, { keyPath: 'sessionId' });
        store.createIndex('recordedAt', 'recordedAt', { unique: false });
        store.createIndex('size', 'size', { unique: false });
      }
    };
  });
};

/**
 * Saves a video recording to IndexedDB
 * @param recording - Video recording data to save
 * @param userId - Optional user ID to scope the recording to
 */
export const saveVideoRecording = async (
  recording: VideoRecording,
  userId?: string
): Promise<boolean> => {
  try {
    // Add userId to recording metadata
    const recordingWithUser = { ...recording, userId };

    const db = await openDB(userId);

    // Check storage quota before saving
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const availableSpace = (estimate.quota || 0) - (estimate.usage || 0);

      if (recordingWithUser.size > availableSpace * 0.8) {
        console.warn('Insufficient storage space. Attempting cleanup...');
        await cleanupOldVideos(5, userId); // Remove 5 oldest videos
      }
    }

    const transaction = db.transaction([VIDEO_STORE], 'readwrite');
    const store = transaction.objectStore(VIDEO_STORE);

    // Check if we've hit the limit
    const count = await new Promise<number>((resolve, reject) => {
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    if (count >= MAX_VIDEOS) {
      console.log('Max videos reached. Removing oldest...');
      await cleanupOldVideos(1, userId);
    }

    // Save the recording
    await new Promise<void>((resolve, reject) => {
      const request = store.put(recordingWithUser);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log(`Video saved: ${recordingWithUser.sessionId} (${formatBytes(recordingWithUser.size)})`);
    return true;
  } catch (error) {
    console.error('Failed to save video recording:', error);
    return false;
  }
};

/**
 * Retrieves a video recording by session ID
 * @param sessionId - Session ID to retrieve video for
 * @param userId - Optional user ID to scope the search to
 */
export const getVideoRecording = async (
  sessionId: string,
  userId?: string
): Promise<VideoRecording | null> => {
  try {
    const db = await openDB(userId);
    const transaction = db.transaction([VIDEO_STORE], 'readonly');
    const store = transaction.objectStore(VIDEO_STORE);

    const recording = await new Promise<VideoRecording | null>((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Convert date strings back to Date objects
          result.recordedAt = new Date(result.recordedAt);
        }
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });

    db.close();
    return recording;
  } catch (error) {
    console.error('Failed to get video recording:', error);
    return null;
  }
};

/**
 * Gets all video metadata (without blob data for performance)
 * @param userId - Optional user ID to scope the search to
 */
export const getAllVideoMetadata = async (userId?: string): Promise<VideoMetadata[]> => {
  try {
    const db = await openDB(userId);
    const transaction = db.transaction([VIDEO_STORE], 'readonly');
    const store = transaction.objectStore(VIDEO_STORE);

    const metadata = await new Promise<VideoMetadata[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result.map((recording: VideoRecording) => {
          const { videoBlob, ...meta } = recording; // Exclude blob
          return {
            ...meta,
            recordedAt: new Date(meta.recordedAt)
          };
        });
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });

    db.close();
    return metadata.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  } catch (error) {
    console.error('Failed to get video metadata:', error);
    return [];
  }
};

/**
 * Deletes a video recording
 * @param sessionId - Session ID to delete video for
 * @param userId - Optional user ID to scope the deletion to
 */
export const deleteVideoRecording = async (sessionId: string, userId?: string): Promise<boolean> => {
  try {
    const db = await openDB(userId);
    const transaction = db.transaction([VIDEO_STORE], 'readwrite');
    const store = transaction.objectStore(VIDEO_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log(`Video deleted: ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Failed to delete video recording:', error);
    return false;
  }
};

/**
 * Cleans up oldest videos to free space
 * @param count - Number of videos to delete
 * @param userId - Optional user ID to scope the cleanup to
 */
const cleanupOldVideos = async (count: number, userId?: string): Promise<void> => {
  try {
    const metadata = await getAllVideoMetadata(userId);
    const oldest = metadata
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      .slice(0, count);

    for (const video of oldest) {
      await deleteVideoRecording(video.sessionId, userId);
    }

    console.log(`Cleaned up ${count} old videos`);
  } catch (error) {
    console.error('Failed to cleanup old videos:', error);
  }
};

/**
 * Gets storage usage statistics
 * @param userId - Optional user ID to scope statistics to
 */
export const getStorageStats = async (userId?: string): Promise<{
  videoCount: number;
  totalSize: number;
  quota?: number;
  usage?: number;
  available?: number;
}> => {
  try {
    const metadata = await getAllVideoMetadata(userId);
    const totalSize = metadata.reduce((sum, video) => sum + video.size, 0);

    let quota, usage, available;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      quota = estimate.quota;
      usage = estimate.usage;
      available = quota ? quota - usage : undefined;
    }

    return {
      videoCount: metadata.length,
      totalSize,
      quota,
      usage,
      available
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return {
      videoCount: 0,
      totalSize: 0
    };
  }
};

/**
 * Checks if video recording is available for a session
 * @param sessionId - Session ID to check
 * @param userId - Optional user ID to scope the check to
 */
export const hasVideoRecording = async (sessionId: string, userId?: string): Promise<boolean> => {
  try {
    const db = await openDB(userId);
    const transaction = db.transaction([VIDEO_STORE], 'readonly');
    const store = transaction.objectStore(VIDEO_STORE);

    const exists = await new Promise<boolean>((resolve, reject) => {
      const request = store.getKey(sessionId);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return exists;
  } catch (error) {
    console.error('Failed to check video existence:', error);
    return false;
  }
};

/**
 * Generates a thumbnail from video blob
 */
export const generateThumbnail = async (
  videoBlob: Blob,
  timeSeconds: number = 1
): Promise<string | undefined> => {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(undefined);
        return;
      }

      video.preload = 'metadata';
      video.src = URL.createObjectURL(videoBlob);

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(timeSeconds, video.duration / 2);
      };

      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            } else {
              resolve(undefined);
            }
            URL.revokeObjectURL(video.src);
          },
          'image/jpeg',
          0.6
        );
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(undefined);
      };
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      resolve(undefined);
    }
  });
};

/**
 * Clears all video recordings (for testing/debugging)
 * @param userId - Optional user ID to scope the clear to
 */
export const clearAllVideos = async (userId?: string): Promise<boolean> => {
  try {
    const db = await openDB(userId);
    const transaction = db.transaction([VIDEO_STORE], 'readwrite');
    const store = transaction.objectStore(VIDEO_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log('All videos cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear videos:', error);
    return false;
  }
};

/**
 * Formats bytes to human-readable format
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Gets supported MIME types for recording
 */
export const getSupportedMimeType = (): string => {
  // Prioritize VP8 over VP9 for better compatibility and duration metadata
  const types = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/webm;codecs=vp9,opus',
    'video/mp4'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`Using MIME type: ${type}`);
      return type;
    }
  }

  return 'video/webm'; // Fallback
};
