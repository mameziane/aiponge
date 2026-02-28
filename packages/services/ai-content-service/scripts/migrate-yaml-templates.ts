/**
 * YAML Template Migration Script
 * Loads YAML prompt templates from tools/prompt-templates into aic_prompt_templates table
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { DatabaseConnectionFactory } from '../src/infrastructure/database/DatabaseConnectionFactory';
import { contentTemplates } from '../src/schema/content-schema';

interface YAMLTemplate {
  metadata?: {
    id?: string;
    version?: string;
    category?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
  meta?: {
    id?: string;
    version?: string;
    name?: string;
    description?: string;
    category?: string;
    author?: string;
    tags?: string[];
  };
  template?: {
    system_prompt?: string;
    user_prompt?: string;
  };
  prompt_structure?: {
    system_prompt?: string;
    user_prompt_structure?: string;
  };
  variables?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    description?: string;
    default?: unknown;
    enum?: string[];
  }>;
  context_analysis?: unknown;
  context_analysis_rules?: unknown;
  inference?: unknown;
  inference_rules?: unknown;
  cultural_adaptations?: unknown;
  quality_metrics?: unknown;
  llm_compatibility?: unknown;
  configuration?: unknown;
  framework_approaches?: unknown;
  [key: string]: unknown;
}

async function loadYAMLTemplate(filePath: string): Promise<Record<string, unknown>> {
  const yamlContent = fs.readFileSync(filePath, 'utf8');
  return parse(yamlContent);
}

function extractTemplateData(yamlData: YAMLTemplate, fileName: string): Record<string, unknown> {
  // Extract metadata from either 'metadata' or 'meta' sections
  const meta: { id?: string; version?: string; category?: string; description?: string; author?: string; tags?: string[]; name?: string } = yamlData.metadata || yamlData.meta || {};
  const templateId = meta.id || fileName.replace(/\.[^/.]+$/, '');
  const version = meta.version || '1.0.0';
  const category = meta.category || 'general';
  const description = meta.description || meta.name || '';
  const author = meta.author || 'aiponge';
  const tags = meta.tags || [];

  // Extract prompts from either 'template' or 'prompt_structure' sections
  const prompts: { system_prompt?: string; user_prompt?: string; user_prompt_structure?: string } = yamlData.template || yamlData.prompt_structure || {};
  const systemPrompt = prompts.system_prompt || '';
  const userPromptStructure = prompts.user_prompt_structure || prompts.user_prompt || '';

  // Extract variables
  const variables = Array.isArray(yamlData.variables) ? yamlData.variables : [];
  const requiredVariables = variables.filter((v: { name: string; required?: boolean; default?: unknown }) => v.required === true).map((v: { name: string; required?: boolean; default?: unknown }) => v.name);
  const optionalVariables = variables
    .filter((v: { name: string; required?: boolean; default?: unknown }) => v.required === false || v.required === undefined)
    .map((v: { name: string; required?: boolean; default?: unknown }) => v.name);

  const asRecord = (val: unknown): Record<string, unknown> | undefined =>
    val && typeof val === 'object' ? (val as Record<string, unknown>) : undefined;

  // Extract context analysis rules
  const contextAnalysisRules = asRecord(yamlData.context_analysis)?.rules || yamlData.context_analysis_rules || [];

  // Extract inference rules
  const inferenceRules = asRecord(yamlData.inference)?.rules || yamlData.inference_rules || [];

  // Extract cultural adaptations
  const culturalAdaptations = asRecord(yamlData.cultural_adaptations)?.adaptations || yamlData.cultural_adaptations || [];

  // Extract quality metrics
  const qualityMetrics = asRecord(yamlData.quality_metrics)?.metrics || yamlData.quality_metrics || [];

  // Extract LLM compatibility
  const llmCompatibility = asRecord(yamlData.llm_compatibility)?.providers || yamlData.llm_compatibility || [];

  // Determine content type from category or tags
  let contentType = 'general';
  if (category === 'music') contentType = 'creative';
  else if (category === 'analysis') contentType = 'technical';
  else if (category === 'therapeutic' || category === 'creative') contentType = category;
  else if (tags.includes('music')) contentType = 'creative';
  else if (tags.includes('analysis')) contentType = 'technical';

  const configRecord = asRecord(yamlData.configuration);
  // Build configuration object
  const configuration = {
    expectedOutputFormat: configRecord?.expected_output_format || 'text',
    postProcessingRules: configRecord?.post_processing_rules || [],
    supportedStrategies: configRecord?.supported_strategies || [],
    defaultParameters: configRecord?.defaultParameters || {},
    qualityMetrics: qualityMetrics,
  };

  return {
    id: templateId,
    name: meta.name || templateId.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
    description,
    contentType,
    category,
    tags,
    systemPrompt,
    userPromptStructure,
    requiredVariables,
    optionalVariables,
    configuration,
    contextAnalysisRules,
    inferenceRules,
    culturalAdaptations,
    llmCompatibility,
    metadata: {
      author,
      version,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      usageCount: 0,
      averageRating: 0,
      tags,
    },
    isActive: true,
    isPublic: true,
    createdBy: 'system',
  };
}

async function migrateTemplates() {
  console.log('🚀 Starting YAML template migration...\n');

  // Initialize database connection
  const dbFactory = DatabaseConnectionFactory.getInstance();
  const db = dbFactory.getDatabase();

  // Support running from different directories
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const templatesDir = path.resolve(scriptDir, '../../../../tools/prompt-templates');

  if (!fs.existsSync(templatesDir)) {
    console.error(`❌ Templates directory not found: ${templatesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.yaml'));
  console.log(`📁 Found ${files.length} YAML templates\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      const filePath = path.join(templatesDir, file);
      console.log(`📝 Processing: ${file}`);

      const yamlData = await loadYAMLTemplate(filePath);
      const templateData = extractTemplateData(yamlData, file);

      // Insert or update into database (UPSERT)
      await db
        .insert(contentTemplates)
        .values(templateData)
        .onConflictDoUpdate({
          target: contentTemplates.id,
          set: {
            name: templateData.name,
            description: templateData.description,
            contentType: templateData.contentType,
            category: templateData.category,
            tags: templateData.tags,
            systemPrompt: templateData.systemPrompt,
            userPromptStructure: templateData.userPromptStructure,
            requiredVariables: templateData.requiredVariables,
            optionalVariables: templateData.optionalVariables,
            configuration: templateData.configuration,
            contextAnalysisRules: templateData.contextAnalysisRules,
            inferenceRules: templateData.inferenceRules,
            culturalAdaptations: templateData.culturalAdaptations,
            llmCompatibility: templateData.llmCompatibility,
            metadata: templateData.metadata,
            isActive: templateData.isActive,
            updatedAt: new Date(),
          },
        });

      console.log(`   ✅ Migrated: ${templateData.name}`);
      console.log(`      ID: ${templateData.id}`);
      console.log(`      Category: ${templateData.category}`);
      console.log(`      Type: ${templateData.contentType}\n`);

      successCount++;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Error migrating ${file}:`, errorMessage);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📝 Total: ${files.length}\n`);

  if (successCount > 0) {
    console.log('✨ YAML templates successfully migrated to database!');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// Run migration
migrateTemplates().catch(error => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});
