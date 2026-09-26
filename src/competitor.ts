import type { AnalysisResult } from './domain';

export const relationshipTypes = [
  'PREDECESSOR',
  'REFERENCE_TITLE',
  'DIRECT_COMPETITOR',
  'FOLLOWER',
  'HIGH_SIMILARITY_FOLLOWER',
  'DIFFERENTIATED_FOLLOWER',
  'ADJACENT_SUBSTITUTE',
  'NOT_RELEVANT',
] as const;

export type RelationshipType = typeof relationshipTypes[number];

export const differentiationDimensions = [
  'Core mechanic',
  'Secondary mechanic',
  'Controls',
  'Camera',
  'Theme',
  'Art / UI',
  'Meta / progression',
  'Economy',
  'Monetization',
  'Content burden',
  'Session structure',
  'Store positioning',
] as const;

export type DifferentiationDimension = typeof differentiationDimensions[number];
export type DifferenceState = 'unknown' | 'similar' | 'meaningfully_different';

export interface DifferentiationJudgment {
  state: DifferenceState;
  note: string;
}

export type DifferentiationMap = Record<DifferentiationDimension, DifferentiationJudgment>;

export interface ListingProfile {
  mechanics: string;
  controls: string;
  systems: string;
  monetization: string;
  rating: string;
  ratingCount: string;
}

export function emptyDifferentiation(): DifferentiationMap {
  return Object.fromEntries(
    differentiationDimensions.map((dimension) => [dimension, { state: 'unknown', note: '' }]),
  ) as DifferentiationMap;
}

export function listingProfile(result: AnalysisResult): ListingProfile {
  const value = (key: string) => result.findings.find((finding) => finding.key === key)?.value ?? 'Unknown';
  return {
    mechanics: value('listing_mechanics'),
    controls: value('listing_controls'),
    systems: value('listing_systems'),
    monetization: value('listing_monetization'),
    rating: value('rating'),
    ratingCount: value('rating_count'),
  };
}

export function differentiationSummary(map: DifferentiationMap) {
  const values = Object.values(map);
  return {
    different: values.filter((item) => item.state === 'meaningfully_different').length,
    similar: values.filter((item) => item.state === 'similar').length,
    unknown: values.filter((item) => item.state === 'unknown').length,
  };
}
