/**
 * Document Data Mappers
 *
 * Maps database records to template variables for Carbone document generation.
 * Each mapper transforms raw DB data into the format expected by DOCX templates.
 */

/** Map agreement + customer data to inspection agreement template */
export function mapInspectionAgreement(data: {
  customerName: string;
  customerAddress: string;
  customerPhone?: string;
  customerEmail?: string;
  repName?: string;
  repPhone?: string;
}): Record<string, any> {
  return {
    customerName: data.customerName || '',
    customerAddress: data.customerAddress || '',
    customerPhone: data.customerPhone || '',
    customerEmail: data.customerEmail || '',
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    repName: data.repName || 'ROOF-ER Representative',
    repPhone: data.repPhone || '',
    year: new Date().getFullYear().toString(),
  };
}

/** Map job/agreement data to insurance scope template */
export function mapInsuranceScope(data: {
  customerName: string;
  customerAddress: string;
  insuranceCompany?: string;
  claimNumber?: string;
  lineItems?: Array<{ description: string; quantity: number; unit: string; unitPrice: number; total: number }>;
}): Record<string, any> {
  const items = data.lineItems || [];
  const totalAmount = items.reduce((sum, item) => sum + (item.total || 0), 0);

  return {
    customerName: data.customerName || '',
    customerAddress: data.customerAddress || '',
    insuranceCompany: data.insuranceCompany || '',
    claimNumber: data.claimNumber || 'Pending',
    lineItems: items,
    totalAmount: totalAmount.toFixed(2),
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
  };
}

/** Map inspection results to homeowner letter template */
export function mapHomeownerLetter(data: {
  customerName: string;
  customerAddress: string;
  stormDates?: string;
  findings?: string;
  recommendations?: string;
  repName?: string;
}): Record<string, any> {
  return {
    customerName: data.customerName || '',
    customerAddress: data.customerAddress || '',
    stormDates: data.stormDates || 'Recent storm activity',
    findings: data.findings || '',
    recommendations: data.recommendations || '',
    repName: data.repName || 'ROOF-ER Representative',
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
  };
}

/** Map job completion data to COC template */
export function mapCertificateOfCompletion(data: {
  customerName: string;
  customerAddress: string;
  completionDate?: string;
  workPerformed?: Array<{ description: string; details?: string }>;
  warrantyInfo?: string;
  repName?: string;
}): Record<string, any> {
  return {
    customerName: data.customerName || '',
    customerAddress: data.customerAddress || '',
    completionDate: data.completionDate || new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    workPerformed: data.workPerformed || [],
    warrantyInfo: data.warrantyInfo || 'Standard manufacturer warranty applies.',
    repName: data.repName || 'ROOF-ER Representative',
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
  };
}
