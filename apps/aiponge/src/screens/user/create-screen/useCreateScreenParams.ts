import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

export interface CreateScreenParams {
  sharedContent?: string;
  entryId?: string;
  pictureUri?: string;
  sourceEntryId?: string;
  sourceText?: string;
  sourceReference?: string;
  sourceBookTitle?: string;
}

function safeDecode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function useCreateScreenParams() {
  const { sharedContent, entryId, pictureUri, sourceEntryId, sourceText, sourceReference, sourceBookTitle } =
    useLocalSearchParams<Record<string, string>>();

  const isPictureMode = !!pictureUri;
  const isSourceMode = !!sourceEntryId && !!sourceText;

  const decodedPictureUri = useMemo(() => {
    if (!pictureUri) return null;
    return safeDecode(pictureUri) || pictureUri;
  }, [pictureUri]);

  const decodedSourceText = useMemo(() => safeDecode(sourceText), [sourceText]);
  const decodedSourceReference = useMemo(() => safeDecode(sourceReference), [sourceReference]);
  const decodedSourceBookTitle = useMemo(() => safeDecode(sourceBookTitle), [sourceBookTitle]);

  return {
    sharedContent,
    entryId,
    pictureUri,
    sourceEntryId,
    isPictureMode,
    isSourceMode,
    decodedPictureUri,
    decodedSourceText,
    decodedSourceReference,
    decodedSourceBookTitle,
  };
}
