import { Request, Response } from 'express';
import { createDeps } from './library-helpers';
import { BookController } from './BookController';
import { ChapterController } from './ChapterController';
import { EntryController } from './EntryController';
import { IllustrationController } from './IllustrationController';
import { UserLibraryController } from './UserLibraryController';
import { ShareLinkController } from './ShareLinkController';

export class LibraryController {
  private bookController: BookController;
  private chapterController: ChapterController;
  private entryController: EntryController;
  private illustrationController: IllustrationController;
  private userLibraryController: UserLibraryController;
  private shareLinkController: ShareLinkController;

  constructor() {
    const deps = createDeps();
    this.bookController = new BookController(deps);
    this.chapterController = new ChapterController(deps);
    this.entryController = new EntryController(deps);
    this.illustrationController = new IllustrationController(deps);
    this.userLibraryController = new UserLibraryController(deps);
    this.shareLinkController = new ShareLinkController(deps);
  }

  async getBookTypes(req: Request, res: Response): Promise<void> {
    return this.bookController.getBookTypes(req, res);
  }

  async getBookTypeById(req: Request, res: Response): Promise<void> {
    return this.bookController.getBookTypeById(req, res);
  }

  async getBooks(req: Request, res: Response): Promise<void> {
    return this.bookController.getBooks(req, res);
  }

  async getMyBooks(req: Request, res: Response): Promise<void> {
    return this.bookController.getMyBooks(req, res);
  }

  async getBookById(req: Request, res: Response): Promise<void> {
    return this.bookController.getBookById(req, res);
  }

  async createBook(req: Request, res: Response): Promise<void> {
    return this.bookController.createBook(req, res);
  }

  async updateBook(req: Request, res: Response): Promise<void> {
    return this.bookController.updateBook(req, res);
  }

  async updateBookCover(req: Request, res: Response): Promise<void> {
    return this.bookController.updateBookCover(req, res);
  }

  async deleteBook(req: Request, res: Response): Promise<void> {
    return this.bookController.deleteBook(req, res);
  }

  async getMyChapters(req: Request, res: Response): Promise<void> {
    return this.chapterController.getMyChapters(req, res);
  }

  async getChaptersByBook(req: Request, res: Response): Promise<void> {
    return this.chapterController.getChaptersByBook(req, res);
  }

  async getChapterById(req: Request, res: Response): Promise<void> {
    return this.chapterController.getChapterById(req, res);
  }

  async createChapter(req: Request, res: Response): Promise<void> {
    return this.chapterController.createChapter(req, res);
  }

  async updateChapter(req: Request, res: Response): Promise<void> {
    return this.chapterController.updateChapter(req, res);
  }

  async deleteChapter(req: Request, res: Response): Promise<void> {
    return this.chapterController.deleteChapter(req, res);
  }

  async getMyEntries(req: Request, res: Response): Promise<void> {
    return this.entryController.getMyEntries(req, res);
  }

  async getEntriesByChapter(req: Request, res: Response): Promise<void> {
    return this.entryController.getEntriesByChapter(req, res);
  }

  async getEntryById(req: Request, res: Response): Promise<void> {
    return this.entryController.getEntryById(req, res);
  }

  async createEntry(req: Request, res: Response): Promise<void> {
    return this.entryController.createEntry(req, res);
  }

  async updateEntry(req: Request, res: Response): Promise<void> {
    return this.entryController.updateEntry(req, res);
  }

  async deleteEntry(req: Request, res: Response): Promise<void> {
    return this.entryController.deleteEntry(req, res);
  }

  async promoteEntry(req: Request, res: Response): Promise<void> {
    return this.entryController.promoteEntry(req, res);
  }

  async unpromoteEntry(req: Request, res: Response): Promise<void> {
    return this.entryController.unpromoteEntry(req, res);
  }

  async autoAssignBookmark(req: Request, res: Response): Promise<void> {
    return this.entryController.autoAssignBookmark(req, res);
  }

  async createIllustration(req: Request, res: Response): Promise<void> {
    return this.illustrationController.createIllustration(req, res);
  }

  async deleteIllustration(req: Request, res: Response): Promise<void> {
    return this.illustrationController.deleteIllustration(req, res);
  }

  async reorderIllustrations(req: Request, res: Response): Promise<void> {
    return this.illustrationController.reorderIllustrations(req, res);
  }

  async generateBookCover(req: Request, res: Response): Promise<void> {
    return this.illustrationController.generateBookCover(req, res);
  }

  async getMyLibrary(req: Request, res: Response): Promise<void> {
    return this.userLibraryController.getMyLibrary(req, res);
  }

  async addToLibrary(req: Request, res: Response): Promise<void> {
    return this.userLibraryController.addToLibrary(req, res);
  }

  async getLibraryProgress(req: Request, res: Response): Promise<void> {
    return this.userLibraryController.getLibraryProgress(req, res);
  }

  async updateLibraryProgress(req: Request, res: Response): Promise<void> {
    return this.userLibraryController.updateLibraryProgress(req, res);
  }

  async removeFromLibrary(req: Request, res: Response): Promise<void> {
    return this.userLibraryController.removeFromLibrary(req, res);
  }

  async createShareLink(req: Request, res: Response): Promise<void> {
    return this.shareLinkController.createShareLink(req, res);
  }

  async resolveShareLink(req: Request, res: Response): Promise<void> {
    return this.shareLinkController.resolveShareLink(req, res);
  }

  async getShareLinks(req: Request, res: Response): Promise<void> {
    return this.shareLinkController.getShareLinks(req, res);
  }

  async revokeShareLink(req: Request, res: Response): Promise<void> {
    return this.shareLinkController.revokeShareLink(req, res);
  }
}

export { BookController } from './BookController';
export { ChapterController } from './ChapterController';
export { EntryController } from './EntryController';
export { IllustrationController } from './IllustrationController';
export { UserLibraryController } from './UserLibraryController';
export { ShareLinkController } from './ShareLinkController';
