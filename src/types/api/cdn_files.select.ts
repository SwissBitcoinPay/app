// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

export interface CdnFilesSelect {
  content: FileUpload;
  created_at: number;
  id: string;
  purpose: string;
  uploaded_by?: null | string;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `CdnFilesSelect`'s JSON-Schema
 * via the `definition` "content".
 */
export interface FileUpload {
  /**
   * The file's user-provided content type.
   */
  content_type?: string | null;
  /**
   * A unique filename derived from original. Helps to address content caching issues with
   * proxies, CDNs, ... .
   */
  filename: string;
  /**
   * The file's text-encoded UUID from which the objectstore path is derived.
   */
  id?: string;
  /**
   * The file's inferred mime type. Not user provided.
   */
  mime_type?: string | null;
  /**
   * The file's original file name.
   */
  original_filename?: string | null;
}
