import React, { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { RefreshCw, AlertTriangle, Wifi } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasChunkError: boolean;
  error: Error | null;
  isReloading: boolean;
}

/**
 * LazyLoadBoundary - Handles lazy-loaded component errors
 *
 * This boundary specifically catches chunk loading failures that occur
 * after deployments when the browser has cached references to old chunks
 * that no longer exist (404 errors on .js files with old hashes).
 *
 * It provides a user-friendly message and auto-reload option.
 */
class LazyLoadBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasChunkError: false,
      error: null,
      isReloading: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> | null {
    // Check if this is a chunk loading error
    const isChunkError = LazyLoadBoundary.isChunkLoadError(error);
    if (isChunkError) {
      return { hasChunkError: true, error };
    }
    // Let other errors propagate to parent ErrorBoundary
    throw error;
  }

  static isChunkLoadError(error: Error): boolean {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    // Common patterns for chunk loading failures
    return (
      message.includes('loading chunk') ||
      message.includes('loading css chunk') ||
      message.includes('failed to fetch dynamically imported module') ||
      message.includes('unable to preload css') ||
      message.includes('dynamically imported module') ||
      message.includes('failed to load') ||
      name.includes('chunkerror') ||
      // Vite-specific error patterns
      message.includes('.js') && (message.includes('404') || message.includes('failed'))
    );
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[LazyLoadBoundary] Chunk load error:', error);
    console.error('[LazyLoadBoundary] Component:', this.props.componentName || 'Unknown');

    // Store in sessionStorage that we had a chunk error
    // This helps detect if we're in a reload loop
    try {
      const reloadAttempts = parseInt(sessionStorage.getItem('chunk_reload_attempts') || '0', 10);
      sessionStorage.setItem('chunk_reload_attempts', String(reloadAttempts + 1));
      sessionStorage.setItem('chunk_error_time', String(Date.now()));
    } catch (e) {
      // Ignore storage errors
    }
  }

  handleReload = (): void => {
    this.setState({ isReloading: true });

    // Clear caches and reload
    const w = window as Window;
    if (typeof caches !== 'undefined') {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      }).finally(() => {
        w.location.reload();
      });
    } else {
      w.location.reload();
    }
  };

  handleRetry = (): void => {
    // Reset state and try to re-render
    this.setState({
      hasChunkError: false,
      error: null,
      isReloading: false
    });
  };

  shouldAutoReload(): boolean {
    // Check if we've already tried reloading recently
    try {
      const lastErrorTime = parseInt(sessionStorage.getItem('chunk_error_time') || '0', 10);
      const reloadAttempts = parseInt(sessionStorage.getItem('chunk_reload_attempts') || '0', 10);
      const timeSinceError = Date.now() - lastErrorTime;

      // Don't auto-reload if:
      // - We've tried more than 2 times
      // - The last error was less than 10 seconds ago (reload loop protection)
      if (reloadAttempts > 2 || timeSinceError < 10000) {
        return false;
      }
    } catch (e) {
      // If storage fails, don't auto-reload
      return false;
    }
    return true;
  }

  render(): ReactNode {
    const { children, fallback, componentName } = this.props;
    const { hasChunkError, isReloading } = this.state;

    if (hasChunkError) {
      // Auto-reload if appropriate
      if (this.shouldAutoReload() && !isReloading) {
        // Small delay before auto-reload
        setTimeout(() => this.handleReload(), 500);
        return (
          <div
            className="flex flex-col items-center justify-center p-8"
            style={{
              minHeight: '400px',
              background: 'var(--bg-primary)'
            }}
          >
            <div
              className="animate-spin rounded-full h-12 w-12 border-b-2 mb-4"
              style={{ borderColor: 'var(--roof-red)' }}
            />
            <p style={{ color: 'var(--text-secondary)' }}>
              Updating app... Please wait
            </p>
          </div>
        );
      }

      // Show manual reload UI
      return (
        <div
          className="flex flex-col items-center justify-center p-8"
          style={{
            minHeight: '400px',
            background: 'var(--bg-primary)'
          }}
        >
          <div
            className="flex items-center justify-center w-16 h-16 mb-6 rounded-full"
            style={{ background: 'rgba(var(--roof-red-rgb, 220, 38, 38), 0.1)' }}
          >
            {isReloading ? (
              <RefreshCw
                className="w-8 h-8 animate-spin"
                style={{ color: 'var(--roof-red)' }}
              />
            ) : (
              <Wifi
                className="w-8 h-8"
                style={{ color: 'var(--roof-red)' }}
              />
            )}
          </div>

          <h2
            className="text-xl font-semibold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {isReloading ? 'Updating...' : 'App Update Available'}
          </h2>

          <p
            className="text-center mb-6 max-w-md"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isReloading
              ? 'Please wait while we refresh the app...'
              : `The ${componentName || 'app'} has been updated. Please reload to get the latest version.`
            }
          </p>

          {!isReloading && (
            <div className="flex gap-4">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
                style={{
                  background: 'var(--roof-red)',
                  color: 'white'
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>

              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)'
                }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      );
    }

    // Default loading fallback
    const loadingFallback = fallback || (
      <div
        className="flex items-center justify-center h-full"
        style={{
          minHeight: '400px',
          background: 'var(--bg-primary)'
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2"
            style={{ borderColor: 'var(--roof-red)' }}
          ></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading {componentName || 'panel'}...
          </p>
        </div>
      </div>
    );

    return (
      <Suspense fallback={loadingFallback}>
        {children}
      </Suspense>
    );
  }
}

export default LazyLoadBoundary;
