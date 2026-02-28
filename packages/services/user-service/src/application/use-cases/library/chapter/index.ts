/**
 * Chapter Use Cases
 * Barrel export for chapter-related use cases
 */

export {
  CreateChapterUseCase,
  createChapterInputSchema,
  type CreateChapterInput,
  type CreateChapterResult,
} from './CreateChapterUseCase';
export { GetChapterUseCase, type GetChapterResult } from './GetChapterUseCase';
export {
  UpdateChapterUseCase,
  updateChapterInputSchema,
  type UpdateChapterInput,
  type UpdateChapterResult,
} from './UpdateChapterUseCase';
export { DeleteChapterUseCase, type DeleteChapterResult } from './DeleteChapterUseCase';
export { ListChaptersUseCase, type ChapterWithIllustrations, type ListChaptersResult } from './ListChaptersUseCase';
