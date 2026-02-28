/**
 * Illustration Use Cases
 * Barrel export for illustration-related use cases
 */

export {
  AddIllustrationUseCase,
  addIllustrationInputSchema,
  type AddIllustrationInput,
  type AddIllustrationResult,
} from './AddIllustrationUseCase';
export { RemoveIllustrationUseCase, type RemoveIllustrationResult } from './RemoveIllustrationUseCase';
export { ReorderIllustrationsUseCase, type ReorderIllustrationsResult } from './ReorderIllustrationsUseCase';
export {
  GenerateBookCoverUseCase,
  extractCoverDefaults,
  type GenerateBookCoverInput,
  type GenerateBookCoverResult,
} from './GenerateBookCoverUseCase';
