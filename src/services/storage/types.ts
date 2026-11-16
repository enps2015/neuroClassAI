/**
 * NeuroClass AI — Local-First Workspace Storage Types
 * Tipos e interfaces fundamentais para persistência Local-First,
 * File System Access API, fallback IndexedDB e backups portáteis .neuroclass.
 */

import type {
  DocumentSource,
  LearningAnalysis,
  StudyNote,
  TutorChatMessage,
  ConceptMastery,
  ConceptReviewSchedule,
  VisualResource,
  LearningSession,
  LearningAttempt,
} from '../../types';

export type StorageMode = 'local_directory' | 'indexed_db';

export type StoragePermissionState = 'granted' | 'prompt' | 'denied' | 'unavailable';

export type AutosaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'permission_required'
  | 'quota_critical'
  | 'contingency_pending';

export interface PendingOperation {
  id: string;
  entityType: 'document' | 'analysis' | 'note' | 'visual' | 'mastery' | 'schedule' | 'pdf' | 'delete' | 'attempt' | 'session' | 'learning_attempts' | 'learning_sessions' | 'chat';
  entityId: string;
  subjectName: string;
  action: 'upsert' | 'delete';
  payload: any;
  binaryBase64?: string;
  mimeType?: string;
  clientUpdatedAt: number;
  sha256?: string;
}

export interface StorageHealth {
  mode: StorageMode;
  directoryConnected: boolean;
  directoryName?: string;
  permissionState: StoragePermissionState;
  persistentGranted: boolean;
  quotaBytes: number;
  usageBytes: number;
  usagePercent: number;
  isCritical: boolean;
  activeSubjectCount: number;
  activeDocumentCount: number;
  pendingOperationsCount?: number;
  lastSavedAt?: number;
}

export interface WorkspaceManifest {
  formatVersion: '1.0';
  app: 'NeuroClass AI';
  workspaceId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  canonicalStorage: StorageMode;
  subjects: WorkspaceSubjectRef[];
  checksums: Record<string, string>; // filepath -> sha256
}

export interface WorkspaceSubjectRef {
  id: string;
  name: string;
  folderName: string;
  academicArea?: string;
  documentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubjectBundle {
  id: string;
  name: string;
  folderName: string;
  academicArea?: string;
  createdAt: number;
  updatedAt: number;
  documents: DocumentSource[];
  analyses: LearningAnalysis[];
  notes: StudyNote[];
  visualResources: VisualResource[];
  chatSessions: Array<{ documentId: string; messages: TutorChatMessage[] }>;
  masteryRecords: ConceptMastery[];
  reviewSchedules: ConceptReviewSchedule[];
  learningSessions: LearningSession[];
  learningAttempts: LearningAttempt[];
  binaryFiles: Array<{
    relativePath: string;
    mimeType: string;
    data: ArrayBuffer;
    sha256: string;
  }>;
}

export interface MigrationStepProgress {
  step: 'scanning' | 'creating_folders' | 'writing_binaries' | 'writing_metadata' | 'verifying' | 'completed' | 'failed';
  currentEntityName?: string;
  completedItems: number;
  totalItems: number;
  percent: number;
  warnings: string[];
  error?: string;
}

export interface BackupPackageManifest {
  formatVersion: '2.0';
  packageType: 'full_workspace' | 'single_subject';
  app: 'NeuroClass AI';
  exportedAt: number;
  exportedBy: string;
  workspaceName: string;
  subjectCount: number;
  documentCount: number;
  noteCount: number;
  visualResourceCount: number;
  files: Array<{
    path: string;
    size: number;
    sha256: string;
    mimeType: string;
  }>;
}

export interface ConflictResolutionOption {
  action: 'create_new_id' | 'replace_confirmed' | 'skip';
  subjectId: string;
  targetName?: string;
}

