export const MAX_LOCAL_WORKSPACE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CLOUD_WORKSPACE_FILE_BYTES = 6 * 1024 * 1024;

export function workspaceUploadLimitBytes(cloudWorkspace: boolean): number {
  return cloudWorkspace ? MAX_CLOUD_WORKSPACE_FILE_BYTES : MAX_LOCAL_WORKSPACE_FILE_BYTES;
}

export function isWorkspaceFileSizeAllowed(size: number, cloudWorkspace: boolean): boolean {
  return Number.isFinite(size) && size > 0 && size <= workspaceUploadLimitBytes(cloudWorkspace);
}
