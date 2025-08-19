
import React, { useEffect, useMemo, useState } from "react";

type PosKey = "QB" | "RB" | "WR" | "TE";

type Player = {
  name: string;
  pos: PosKey;
  team?: string;
  age?: number;
  rookie?: boolean;
  adp: number;
  injuryRisk?: number;
  upside?: number;
  offense?: number; // 1 best .. 5 worst
  bye?: number;
  baseRank?: number;
  score?: number;
  rankNow?: number;
  delta?: number;
};

type PickItem = { overall: number; name: string; pos: string; myPick: boolean };

const DEFAULT_PLAYERS: Player[] = [
  { name: "Patrick Mahomes", pos: "QB", team: "KC", age: 29, rookie: false, adp: 12, injuryRisk: 0.10, upside: 0.95, offense: 1, bye: 10 },
  { name: "Josh Allen", pos: "QB", team: "BUF", age: 29, rookie: false, adp: 15, injuryRisk: 0.12, upside: 0.92, offense: 1, bye: 12 },
  { name: "C.J. Stroud", pos: "QB", team: "HOU", age: 23, rookie: false, adp: 18, injuryRisk: 0.08, upside: 0.90, offense: 1, bye: 7 },
  { name: "Caleb Williams", pos: "QB", team: "CHI", age: 22, rookie: true, adp: 65, injuryRisk: 0.15, upside: 0.85, offense: 2, bye: 11 },
  { name: "Christian McCaffrey", pos: "RB", team: "SF", age: 28, rookie: false, adp: 1, injuryRisk: 0.18, upside: 0.96, offense: 1, bye: 9 },
  { name: "Breece Hall", pos: "RB", team: "NYJ", age: 23, rookie: false, adp: 7, injuryRisk: 0.20, upside: 0.90, offense: 2, bye: 12 },
  { name: "Bijan Robinson", pos: "RB", team: "ATL", age: 22, rookie: false, adp: 4, injuryRisk: 0.14, upside: 0.92, offense: 2, bye: 10 },
  { name: "Rookie RB A", pos: "RB", team: "RFA", age: 21, rookie: true, adp: 80, injuryRisk: 0.22, upside: 0.78, offense: 3, bye: 7 },
  { name: "Justin Jefferson", pos: "WR", team: "MIN", age: 25, rookie: false, adp: 2, injuryRisk: 0.10, upside: 0.98, offense: 1, bye: 6 },
  { name: "Ja'Marr Chase", pos: "WR", team: "CIN", age: 25, rookie: false, adp: 3, injuryRisk: 0.16, upside: 0.96, offense: 1, bye: 12 },
  { name: "Puka Nacua", pos: "WR", team: "LAR", age: 23, rookie: false, adp: 14, injuryRisk: 0.12, upside: 0.90, offense: 2, bye: 10 },
  { name: "Rookie WR B", pos: "WR", team: "RFB", age: 22, rookie: true, adp: 75, injuryRisk: 0.18, upside: 0.82, offense: 3, bye: 8 },
  { name: "Sam LaPorta", pos: "TE", team: "DET", age: 23, rookie: false, adp: 22, injuryRisk: 0.10, upside: 0.87, offense: 1, bye: 9 },
  { name: "Travis Kelce", pos: "TE", team: "KC", age: 35, rookie: false, adp: 28, injuryRisk: 0.22, upside: 0.82, offense: 1, bye: 10 },
  { name: "Brock Bowers", pos: "TE", team: "LV", age: 21, rookie: true, adp: 90, injuryRisk: 0.16, upside: 0.76, offense: 3, bye: 11 }
];

const POS_INDEX: Record<PosKey, number> = { QB: 0, RB: 1, WR: 2, TE: 3 };

