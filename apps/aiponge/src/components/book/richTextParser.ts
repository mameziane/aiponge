export type BlockType = 'paragraph' | 'quote' | 'reflection' | 'pause' | 'numbered';

export interface CharRange {
  start: number;
  end: number;
}

export interface BlockWithMeta {
  type: BlockType;
  plainText: string;
  boldRanges: CharRange[];
  number?: number;
}

function extractBoldRanges(text: string): { plainText: string; boldRanges: CharRange[] } {
  const boldRanges: CharRange[] = [];
  let plainText = '';
  let i = 0;

  while (i < text.length) {
    if (text.slice(i, i + 3) === '[b]') {
      const closeIdx = text.indexOf('[/b]', i + 3);
      if (closeIdx !== -1) {
        const boldContent = text.slice(i + 3, closeIdx);
        const start = plainText.length;
        plainText += boldContent;
        boldRanges.push({ start, end: plainText.length });
        i = closeIdx + 4;
        continue;
      }
    }
    plainText += text[i];
    i++;
  }

  return { plainText, boldRanges };
}

export function stripFormattingTags(text: string): string {
  return text
    .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '$1')
    .replace(/\[q\]([\s\S]*?)\[\/q\]/g, '$1')
    .replace(/\[r\]([\s\S]*?)\[\/r\]/g, '$1')
    .replace(/\[p\]/g, '')
    .trim();
}

function stripLeftoverMarkers(text: string): string {
  return text
    .replace(/\[b\]/g, '')
    .replace(/\[\/b\]/g, '')
    .replace(/\[q\]/g, '')
    .replace(/\[\/q\]/g, '')
    .replace(/\[r\]/g, '')
    .replace(/\[\/r\]/g, '')
    .replace(/\[p\]/g, '')
    .trim();
}

interface RawSegment {
  type: 'block' | 'text';
  blockType?: BlockType;
  content: string;
}

function extractBlockMarkers(text: string): RawSegment[] {
  const segments: RawSegment[] = [];
  const blockRegex = /\[(q|r)\]([\s\S]*?)\[\/\1\]/g;
  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const blockType = match[1] === 'q' ? 'quote' : 'reflection';
    segments.push({ type: 'block', blockType: blockType as BlockType, content: match[2].trim() });
    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

function splitNumberedItems(text: string): string[] {
  return text.split(/\n(?=\d+\.\s)/);
}

function parsePlainParagraphs(text: string): BlockWithMeta[] {
  const blocks: BlockWithMeta[] = [];
  const parts = text.split(/\n\s*\n/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed === '[p]') {
      blocks.push({ type: 'pause', plainText: '', boldRanges: [] });
      continue;
    }

    const hasNumberedItems = /^(\d+)\.\s+/.test(trimmed) || /\n\d+\.\s+/.test(trimmed);
    if (hasNumberedItems) {
      const items = splitNumberedItems(trimmed);
      for (const item of items) {
        const itemTrimmed = item.trim();
        if (!itemTrimmed) continue;

        const numberedMatch = itemTrimmed.match(/^(\d+)\.\s+([\s\S]+)/);
        if (numberedMatch) {
          const content = numberedMatch[2].replace(/\n/g, ' ').trim();
          const { plainText, boldRanges } = extractBoldRanges(content);
          blocks.push({
            type: 'numbered',
            plainText: stripLeftoverMarkers(plainText),
            boldRanges,
            number: parseInt(numberedMatch[1], 10),
          });
        } else {
          const { plainText, boldRanges } = extractBoldRanges(itemTrimmed);
          const safePlain = stripLeftoverMarkers(plainText);
          if (safePlain) {
            blocks.push({ type: 'paragraph', plainText: safePlain, boldRanges });
          }
        }
      }
      continue;
    }

    const { plainText, boldRanges } = extractBoldRanges(trimmed);
    const safePlain = stripLeftoverMarkers(plainText);
    if (safePlain) {
      blocks.push({ type: 'paragraph', plainText: safePlain, boldRanges });
    }
  }

  return blocks;
}

export function parseContentBlocks(rawText: string): BlockWithMeta[] {
  const cleaned = stripMarkdownFormatting(rawText);
  const segments = extractBlockMarkers(cleaned);
  const blocks: BlockWithMeta[] = [];

  for (const seg of segments) {
    if (seg.type === 'block') {
      const innerCleaned = seg.content
        .replace(/\n\s*\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const { plainText, boldRanges } = extractBoldRanges(innerCleaned);
      blocks.push({ type: seg.blockType!, plainText, boldRanges });
    } else {
      blocks.push(...parsePlainParagraphs(seg.content));
    }
  }

  return blocks;
}

export function stripMarkdownFormatting(text: string): string {
  let result = text;
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\b\*([^*]+)\*\b/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/\b_([^_]+)_\b/g, '$1');
  result = result.replace(/^#{1,6}\s+/gm, '');
  result = result.replace(/^[-*]\s+(?!\[)/gm, '');
  result = result.replace(/^\d+\)\s+/gm, '');
  result = result.replace(/```[^`]*```/g, '');
  result = result.replace(/`([^`]+)`/g, '$1');
  return result.trim();
}
