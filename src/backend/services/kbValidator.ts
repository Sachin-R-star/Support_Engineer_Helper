import { z } from 'zod';
import { KbIssueDefinition, IncidentCategory } from '../models';
import fs from 'fs';
import path from 'path';

const AllowedCategories: IncidentCategory[] = ['NETWORK', 'ACCOUNT', 'APPLICATION', 'DEVICE', 'OTHER'];
const AllowedSubdomains = ['VPN', 'EMAIL', 'SECURITY', 'PRINTING', 'CLOUD', 'OFFICE_PRODUCTIVITY', 'PERIPHERALS', 'GENERAL', 'NETWORK', 'ACCOUNT', 'APPLICATION', 'DEVICE'];

const KbQuestionOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  priority_signal: z.string().optional(),
  indicates_issue_type: z.string().optional()
});

const KbDiagnosticQuestionSchema = z.object({
  id: z.string().min(1),
  question_text: z.string().min(1),
  options: z.array(KbQuestionOptionSchema).min(1)
});

const KbPrioritySignalsSchema = z.object({
  p1_conditions: z.array(z.string()).optional(),
  p2_conditions: z.array(z.string()).optional(),
  p3_conditions: z.array(z.string()).optional(),
  p4_conditions: z.array(z.string()).optional()
});

export const KbIssueDefinitionSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['NETWORK', 'ACCOUNT', 'APPLICATION', 'DEVICE', 'OTHER']),
  subdomain: z.string().min(1),
  issue_type: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  example_user_phrases: z.array(z.string()).min(1),
  required_information: z.array(z.string()),
  diagnostic_questions: z.array(KbDiagnosticQuestionSchema),
  troubleshooting_steps: z.array(z.string()).min(1),
  priority_signals: KbPrioritySignalsSchema,
  escalation_conditions: z.array(z.string()),
  related_issue_types: z.array(z.string())
});

export interface ValidationResult {
  isValid: boolean;
  totalDefinitions: number;
  categoryDistribution: Record<IncidentCategory, number>;
  errors: string[];
  warnings: string[];
}

export class KbValidator {
  /**
   * Validates an array of KB Issue Definitions against schema and business integrity rules.
   */
  public static validate(definitions: KbIssueDefinition[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const categoryDistribution: Record<IncidentCategory, number> = {
      NETWORK: 0,
      ACCOUNT: 0,
      APPLICATION: 0,
      DEVICE: 0,
      OTHER: 0
    };

    const idSet = new Set<string>();
    const issueTypeSet = new Set<string>();

    if (!Array.isArray(definitions) || definitions.length === 0) {
      errors.push('Knowledge base is empty or invalid array format.');
      return {
        isValid: false,
        totalDefinitions: 0,
        categoryDistribution,
        errors,
        warnings
      };
    }

    // 1. Individual Definition Validation
    definitions.forEach((def, index) => {
      const parseResult = KbIssueDefinitionSchema.safeParse(def);
      if (!parseResult.success) {
        errors.push(`Def #${index} (${def.id || 'NO_ID'}) failed Zod schema validation: ${parseResult.error.message}`);
        return;
      }

      // Check Duplicate IDs
      if (idSet.has(def.id)) {
        errors.push(`Duplicate issue ID detected: "${def.id}"`);
      } else {
        idSet.add(def.id);
      }

      issueTypeSet.add(def.issue_type);

      // Category distribution counter
      if (AllowedCategories.includes(def.category)) {
        categoryDistribution[def.category] = (categoryDistribution[def.category] || 0) + 1;
      } else {
        errors.push(`Issue ID "${def.id}" has invalid category "${def.category}"`);
      }
    });

    // 2. Referential Integrity Check for related_issue_types
    definitions.forEach((def) => {
      def.related_issue_types.forEach((relId) => {
        if (!idSet.has(relId)) {
          warnings.push(`Issue ID "${def.id}" references non-existent related_issue_type ID "${relId}"`);
        }
      });
    });

    // 3. Fallback Path Check (Must have a general fallback under category OTHER)
    const hasFallback = definitions.some(def => def.category === 'OTHER' && (def.issue_type === 'other_general_it' || def.id.includes('general')));
    if (!hasFallback) {
      errors.push('Knowledge Base missing required fallback path under category OTHER.');
    }

    return {
      isValid: errors.length === 0,
      totalDefinitions: definitions.length,
      categoryDistribution,
      errors,
      warnings
    };
  }

  /**
   * Reads and validates the knowledgeBase.json file from disk.
   */
  public static loadAndValidateFromFile(filePath?: string): { definitions: KbIssueDefinition[]; validation: ValidationResult } {
    let targetPath = filePath || path.join(__dirname, '../data/knowledgeBase.json');
    if (!fs.existsSync(targetPath)) {
      const fallbackPath = path.join(process.cwd(), 'src/backend/data/knowledgeBase.json');
      if (fs.existsSync(fallbackPath)) {
        targetPath = fallbackPath;
      } else {
        throw new Error(`Knowledge Base file not found at ${targetPath}`);
      }
    }

    const rawData = fs.readFileSync(targetPath, 'utf8');
    const definitions: KbIssueDefinition[] = JSON.parse(rawData);
    const validation = this.validate(definitions);

    return { definitions, validation };
  }
}
