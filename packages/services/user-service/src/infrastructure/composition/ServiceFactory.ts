/**
 * Service Factory - Composition Root
 * Wires up dependencies following Clean Architecture and Dependency Inversion
 */

import { AuthRepository } from '../repositories/AuthRepository';
import { ProfileRepository } from '../repositories/ProfileRepository';
import { IntelligenceRepository } from '../repositories/IntelligenceRepository';
import { AnalysisRepository } from '../repositories/AnalysisRepository';
// EntryRepository - using UnifiedEntryRepositoryAdapter from LibraryRepository
import { CreditRepository } from '../repositories/credit';
import { CreditProductRepository } from '../repositories/CreditProductRepository';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository';
import { GuestConversionRepository } from '../repositories/GuestConversionRepository';
import { PatternRepository } from '../repositories/PatternRepository';
import { PersonaRepository } from '../repositories/PersonaRepository';
import { createCachedPersonaRepository, type ICachedPersonaRepository } from '../cache/PersonaCacheService';
// BookRepository from LibraryRepository (unified book system)
import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
  UnifiedEntryRepositoryAdapter,
} from '../repositories/LibraryRepository';
import { JWTService } from '../services/JWTService';
import { EventPublisher } from '../services/EventPublisher';
import { AIAnalysisService } from '../services/AIAnalysisService';
import { RiskDetectionService } from '../services/RiskDetectionService';
import { SafetyRepository } from '../repositories/SafetyRepository';
import { createDrizzleRepository, getDatabase } from '../database/DatabaseConnectionFactory';

// Domain Repository Implementations (infrastructure layer)
import { LibraryRepositoryImpl } from '../repositories/library/LibraryRepositoryImpl';
import { InsightRepositoryImpl } from '../repositories/insights/InsightRepositoryImpl';
import { ReflectionRepositoryImpl } from '../repositories/insights/ReflectionRepositoryImpl';
import { PatternRepositoryImpl } from '../repositories/insights/PatternRepositoryImpl';
import { PersonaRepositoryImpl } from '../repositories/insights/PersonaRepositoryImpl';
import { NotificationRepositoryImpl } from '../repositories/notifications/NotificationRepositoryImpl';
import { IdentityRepositoryImpl } from '../repositories/identity/IdentityRepositoryImpl';

// Auth Use Cases
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  GuestAuthUseCase,
  RefreshTokenUseCase,
  SendSmsVerificationCodeUseCase,
  VerifySmsCodeUseCase,
  AuthenticateUserUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  PasswordResetWithCodeUseCase,
} from '../../application/use-cases/auth';

// User Management Use Cases
import { CreateUserUseCase } from '../../application/use-cases/user/CreateUserUseCase';
import { UpdateUserUseCase, UpdateUserSettingsUseCase } from '../../application/use-cases/user/UpdateUserUseCase';
import { DeleteUserDataUseCase } from '../../application/use-cases/user/DeleteUserDataUseCase';
import { AssignLibrarianRoleUseCase } from '../../application/use-cases/user/AssignLibrarianRoleUseCase';

// Library Entry Use Cases
import { CreateEntryUseCase } from '../../application/use-cases/library/entry/CreateEntryUseCase';

// Insights Use Cases
import {
  CreateInsightUseCase,
  CreateReflectionUseCase,
  GetInsightsUseCase,
} from '../../application/use-cases/insights';
import { ContinueReflectionDialogueUseCase } from '../../application/use-cases/insights/ContinueReflectionDialogueUseCase';
import { ExplorePatternUseCase } from '../../application/use-cases/insights/ExplorePatternUseCase';
import { RecordMoodCheckInUseCase } from '../../application/use-cases/insights/RecordMoodCheckInUseCase';
import { GeneratePersonalNarrativeUseCase } from '../../application/use-cases/insights/GeneratePersonalNarrativeUseCase';

