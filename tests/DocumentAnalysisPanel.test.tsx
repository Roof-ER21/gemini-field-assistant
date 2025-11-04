/**
 * Test Suite: DocumentAnalysisPanel
 * Testing document upload, analysis workflow, and AI integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentAnalysisPanel from '../components/DocumentAnalysisPanel';
import { multiAI } from '../services/multiProviderAI';

// Mock dependencies
vi.mock('../services/multiProviderAI', () => ({
  multiAI: {
    generate: vi.fn(),
  },
}));

vi.mock('pdfjs-dist', () => ({
  default: {
    getDocument: vi.fn(),
  },
}));

vi.mock('mammoth/mammoth.browser', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

describe('DocumentAnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render the main heading and description', () => {
      render(<DocumentAnalysisPanel />);

      expect(screen.getByText(/Document Analyzer/i)).toBeInTheDocument();
      expect(screen.getByText(/AI-Powered Multi-Format Document Analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/Powered by Susan AI/i)).toBeInTheDocument();
    });

    it('should display supported file format badges', () => {
      render(<DocumentAnalysisPanel />);

      expect(screen.getByText('📄 PDF')).toBeInTheDocument();
      expect(screen.getByText('📝 Word')).toBeInTheDocument();
      expect(screen.getByText('📊 Excel')).toBeInTheDocument();
      expect(screen.getByText('📃 Text')).toBeInTheDocument();
      expect(screen.getByText('🖼️ Images')).toBeInTheDocument();
    });

    it('should render upload zone with correct text', () => {
      render(<DocumentAnalysisPanel />);

      expect(screen.getByText('Drag & drop files here')).toBeInTheDocument();
      expect(screen.getByText('or click to browse')).toBeInTheDocument();
      expect(screen.getByText(/Max 20 files, 10MB each/i)).toBeInTheDocument();
    });

    it('should render optional context fields', () => {
      render(<DocumentAnalysisPanel />);

      expect(screen.getByLabelText(/Property Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Claim\/Loss Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Additional Notes/i)).toBeInTheDocument();
    });

    it('should render disabled analyze button initially', () => {
      render(<DocumentAnalysisPanel />);

      const analyzeButton = screen.getByRole('button', { name: /Analyze 0 Document/i });
      expect(analyzeButton).toBeDisabled();
    });

    it('should render empty state in results panel', () => {
      render(<DocumentAnalysisPanel />);

      expect(screen.getByText('No Analysis Yet')).toBeInTheDocument();
      expect(screen.getByText(/Upload documents and click "Analyze"/i)).toBeInTheDocument();
    });
  });

  describe('File Upload - Basic Functionality', () => {
    it('should accept file selection via file input', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });
    });

    it('should display uploaded file with correct icon', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('document.pdf')).toBeInTheDocument();
        expect(screen.getByText('📄')).toBeInTheDocument();
      });
    });

    it('should display file size correctly', async () => {
      render(<DocumentAnalysisPanel />);

      const content = 'a'.repeat(1500); // 1.5 KB
      const file = new File([content], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/1\.\d KB/)).toBeInTheDocument();
      });
    });

    it('should allow uploading multiple files', async () => {
      render(<DocumentAnalysisPanel />);

      const files = [
        new File(['content1'], 'file1.txt', { type: 'text/plain' }),
        new File(['content2'], 'file2.pdf', { type: 'application/pdf' }),
        new File(['content3'], 'file3.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      ];

      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, files);

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('file2.pdf')).toBeInTheDocument();
        expect(screen.getByText('file3.docx')).toBeInTheDocument();
        expect(screen.getByText('Uploaded Files (3)')).toBeInTheDocument();
      });
    });

    it('should enable analyze button when files are uploaded', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        const analyzeButton = screen.getByRole('button', { name: /Analyze 1 Document with Susan/i });
        expect(analyzeButton).not.toBeDisabled();
      });
    });
  });

  describe('File Upload - Validation', () => {
    it('should reject files larger than 10MB', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      render(<DocumentAnalysisPanel />);

      const largeContent = 'a'.repeat(11 * 1024 * 1024); // 11MB
      const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds 10MB limit'));
      expect(screen.queryByText('large.pdf')).not.toBeInTheDocument();

      alertSpy.mockRestore();
    });

    it('should prevent uploading more than 20 files', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      render(<DocumentAnalysisPanel />);

      const files = Array.from({ length: 21 }, (_, i) =>
        new File([`content${i}`], `file${i}.txt`, { type: 'text/plain' })
      );

      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, files);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Maximum 20 files allowed');
        expect(screen.getByText(/Uploaded Files \(20\)/)).toBeInTheDocument();
      });

      alertSpy.mockRestore();
    });

    it('should validate accepted file types', () => {
      render(<DocumentAnalysisPanel />);

      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      expect(input.accept).toContain('.pdf');
      expect(input.accept).toContain('.docx');
      expect(input.accept).toContain('.txt');
      expect(input.accept).toContain('.jpg');
      expect(input.accept).toContain('.png');
    });
  });

  describe('File Management', () => {
    it('should allow removing individual files', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      const removeButton = screen.getByText('×');
      fireEvent.click(removeButton);

      expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
    });

    it('should clear all files when Clear All is clicked', async () => {
      render(<DocumentAnalysisPanel />);

      const files = [
        new File(['content1'], 'file1.txt', { type: 'text/plain' }),
        new File(['content2'], 'file2.txt', { type: 'text/plain' }),
      ];

      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, files);

      await waitFor(() => {
        expect(screen.getByText('Uploaded Files (2)')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear All');
      fireEvent.click(clearButton);

      expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
      expect(screen.queryByText('file2.txt')).not.toBeInTheDocument();
    });

    it('should show file count in upload list', async () => {
      render(<DocumentAnalysisPanel />);

      const files = [
        new File(['1'], 'f1.txt', { type: 'text/plain' }),
        new File(['2'], 'f2.txt', { type: 'text/plain' }),
        new File(['3'], 'f3.txt', { type: 'text/plain' }),
      ];

      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, files);

      await waitFor(() => {
        expect(screen.getByText('Uploaded Files (3)')).toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag over event', () => {
      render(<DocumentAnalysisPanel />);

      const dropZone = screen.getByText('Drag & drop files here').closest('div');

      fireEvent.dragOver(dropZone!, { dataTransfer: { files: [] } });

      // Visual feedback should be applied (border color changes)
      expect(dropZone).toHaveStyle({ border: '2px dashed #3b82f6' });
    });

    it('should handle drag leave event', () => {
      render(<DocumentAnalysisPanel />);

      const dropZone = screen.getByText('Drag & drop files here').closest('div');

      fireEvent.dragOver(dropZone!, { dataTransfer: { files: [] } });
      fireEvent.dragLeave(dropZone!);

      expect(dropZone).toHaveStyle({ border: '2px dashed #d1d5db' });
    });

    it('should handle file drop', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'dropped.txt', { type: 'text/plain' });
      const dropZone = screen.getByText('Drag & drop files here').closest('div');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText('dropped.txt')).toBeInTheDocument();
      });
    });
  });

  describe('Optional Context Fields', () => {
    it('should allow entering property address', async () => {
      render(<DocumentAnalysisPanel />);

      const input = screen.getByPlaceholderText(/123 Main St/i);
      await userEvent.type(input, '456 Oak Street, City, ST 12345');

      expect(input).toHaveValue('456 Oak Street, City, ST 12345');
    });

    it('should allow selecting claim date', async () => {
      render(<DocumentAnalysisPanel />);

      const input = screen.getByLabelText(/Claim\/Loss Date/i);
      await userEvent.type(input, '2025-01-15');

      expect(input).toHaveValue('2025-01-15');
    });

    it('should allow entering additional notes', async () => {
      render(<DocumentAnalysisPanel />);

      const textarea = screen.getByPlaceholderText(/Any additional context/i);
      await userEvent.type(textarea, 'Storm damage from hurricane');

      expect(textarea).toHaveValue('Storm damage from hurricane');
    });

    it('should clear context fields when Clear All is clicked', async () => {
      render(<DocumentAnalysisPanel />);

      const addressInput = screen.getByPlaceholderText(/123 Main St/i);
      const notesInput = screen.getByPlaceholderText(/Any additional context/i);

      await userEvent.type(addressInput, '123 Test St');
      await userEvent.type(notesInput, 'Test notes');

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('Uploaded Files (1)')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear All');
      fireEvent.click(clearButton);

      expect(addressInput).toHaveValue('');
      expect(notesInput).toHaveValue('');
    });
  });

  describe('Document Analysis - Success Flow', () => {
    it('should show loading state during analysis', async () => {
      const mockGenerate = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );
      (multiAI.generate as any).mockImplementation(mockGenerate);

      render(<DocumentAnalysisPanel />);

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Analyzing Documents.../i)).toBeInTheDocument();
      });
    });

    it('should display analysis results on success', async () => {
      const mockResponse = {
        content: JSON.stringify({
          approvalStatus: 'full',
          insuranceData: {
            claimNumber: 'CLM-12345',
            policyNumber: 'POL-67890',
            insuranceCompany: 'Test Insurance Co',
          },
          summary: 'Test summary of the documents',
          keyFindings: ['Finding 1', 'Finding 2'],
          recommendations: ['Recommendation 1'],
          nextSteps: ['Step 1', 'Step 2'],
        }),
        provider: 'Test Provider',
        model: 'test-model',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['insurance claim content'], 'claim.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('claim.txt')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
      });

      expect(screen.getByText('✓ Full Approval')).toBeInTheDocument();
      expect(screen.getByText('CLM-12345')).toBeInTheDocument();
      expect(screen.getByText('Test summary of the documents')).toBeInTheDocument();
      expect(screen.getByText('Finding 1')).toBeInTheDocument();
    });

    it('should update file status to success after analysis', async () => {
      const mockResponse = {
        content: JSON.stringify({
          approvalStatus: 'unknown',
          insuranceData: {},
          summary: 'Test',
          keyFindings: [],
          recommendations: [],
          nextSteps: [],
        }),
        provider: 'Test',
        model: 'test',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
      });

      // Success icon should be displayed
      const successIcon = document.querySelector('.text-green-600');
      expect(successIcon).toBeInTheDocument();
    });
  });

  describe('Document Analysis - Error Handling', () => {
    it('should show error alert when analysis fails', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      (multiAI.generate as any).mockRejectedValue(new Error('AI service unavailable'));

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Analysis failed'));
      });

      alertSpy.mockRestore();
    });

    it('should require at least one file before analysis', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<DocumentAnalysisPanel />);

      const analyzeButton = screen.getByRole('button', { name: /Analyze 0 Document/i });

      // Button should be disabled
      expect(analyzeButton).toBeDisabled();

      alertSpy.mockRestore();
    });

    it('should handle malformed AI response gracefully', async () => {
      const mockResponse = {
        content: 'Invalid JSON response',
        provider: 'Test',
        model: 'test',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
      });

      // Should show fallback message
      expect(screen.getByText(/Unable to extract structured data/i)).toBeInTheDocument();
    });
  });

  describe('Approval Status Display', () => {
    it('should display full approval badge correctly', async () => {
      const mockResponse = {
        content: JSON.stringify({
          approvalStatus: 'full',
          insuranceData: {},
          summary: 'Approved',
          keyFindings: [],
          recommendations: [],
          nextSteps: [],
        }),
        provider: 'Test',
        model: 'test',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('✓ Full Approval')).toBeInTheDocument();
      });
    });

    it('should display partial approval badge correctly', async () => {
      const mockResponse = {
        content: JSON.stringify({
          approvalStatus: 'partial',
          insuranceData: {},
          summary: 'Partial',
          keyFindings: [],
          recommendations: [],
          nextSteps: [],
        }),
        provider: 'Test',
        model: 'test',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('◐ Partial Approval')).toBeInTheDocument();
      });
    });

    it('should display denial badge correctly', async () => {
      const mockResponse = {
        content: JSON.stringify({
          approvalStatus: 'denial',
          insuranceData: {},
          summary: 'Denied',
          keyFindings: [],
          recommendations: [],
          nextSteps: [],
        }),
        provider: 'Test',
        model: 'test',
      };

      (multiAI.generate as any).mockResolvedValue(mockResponse);

      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('✗ Denial')).toBeInTheDocument();
      });
    });
  });

  describe('File Type Icons', () => {
    it('should display correct icon for PDF files', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('📄')).toBeInTheDocument();
      });
    });

    it('should display correct icon for Word files', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('📝')).toBeInTheDocument();
      });
    });

    it('should display correct icon for text files', async () => {
      render(<DocumentAnalysisPanel />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('📃')).toBeInTheDocument();
      });
    });
  });

  describe('Context Integration', () => {
    it('should include context in AI prompt', async () => {
      const generateSpy = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          approvalStatus: 'unknown',
          insuranceData: {},
          summary: 'Test',
          keyFindings: [],
          recommendations: [],
          nextSteps: [],
        }),
        provider: 'Test',
        model: 'test',
      });

      (multiAI.generate as any).mockImplementation(generateSpy);

      render(<DocumentAnalysisPanel />);

      // Fill in context
      await userEvent.type(screen.getByPlaceholderText(/123 Main St/i), '789 Pine Ave');
      await userEvent.type(screen.getByLabelText(/Claim\/Loss Date/i), '2025-01-20');
      await userEvent.type(screen.getByPlaceholderText(/Any additional context/i), 'Hail damage');

      // Upload file
      const file = new File(['claim text'], 'claim.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /Drag & drop files here/i })
        .querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      // Analyze
      const analyzeButton = await screen.findByRole('button', { name: /Analyze 1 Document with Susan/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(generateSpy).toHaveBeenCalled();
      });

      const calledPrompt = generateSpy.mock.calls[0][0][1].content;
      expect(calledPrompt).toContain('Property Address: 789 Pine Ave');
      expect(calledPrompt).toContain('Claim/Loss Date: 2025-01-20');
      expect(calledPrompt).toContain('Additional Notes: Hail damage');
    });
  });
});
