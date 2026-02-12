/**
 * Carbone Service
 *
 * Template-based document generation using Carbone.
 * Renders DOCX templates with JSON data.
 * PDF conversion requires LibreOffice (future enhancement).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../templates');
// Registry of available templates and their expected fields
const TEMPLATE_REGISTRY = [
    {
        id: 'inspection-agreement',
        name: 'Inspection Agreement',
        description: 'Property inspection authorization and agreement',
        filename: 'inspection-agreement.docx',
        fields: ['customerName', 'customerAddress', 'customerPhone', 'customerEmail', 'date', 'repName', 'repPhone'],
    },
    {
        id: 'insurance-scope',
        name: 'Insurance Scope of Work',
        description: 'Detailed scope for insurance claim submission',
        filename: 'insurance-scope.docx',
        fields: ['customerName', 'customerAddress', 'insuranceCompany', 'claimNumber', 'lineItems', 'totalAmount', 'date'],
    },
    {
        id: 'homeowner-letter',
        name: 'Homeowner Letter',
        description: 'Post-inspection letter to homeowner with findings',
        filename: 'homeowner-letter.docx',
        fields: ['customerName', 'customerAddress', 'stormDates', 'findings', 'recommendations', 'repName', 'date'],
    },
    {
        id: 'coc',
        name: 'Certificate of Completion',
        description: 'Certificate confirming work completion',
        filename: 'coc.docx',
        fields: ['customerName', 'customerAddress', 'completionDate', 'workPerformed', 'warrantyInfo', 'repName'],
    },
];
class CarboneService {
    carbone = null;
    initialized = false;
    /** Lazy-load carbone (it's a CommonJS module) */
    async getCarbone() {
        if (!this.carbone) {
            try {
                // Dynamic import for CommonJS module
                const carboneModule = await import('carbone');
                this.carbone = carboneModule.default || carboneModule;
                this.initialized = true;
            }
            catch (err) {
                console.error('[Carbone] Failed to load carbone:', err);
                throw new Error('Carbone module not available');
            }
        }
        return this.carbone;
    }
    /** List available templates */
    listTemplates() {
        return TEMPLATE_REGISTRY.map(t => ({
            ...t,
            // Check if template file actually exists
            filename: fs.existsSync(path.join(TEMPLATES_DIR, t.filename)) ? t.filename : `${t.filename} (missing)`,
        }));
    }
    /** Get a specific template's info */
    getTemplate(templateId) {
        return TEMPLATE_REGISTRY.find(t => t.id === templateId) || null;
    }
    /**
     * Render a document from a template + data.
     * Returns a Buffer of the rendered DOCX.
     */
    async renderDocument(templateId, data, options) {
        const template = TEMPLATE_REGISTRY.find(t => t.id === templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }
        const templatePath = path.join(TEMPLATES_DIR, template.filename);
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file missing: ${template.filename}. Please add it to server/templates/`);
        }
        const carbone = await this.getCarbone();
        // Wrap data for Carbone's {d.field} syntax
        const carboneData = { d: data };
        const convertTo = options?.convertTo || '';
        return new Promise((resolve, reject) => {
            carbone.render(templatePath, carboneData, { convertTo }, (err, result) => {
                if (err) {
                    console.error('[Carbone] Render error:', err);
                    return reject(new Error(`Document generation failed: ${err.message || err}`));
                }
                const ext = convertTo || 'docx';
                const contentType = ext === 'pdf'
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                const filename = `${template.id}-${Date.now()}.${ext}`;
                resolve({ buffer: result, filename, contentType });
            });
        });
    }
    /**
     * Render from a raw template file path (for custom templates).
     */
    async renderFromFile(templatePath, data, options) {
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }
        const carbone = await this.getCarbone();
        const carboneData = { d: data };
        const convertTo = options?.convertTo || '';
        return new Promise((resolve, reject) => {
            carbone.render(templatePath, carboneData, { convertTo }, (err, result) => {
                if (err) {
                    return reject(new Error(`Document generation failed: ${err.message || err}`));
                }
                const ext = convertTo || path.extname(templatePath).replace('.', '') || 'docx';
                const contentType = ext === 'pdf'
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                const basename = path.basename(templatePath, path.extname(templatePath));
                const filename = `${basename}-${Date.now()}.${ext}`;
                resolve({ buffer: result, filename, contentType });
            });
        });
    }
}
export const carboneService = new CarboneService();
export default carboneService;
