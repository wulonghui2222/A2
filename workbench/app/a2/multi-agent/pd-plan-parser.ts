/*
 * add-multi-agent-team (task 2.2, design D2/D14): tolerant parser for the PD
 * planning output. The two sections (<selection> / <plan>) are parsed
 * independently so a drift in one never loses the other; in incremental mode
 * selection is absent by contract.
 */

export interface PdPlanSelection {
  templateName: string;
  title: string;
}

export interface PdPlanParseResult {
  /** null when the selection block is missing or unusable (fall back to blank). */
  selection: PdPlanSelection | null;

  /** Plan steps in order; empty when no usable <step> entries exist. */
  steps: string[];
}

export function parsePdSelection(text: string): PdPlanSelection | null {
  const templateNameMatch = text.match(/<templateName>\s*([\s\S]*?)\s*<\/templateName>/);

  if (!templateNameMatch) {
    return null;
  }

  const templateName = templateNameMatch[1].trim();

  if (!templateName) {
    return null;
  }

  const titleMatch = text.match(/<title>\s*([\s\S]*?)\s*<\/title>/);

  return {
    templateName,
    title: titleMatch?.[1]?.trim() || '',
  };
}

export function parsePdPlanSteps(text: string): string[] {
  const steps: string[] = [];
  const stepRegex = /<step>\s*([\s\S]*?)\s*<\/step>/g;
  let match: RegExpExecArray | null;

  while ((match = stepRegex.exec(text)) !== null) {
    const step = match[1].trim();

    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

export function parsePdPlanOutput(text: string): PdPlanParseResult {
  return {
    selection: parsePdSelection(text),
    steps: parsePdPlanSteps(text),
  };
}
