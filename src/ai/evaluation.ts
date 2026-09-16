import type { Summary } from '../news/summarize.ts';
import { validateSummary } from './schema.ts';

export interface SummaryEvaluationCase {
  name: string;
  output: unknown;
  expectedTerms?: string[];
  forbiddenTerms?: string[];
}

export interface EvaluationResult {
  name: string;
  schemaValid: boolean;
  expectedTermRecall: number;
  forbiddenTermsPresent: string[];
  passed: boolean;
}

function searchable(summary: Summary): string {
  return `${summary.whatHappened} ${summary.whyItMatters}`.toLowerCase();
}

export function evaluateSummaryCase(testCase: SummaryEvaluationCase): EvaluationResult {
  const validation = validateSummary(testCase.output);
  if (!validation.value) {
    return { name: testCase.name, schemaValid: false, expectedTermRecall: 0, forbiddenTermsPresent: [], passed: false };
  }
  const text = searchable(validation.value);
  const expected = testCase.expectedTerms ?? [];
  const matched = expected.filter((term) => text.includes(term.toLowerCase())).length;
  const expectedTermRecall = expected.length ? matched / expected.length : 1;
  const forbiddenTermsPresent = (testCase.forbiddenTerms ?? []).filter((term) => text.includes(term.toLowerCase()));
  return {
    name: testCase.name,
    schemaValid: true,
    expectedTermRecall,
    forbiddenTermsPresent,
    passed: expectedTermRecall === 1 && forbiddenTermsPresent.length === 0
  };
}

export function evaluateSummarySuite(cases: SummaryEvaluationCase[]) {
  const results = cases.map(evaluateSummaryCase);
  return {
    results,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    passRate: results.length ? results.filter((result) => result.passed).length / results.length : 1
  };
}
