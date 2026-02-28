import { Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase, type DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { createControllerHelpers, extractAuthContext } from '@aiponge/platform-core';
import { normalizeRole } from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import {
  BookTypeRepository,
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
  UserLibraryRepository,
  ShareLinkRepository,
} from '@infrastructure/repositories';
import { CreatorMemberRepository } from '@infrastructure/repositories/CreatorMemberRepository';
import {
  createContentAccessContext,
  BookService,
  CreateChapterUseCase,
  GetChapterUseCase,
  UpdateChapterUseCase,
  DeleteChapterUseCase,
  ListChaptersUseCase,
  CreateEntryUseCase,
  GetEntryUseCase,
  UpdateEntryUseCase,
  DeleteEntryUseCase,
  ListEntriesUseCase,
  PromoteEntryUseCase,
  UnpromoteEntryUseCase,
  AddIllustrationUseCase,
  RemoveIllustrationUseCase,
  ReorderIllustrationsUseCase,
  GenerateBookCoverUseCase,
} from '@application/use-cases/library';

export const logger = getLogger('library-controller');

export const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export function formatZodErrors(errors: z.ZodIssue[]): Record<string, unknown> {
  return { validationErrors: errors.map(e => ({ path: e.path, message: e.message })) };
}

export function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function buildContext(req: Request, accessibleCreatorIds: string[] = []): ContentAccessContext {
  const { userId, role } = extractAuthContext(req);
  const userRole = normalizeRole(role);

  return createContentAccessContext(userId || '', userRole, accessibleCreatorIds);
}

export function handleUseCaseResult<T>(
  res: Response,
  result: { success: true; data: T } | { success: false; error: { code: string; message: string; details?: unknown } },
  successStatus: number = 200,
  req?: Request
): void {
  if (result.success) {
    if (successStatus === 201) {
      sendCreated(res, result.data);
    } else {
      sendSuccess(res, result.data);
    }
    return;
  }

  const { code, message, details } = (
    result as { success: false; error: { code: string; message: string; details?: unknown } }
  ).error;

  switch (code) {
    case 'NOT_FOUND':
      ServiceErrors.notFound(res, message, req);
      break;
    case 'FORBIDDEN':
      ServiceErrors.forbidden(res, message, req);
      break;
    case 'VALIDATION_ERROR':
      ServiceErrors.badRequest(res, message, req, details as Record<string, unknown> | undefined);
      break;
    case 'CONFLICT':
      ServiceErrors.conflict(res, message, req);
      break;
    case 'OPERATION_FAILED':
    default:
      ServiceErrors.internal(res, message, undefined, req);
      break;
  }
}

export interface LibraryControllerDeps {
  db: DatabaseConnection;
  bookTypeRepo: BookTypeRepository;
  bookRepo: BookRepository;
  chapterRepo: ChapterRepository;
  entryRepo: EntryRepository;
  illustrationRepo: IllustrationRepository;
  userLibraryRepo: UserLibraryRepository;
  shareLinkRepo: ShareLinkRepository;
  bookService: BookService;
  createChapterUseCase: CreateChapterUseCase;
  getChapterUseCase: GetChapterUseCase;
  updateChapterUseCase: UpdateChapterUseCase;
  deleteChapterUseCase: DeleteChapterUseCase;
  listChaptersUseCase: ListChaptersUseCase;
  createEntryUseCase: CreateEntryUseCase;
  getEntryUseCase: GetEntryUseCase;
  updateEntryUseCase: UpdateEntryUseCase;
  deleteEntryUseCase: DeleteEntryUseCase;
  listEntriesUseCase: ListEntriesUseCase;
  promoteEntryUseCase: PromoteEntryUseCase;
  unpromoteEntryUseCase: UnpromoteEntryUseCase;
  addIllustrationUseCase: AddIllustrationUseCase;
  removeIllustrationUseCase: RemoveIllustrationUseCase;
  reorderIllustrationsUseCase: ReorderIllustrationsUseCase;
  generateBookCoverUseCase: GenerateBookCoverUseCase;
}

export async function buildEnrichedContext(db: DatabaseConnection, req: Request): Promise<ContentAccessContext> {
  const userId = extractAuthContext(req).userId || '';
  const creatorMemberRepo = new CreatorMemberRepository(db);
  const librarianIds = await creatorMemberRepo.getLibrarianIds();

  let accessibleCreatorIds: string[];
  if (userId) {
    const creatorIds = await creatorMemberRepo.getAccessibleCreatorIds(userId);
    accessibleCreatorIds = [...new Set([...creatorIds, userId, ...librarianIds])];
  } else {
    accessibleCreatorIds = librarianIds;
  }

  return buildContext(req, accessibleCreatorIds);
}

export function createDeps(): LibraryControllerDeps {
  const db = getDatabase();
  const bookTypeRepo = new BookTypeRepository(db);
  const bookRepo = new BookRepository(db);
  const chapterRepo = new ChapterRepository(db);
  const entryRepo = new EntryRepository(db);
  const illustrationRepo = new IllustrationRepository(db);
  const userLibraryRepo = new UserLibraryRepository(db);
  const shareLinkRepo = new ShareLinkRepository(db);

  const bookService = new BookService(bookRepo, bookTypeRepo, illustrationRepo, chapterRepo, entryRepo);

  const createChapterUseCase = new CreateChapterUseCase(chapterRepo, bookRepo);
  const getChapterUseCase = new GetChapterUseCase(chapterRepo, bookRepo, illustrationRepo);
  const updateChapterUseCase = new UpdateChapterUseCase(chapterRepo, bookRepo);
  const deleteChapterUseCase = new DeleteChapterUseCase(chapterRepo, bookRepo);
  const listChaptersUseCase = new ListChaptersUseCase(chapterRepo, bookRepo, illustrationRepo);

  const createEntryUseCase = new CreateEntryUseCase(entryRepo, chapterRepo, bookRepo);
  const getEntryUseCase = new GetEntryUseCase(entryRepo, chapterRepo, bookRepo, illustrationRepo);
  const updateEntryUseCase = new UpdateEntryUseCase(entryRepo, chapterRepo, bookRepo);
  const deleteEntryUseCase = new DeleteEntryUseCase(entryRepo, chapterRepo, bookRepo, illustrationRepo);
  const listEntriesUseCase = new ListEntriesUseCase(entryRepo, chapterRepo, bookRepo, illustrationRepo);
  const promoteEntryUseCase = new PromoteEntryUseCase(entryRepo, chapterRepo, bookRepo);
  const unpromoteEntryUseCase = new UnpromoteEntryUseCase(entryRepo, chapterRepo, bookRepo);

  const addIllustrationUseCase = new AddIllustrationUseCase(illustrationRepo, bookRepo, chapterRepo, entryRepo);
  const removeIllustrationUseCase = new RemoveIllustrationUseCase(illustrationRepo, bookRepo, chapterRepo, entryRepo);
  const reorderIllustrationsUseCase = new ReorderIllustrationsUseCase(
    illustrationRepo,
    entryRepo,
    chapterRepo,
    bookRepo
  );
  const generateBookCoverUseCase = new GenerateBookCoverUseCase(illustrationRepo, bookRepo, bookTypeRepo, entryRepo);

  return {
    db,
    bookTypeRepo,
    bookRepo,
    chapterRepo,
    entryRepo,
    illustrationRepo,
    userLibraryRepo,
    shareLinkRepo,
    bookService,
    createChapterUseCase,
    getChapterUseCase,
    updateChapterUseCase,
    deleteChapterUseCase,
    listChaptersUseCase,
    createEntryUseCase,
    getEntryUseCase,
    updateEntryUseCase,
    deleteEntryUseCase,
    listEntriesUseCase,
    promoteEntryUseCase,
    unpromoteEntryUseCase,
    addIllustrationUseCase,
    removeIllustrationUseCase,
    reorderIllustrationsUseCase,
    generateBookCoverUseCase,
  };
}
