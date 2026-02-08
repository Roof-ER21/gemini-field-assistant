/**
 * Services Barrel Export
 * Centralized export for all service modules
 */

// Inspection and Presentation Services
export { InspectionService } from './inspectionService.js';
export type {
  Inspection,
  InspectionPhoto,
  CreateInspectionData,
  CreatePhotoData,
} from './inspectionService.js';

export { PresentationService } from './presentationService.js';
export type {
  Presentation,
  PresentationSlide,
  ViewerSession,
  CreatePresentationData,
  CreateSlideData,
} from './presentationService.js';