// Library Entry Use Cases (unified with Clean Architecture)
import {
  ListEntriesUseCase,
  UpdateEntryUseCase,
  DeleteEntryUseCase,
  GetEntryUseCase,
  ArchiveEntryUseCase,
  AnalyzeEntryUseCase,
  BatchAnalyzeEntriesUseCase,
  DetectEntryPatternsUseCase,
  AddEntryImageUseCase,
  RemoveEntryImageUseCase,
  GetEntryImagesUseCase,
  ReorderEntryImagesUseCase,
} from '../../application/use-cases/library/entry';

// Insights Use Cases (wellness, goals, insights)
import {
  UpdateUserGoalsFromInsightsUseCase,
  CalculateUserWellnessScoreUseCase,
} from '../../application/use-cases/insights';

// Profile Management Use Cases
import { GetUserProfileUseCase } from '../../application/use-cases/profile/GetUserProfileUseCase';
import { UpdateUserProfileUseCase } from '../../application/use-cases/profile/UpdateUserProfileUseCase';
import { UpdateProfileUseCase } from '../../application/use-cases/profile/UpdateProfileUseCase';
import { GetUserProfileSummaryUseCase } from '../../application/use-cases/profile/GetUserProfileSummaryUseCase';
import { ExportUserProfileUseCase } from '../../application/use-cases/profile/ExportUserProfileUseCase';
import { ImportUserProfileUseCase } from '../../application/use-cases/profile/ImportUserProfileUseCase';

// User Analytics Use Cases
import { GenerateUserAnalyticsUseCase } from '../../application/use-cases/analytics/GenerateUserAnalyticsUseCase';
import { GeneratePersonalityProfileUseCase } from '../../application/use-cases/profile/GeneratePersonalityProfileUseCase';
import { GenerateProfileHighlightsUseCase } from '../../application/use-cases/profile/GenerateProfileHighlightsUseCase';
import { GenerateUserPersonaUseCase } from '../../application/use-cases/profile/GenerateUserPersonaUseCase';
import { GetLatestPersonaUseCase } from '../../application/use-cases/profile/GetLatestPersonaUseCase';
import {
  PersonalityAnalyzerService,
  BehaviorAnalyzerService,
  CognitiveAnalyzerService,
  SocialAnalyzerService,
  GrowthAnalyzerService,
} from '../../application/services/persona';

// Onboarding Use Cases
import { InitializeUserOnboardingUseCase } from '../../application/use-cases/onboarding/InitializeUserOnboardingUseCase';

// Analytics Use Cases
import { GetContentAnalyticsUseCase, TrackContentViewUseCase } from '../../application/use-cases/analytics';

// Billing Use Cases (credits, subscriptions, quota)
import {
  GetCreditBalanceUseCase,
  ValidateCreditsUseCase,
  DeductCreditsUseCase,
  RefundCreditsUseCase,
  GetTransactionHistoryUseCase,
  CheckUsageEligibilityUseCase,
  CheckQuotaUseCase,
} from '../../application/use-cases/billing';

// Narrative Seeds Use Cases
import { GetNarrativeSeedsUseCase } from '../../application/use-cases/insights';

// Import Backup Repository
import { ImportBackupRepository } from '../repositories/ImportBackupRepository';

// Controllers
import { AuthController } from '../../presentation/controllers/AuthController';
import { ProfileController } from '../../presentation/controllers/ProfileController';
import { IntelligenceController } from '../../presentation/controllers/intelligence';
import { UserController } from '../../presentation/controllers/UserController';
import { OnboardingController } from '../../presentation/controllers/OnboardingController';
import { AnalyticsController } from '../../presentation/controllers/AnalyticsController';
import { CreditController } from '../../presentation/controllers/CreditController';
import { SubscriptionController } from '../../presentation/controllers/SubscriptionController';
import { GuestConversionController } from '../../presentation/controllers/GuestConversionController';
import { PatternController } from '../../presentation/controllers/PatternController';
import { NarrativeSeedsController } from '../../presentation/controllers/NarrativeSeedsController';

