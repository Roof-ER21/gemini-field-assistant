/**
 * Document Routes - Template-based Document Generation
 *
 * Endpoints for generating DOCX documents from templates using Carbone.
 * Supports inspection agreements, insurance scopes, homeowner letters, and COCs.
 */

import { Router, Request, Response } from 'express';
import { carboneService } from '../services/carboneService.js';
import {
  mapInspectionAgreement,
  mapInsuranceScope,
  mapHomeownerLetter,
  mapCertificateOfCompletion,
} from '../services/documentDataMappers.js';

export function createDocumentRoutes() {
  const router = Router();

  /**
   * GET /api/documents/templates
   * List available document templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    const templates = carboneService.listTemplates();
    res.json({ templates });
  });

  /**
   * POST /api/documents/generate
   * Generate a document from a template + data
   *
   * Body: { templateId, data, convertTo? }
   * Returns: DOCX file download
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { templateId, data, convertTo } = req.body;

      if (!templateId) {
        return res.status(400).json({ error: 'templateId is required' });
      }
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'data object is required' });
      }

      const template = carboneService.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: `Template not found: ${templateId}` });
      }

      // Apply data mapper based on template type
      let mappedData: Record<string, any>;
      switch (templateId) {
        case 'inspection-agreement':
          mappedData = mapInspectionAgreement(data);
          break;
        case 'insurance-scope':
          mappedData = mapInsuranceScope(data);
          break;
        case 'homeowner-letter':
          mappedData = mapHomeownerLetter(data);
          break;
        case 'coc':
          mappedData = mapCertificateOfCompletion(data);
          break;
        default:
          mappedData = data;
      }

      const result = await carboneService.renderDocument(templateId, mappedData, { convertTo });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (error: any) {
      console.error('[Documents] Generate error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate document' });
    }
  });

  /**
   * POST /api/documents/preview
   * Preview template fields without generating
   *
   * Body: { templateId, data }
   * Returns: mapped data that would be used for generation
   */
  router.post('/preview', (req: Request, res: Response) => {
    try {
      const { templateId, data } = req.body;

      const template = carboneService.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: `Template not found: ${templateId}` });
      }

      let mappedData: Record<string, any>;
      switch (templateId) {
        case 'inspection-agreement':
          mappedData = mapInspectionAgreement(data || {});
          break;
        case 'insurance-scope':
          mappedData = mapInsuranceScope(data || {});
          break;
        case 'homeowner-letter':
          mappedData = mapHomeownerLetter(data || {});
          break;
        case 'coc':
          mappedData = mapCertificateOfCompletion(data || {});
          break;
        default:
          mappedData = data || {};
      }

      res.json({ template, mappedData });
    } catch (error: any) {
      console.error('[Documents] Preview error:', error);
      res.status(500).json({ error: error.message || 'Failed to preview document' });
    }
  });

  return router;
}
