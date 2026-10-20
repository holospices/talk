export const AI_TEST_PREFIX = 'ai-test-'

export function isAiTestId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(AI_TEST_PREFIX)
}

export function excludeAiTestRows<T extends { id: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isAiTestId(row.id))
}