/**
 * Service Factory - Composition Root
 * Single source of truth for dependency wiring
 */
export class ServiceFactory {
  // Infrastructure (singleton instances via DI factory)
  private static authRepo = createDrizzleRepository(AuthRepository);
  private static profileRepo = createDrizzleRepository(ProfileRepository);
  private static intelligenceRepo = createDrizzleRepository(IntelligenceRepository);
  private static analysisRepo = createDrizzleRepository(AnalysisRepository);
  // entryRepo - using unifiedEntryRepo instead (see below)
  private static creditRepo = createDrizzleRepository(CreditRepository);
  private static creditProductRepo = createDrizzleRepository(CreditProductRepository);
  private static subscriptionRepo = createDrizzleRepository(SubscriptionRepository);
  private static guestConversionRepo = createDrizzleRepository(GuestConversionRepository);
  private static patternRepo = createDrizzleRepository(PatternRepository);
  private static personaRepoRaw = createDrizzleRepository(PersonaRepository);
  private static personaRepo: ICachedPersonaRepository = createCachedPersonaRepository(
    ServiceFactory.personaRepoRaw,
    process.env.ENABLE_PERSONA_CACHE !== 'false'
  );
  // Unified Library repositories (book system)
  private static bookRepo = createDrizzleRepository(BookRepository);
  private static chapterRepo = createDrizzleRepository(ChapterRepository);
  private static entryRepo = createDrizzleRepository(EntryRepository);
  private static illustrationRepo = createDrizzleRepository(IllustrationRepository);
  // Adapter that implements IEntryRepository using unified library (entries + insights)
  private static unifiedEntryRepo = createDrizzleRepository(UnifiedEntryRepositoryAdapter);
  private static importBackupRepo = createDrizzleRepository(ImportBackupRepository);
  private static jwtService = JWTService.getInstance();
  private static eventPublisher = new EventPublisher();
  private static aiAnalysisService = new AIAnalysisService();
  private static safetyRepo = createDrizzleRepository(SafetyRepository);
  private static riskDetectionService = new RiskDetectionService(ServiceFactory.safetyRepo);

  // Persona Analyzer Services (singleton instances)
  private static personalityAnalyzer = new PersonalityAnalyzerService();
  private static behaviorAnalyzer = new BehaviorAnalyzerService();
  private static cognitiveAnalyzer = new CognitiveAnalyzerService();
  private static socialAnalyzer = new SocialAnalyzerService();
  private static growthAnalyzer = new GrowthAnalyzerService();

  // Domain Repositories (organized by bounded context)
  private static libraryRepoImpl = createDrizzleRepository(LibraryRepositoryImpl);
  private static insightRepoImpl = createDrizzleRepository(InsightRepositoryImpl);
  private static reflectionRepoImpl = createDrizzleRepository(ReflectionRepositoryImpl);
  private static patternRepoImpl = createDrizzleRepository(PatternRepositoryImpl);
  private static domainPersonaRepoImpl = createDrizzleRepository(PersonaRepositoryImpl);
  private static notificationRepoImpl = createDrizzleRepository(NotificationRepositoryImpl);
  private static identityRepoImpl = createDrizzleRepository(IdentityRepositoryImpl);

  // ==================== AUTH & USER USE CASES ====================

  static createRegisterUserUseCase() {
    return new RegisterUserUseCase(this.authRepo, this.jwtService, this.subscriptionRepo);
  }

  static createLoginUserUseCase() {
    return new LoginUserUseCase(this.authRepo, this.jwtService);
  }

  static createGuestAuthUseCase() {
    return new GuestAuthUseCase(this.jwtService, this.authRepo, this.creditRepo);
  }

  static createRefreshTokenUseCase() {
    return new RefreshTokenUseCase(this.authRepo, this.jwtService);
  }

  static createSendSmsVerificationCodeUseCase() {
    return new SendSmsVerificationCodeUseCase(this.authRepo);
  }

