import type { DecisionResult } from './decision';

export type DossierNextTarget = 'findings' | 'unknowns' | 'scorecard';

export interface DossierStatusSummary {
  source: {
    label: string;
    detail: string;
    complete: boolean;
  };
  review: {
    label: string;
    detail: string;
    complete: boolean;
  };
  unknowns: {
    label: string;
    detail: string;
    complete: boolean;
  };
  decision: {
    label: string;
    detail: string;
    complete: boolean;
  };
  nextAction: {
    label: string;
    detail: string;
    target: DossierNextTarget;
  };
}

export function deriveDossierStatusSummary({
  rawSourceCaptured,
  findingCount,
  reviewedCount,
  unknownCount,
  decision,
}: {
  rawSourceCaptured: boolean;
  findingCount: number;
  reviewedCount: number;
  unknownCount: number;
  decision: DecisionResult;
}): DossierStatusSummary {
  const unreviewedCount = Math.max(0, findingCount - reviewedCount);
  const missingCount = decision.missing.length;
  const decisiveGateActive = decision.status === 'PASS' || decision.status === 'TOO LATE';

  const source = rawSourceCaptured
    ? {
        label: 'Raw source captured',
        detail: 'The original public Apple response is preserved separately from normalized findings.',
        complete: true,
      }
    : {
        label: 'Normalized snapshot only',
        detail: 'This older dossier remains readable, but it does not contain the original raw store response.',
        complete: false,
      };

  const review = unreviewedCount === 0
    ? {
        label: `${reviewedCount}/${findingCount} reviewed`,
        detail: findingCount === 0 ? 'No store findings were returned.' : 'Every current store finding has a human review state.',
        complete: true,
      }
    : {
        label: `${reviewedCount}/${findingCount} reviewed`,
        detail: `${unreviewedCount} finding${unreviewedCount === 1 ? '' : 's'} still need${unreviewedCount === 1 ? 's' : ''} human review.`,
        complete: false,
      };

  const unknowns = unknownCount === 0
    ? {
        label: 'No listed unknowns',
        detail: 'This dossier currently has no unresolved unknown items in its analysis response.',
        complete: true,
      }
    : {
        label: `${unknownCount} unresolved`,
        detail: 'These items remain unknown until admissible evidence resolves them.',
        complete: false,
      };

  const decisionSummary = decisiveGateActive
    ? {
        label: `${decision.status} gate active`,
        detail: `${decision.reasons[0]}${missingCount > 0 ? ` ${missingCount} other score dimension${missingCount === 1 ? '' : 's'} remain unfilled, but this rule already determines the preliminary threshold result.` : ' This is a preliminary rules-based result, not a success forecast or BUILD NOW decision.'}`,
        complete: true,
      }
    : missingCount > 0
      ? {
          label: 'Scorecard incomplete',
          detail: `${missingCount} score dimension${missingCount === 1 ? '' : 's'} still need${missingCount === 1 ? 's' : ''} evidence.`,
          complete: false,
        }
      : {
          label: `${decision.status} threshold result`,
          detail: 'This is a preliminary rules-based result, not a success forecast or BUILD NOW decision.',
          complete: true,
        };

  if (unreviewedCount > 0) {
    return {
      source,
      review,
      unknowns,
      decision: decisionSummary,
      nextAction: {
        label: 'Review store findings',
        detail: `Start with the ${unreviewedCount} unreviewed finding${unreviewedCount === 1 ? '' : 's'} before changing the scorecard.`,
        target: 'findings',
      },
    };
  }

  if (unknownCount > 0) {
    return {
      source,
      review,
      unknowns,
      decision: decisionSummary,
      nextAction: {
        label: 'Verify unresolved evidence',
        detail: `Keep all ${unknownCount} unresolved item${unknownCount === 1 ? '' : 's'} explicit until evidence closes the gap.`,
        target: 'unknowns',
      },
    };
  }

  if (missingCount > 0 && !decisiveGateActive) {
    return {
      source,
      review,
      unknowns,
      decision: decisionSummary,
      nextAction: {
        label: 'Complete evidence-backed scores',
        detail: 'Score only the remaining dimensions that have supporting evidence; leave unsupported dimensions unknown.',
        target: 'scorecard',
      },
    };
  }

  return {
    source,
    review,
    unknowns,
    decision: decisionSummary,
    nextAction: {
      label: 'Review preliminary threshold result',
      detail: `${decision.status} is the current deterministic threshold result. Human review still decides what happens next.`,
      target: 'scorecard',
    },
  };
}
