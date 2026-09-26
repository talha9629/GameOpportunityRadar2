export type ScoreDimension = 'momentum' | 'soloFit' | 'differentiation' | 'saturation' | 'risk' | 'confidence';
export type ScoreValue = 1 | 2 | 3 | 4 | 5 | null;
export type DecisionStatus = 'PASS' | 'TOO LATE' | 'WATCH' | 'VERIFY' | 'PROTOTYPE';

export interface Scorecard {
  momentum: ScoreValue;
  soloFit: ScoreValue;
  differentiation: ScoreValue;
  saturation: ScoreValue;
  risk: ScoreValue;
  confidence: ScoreValue;
  hardBlocks: string[];
}

export interface DecisionResult {
  status: DecisionStatus;
  reasons: string[];
  missing: ScoreDimension[];
}

const dimensions: ScoreDimension[] = ['momentum', 'soloFit', 'differentiation', 'saturation', 'risk', 'confidence'];

export function decideOpportunity(scorecard: Scorecard): DecisionResult {
  const missing = dimensions.filter((key) => scorecard[key] == null);
  if (scorecard.hardBlocks.length > 0) return { status: 'PASS', reasons: ['One or more hard blockers are active.'], missing };
  if (scorecard.soloFit != null && scorecard.soloFit <= 2) return { status: 'PASS', reasons: ['Solo Fit is 2 or lower with the current scope.'], missing };
  if (scorecard.saturation != null && scorecard.differentiation != null && scorecard.saturation >= 4 && scorecard.differentiation <= 2) {
    return { status: 'TOO LATE', reasons: ['Saturation is high while differentiation room is low.'], missing };
  }
  if (scorecard.confidence != null && scorecard.confidence <= 2) {
    return { status: 'VERIFY', reasons: ['Confidence is too low for a prototype decision.'], missing };
  }
  if (missing.length > 0) return { status: 'VERIFY', reasons: ['Critical score dimensions still need evidence.'], missing };
  if (scorecard.momentum! >= 4 && scorecard.soloFit! >= 4 && scorecard.differentiation! >= 3 && scorecard.risk! <= 2 && scorecard.confidence! >= 3) {
    return { status: 'PROTOTYPE', reasons: ['All prototype thresholds are currently met.'], missing };
  }
  if (scorecard.momentum! <= 3) return { status: 'WATCH', reasons: ['Momentum is not yet strong enough for the prototype threshold.'], missing };
  return { status: 'WATCH', reasons: ['Evidence does not currently satisfy the prototype threshold.'], missing };
}