  static createVerifySmsCodeUseCase() {
    return new VerifySmsCodeUseCase(this.authRepo);
  }

  static createCreateUserUseCase() {
    return new CreateUserUseCase(this.authRepo);
  }

  static createAuthenticateUserUseCase() {
    return new AuthenticateUserUseCase(this.authRepo);
  }

  static createUpdateUserUseCase() {
    return new UpdateUserUseCase(this.authRepo);
  }

  static createUpdateUserSettingsUseCase() {
    return new UpdateUserSettingsUseCase(this.authRepo);
  }

  static createDeleteUserDataUseCase() {
    return new DeleteUserDataUseCase(this.authRepo);
  }

  static createRequestPasswordResetUseCase() {
    return new RequestPasswordResetUseCase(this.authRepo);
  }

  static createResetPasswordUseCase() {
    return new ResetPasswordUseCase(this.authRepo, this.createRequestPasswordResetUseCase());
  }

  private static passwordResetWithCodeUseCase: PasswordResetWithCodeUseCase | null = null;

  static createPasswordResetWithCodeUseCase() {
    if (!this.passwordResetWithCodeUseCase) {
      this.passwordResetWithCodeUseCase = new PasswordResetWithCodeUseCase(this.authRepo);
    }
    return this.passwordResetWithCodeUseCase;
  }

  static createAssignLibrarianRoleUseCase() {
    return new AssignLibrarianRoleUseCase(this.authRepo, this.creditRepo);
  }

  // ==================== ENTRY USE CASES (unified library content) ====================

  // Entry management (primary API)
  static createEntryUseCase() {
    return new CreateEntryUseCase(this.entryRepo, this.chapterRepo, this.bookRepo, {
      profileRepo: this.profileRepo,
      riskDetectionService: this.riskDetectionService,
    });
  }

  static createListEntriesUseCase() {
    return new ListEntriesUseCase(this.entryRepo, this.chapterRepo, this.bookRepo, this.illustrationRepo);
  }

  static createGetEntryUseCase() {
    return new GetEntryUseCase(this.entryRepo, this.chapterRepo, this.bookRepo, this.illustrationRepo);
  }

  static createUpdateEntryUseCase() {
    return new UpdateEntryUseCase(this.entryRepo, this.chapterRepo, this.bookRepo, {
      intelligenceRepo: this.intelligenceRepo,
    });
  }

  static createDeleteEntryUseCase() {
    return new DeleteEntryUseCase(this.entryRepo, this.chapterRepo, this.bookRepo, this.illustrationRepo, {
      intelligenceRepo: this.intelligenceRepo,
    });
  }

  static createArchiveEntryUseCase() {
    return new ArchiveEntryUseCase(this.intelligenceRepo);
  }

  static createAnalyzeEntryUseCase() {
    return new AnalyzeEntryUseCase(this.intelligenceRepo);
  }

  static createBatchAnalyzeEntriesUseCase() {
    return new BatchAnalyzeEntriesUseCase(this.intelligenceRepo);
  }

  static createDetectEntryPatternsUseCase() {
    return new DetectEntryPatternsUseCase(this.analysisRepo, this.createGetNarrativeSeedsUseCase());
  }

  // Illustration management (primary API)
  static createAddIllustrationUseCase() {
    return new AddEntryImageUseCase(this.intelligenceRepo);
  }

  static createRemoveIllustrationUseCase() {
    return new RemoveEntryImageUseCase(this.intelligenceRepo);
  }

  static createGetIllustrationsUseCase() {
    return new GetEntryImagesUseCase(this.intelligenceRepo);
  }

  static createReorderIllustrationsUseCase() {
    return new ReorderEntryImagesUseCase(this.intelligenceRepo);
  }

  static getRiskDetectionService() {
    return this.riskDetectionService;
  }

  static getSafetyRepository() {
    return this.safetyRepo;
  }

  static createInsightUseCase() {
    return new CreateInsightUseCase(this.intelligenceRepo, this.profileRepo);
  }

