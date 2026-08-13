/*
 * add-multi-agent-team (tasks 5.2/5.6, design D4/D15): data model for plan
 * annotations carried on assistant messages through the existing persistence
 * channel, plus helpers to locate the currently effective plan.
 */
import type { Message } from 'ai';
import type { PdPlanSelection } from './pd-plan-parser';

export type TlStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface PlanAnnotationStep {
  text: string;

  /** Completion state written back by the orchestrator terminal states (D15). */
  status?: TlStepStatus;
}

export interface PlanAnnotationValue {
  role: 'pd';
  gen: number;
  steps: PlanAnnotationStep[];
  selection?: PdPlanSelection | null;
  timing?: {
    startedAt: number;
    firstTokenAt?: number;
    endedAt: number;
  };
}

export interface PlanAnnotation {
  type: 'plan';
  value: PlanAnnotationValue;
}

export function isPlanAnnotation(annotation: unknown): annotation is PlanAnnotation {
  return (
    typeof annotation === 'object' &&
    annotation !== null &&
    (annotation as PlanAnnotation).type === 'plan' &&
    (annotation as PlanAnnotation).value?.role === 'pd'
  );
}

export function getPlanAnnotations(messages: Message[]): Array<{ message: Message; annotation: PlanAnnotation }> {
  const result: Array<{ message: Message; annotation: PlanAnnotation }> = [];

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    for (const annotation of (message.annotations ?? []) as unknown[]) {
      if (isPlanAnnotation(annotation)) {
        result.push({ message, annotation });
      }
    }
  }

  return result;
}

/** The effective plan is the approved plan with the highest gen (D15). */
export function getEffectivePlan(
  messages: Message[],
): { message: Message; annotation: PlanAnnotation } | undefined {
  const plans = getPlanAnnotations(messages);

  if (plans.length === 0) {
    return undefined;
  }

  return plans.reduce((best, current) =>
    current.annotation.value.gen > best.annotation.value.gen ? current : best,
  );
}
