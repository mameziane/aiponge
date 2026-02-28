/**
 * React Native FormData Type Augmentation
 *
 * React Native's FormData implementation accepts file objects with
 * uri/name/type properties, unlike the browser Blob-based API.
 *
 * This declaration extends the global FormData interface to properly
 * type file uploads in React Native without requiring unsafe casts.
 */

/**
 * React Native file object for FormData uploads
 * This is the format required by React Native's fetch implementation
 */
export interface ReactNativeFile {
  /** Local file URI (e.g., 'file:///path/to/image.jpg') */
  uri: string;
  /** Filename to send to server */
  name: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  type: string;
}

/**
 * Extend global FormData to accept React Native file objects
 */
declare global {
  interface FormData {
    append(name: string, value: ReactNativeFile): void;
  }
}

export {};
