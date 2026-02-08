/**
 * Inspection Service
 * Handles roof inspection CRUD operations and photo management
 */

import { Pool } from 'pg';

export interface Inspection {
  id: string;
  contractorId: string;
  propertyAddress: string;
  propertyLat?: number;
  propertyLng?: number;
  homeownerName?: string;
  homeownerPhone?: string;
  homeownerEmail?: string;
  inspectionDate: Date;
  notes?: string;
  status: 'draft' | 'completed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionPhoto {
  id: string;
  inspectionId: string;
  photoUrl: string;
  photoType: 'overview' | 'damage' | 'detail' | 'other';
  caption?: string;
  damageSeverity?: 'none' | 'minor' | 'moderate' | 'severe';
  uploadOrder: number;
  createdAt: Date;
}

export interface CreateInspectionData {
  contractorId: string;
  propertyAddress: string;
  propertyLat?: number;
  propertyLng?: number;
  homeownerName?: string;
  homeownerPhone?: string;
  homeownerEmail?: string;
  inspectionDate?: Date;
  notes?: string;
}

export interface CreatePhotoData {
  inspectionId: string;
  photoUrl: string;
  photoType: 'overview' | 'damage' | 'detail' | 'other';
  caption?: string;
  damageSeverity?: 'none' | 'minor' | 'moderate' | 'severe';
  uploadOrder?: number;
}

export class InspectionService {
  constructor(private pool: Pool) {}

  /**
   * Create a new inspection
   */
  async createInspection(data: CreateInspectionData): Promise<Inspection> {
    const result = await this.pool.query(
      `INSERT INTO inspections (
        contractor_id, property_address, property_lat, property_lng,
        homeowner_name, homeowner_phone, homeowner_email, inspection_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.contractorId,
        data.propertyAddress,
        data.propertyLat,
        data.propertyLng,
        data.homeownerName,
        data.homeownerPhone,
        data.homeownerEmail,
        data.inspectionDate || new Date(),
        data.notes,
      ]
    );

    return this.mapInspection(result.rows[0]);
  }

  /**
   * Get inspection by ID
   */
  async getInspectionById(id: string, contractorId: string): Promise<Inspection | null> {
    const result = await this.pool.query(
      'SELECT * FROM inspections WHERE id = $1 AND contractor_id = $2',
      [id, contractorId]
    );

    return result.rows[0] ? this.mapInspection(result.rows[0]) : null;
  }

  /**
   * Get all inspections for a contractor
   */
  async getInspectionsByContractor(
    contractorId: string,
    status?: string
  ): Promise<Inspection[]> {
    const query = status
      ? 'SELECT * FROM inspections WHERE contractor_id = $1 AND status = $2 ORDER BY inspection_date DESC'
      : 'SELECT * FROM inspections WHERE contractor_id = $1 ORDER BY inspection_date DESC';

    const params = status ? [contractorId, status] : [contractorId];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapInspection(row));
  }

  /**
   * Update inspection
   */
  async updateInspection(
    id: string,
    contractorId: string,
    updates: Partial<CreateInspectionData>
  ): Promise<Inspection | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.propertyAddress !== undefined) {
      fields.push(`property_address = $${paramCount++}`);
      values.push(updates.propertyAddress);
    }
    if (updates.propertyLat !== undefined) {
      fields.push(`property_lat = $${paramCount++}`);
      values.push(updates.propertyLat);
    }
    if (updates.propertyLng !== undefined) {
      fields.push(`property_lng = $${paramCount++}`);
      values.push(updates.propertyLng);
    }
    if (updates.homeownerName !== undefined) {
      fields.push(`homeowner_name = $${paramCount++}`);
      values.push(updates.homeownerName);
    }
    if (updates.homeownerPhone !== undefined) {
      fields.push(`homeowner_phone = $${paramCount++}`);
      values.push(updates.homeownerPhone);
    }
    if (updates.homeownerEmail !== undefined) {
      fields.push(`homeowner_email = $${paramCount++}`);
      values.push(updates.homeownerEmail);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(updates.notes);
    }

    if (fields.length === 0) {
      return this.getInspectionById(id, contractorId);
    }

    values.push(id, contractorId);
    const result = await this.pool.query(
      `UPDATE inspections SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND contractor_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapInspection(result.rows[0]) : null;
  }

  /**
   * Add photo to inspection
   */
  async addPhoto(data: CreatePhotoData): Promise<InspectionPhoto> {
    const result = await this.pool.query(
      `INSERT INTO inspection_photos (
        inspection_id, photo_url, photo_type, caption, damage_severity, upload_order
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        data.inspectionId,
        data.photoUrl,
        data.photoType,
        data.caption,
        data.damageSeverity,
        data.uploadOrder || 0,
      ]
    );

    return this.mapPhoto(result.rows[0]);
  }

  /**
   * Get photos for inspection
   */
  async getPhotosByInspection(inspectionId: string): Promise<InspectionPhoto[]> {
    const result = await this.pool.query(
      'SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY upload_order ASC, created_at ASC',
      [inspectionId]
    );

    return result.rows.map(row => this.mapPhoto(row));
  }

  /**
   * Delete photo
   */
  async deletePhoto(photoId: string, inspectionId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM inspection_photos WHERE id = $1 AND inspection_id = $2',
      [photoId, inspectionId]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Update inspection status
   */
  async updateStatus(
    id: string,
    contractorId: string,
    status: 'draft' | 'completed' | 'archived'
  ): Promise<Inspection | null> {
    const result = await this.pool.query(
      `UPDATE inspections SET status = $1
       WHERE id = $2 AND contractor_id = $3
       RETURNING *`,
      [status, id, contractorId]
    );

    return result.rows[0] ? this.mapInspection(result.rows[0]) : null;
  }

  /**
   * Delete inspection
   */
  async deleteInspection(id: string, contractorId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM inspections WHERE id = $1 AND contractor_id = $2',
      [id, contractorId]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Map database row to Inspection object
   */
  private mapInspection(row: any): Inspection {
    return {
      id: row.id,
      contractorId: row.contractor_id,
      propertyAddress: row.property_address,
      propertyLat: row.property_lat,
      propertyLng: row.property_lng,
      homeownerName: row.homeowner_name,
      homeownerPhone: row.homeowner_phone,
      homeownerEmail: row.homeowner_email,
      inspectionDate: new Date(row.inspection_date),
      notes: row.notes,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to InspectionPhoto object
   */
  private mapPhoto(row: any): InspectionPhoto {
    return {
      id: row.id,
      inspectionId: row.inspection_id,
      photoUrl: row.photo_url,
      photoType: row.photo_type,
      caption: row.caption,
      damageSeverity: row.damage_severity,
      uploadOrder: row.upload_order,
      createdAt: new Date(row.created_at),
    };
  }
}
