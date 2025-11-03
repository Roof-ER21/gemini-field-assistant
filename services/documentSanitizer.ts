/**
 * Document Sanitizer Service
 * Cleans and validates document content before display
 */

export interface SanitizationResult {
  content: string;
  wasModified: boolean;
  issues: string[];
}

export const documentSanitizer = {
  /**
   * Remove HTML tags and extract text content
   */
  stripHTML(html: string): string {
    // Remove script and style tags with their content
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove DOCTYPE and meta tags
    text = text.replace(/<!DOCTYPE[^>]*>/gi, '');
    text = text.replace(/<meta[^>]*>/gi, '');
    text = text.replace(/<link[^>]*>/gi, '');

    // Remove all other HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&apos;/g, "'");

    // Remove excessive whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');

    return text.trim();
  },

  /**
   * Detect if content is HTML
   */
  isHTML(content: string): boolean {
    // Check for common HTML indicators
    return /<!DOCTYPE|<html|<head|<body|<div|<script|<style/i.test(content);
  },

  /**
   * Sanitize document content for safe display
   * Removes binary data, control characters, HTML, and malformed content
   */
  sanitizeContent(content: string, documentName?: string): SanitizationResult {
    const issues: string[] = [];
    let sanitized = content;
    let wasModified = false;

    // Check if content is null or undefined
    if (!content) {
      return {
        content: '[No content available]',
        wasModified: true,
        issues: ['Content is null or undefined']
      };
    }

    // Convert to string if not already
    if (typeof content !== 'string') {
      sanitized = String(content);
      wasModified = true;
      issues.push('Content was not a string, converted to string');
    }

    // Check if content contains HTML and strip it
    if (this.isHTML(sanitized)) {
      sanitized = this.stripHTML(sanitized);
      wasModified = true;
      issues.push('Stripped HTML tags from content');
    }

    // Remove null bytes
    if (sanitized.includes('\0')) {
      sanitized = sanitized.replace(/\0/g, '');
      wasModified = true;
      issues.push('Removed null bytes');
    }

    // Remove other control characters (except newlines, tabs, carriage returns)
    const controlCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
    if (controlCharsRegex.test(sanitized)) {
      sanitized = sanitized.replace(controlCharsRegex, '');
      wasModified = true;
      issues.push('Removed control characters');
    }

    // Check for binary/non-text content (high percentage of non-printable chars)
    const nonPrintableCount = (sanitized.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
    const nonPrintableRatio = nonPrintableCount / sanitized.length;

    if (nonPrintableRatio > 0.3) {
      // Likely binary data
      sanitized = `[Binary or non-text content detected in document: ${documentName || 'Unknown'}]\n\n` +
                  `This document appears to contain binary data or improperly encoded content.\n` +
                  `Please check the source file format and re-upload if needed.\n\n` +
                  `Original content length: ${content.length} bytes\n` +
                  `Non-printable character ratio: ${(nonPrintableRatio * 100).toFixed(1)}%`;
      wasModified = true;
      issues.push(`High non-printable character ratio: ${(nonPrintableRatio * 100).toFixed(1)}%`);
    }

    // Normalize line endings
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove excessive whitespace (more than 3 consecutive newlines)
    if (/\n{4,}/.test(sanitized)) {
      sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
      wasModified = true;
      issues.push('Reduced excessive whitespace');
    }

    // Trim whitespace from start and end
    const trimmed = sanitized.trim();
    if (trimmed !== sanitized) {
      sanitized = trimmed;
      wasModified = true;
    }

    // Check if content is suspiciously short (less than 10 chars)
    if (sanitized.length < 10 && content.length > 10) {
      issues.push('Content was significantly reduced during sanitization');
    }

    // Check for common document extraction errors
    if (sanitized.includes('PK\x03\x04') || sanitized.includes('PK\u0003\u0004')) {
      sanitized = `[ZIP/DOCX Archive Detected]\n\n` +
                  `This appears to be a compressed archive file (likely a .docx or .zip).\n` +
                  `The document needs to be properly extracted before it can be displayed.\n\n` +
                  `Document: ${documentName || 'Unknown'}`;
      wasModified = true;
      issues.push('Detected ZIP/DOCX archive header');
    }

    return {
      content: sanitized,
      wasModified,
      issues
    };
  },

  /**
   * Validate if content is displayable text
   */
  isDisplayableText(content: string): boolean {
    if (!content || typeof content !== 'string') {
      return false;
    }

    // Check for binary data indicators
    if (content.includes('\0')) return false;
    if (content.includes('PK\x03\x04')) return false;

    // Check printable character ratio
    const printableCount = (content.match(/[\x20-\x7E\n\r\t]/g) || []).length;
    const printableRatio = printableCount / content.length;

    return printableRatio > 0.7; // At least 70% printable
  },

  /**
   * Extract clean preview text (first N characters)
   */
  getCleanPreview(content: string, maxLength: number = 500): string {
    const { content: sanitized } = this.sanitizeContent(content);

    if (sanitized.length <= maxLength) {
      return sanitized;
    }

    // Find a good breaking point (end of sentence or word)
    let preview = sanitized.substring(0, maxLength);
    const lastPeriod = preview.lastIndexOf('.');
    const lastNewline = preview.lastIndexOf('\n');
    const lastSpace = preview.lastIndexOf(' ');

    const breakPoint = Math.max(lastPeriod, lastNewline, lastSpace);
    if (breakPoint > maxLength * 0.7) {
      preview = preview.substring(0, breakPoint + 1);
    }

    return preview + '...';
  },

  /**
   * Log sanitization issues for debugging
   */
  logIssues(documentName: string, result: SanitizationResult): void {
    if (result.wasModified) {
      console.warn(`Document sanitization issues for "${documentName}":`, {
        issues: result.issues,
        originalLength: result.content.length,
        wasModified: result.wasModified
      });
    }
  }
};

export default documentSanitizer;