type Weights = {
  pos: [number, number, number, number];
  rookieBoost: number;
  riskAverse: number;
  upsideWeight: number;
  adpAnchor: number;
  offenseWeight: number;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function scorePlayer(p: Player, w: Weights) {
  const maxADP = 240;
  const adpNorm = 1 - clamp01(p.adp / maxADP); // 1 is best
  const posWeight = w.pos[POS_INDEX[p.pos]] ?? 1;
  const rookie = p.rookie ? w.rookieBoost : 0;
  const riskPenalty = w.riskAverse * (p.injuryRisk ?? 0.15);
  const upsideBonus = w.upsideWeight * (p.upside ?? 0.5);
  const offense = p.offense ?? 3; // 1..5
  const offenseBonus = w.offenseWeight * (1 - (offense - 1) / 4);
  const custom = 0.35 * posWeight + 0.25 * adpNorm + 0.15 * upsideBonus + 0.15 * offenseBonus + 0.10 * rookie - 0.10 * riskPenalty;
  const blended = w.adpAnchor * adpNorm + (1 - w.adpAnchor) * custom;
  return blended;
}

// CSV helpers
const REQUIRED_HEADERS = ["name","pos","adp"] as const;
const OPTIONAL_HEADERS = ["team","age","rookie","injuryRisk","upside","offense","bye"] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

function normalizeHeader(h: string) { return h.trim().toLowerCase(); }
function parseBool(v: string | number | undefined) {
  if (v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}
function parseMaybeNum(v: string | number | undefined) {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function simpleCSVParse(text: string): Record<string,string>[] {
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(normalizeHeader);
  return lines.slice(1).map(line => {
    const cells = line.split(",");
    const obj: Record<string,string> = {};
    headers.forEach((h,i)=>{ obj[h]=(cells[i]??"").trim(); });
    return obj;
  });
}
function parsePlayersCSV(text: string): Player[] {
  const rows = simpleCSVParse(text);
  if (!rows.length) return [];
  const headSet = new Set(Object.keys(rows[0]));
  for (const req of REQUIRED_HEADERS) if (!headSet.has(req)) throw new Error(`CSV missing required column: ${req}`);
  return rows.filter(r => (r.name??"").trim().length>0).map(r => {
    const p: Player = {
      name: r.name,
      pos: (r.pos?.toUpperCase() as PosKey),
      team: r.team,
      age: parseMaybeNum(r.age),
      rookie: parseBool(r.rookie),
      adp: Number(r.adp),
      injuryRisk: parseMaybeNum(r.injuryrisk),
      upside: parseMaybeNum(r.upside),
      offense: parseMaybeNum(r.offense),
      bye: parseMaybeNum(r.bye),
    };
    if (!Number.isFinite(p.adp)) throw new Error(`Invalid ADP for ${p.name}`);
    if (!["QB","RB","WR","TE"].includes(p.pos)) throw new Error(`Invalid position for ${p.name}: ${r.pos}`);
    return p;
  });
}

export default function FantasyDraftDashboard() {
  // League Settings
  const [teams, setTeams] = useState(12);
  const [mySlot, setMySlot] = useState(1);
  const [rounds, setRounds] = useState(15);

  // Weights (0..200 visual, normalized inside)
  const [qbW, setQbW] = useState(100);
  const [rbW, setRbW] = useState(100);
  const [wrW, setWrW] = useState(100);
  const [teW, setTeW] = useState(100);

  const [rookieBoost, setRookieBoost] = useState(20);
  const [riskAverse, setRiskAverse] = useState(50);
  const [upsideWeight, setUpsideWeight] = useState(50);
  const [adpAnchor, setAdpAnchor] = useState(60);
  const [offenseWeight, setOffenseWeight] = useState(50);

  // UI
  const [showOnly, setShowOnly] = useState<"ALL"|PosKey>("ALL");
  const [search, setSearch] = useState("");
  const [showTakenInList, setShowTakenInList] = useState(false);
  const [dataError, setDataError] = useState<string|null>(null);

  // Data
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);

  // Draft
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [myRoster, setMyRoster] = useState<string[]>([]);

  // LocalStorage
  const LS_KEY = "tdb_v1_state";
  function loadState(){ try{ const raw=localStorage.getItem(LS_KEY); return raw?JSON.parse(raw):null }catch{return null} }
  function saveState(s:any){ try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch{} }

  useEffect(()=>{
    const s = loadState();
    if (s){
      setTeams(s.teams ?? 12);
      setMySlot(s.mySlot ?? 1);
      setRounds(s.rounds ?? 15);
      setQbW(s.qbW ?? 100); setRbW(s.rbW ?? 100); setWrW(s.wrW ?? 100); setTeW(s.teW ?? 100);
      setRookieBoost(s.rookieBoost ?? 20); setRiskAverse(s.riskAverse ?? 50); setUpsideWeight(s.upsideWeight ?? 50);
      setAdpAnchor(s.adpAnchor ?? 60); setOffenseWeight(s.offenseWeight ?? 50);
      setShowTakenInList(!!s.showTakenInList);
      setPicks(s.picks ?? []); setMyRoster(s.myRoster ?? []);
      if (Array.isArray(s.players) && s.players.length) setPlayers(s.players);
    }
  },[]);

  useEffect(()=>{
    saveState({ teams,mySlot,rounds,qbW,rbW,wrW,teW,rookieBoost,riskAverse,upsideWeight,adpAnchor,offenseWeight,showTakenInList,picks,myRoster,players });
  },[teams,mySlot,rounds,qbW,rbW,wrW,teW,rookieBoost,riskAverse,upsideWeight,adpAnchor,offenseWeight,showTakenInList,picks,myRoster,players]);

  const weights: Weights = useMemo(()=>{
    const total = qbW + rbW + wrW + teW;
    const pos = [qbW/total, rbW/total, wrW/total, teW/total] as [number,number,number,number];
    return { pos, rookieBoost: rookieBoost/100, riskAverse: riskAverse/100, upsideWeight: upsideWeight/100, adpAnchor: adpAnchor/100, offenseWeight: offenseWeight/100 };
  },[qbW,rbW,wrW,teW,rookieBoost,riskAverse,upsideWeight,adpAnchor,offenseWeight]);

  const baseRankings = useMemo(()=>{
    return [...players].sort((a,b)=>a.adp-b.adp).map((p,i)=>({...p, baseRank: i+1}));
  },[players]);

  const takenNames = useMemo(()=> new Set(picks.map(p=>p.name)), [picks]);

  const ranked = useMemo(()=>{
    let pool = baseRankings
      .filter(p => (showOnly==="ALL" ? true : p.pos===showOnly))
      .filter(p => (search ? p.name.toLowerCase().includes(search.toLowerCase()) : true))
      .map(p => ({ ...p, score: scorePlayer(p, weights) }));
    pool.sort((a,b)=> b.score - a.score);
    const withRanks = pool.map((p,i)=> ({...p, rankNow: i+1, delta: (p.baseRank ?? i+1) - (i+1)}));
    return showTakenInList ? withRanks : withRanks.filter(p => !takenNames.has(p.name));
  },[baseRankings,weights,showOnly,search,showTakenInList,takenNames]);

  const posSummary = useMemo(()=>{
    const map: Record<string, number> = { QB:0, RB:0, WR:0, TE:0 };
    ranked.forEach((p,i)=>{ if (i<24) map[p.pos]++; });
    return map;
  },[ranked]);

  // Draft helpers
  const currentOverall = picks.length;
  function addPick(name: string, myPick: boolean){
    const p = players.find(pp=>pp.name===name);
    if (!p) return;
    if (takenNames.has(name)) return;
    const overall = currentOverall + 1;
    const item: PickItem = { overall, name: p.name, pos: p.pos, myPick };
    setPicks(prev=>[...prev, item]);
    if (myPick) setMyRoster(prev=>[...prev, name]);
  }
  function undoPick(){
    setPicks(prev=>{
      if (!prev.length) return prev;
      const last = prev[prev.length-1];
      if (last.myPick) setMyRoster(r=> r.filter(n=>n!==last.name));
      return prev.slice(0,-1);
    });
  }
  function resetDraft(){ setPicks([]); setMyRoster([]); }
  function onTaken(player: Player){ addPick(player.name, false); }
  function onToMe(player: Player){ addPick(player.name, true); }

  const myUpcoming = useMemo(()=>{
    const res:number[] = [];
    let idx = currentOverall + 1;
    while (res.length < 3){
      const round = Math.ceil(idx / teams);
      const posInRoundRaw = idx - (round - 1) * teams; // 1..teams
      const snake = round % 2 === 1 ? posInRoundRaw : (teams - posInRoundRaw + 1);
      if (snake === mySlot) res.push(idx);
      idx++;
    }
    return res;
  },[mySlot, teams, currentOverall]);

  const bestAvailable = ranked.slice(0,10);

  // CSV export
  function downloadCSV(){
    const headers = ["name","pos","adp","rookie","upside","injuryRisk","offense","bye","rankNow"];
    const rows = ranked.map(p => [p.name,p.pos,p.adp,p.rookie?1:0,p.upside??"",p.injuryRisk??"",p.offense??"",p.bye??"",p.rankNow]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "custom_board.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCSVFile(file: File){
    setDataError(null);
    const text = await file.text();
    try{
      const parsed = parsePlayersCSV(text);
      if (!parsed.length) throw new Error("No rows found.");
      parsed.sort((a,b)=>a.adp - b.adp);
      setPlayers(parsed);
      setPicks([]); setMyRoster([]);
    }catch(err:any){
      setDataError(err?.message || "Failed to parse CSV.");
    }
  }

  // UI
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Fantasy Draft Strategy Dashboard</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>12-team defaults, CSV import, live pick tracking, and snake math. Auto-saves in your browser.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Search player" value={search} onChange={(e)=>setSearch(e.target.value)} style={{ padding: 8, width: 220 }} />
          <select value={showOnly} onChange={(e)=>setShowOnly(e.target.value as any)} style={{ padding: 8 }}>
            <option value="ALL">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>Import / Export Data</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={()=>{
              const headers = ALL_HEADERS.join(",");
              const example = [
                "Patrick Mahomes,QB,12,KC,29,false,0.10,0.95,1,10",
                "Christian McCaffrey,RB,1,SF,28,false,0.18,0.96,1,9",
                "Ja'Marr Chase,WR,3,CIN,25,false,0.16,0.96,1,12"
              ].join("\\n");
              const csv = headers + "\\n" + example + "\\n";
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "player_template.csv"; a.click();
              URL.revokeObjectURL(url);
            }}>Download CSV template</button>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <span>Upload CSV</span>
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e)=>{
                const f = e.target.files?.[0]; if (f) handleCSVFile(f);
              }}/>
            </label>
            <button onClick={()=>{ setPlayers(DEFAULT_PLAYERS); setPicks([]); setMyRoster([]); }}>Use sample data</button>
            <button onClick={downloadCSV}>Export current board</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Required columns: <code>name,pos,adp</code>. Optional: <code>team,age,rookie,injuryRisk,upside,offense,bye</code>.
          </div>
          {dataError && <div style={{ color: "#b00020", marginTop: 6 }}>{dataError}</div>}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>League Settings</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>Teams <input type="number" min={2} max={16} value={teams} onChange={(e)=>setTeams(Math.max(2, Math.min(16, Number(e.target.value))))} /></label>
            <label>Your Draft Slot <input type="number" min={1} max={teams} value={mySlot} onChange={(e)=>setMySlot(Math.max(1, Math.min(teams, Number(e.target.value))))} /></label>
            <label>Rounds <input type="number" min={1} max={25} value={rounds} onChange={(e)=>setRounds(Math.max(1, Math.min(25, Number(e.target.value))))} /></label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showTakenInList} onChange={(e)=>setShowTakenInList(e.target.checked)} /> Show taken in list
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>At-a-Glance (Top 24)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 12, display: "flex", justifyContent: "space-between" }}><span>QB</span><b>{posSummary.QB}</b></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 12, display: "flex", justifyContent: "space-between" }}><span>RB</span><b>{posSummary.RB}</b></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 12, display: "flex", justifyContent: "space-between" }}><span>WR</span><b>{posSummary.WR}</b></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 12, display: "flex", justifyContent: "space-between" }}><span>TE</span><b>{posSummary.TE}</b></div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Counts reflect how your current settings shape the early-board mix.</div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>Custom Rankings</h3>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Δ shows movement vs baseline ADP order. Click <b>Taken</b> or <b>To Me</b>.</div>
          <div style={{ maxHeight: 480, overflow: "auto", border: "1px solid #eee", borderRadius: 12 }}>
            {ranked.map(p => (
              <div key={p.name} style={{ display: "grid", gridTemplateColumns: "40px 1fr 60px 60px 60px 160px", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #eee", opacity: (showTakenInList && takenNames.has(p.name)) ? 0.5 : 1 }}>
                <div style={{ textAlign: "right", opacity: 0.7 }}>{p.rankNow}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "2px 6px", borderRadius: 8, background: "#eee", fontSize: 12 }}>{p.pos}</span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {p.rookie && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 8, background: "#ffe0e0", fontSize: 12 }}>R</span>}
                  {takenNames.has(p.name) && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 8, border: "1px solid #ccc", fontSize: 12 }}>Taken</span>}
                </div>
                <div style={{ fontSize: 12 }}>ADP {p.adp}</div>
                <div style={{ fontSize: 12 }}>Ceil {Math.round((p.upside ?? 0.5)*100)}</div>
                <div style={{ fontSize: 12 }}>Health {Math.round((1-(p.injuryRisk??0.15))*100)}</div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={()=>onTaken(p)} disabled={takenNames.has(p.name)}>Taken</button>
                  <button onClick={()=>onToMe(p)} disabled={takenNames.has(p.name)}>To Me</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={downloadCSV}>Download CSV</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>Live Draft – Picks & Planner</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Quick pick search</div>
              <input placeholder="Type a name…" value={search} onChange={(e)=>setSearch(e.target.value)} style={{ padding: 8, width: "100%" }} />
              <div style={{ marginTop: 8, maxHeight: 160, overflow: "auto", border: "1px solid #eee", borderRadius: 12 }}>
                {baseRankings.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())).slice(0,8).map(m=>(
                  <div key={m.name} style={{ display:"flex", justifyContent:"space-between", padding:"6px 10px", borderBottom:"1px solid #f0f0f0", fontSize:14 }}>
                    <span><b style={{ padding:"2px 6px", background:"#eee", borderRadius:8, marginRight:6 }}>{m.pos}</b>{m.name}</span>
                    <span style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>addPick(m.name,false)}>Taken</button>
                      <button onClick={()=>addPick(m.name,true)}>To Me</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={undoPick}>Undo</button>
              <button onClick={resetDraft}>Reset Draft</button>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop: 8 }}>
            <div style={{ padding: 8, border:"1px solid #eee", borderRadius:12 }}>
              <div style={{ fontWeight:600, marginBottom:6 }}>Live Picks ({picks.length})</div>
              <div style={{ maxHeight: 200, overflow:"auto", fontSize:14 }}>
                {picks.map(pk=>{
                  const round = Math.ceil(pk.overall / teams);
                  const posInRoundRaw = pk.overall - (round - 1) * teams;
                  const snake = round % 2 === 1 ? posInRoundRaw : (teams - posInRoundRaw + 1);
                  return (
                    <div key={pk.overall} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #f5f5f5" }}>
                      <div>#{pk.overall} • R{round} P{snake}</div>
                      <div><b style={{ padding:"2px 6px", background:"#eee", borderRadius:8, marginRight:6 }}>{pk.pos}</b><span style={{ fontWeight: pk.myPick ? 700 : 400 }}>{pk.name}</span>{pk.myPick && <span style={{ marginLeft:6, padding:"2px 6px", background:"#def", borderRadius:8 }}>Mine</span>}</div>
                    </div>
                  );
                })}
                {picks.length===0 && <div style={{ opacity:0.6 }}>No picks yet.</div>}
              </div>
            </div>
            <div style={{ padding: 8, border:"1px solid #eee", borderRadius:12 }}>
              <div style={{ fontWeight:600, marginBottom:6 }}>Your Upcoming Picks</div>
              <div style={{ fontSize:14 }}>
                {myUpcoming.map(ov=>{
                  const r = Math.ceil(ov / teams);
                  const pr = ov - (r - 1) * teams;
                  const snakePR = r % 2 === 1 ? pr : (teams - pr + 1);
                  return <div key={ov}>#{ov} • Round {r}, Pick {snakePR}</div>;
                })}
              </div>
              <div style={{ fontWeight:600, marginTop:10 }}>Best Available (top 10)</div>
              <div style={{ marginTop:4, fontSize:14, maxHeight:160, overflow:"auto" }}>
                {bestAvailable.map(p => (
                  <div key={p.name} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #f5f5f5" }}>
                    <span><b style={{ padding:"2px 6px", background:"#eee", borderRadius:8, marginRight:6 }}>{p.pos}</b>{p.name}</span>
                    <span style={{ opacity:0.7, fontSize:12 }}>Δ {p.delta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3>Round Builder (Snake Preview)</h3>
          <p style={{ fontSize: 14, opacity: 0.8 }}>Preview of first three rounds with your current settings. Uses your league size and removes taken players.</p>
          {["Round 1","Round 2","Round 3"].map((label, idx)=>{
            const start = idx * teams;
            const avail = ranked.filter(p => !takenNames.has(p.name));
            const slice = avail.slice(start, start + teams);
            return (
              <div key={label} style={{ marginTop: 8 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {slice.map(p => (
                    <div key={label + p.name} style={{ padding:8, border:"1px solid #eee", borderRadius:12, display:"flex", justifyContent:"space-between", fontSize:14 }}>
                      <span><b style={{ padding:"2px 6px", background:"#eee", borderRadius:8, marginRight:6 }}>{p.pos}</b>{p.name}</span>
                      <span style={{ opacity:0.7 }}>ADP {p.adp}</span>
                    </div>
                  ))}
                  {slice.length===0 && <div style={{ opacity:0.6 }}>Not enough players in pool.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
        <button onClick={()=>{ setQbW(100); setRbW(100); setWrW(100); setTeW(100); setRookieBoost(20); setRiskAverse(50); setUpsideWeight(50); setAdpAnchor(60); setOffenseWeight(50); }}>Reset Weights</button>
        <button onClick={()=>{ setTeams(12); setMySlot(1); setRounds(15); }}>Reset League</button>
      </div>
    </div>
  );
}
