/**
 * Batch Document Loader
 * Safely loads large numbers of documents without timeouts
 * Implements retry logic, progress tracking, and error recovery
 */
export class BatchDocumentLoader {
    batchSize;
    retryAttempts;
    retryDelay;
    timeout;
    constructor(options = {}) {
        this.batchSize = options.batchSize || 10; // Load 10 documents at a time
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second between retries
        this.timeout = options.timeout || 30000; // 30 seconds per request
    }
    /**
     * Load items in batches with progress callback
     */
    async loadInBatches(items, loadFn, options = {}) {
        const results = [];
        const failed = [];
        const totalBatches = Math.ceil(items.length / this.batchSize);
        for (let i = 0; i < items.length; i += this.batchSize) {
            const batch = items.slice(i, i + this.batchSize);
            const batchIndex = Math.floor(i / this.batchSize);
            try {
                // Load batch in parallel
                const batchResults = await Promise.allSettled(batch.map(item => this.loadWithRetry(item, loadFn, options.onError)));
                // Separate successful and failed results
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    }
                    else {
                        failed.push({
                            item: batch[index],
                            error: result.reason
                        });
                    }
                });
                // Report progress
                const progress = {
                    total: items.length,
                    loaded: results.length,
                    failed: failed.length,
                    percentage: Math.round((results.length / items.length) * 100),
                    currentBatch: batchIndex + 1,
                    totalBatches
                };
                options.onProgress?.(progress);
                options.onBatchComplete?.(batchResults.filter(r => r.status === 'fulfilled').map(r => r.value), batchIndex);
                // Small delay between batches to prevent overwhelming the server
                if (i + this.batchSize < items.length) {
                    await this.delay(200);
                }
            }
            catch (error) {
                console.error(`Batch ${batchIndex + 1} failed:`, error);
                // Continue with next batch
            }
        }
        const finalProgress = {
            total: items.length,
            loaded: results.length,
            failed: failed.length,
            percentage: Math.round((results.length / items.length) * 100),
            currentBatch: totalBatches,
            totalBatches
        };
        return {
            success: results,
            failed,
            progress: finalProgress
        };
    }
    /**
     * Load single item with retry logic
     */
    async loadWithRetry(item, loadFn, onError) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                // Load with timeout
                const result = await this.withTimeout(loadFn(item), this.timeout, `Timeout loading item after ${this.timeout}ms`);
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                onError?.(item, lastError, attempt);
                // Don't retry on last attempt
                if (attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt); // Exponential backoff
                }
            }
        }
        throw lastError || new Error('Failed to load item after retries');
    }
    /**
     * Execute promise with timeout
     */
    withTimeout(promise, timeoutMs, timeoutError) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(timeoutError));
            }, timeoutMs);
            promise
                .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
/**
 * Pre-configured loader for documents
 */
export const documentBatchLoader = new BatchDocumentLoader({
    batchSize: 8, // 8 documents per batch
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 15000 // 15 seconds per document
});