  static createReflectionUseCase() {
    return new CreateReflectionUseCase(this.intelligenceRepo, this.profileRepo);
  }

  static createContinueReflectionDialogueUseCase() {
    return new ContinueReflectionDialogueUseCase(this.intelligenceRepo);
  }

  static createExplorePatternUseCase() {
    return new ExplorePatternUseCase(this.intelligenceRepo);
  }

  static createRecordMoodCheckInUseCase() {
    return new RecordMoodCheckInUseCase(this.intelligenceRepo);
  }

  static createGeneratePersonalNarrativeUseCase() {
    return new GeneratePersonalNarrativeUseCase(this.intelligenceRepo);
  }

  static createGetInsightsUseCase() {
    return new GetInsightsUseCase(this.intelligenceRepo);
  }

  static createUpdateUserGoalsFromInsightsUseCase() {
    return new UpdateUserGoalsFromInsightsUseCase(this.profileRepo, this.unifiedEntryRepo, this.analysisRepo);
  }

  // ==================== PROFILE USE CASES ====================

  static createGetUserProfileUseCase() {
    return new GetUserProfileUseCase(this.profileRepo, this.unifiedEntryRepo);
  }

  static createUpdateUserProfileUseCase() {
    return new UpdateUserProfileUseCase(this.profileRepo);
  }

  static createUpdateProfileUseCase() {
    return new UpdateProfileUseCase(this.profileRepo);
  }

  static createGetUserProfileSummaryUseCase() {
    return new GetUserProfileSummaryUseCase(this.profileRepo, this.unifiedEntryRepo, this.analysisRepo);
  }

  static createExportUserProfileUseCase() {
    return new ExportUserProfileUseCase(this.profileRepo, this.unifiedEntryRepo, this.analysisRepo);
  }

  static createImportUserProfileUseCase() {
    return new ImportUserProfileUseCase(
      this.profileRepo,
      this.unifiedEntryRepo,
      this.analysisRepo,
      this.importBackupRepo,
      this.bookRepo,
      this.intelligenceRepo
    );
  }

  // ==================== USER ANALYTICS USE CASES ====================

  static createGenerateUserAnalyticsUseCase() {
    return new GenerateUserAnalyticsUseCase(this.analysisRepo);
  }

  static createGeneratePersonalityProfileUseCase() {
    return new GeneratePersonalityProfileUseCase(this.analysisRepo);
  }

  static createGenerateProfileHighlightsUseCase() {
    return new GenerateProfileHighlightsUseCase(this.profileRepo, this.unifiedEntryRepo, this.analysisRepo);
  }

  static createGenerateUserPersonaUseCase() {
    return new GenerateUserPersonaUseCase(
      this.profileRepo,
      this.unifiedEntryRepo,
      this.analysisRepo,
      this.personaRepo,
      this.personalityAnalyzer,
      this.behaviorAnalyzer,
      this.cognitiveAnalyzer,
      this.socialAnalyzer,
      this.growthAnalyzer
    );
  }

  static createCalculateUserWellnessScoreUseCase() {
    return new CalculateUserWellnessScoreUseCase(this.profileRepo, this.unifiedEntryRepo, this.analysisRepo);
  }

  static createGetLatestPersonaUseCase() {
    return new GetLatestPersonaUseCase(this.personaRepo);
  }

  static getPersonaRepository() {
    return this.personaRepo;
  }

  // ==================== ONBOARDING USE CASES ====================

  static createInitializeUserOnboardingUseCase() {
    return new InitializeUserOnboardingUseCase(this.intelligenceRepo, getDatabase());
  }

  // ==================== ANALYTICS USE CASES ====================

  static createGetContentAnalyticsUseCase() {
    return new GetContentAnalyticsUseCase(this.analysisRepo);
  }

  static createTrackContentViewUseCase() {
    return new TrackContentViewUseCase(this.analysisRepo);
  }

