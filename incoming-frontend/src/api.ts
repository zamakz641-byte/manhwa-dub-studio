import type {
  RuntimeStatus,
  VoicesResponse,
  ExportPresetsResponse,
  Project,
  TasksResponse,
  Segment
} from './types';

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).detail || (data as any).error || `Erreur HTTP ${res.status}`);
  }
  return data as T;
}

export const fetchRuntime = () => api<RuntimeStatus>('/api/runtime');
export const fetchVoices = () => api<VoicesResponse>('/api/voices');
export const fetchPresets = () => api<ExportPresetsResponse>('/api/export-presets');
export const fetchProjects = () => api<Project[]>('/api/projects');

export const createProject = (title: string, target_language: string, voice_id: string, tts_engine: 'qwen' | 'omnivoice') =>
  api<Project>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, target_language, voice_id, tts_engine })
  });

export const fetchProject = (projectId: string) => api<Project>(`/api/projects/${projectId}`);

export const updateProject = (projectId: string, payload: Partial<Project>) =>
  api<Project>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

export const fetchTasks = (projectId: string) => api<TasksResponse>(`/api/projects/${projectId}/tasks`);

export const startPipelineTask = (projectId: string, kind: 'analyze' | 'tts' | 'export', payload: any = {}) =>
  api<{ ok: boolean; taskId: string }>(`/api/projects/${projectId}/tasks/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

export const uploadSourceFile = (projectId: string, file: File) =>
  api<Project>(`/api/projects/${projectId}/source`, {
    method: 'POST',
    headers: {
      'X-Filename': encodeURIComponent(file.name),
      'Content-Type': 'application/octet-stream'
    },
    body: file
  });

export const uploadSourceUrl = (projectId: string, url: string) =>
  api<Project>(`/api/projects/${projectId}/source-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

export const saveSegmentText = (projectId: string, segmentId: string, rewritten_text: string) =>
  api<Segment>(`/api/projects/${projectId}/segments/${segmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rewritten_text })
  });

export const generateSegmentTts = (projectId: string, segmentId: string) =>
  api<Segment>(`/api/projects/${projectId}/segments/${segmentId}/tts`, {
    method: 'POST'
  });

export const solveTimeline = (projectId: string) =>
  api<Project>(`/api/projects/${projectId}/solve`, {
    method: 'POST'
  });

export const cleanupProjectCache = (projectId: string) =>
  api<{ removed: number; freed_mb: number; message: string }>(`/api/projects/${projectId}/cleanup`, {
    method: 'POST'
  });

export const importScriptJson = (projectId: string, scriptData: any) =>
  api<Project>(`/api/projects/${projectId}/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scriptData)
  });

export function formatTime(seconds = 0): string {
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPreciseTime(seconds = 0): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(4, '0')}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return 'ETA —';
  return `ETA ${formatTime(seconds)}`;
}

export function labelStatus(status: string): string {
  const map: Record<string, string> = {
    draft: 'Brouillon',
    imported: 'Importé',
    analyzed: 'Analysé',
    script_ready: 'Script prêt',
    tts: 'Voix générée',
    review: 'À réviser',
    done: 'Terminé'
  };
  return map[status] || status;
}

export function stageIndex(status: string): number {
  const map: Record<string, number> = {
    draft: 0,
    imported: 1,
    analyzed: 2,
    script_ready: 3,
    tts: 4,
    review: 5,
    done: 6
  };
  return map[status] ?? 0;
}
