import type { DocStatus } from '../types'
import type { PipelineStatus } from './api'

/** Maps the backend's per-book pipeline + the caller's completion onto the wireframe's status badges. */
export function toDocStatus(pipeline: PipelineStatus, completedAt: string | null): DocStatus {
  if (pipeline === 'ready') return completedAt ? 'done' : 'in_review'
  return pipeline
}
