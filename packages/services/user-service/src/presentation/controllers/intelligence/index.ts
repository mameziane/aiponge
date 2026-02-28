import { Request, Response } from 'express';
import { IntelligenceEntryController } from './EntryController';
import { IntelligenceEntryAnalysisController } from './EntryAnalysisController';
import { IntelligenceIllustrationController } from './IllustrationController';
import { IntelligenceInsightController } from './InsightController';
import { IntelligenceReflectionController } from './ReflectionController';
import { IntelligenceMoodController } from './MoodController';
import { IntelligenceNarrativeController } from './NarrativeController';
import { IntelligenceChapterController } from './ChapterController';

const entryController = new IntelligenceEntryController();
const entryAnalysisController = new IntelligenceEntryAnalysisController();
const illustrationController = new IntelligenceIllustrationController();
const insightController = new IntelligenceInsightController();
const reflectionController = new IntelligenceReflectionController();
const moodController = new IntelligenceMoodController();
const narrativeController = new IntelligenceNarrativeController();
const chapterController = new IntelligenceChapterController();

export class IntelligenceController {
  createEntry(req: Request, res: Response) { return entryController.createEntry(req, res); }
  getEntries(req: Request, res: Response) { return entryController.getEntries(req, res); }
  getEntryById(req: Request, res: Response) { return entryController.getEntryById(req, res); }
  updateEntry(req: Request, res: Response) { return entryController.updateEntry(req, res); }
  deleteEntry(req: Request, res: Response) { return entryController.deleteEntry(req, res); }
  batchUpdateEntries(req: Request, res: Response) { return entryController.batchUpdateEntries(req, res); }
  batchDeleteEntries(req: Request, res: Response) { return entryController.batchDeleteEntries(req, res); }
  archiveEntry(req: Request, res: Response) { return entryController.archiveEntry(req, res); }

  analyzeEntry(req: Request, res: Response) { return entryAnalysisController.analyzeEntry(req, res); }
  batchAnalyzeEntries(req: Request, res: Response) { return entryAnalysisController.batchAnalyzeEntries(req, res); }
  detectEntryPatterns(req: Request, res: Response) { return entryAnalysisController.detectEntryPatterns(req, res); }

  addIllustration(req: Request, res: Response) { return illustrationController.addIllustration(req, res); }
  removeIllustration(req: Request, res: Response) { return illustrationController.removeIllustration(req, res); }
  getIllustrations(req: Request, res: Response) { return illustrationController.getIllustrations(req, res); }
  reorderIllustrations(req: Request, res: Response) { return illustrationController.reorderIllustrations(req, res); }

  getInsightsByEntry(req: Request, res: Response) { return insightController.getInsightsByEntry(req, res); }
  createInsight(req: Request, res: Response) { return insightController.createInsight(req, res); }
  getInsights(req: Request, res: Response) { return insightController.getInsights(req, res); }
  updateUserGoalsFromInsights(req: Request, res: Response) { return insightController.updateUserGoalsFromInsights(req, res); }

  createReflection(req: Request, res: Response) { return reflectionController.createReflection(req, res); }
  getReflections(req: Request, res: Response) { return reflectionController.getReflections(req, res); }
  getReflectionById(req: Request, res: Response) { return reflectionController.getReflectionById(req, res); }
  updateReflection(req: Request, res: Response) { return reflectionController.updateReflection(req, res); }
  deleteReflectionById(req: Request, res: Response) { return reflectionController.deleteReflectionById(req, res); }
  continueReflectionDialogue(req: Request, res: Response) { return reflectionController.continueReflectionDialogue(req, res); }
  getReflectionThread(req: Request, res: Response) { return reflectionController.getReflectionThread(req, res); }

  recordMoodCheckin(req: Request, res: Response) { return moodController.recordMoodCheckin(req, res); }
  getMoodCheckins(req: Request, res: Response) { return moodController.getMoodCheckins(req, res); }
  respondToMoodMicroQuestion(req: Request, res: Response) { return moodController.respondToMoodMicroQuestion(req, res); }

  getLatestNarrative(req: Request, res: Response) { return narrativeController.getLatestNarrative(req, res); }
  getNarrativeHistory(req: Request, res: Response) { return narrativeController.getNarrativeHistory(req, res); }
  respondToNarrative(req: Request, res: Response) { return narrativeController.respondToNarrative(req, res); }

  createChapter(req: Request, res: Response) { return chapterController.createChapter(req, res); }
  getChapters(req: Request, res: Response) { return chapterController.getChapters(req, res); }
  updateChapter(req: Request, res: Response) { return chapterController.updateChapter(req, res); }
  deleteChapter(req: Request, res: Response) { return chapterController.deleteChapter(req, res); }
  assignEntriesToChapter(req: Request, res: Response) { return chapterController.assignEntriesToChapter(req, res); }
  getChapterSnapshot(req: Request, res: Response) { return chapterController.getChapterSnapshot(req, res); }
}

export { IntelligenceEntryController } from './EntryController';
export { IntelligenceEntryAnalysisController } from './EntryAnalysisController';
export { IntelligenceIllustrationController } from './IllustrationController';
export { IntelligenceInsightController } from './InsightController';
export { IntelligenceReflectionController } from './ReflectionController';
export { IntelligenceMoodController } from './MoodController';
export { IntelligenceNarrativeController } from './NarrativeController';
export { IntelligenceChapterController } from './ChapterController';
