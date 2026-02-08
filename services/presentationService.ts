/**
 * Presentation Service
 * Handles presentation CRUD operations, slide management, and viewer tracking
 */

import { Pool } from 'pg';

export interface Presentation {
  id: string;
  contractorId: string;
  inspectionId?: string;
  title: string;
  description?: string;
  coverImage?: string;
  isActive: boolean;
  slideCount?: number;
  viewerCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresentationSlide {
  id: string;
  presentationId: string;
  slideType: 'cover' | 'damage_overview' | 'photo_detail' | 'recommendations' | 'contact';
  title: string;
  content: any;
  slideOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViewerSession {
  id: string;
  presentationId: string;
  viewerIp?: string;
  viewerUserAgent?: string;
  startedAt: Date;
  lastViewedAt: Date;
  slidesViewed: number;
  completed: boolean;
}

export interface CreatePresentationData {
  contractorId: string;
  inspectionId?: string;
  title: string;
  description?: string;
  coverImage?: string;
  isActive?: boolean;
}

export interface CreateSlideData {
  presentationId: string;
  slideType: 'cover' | 'damage_overview' | 'photo_detail' | 'recommendations' | 'contact';
  title: string;
  content: any;
  slideOrder: number;
}

export class PresentationService {
  constructor(private pool: Pool) {}

  /**
   * Create a new presentation
   */
  async createPresentation(data: CreatePresentationData): Promise<Presentation> {
    const result = await this.pool.query(
      `INSERT INTO presentations (
        contractor_id, inspection_id, title, description, cover_image, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        data.contractorId,
        data.inspectionId,
        data.title,
        data.description,
        data.coverImage,
        data.isActive !== undefined ? data.isActive : true,
      ]
    );

    return this.mapPresentation(result.rows[0]);
  }

  /**
   * Get presentation by ID
   */
  async getPresentationById(id: string): Promise<Presentation | null> {
    const result = await this.pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM presentation_slides WHERE presentation_id = p.id) as slide_count,
        (SELECT COUNT(DISTINCT id) FROM viewer_sessions WHERE presentation_id = p.id) as viewer_count
      FROM presentations p
      WHERE p.id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapPresentation(result.rows[0]) : null;
  }

  /**
   * Get presentation by ID for contractor (with auth check)
   */
  async getPresentationByIdForContractor(
    id: string,
    contractorId: string
  ): Promise<Presentation | null> {
    const result = await this.pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM presentation_slides WHERE presentation_id = p.id) as slide_count,
        (SELECT COUNT(DISTINCT id) FROM viewer_sessions WHERE presentation_id = p.id) as viewer_count
      FROM presentations p
      WHERE p.id = $1 AND p.contractor_id = $2`,
      [id, contractorId]
    );

    return result.rows[0] ? this.mapPresentation(result.rows[0]) : null;
  }

  /**
   * Get all presentations for a contractor
   */
  async getPresentationsByContractor(contractorId: string): Promise<Presentation[]> {
    const result = await this.pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM presentation_slides WHERE presentation_id = p.id) as slide_count,
        (SELECT COUNT(DISTINCT id) FROM viewer_sessions WHERE presentation_id = p.id) as viewer_count
      FROM presentations p
      WHERE p.contractor_id = $1
      ORDER BY p.updated_at DESC`,
      [contractorId]
    );

    return result.rows.map(row => this.mapPresentation(row));
  }

  /**
   * Update presentation
   */
  async updatePresentation(
    id: string,
    contractorId: string,
    updates: Partial<CreatePresentationData>
  ): Promise<Presentation | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.coverImage !== undefined) {
      fields.push(`cover_image = $${paramCount++}`);
      values.push(updates.coverImage);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(updates.isActive);
    }

    if (fields.length === 0) {
      return this.getPresentationByIdForContractor(id, contractorId);
    }

    values.push(id, contractorId);
    const result = await this.pool.query(
      `UPDATE presentations SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND contractor_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapPresentation(result.rows[0]) : null;
  }

  /**
   * Delete presentation
   */
  async deletePresentation(id: string, contractorId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM presentations WHERE id = $1 AND contractor_id = $2',
      [id, contractorId]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Create a slide
   */
  async createSlide(data: CreateSlideData): Promise<PresentationSlide> {
    const result = await this.pool.query(
      `INSERT INTO presentation_slides (
        presentation_id, slide_type, title, content, slide_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [data.presentationId, data.slideType, data.title, JSON.stringify(data.content), data.slideOrder]
    );

    return this.mapSlide(result.rows[0]);
  }

  /**
   * Get slides for presentation
   */
  async getSlidesByPresentation(presentationId: string): Promise<PresentationSlide[]> {
    const result = await this.pool.query(
      'SELECT * FROM presentation_slides WHERE presentation_id = $1 ORDER BY slide_order ASC',
      [presentationId]
    );

    return result.rows.map(row => this.mapSlide(row));
  }

  /**
   * Update slide
   */
  async updateSlide(
    id: string,
    updates: Partial<CreateSlideData>
  ): Promise<PresentationSlide | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.slideType !== undefined) {
      fields.push(`slide_type = $${paramCount++}`);
      values.push(updates.slideType);
    }
    if (updates.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push(`content = $${paramCount++}`);
      values.push(JSON.stringify(updates.content));
    }
    if (updates.slideOrder !== undefined) {
      fields.push(`slide_order = $${paramCount++}`);
      values.push(updates.slideOrder);
    }

    if (fields.length === 0) {
      const result = await this.pool.query(
        'SELECT * FROM presentation_slides WHERE id = $1',
        [id]
      );
      return result.rows[0] ? this.mapSlide(result.rows[0]) : null;
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE presentation_slides SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapSlide(result.rows[0]) : null;
  }

  /**
   * Delete slide
   */
  async deleteSlide(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM presentation_slides WHERE id = $1',
      [id]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Create viewer session
   */
  async createViewerSession(
    presentationId: string,
    viewerIp?: string,
    viewerUserAgent?: string
  ): Promise<ViewerSession> {
    const result = await this.pool.query(
      `INSERT INTO viewer_sessions (
        presentation_id, viewer_ip, viewer_user_agent
      ) VALUES ($1, $2, $3)
      RETURNING *`,
      [presentationId, viewerIp, viewerUserAgent]
    );

    return this.mapViewerSession(result.rows[0]);
  }

  /**
   * Update viewer session
   */
  async updateViewerSession(
    id: string,
    slidesViewed?: number,
    completed?: boolean
  ): Promise<ViewerSession | null> {
    const updates = [];
    const values = [];
    let paramCount = 1;

    updates.push(`last_viewed_at = NOW()`);

    if (slidesViewed !== undefined) {
      updates.push(`slides_viewed = $${paramCount++}`);
      values.push(slidesViewed);
    }
    if (completed !== undefined) {
      updates.push(`completed = $${paramCount++}`);
      values.push(completed);
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE viewer_sessions SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapViewerSession(result.rows[0]) : null;
  }

  /**
   * Get viewer sessions for presentation
   */
  async getViewerSessions(presentationId: string): Promise<ViewerSession[]> {
    const result = await this.pool.query(
      'SELECT * FROM viewer_sessions WHERE presentation_id = $1 ORDER BY started_at DESC',
      [presentationId]
    );

    return result.rows.map(row => this.mapViewerSession(row));
  }

  /**
   * Map database row to Presentation object
   */
  private mapPresentation(row: any): Presentation {
    return {
      id: row.id,
      contractorId: row.contractor_id,
      inspectionId: row.inspection_id,
      title: row.title,
      description: row.description,
      coverImage: row.cover_image,
      isActive: row.is_active,
      slideCount: row.slide_count ? parseInt(row.slide_count) : undefined,
      viewerCount: row.viewer_count ? parseInt(row.viewer_count) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to PresentationSlide object
   */
  private mapSlide(row: any): PresentationSlide {
    return {
      id: row.id,
      presentationId: row.presentation_id,
      slideType: row.slide_type,
      title: row.title,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
      slideOrder: row.slide_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to ViewerSession object
   */
  private mapViewerSession(row: any): ViewerSession {
    return {
      id: row.id,
      presentationId: row.presentation_id,
      viewerIp: row.viewer_ip,
      viewerUserAgent: row.viewer_user_agent,
      startedAt: new Date(row.started_at),
      lastViewedAt: new Date(row.last_viewed_at),
      slidesViewed: row.slides_viewed,
      completed: row.completed,
    };
  }
}
