import { useMemo, useState } from 'react';
import { CloudUpload, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { analyzeGame, isDirectAppleInput, loadCompetitorMap, saveCompetitorMap, searchGameCandidates } from './api';
import {
  differentiationDimensions,
  differentiationSummary,
  emptyDifferentiation,
  listingProfile,
  relationshipTypes,
  type DifferentiationMap,
  type DifferenceState,
  type RelationshipType,
} from './competitor';
import type { AnalysisResult, StoreCandidate } from './domain';

type CandidateIntent = Record<string, RelationshipType | ''>;

interface ConfirmedCompetitor {
  id: string;
  analysis: AnalysisResult;
  relationship: RelationshipType;
  differentiation: DifferentiationMap;
}

function GameIdentity({ result, label }: { result: AnalysisResult; label: string }) {
  return <div className="comparison-identity">{result.game.iconUrl && <img src={result.game.iconUrl} alt="" />}<div><span>{label}</span><strong>{result.game.canonicalName}</strong><small>{result.game.publisher ?? 'Publisher unknown'}</small></div><a href={result.game.storeUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a></div>;
}

function CandidateList({ candidates, intents, onIntent, onConfirm, busy }: { candidates: StoreCandidate[]; intents: CandidateIntent; onIntent: (id: string, relation: RelationshipType | '') => void; onConfirm: (candidate: StoreCandidate, relation: RelationshipType) => void; busy: boolean }) {
  return <div className="competitor-candidates">{candidates.map((candidate) => { const intent = intents[candidate.storeId] ?? ''; return <article className="competitor-candidate" key={candidate.storeId}>{candidate.iconUrl && <img src={candidate.iconUrl} alt="" />}<div className="candidate-copy"><strong>{candidate.canonicalName}</strong><span>{candidate.publisher ?? 'Publisher unknown'}</span><small>Apple ID {candidate.storeId}</small></div><select value={intent} onChange={(event) => onIntent(candidate.storeId, event.target.value as RelationshipType | '')}><option value="">Choose relationship…</option>{relationshipTypes.map((relation) => <option key={relation} value={relation}>{relation.replaceAll('_', ' ')}</option>)}</select><button disabled={busy || !intent} onClick={() => intent && onConfirm(candidate, intent)}><Plus size={14} /> Confirm</button></article>; })}</div>;
}

function EvidenceTable({ primary, competitor }: { primary: AnalysisResult; competitor: AnalysisResult }) {
  const left = listingProfile(primary); const right = listingProfile(competitor);
  const rows: Array<[string, keyof typeof left]> = [['Publisher-described mechanics','mechanics'],['Publisher-described controls','controls'],['Publisher-described systems','systems'],['Publisher-described monetization','monetization'],['Store rating','rating'],['Rating count','ratingCount']];
  return <div className="evidence-compare"><div className="compare-head"><span>Evidence field</span><strong>{primary.game.canonicalName}</strong><strong>{competitor.game.canonicalName}</strong></div>{rows.map(([label,key]) => <div className="compare-row" key={key}><span>{label}</span><div>{left[key]}</div><div>{right[key]}</div></div>)}</div>;
}

function DifferentiationEditor({ map, onChange }: { map: DifferentiationMap; onChange: (dimension: keyof DifferentiationMap, state: DifferenceState, note?: string) => void }) {
  return <div className="difference-grid">{differentiationDimensions.map((dimension) => <div className="difference-row" key={dimension}><strong>{dimension}</strong><select value={map[dimension].state} onChange={(event) => onChange(dimension,event.target.value as DifferenceState)}><option value="unknown">Unknown</option><option value="similar">Similar</option><option value="meaningfully_different">Meaningfully different</option></select><input value={map[dimension].note} onChange={(event) => onChange(dimension,map[dimension].state,event.target.value)} placeholder="Evidence / note (optional)" /></div>)}</div>;
}

export function Competitors({ initialPrimaryId = '', ownerEmail = null }: { initialPrimaryId?: string; ownerEmail?: string | null }) {
  const [primaryInput,setPrimaryInput] = useState(initialPrimaryId);
  const [primary,setPrimary] = useState<AnalysisResult | null>(null);
  const [primaryCandidates,setPrimaryCandidates] = useState<StoreCandidate[]>([]);
  const [candidateInput,setCandidateInput] = useState('');
  const [candidates,setCandidates] = useState<StoreCandidate[]>([]);
  const [intents,setIntents] = useState<CandidateIntent>({});
  const [confirmed,setConfirmed] = useState<ConfirmedCompetitor[]>([]);
  const [busy,setBusy] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [cloudMessage,setCloudMessage] = useState<string | null>(null);
  const relationshipCounts = useMemo(() => Object.fromEntries(relationshipTypes.map((type) => [type,confirmed.filter((item) => item.relationship===type).length])),[confirmed]);

  async function adoptPrimary(fresh: AnalysisResult) {
    setPrimary(fresh); setConfirmed([]); setCloudMessage(null);
    if (!ownerEmail) return;
    try {
      const saved = await loadCompetitorMap(fresh.game.storeId);
      if (saved) {
        setPrimary(saved.primary);
        setConfirmed(saved.competitors.map((item) => ({ id:item.id, analysis:item.analysis, relationship:item.relationship, differentiation:item.differentiation })));
        setCloudMessage(`Restored ${saved.competitors.length} saved relationship${saved.competitors.length===1?'':'s'} from cloud.`);
      }
    } catch (err) {
      setCloudMessage(err instanceof Error ? `Cloud restore unavailable: ${err.message}` : 'Cloud restore unavailable.');
    }
  }

  async function resolvePrimary(value: string) {
    setError(null); setBusy(true); setPrimaryCandidates([]); setCloudMessage(null);
    try { if (isDirectAppleInput(value)) await adoptPrimary(await analyzeGame(value)); else { const search=await searchGameCandidates(value); setPrimaryCandidates(search.candidates); } }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not resolve primary game.'); }
    finally { setBusy(false); }
  }

  async function choosePrimary(candidate: StoreCandidate) {
    setPrimaryInput(candidate.storeId); setPrimaryCandidates([]); setBusy(true); setError(null); setCloudMessage(null);
    try { await adoptPrimary(await analyzeGame(candidate.storeId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not analyze primary game.'); }
    finally { setBusy(false); }
  }

  async function searchCandidates() {
    if (!primary) return;
    setBusy(true); setError(null); setCandidates([]); setIntents({});
    try {
      if (isDirectAppleInput(candidateInput.trim())) { const analysis=await analyzeGame(candidateInput.trim()); setCandidates([{storeId:analysis.game.storeId,canonicalName:analysis.game.canonicalName,publisher:analysis.game.publisher,storeUrl:analysis.game.storeUrl,iconUrl:analysis.game.iconUrl}]); }
      else { const result=await searchGameCandidates(candidateInput); setCandidates(result.candidates.filter((candidate) => candidate.storeId!==primary.game.storeId && !confirmed.some((item) => item.analysis.game.storeId===candidate.storeId))); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Competitor search failed.'); }
    finally { setBusy(false); }
  }

  async function confirmCandidate(candidate: StoreCandidate, relationship: RelationshipType) {
    setBusy(true); setError(null); setCloudMessage(null);
    try { const analysis=await analyzeGame(candidate.storeId); setConfirmed((current) => [...current.filter((item) => item.analysis.game.storeId!==candidate.storeId),{id:crypto.randomUUID(),analysis,relationship,differentiation:emptyDifferentiation()}]); setCandidates((current) => current.filter((item) => item.storeId!==candidate.storeId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not analyze competitor.'); }
    finally { setBusy(false); }
  }

  async function saveMap() {
    if (!primary || !ownerEmail) return;
    setSaving(true); setCloudMessage(null);
    try {
      const count=await saveCompetitorMap(primary,confirmed.map(({analysis,relationship,differentiation}) => ({analysis,relationship,differentiation})));
      setCloudMessage(`Saved ${count} relationship${count===1?'':'s'} to the owner cloud workspace.`);
      const saved=await loadCompetitorMap(primary.game.storeId);
      if (saved) setConfirmed(saved.competitors.map((item) => ({id:item.id,analysis:item.analysis,relationship:item.relationship,differentiation:item.differentiation})));
    } catch (err) { setCloudMessage(err instanceof Error ? err.message : 'Could not save competitor map.'); }
    finally { setSaving(false); }
  }

  function updateRelationship(id:string,relationship:RelationshipType){setCloudMessage(null);setConfirmed((current)=>current.map((item)=>item.id===id?{...item,relationship}:item));}
  function updateDifference(id:string,dimension:keyof DifferentiationMap,state:DifferenceState,note?:string){setCloudMessage(null);setConfirmed((current)=>current.map((item)=>item.id===id?{...item,differentiation:{...item.differentiation,[dimension]:{state,note:note??item.differentiation[dimension].note}}}:item));}

  return <section className="competitors-view">
    <header className="compact-hero"><div className="eyebrow">COMPETITOR MAP</div><h1>Confirm the market around a game.</h1><p>Radar can surface titles and listing evidence. Relationship labels and differentiation judgments remain human-confirmed.</p></header>
    <section className="panel competitor-setup"><div><h2>1. Choose primary game</h2><p>This is the product or reference title you want to map around.</p></div><div className="search-row"><input value={primaryInput} onChange={(event)=>setPrimaryInput(event.target.value)} placeholder="Apple ID, App Store URL, or title" /><button className="primary" disabled={busy||primaryInput.trim().length<2} onClick={()=>void resolvePrimary(primaryInput.trim())}><Search size={16}/> Resolve</button></div>{primaryCandidates.length>0&&<div className="identity-results">{primaryCandidates.map((candidate)=><button key={candidate.storeId} onClick={()=>void choosePrimary(candidate)}>{candidate.iconUrl&&<img src={candidate.iconUrl} alt=""/>}<span><strong>{candidate.canonicalName}</strong><small>{candidate.publisher??'Unknown publisher'}</small></span></button>)}</div>}{primary&&<GameIdentity result={primary} label="Primary"/>}{error&&<div className="error-box">{error}</div>}{cloudMessage&&<div className="save-message">{cloudMessage}</div>}</section>
    {primary&&<>
      <section className="panel competitor-setup"><div><h2>2. Find candidates</h2><p>Search a title/mechanic phrase or paste an exact Apple ID. A candidate is not added until you assign its relationship.</p></div><div className="search-row"><input value={candidateInput} onChange={(event)=>setCandidateInput(event.target.value)} placeholder="e.g. cat puzzle, sorting game, Apple ID…"/><button className="primary" disabled={busy||candidateInput.trim().length<2} onClick={()=>void searchCandidates()}><Search size={16}/> Find</button></div>{candidates.length>0&&<CandidateList candidates={candidates} intents={intents} busy={busy} onIntent={(id,relation)=>setIntents((current)=>({...current,[id]:relation}))} onConfirm={(candidate,relation)=>void confirmCandidate(candidate,relation)}/>}</section>
      <section className="competitor-summary panel"><div><div className="eyebrow">HUMAN-CONFIRMED MAP</div><h2>{confirmed.length} relationship{confirmed.length===1?'':'s'}</h2></div><div className="relationship-counts">{relationshipTypes.filter((type)=>relationshipCounts[type]>0).map((type)=><span key={type}>{type.replaceAll('_',' ')} · {relationshipCounts[type]}</span>)}{confirmed.length===0&&<span>No confirmed relationships yet</span>}</div><button className="primary" disabled={!ownerEmail||saving} onClick={()=>void saveMap()}><CloudUpload size={16}/>{saving?'Saving…':'Save competitor map'}</button></section>
      {!ownerEmail&&<section className="panel"><strong>Cloud save requires owner sign-in.</strong><p>You can research and edit this map anonymously, but only the authenticated owner can persist relationships and differentiation evidence.</p></section>}
      <div className="confirmed-competitors">{confirmed.map((item)=>{const summary=differentiationSummary(item.differentiation);return <section className="panel competitor-card" key={item.id}><div className="competitor-card-head"><GameIdentity result={item.analysis} label="Compared title"/><div className="relationship-control"><label>Relationship</label><select value={item.relationship} onChange={(event)=>updateRelationship(item.id,event.target.value as RelationshipType)}>{relationshipTypes.map((relation)=><option key={relation} value={relation}>{relation.replaceAll('_',' ')}</option>)}</select></div><button className="danger-quiet" onClick={()=>{setCloudMessage(null);setConfirmed((current)=>current.filter((entry)=>entry.id!==item.id));}}><Trash2 size={14}/> Remove</button></div><EvidenceTable primary={primary} competitor={item.analysis}/><div className="difference-heading"><div><h3>Differentiation review</h3><p>These are human judgments, not AI facts. Add evidence notes where possible.</p></div><div className="difference-summary"><span>{summary.different} different</span><span>{summary.similar} similar</span><span>{summary.unknown} unknown</span></div></div><DifferentiationEditor map={item.differentiation} onChange={(dimension,state,note)=>updateDifference(item.id,dimension,state,note)}/></section>;})}</div>
    </>}
  </section>;
}