  // ==================== CREDIT USE CASES ====================

  static createGetCreditBalanceUseCase() {
    return new GetCreditBalanceUseCase(this.creditRepo);
  }

  static createValidateCreditsUseCase() {
    return new ValidateCreditsUseCase(this.creditRepo);
  }

  static createDeductCreditsUseCase() {
    return new DeductCreditsUseCase(this.creditRepo);
  }

  static createRefundCreditsUseCase() {
    return new RefundCreditsUseCase(this.creditRepo);
  }

  static getCreditRepository() {
    return this.creditRepo;
  }

  static getCreditProductRepository() {
    return this.creditProductRepo;
  }

  static createGetTransactionHistoryUseCase() {
    return new GetTransactionHistoryUseCase(this.creditRepo);
  }

  // ==================== REPOSITORY ACCESSORS ====================

  static createIntelligenceRepository() {
    return this.intelligenceRepo;
  }

  // Domain Repository Accessors (bounded context repositories)
  static getLibraryRepository() {
    return this.libraryRepoImpl;
  }

  static getInsightRepository() {
    return this.insightRepoImpl;
  }

  static getReflectionRepository() {
    return this.reflectionRepoImpl;
  }

  static getPatternRepository() {
    return this.patternRepoImpl;
  }

  static getDomainPersonaRepository() {
    return this.domainPersonaRepoImpl;
  }

  static getNotificationRepository() {
    return this.notificationRepoImpl;
  }

  static getIdentityRepository() {
    return this.identityRepoImpl;
  }

  // ==================== SERVICE ACCESSORS ====================

  static createJWTService() {
    return this.jwtService;
  }

  static createAuthRepository() {
    return this.authRepo;
  }

  // ==================== CONTROLLERS ====================

  static createAuthController() {
    return new AuthController();
  }

  static createProfileController() {
    return new ProfileController();
  }

  static createIntelligenceController() {
    return new IntelligenceController();
  }

  static createUserController() {
    return new UserController(
      this.createCreateUserUseCase(),
      this.createGetUserProfileUseCase(),
      this.createUpdateUserUseCase(),
      this.createDeleteUserDataUseCase(),
      this.createUpdateUserSettingsUseCase()
    );
  }

  static createOnboardingController() {
    return new OnboardingController(this.createInitializeUserOnboardingUseCase());
  }

  static createAnalyticsController() {
    return new AnalyticsController(
      this.createGenerateUserAnalyticsUseCase(),
      this.createGeneratePersonalityProfileUseCase(),
      this.createGenerateProfileHighlightsUseCase(),
      this.createGenerateUserPersonaUseCase(),
      this.createGetLatestPersonaUseCase(),
      this.createCalculateUserWellnessScoreUseCase(),
      this.createGetContentAnalyticsUseCase(),
      this.createTrackContentViewUseCase()
    );
  }

  static createCreditController() {
    return new CreditController();
  }

  static createCheckUsageEligibilityUseCase() {
    return new CheckUsageEligibilityUseCase(this.subscriptionRepo);
  }

  static createCheckQuotaUseCase() {
    return new CheckQuotaUseCase(this.subscriptionRepo, this.creditRepo);
  }

  static createSubscriptionController() {
    return new SubscriptionController(this.subscriptionRepo, this.createCheckUsageEligibilityUseCase());
  }

  static getGuestConversionRepository() {
    return this.guestConversionRepo;
  }

  static createGuestConversionController() {
    return new GuestConversionController(this.guestConversionRepo);
  }

  static createPatternController() {
    return new PatternController();
  }

  static createPatternRepository() {
    return this.patternRepo;
  }

  // ==================== NARRATIVE SEEDS ====================

  static createGetNarrativeSeedsUseCase() {
    return new GetNarrativeSeedsUseCase(this.intelligenceRepo);
  }

  static createNarrativeSeedsController() {
    return new NarrativeSeedsController(this.createGetNarrativeSeedsUseCase());
  }
}
