export function truncateAtSentence(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);

  const sentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (sentenceEnd > maxChars * 0.2) {
    return truncated.slice(0, sentenceEnd + 1);
  }

  const wordBoundary = truncated.lastIndexOf(' ');
  if (wordBoundary > maxChars * 0.2) {
    return truncated.slice(0, wordBoundary) + '…';
  }

  return truncated + '…';
}
