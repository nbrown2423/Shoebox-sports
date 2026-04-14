import { useState, useEffect } from "react";

// ─── COLORS & CONSTANTS ───────────────────────────────────────────────────────
const C = {
  navy:"#0D2B4E", navyMid:"#0F3460", navyLight:"#143D6E",
  sky:"#2A9ED8", light:"#5BC8F0", white:"#F4F9FD",
  gray:"#6B8CAE", grayL:"#1E4570", grayD:"#1A3550",
  green:"#27C97A", red:"#F04E5E", gold:"#F5C842",
};
const DC = ["#2A9ED8","#F5C842","#27C97A","#B57BFF","#FF8C55","#5BC8F0","#FF6B9D","#54D4A0"];
const dc = i => DC[i % DC.length];
const GD = [
  {id:"3rd",s:"3rd"},{id:"4th",s:"4th"},{id:"5th",s:"5th"},{id:"6th",s:"6th"},
  {id:"7th",s:"7th"},{id:"8th",s:"8th"},{id:"9th",s:"9th/15U"},
  {id:"10th",s:"10th/16U"},{id:"11th",s:"11th/17U"},
];
const GDL = {
  "3rd":"3rd Grade","4th":"4th Grade","5th":"5th Grade","6th":"6th Grade","7th":"7th Grade",
  "8th":"8th Grade","9th":"9th Grade (15U)","10th":"10th Grade (16U)","11th":"11th Grade (17U)"
};
const COURTS = ["Court 1","Court 2","Court 3","Court 4"];

// ─── TIME HELPERS ─────────────────────────────────────────────────────────────
const toMins = t => {
  if (!t) return 0;
  const [tm,mer] = t.split(" "); let [h,m] = tm.split(":").map(Number);
  if (mer==="PM"&&h!==12) h+=12; if (mer==="AM"&&h===12) h=0;
  return h*60+(m||0);
};
const fromMins = m => {
  const h24=Math.floor(m/60)%24, mn=m%60, mer=h24>=12?"PM":"AM", h=h24%12||12;
  return `${h}:${String(mn).padStart(2,"0")} ${mer}`;
};
const buildSlots = (start, n=16, gap=60) =>
  Array.from({length:n}, (_,i) => fromMins(toMins(start) + i*gap));
const addDays = (ds,n) => {
  const d = new Date(ds+"T12:00:00"); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
};
const fmtD   = ds => ds ? new Date(ds+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) : "";
const tDates = t  => Array.from({length:t.numDays}, (_,i) => addDays(t.startDate, i));
const dlabel = (g,s) => `${GDL[g]||g} ${s}`;
const dshort = (g,s) => `${GD.find(x=>x.id===g)?.s||g} ${s}`;
const tname  = (divs,id) => { for(const d of divs){const t=d.teams.find(x=>x.id===id);if(t)return t.name;} return "TBD"; };
const poolSort = (teams,pool) => teams.filter(t=>t.pool===pool).sort((a,b)=>b.wins-a.wins||(b.pf-b.pa)-(a.pf-a.pa));

// ─── MATCHUP GENERATOR (who plays who — no time/court assigned) ───────────────
function genMatchups(divs) {
  let gid = Date.now();
  const games = [];
  divs.forEach(div => {
    const pools = {};
    div.teams.forEach(t => { if (!pools[t.pool]) pools[t.pool]=[]; pools[t.pool].push(t); });
    // Pool play matchups
    Object.entries(pools).forEach(([pool, pts]) => {
      for (let i=0; i<pts.length; i++) for (let j=i+1; j<pts.length; j++)
        games.push({ id:gid++, divisionId:div.id, phase:"pool", pool,
          homeId:pts[i].id, awayId:pts[j].id,
          dayIdx:null, court:null, time:null,
          homeScore:null, awayScore:null, status:"upcoming" });
    });
    // Bracket shells (TBD until pool play is done)
    const nSemis = Math.min(Object.keys(pools).length, 2);
    for (let s=0; s<nSemis; s++)
      games.push({ id:gid++, divisionId:div.id, phase:"bracket", round:"Semi",
        homeId:null, awayId:null, dayIdx:null, court:null, time:null,
        homeScore:null, awayScore:null, status:"upcoming" });
    games.push({ id:gid++, divisionId:div.id, phase:"bracket", round:"Final",
      homeId:null, awayId:null, dayIdx:null, court:null, time:null,
      homeScore:null, awayScore:null, status:"upcoming" });
  });
  return games;
}

// ─── BRACKET SEEDING ─────────────────────────────────────────────────────────
// Called after every score save. For each division, checks if all pool games
// are final. If so, ranks each pool and seeds teams into Semi/Final slots.
//
// Seeding logic (2-pool bracket):
//   Semi 1: Pool A #1  vs  Pool B #2
//   Semi 2: Pool B #1  vs  Pool A #2
//   Final:  Winner Semi 1  vs  Winner Semi 2  (homeId/awayId stay null until semis done)
//
// 1-pool bracket (everyone in one pool, top 2 go straight to Final):
//   Final: Pool A #1  vs  Pool A #2
//
// After semis are final, winner seeds into the Final automatically.

function seedBracket(divisions, games) {
  let updated = games.map(g => ({...g}));

  divisions.forEach(div => {
    const divPool  = updated.filter(g => g.divisionId === div.id && g.phase === "pool");
    const divBrkt  = updated.filter(g => g.divisionId === div.id && g.phase === "bracket");
    const semis    = divBrkt.filter(g => g.round === "Semi");
    const final    = divBrkt.find(g  => g.round === "Final");
    if (!final) return;

    // Rebuild standings from game results
    const standings = {}; // teamId -> {wins,losses,pf,pa,pool}
    div.teams.forEach(t => { standings[t.id] = {wins:0,losses:0,pf:0,pa:0,pool:t.pool}; });
    divPool.forEach(g => {
      if (g.status !== "final" || g.homeScore == null) return;
      standings[g.homeId].pf  += g.homeScore; standings[g.homeId].pa  += g.awayScore;
      standings[g.awayId].pf  += g.awayScore; standings[g.awayId].pa  += g.homeScore;
      if (g.homeScore > g.awayScore) { standings[g.homeId].wins++; standings[g.awayId].losses++; }
      else                           { standings[g.awayId].wins++; standings[g.homeId].losses++; }
    });

    // Group pools and sort each
    const pools = {};
    div.teams.forEach(t => { if(!pools[t.pool]) pools[t.pool]=[]; pools[t.pool].push(t.id); });
    const sortedPools = {}; // pool -> [teamId in rank order]
    Object.entries(pools).forEach(([pool, ids]) => {
      sortedPools[pool] = [...ids].sort((a,b) => {
        const sa=standings[a], sb=standings[b];
        if (sb.wins !== sa.wins) return sb.wins - sa.wins;
        return (sb.pf - sb.pa) - (sa.pf - sa.pa);
      });
    });

    const poolKeys  = Object.keys(sortedPools).sort();
    const allPoolGamesFinal = divPool.every(g => g.status === "final");

    // ── Seed pool play → semis/final ──────────────────────────────────────────
    if (allPoolGamesFinal) {
      if (poolKeys.length >= 2 && semis.length >= 2) {
        // 2+ pools: Semi1 = A1 vs B2, Semi2 = B1 vs A2
        const A1 = sortedPools[poolKeys[0]]?.[0];
        const A2 = sortedPools[poolKeys[0]]?.[1];
        const B1 = sortedPools[poolKeys[1]]?.[0];
        const B2 = sortedPools[poolKeys[1]]?.[1];
        updated = updated.map(g => {
          if (g.id === semis[0].id) return {...g, homeId:A1||null, awayId:B2||null};
          if (g.id === semis[1].id) return {...g, homeId:B1||null, awayId:A2||null};
          return g;
        });
      } else if (poolKeys.length === 1) {
        // 1 pool: top 2 go straight to Final
        const P1 = sortedPools[poolKeys[0]]?.[0];
        const P2 = sortedPools[poolKeys[0]]?.[1];
        updated = updated.map(g => {
          if (g.id === final.id) return {...g, homeId:P1||null, awayId:P2||null};
          return g;
        });
      }
    }

    // ── Seed semi winners → final ─────────────────────────────────────────────
    if (semis.length >= 2) {
      const s1 = updated.find(g => g.id === semis[0].id);
      const s2 = updated.find(g => g.id === semis[1].id);
      if (s1?.status === "final" && s2?.status === "final") {
        const w1 = s1.homeScore > s1.awayScore ? s1.homeId : s1.awayId;
        const w2 = s2.homeScore > s2.awayScore ? s2.homeId : s2.awayId;
        updated = updated.map(g => {
          if (g.id === final.id) return {...g, homeId:w1||null, awayId:w2||null};
          return g;
        });
      }
    }
  });

  return updated;
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
function buildSeed() {
  const divs = [
    {id:"d1",gradeId:"4th",gender:"Boys",teams:[
      {id:101,name:"Detroit Pistons Jr.",pool:"A",wins:2,losses:0,pf:78,pa:54},
      {id:102,name:"Flint Falcons",      pool:"A",wins:1,losses:1,pf:62,pa:65},
      {id:103,name:"Ann Arbor Wolves",   pool:"B",wins:1,losses:0,pf:44,pa:38},
      {id:104,name:"Lansing Lightning",  pool:"B",wins:0,losses:1,pf:38,pa:44},
    ]},
    {id:"d2",gradeId:"4th",gender:"Girls",teams:[
      {id:201,name:"Detroit Diamonds",   pool:"A",wins:1,losses:0,pf:36,pa:28},
      {id:202,name:"Flint Flames",       pool:"A",wins:0,losses:1,pf:28,pa:36},
      {id:203,name:"GR Gazelles",        pool:"B",wins:1,losses:0,pf:42,pa:30},
      {id:204,name:"Kalamazoo Kats",     pool:"B",wins:0,losses:1,pf:30,pa:42},
    ]},
    {id:"d3",gradeId:"5th",gender:"Boys",teams:[
      {id:301,name:"Detroit Ballers",    pool:"A",wins:2,losses:0,pf:60,pa:44},
      {id:302,name:"Lansing Legends",    pool:"A",wins:0,losses:2,pf:44,pa:60},
      {id:303,name:"GR Grizzlies",       pool:"B",wins:1,losses:1,pf:52,pa:54},
      {id:304,name:"Kalamazoo Kings",    pool:"B",wins:1,losses:1,pf:54,pa:52},
    ]},
  ];
  // Pre-place some games for demo purposes
  const raw = genMatchups(divs);
  const schedule = [
    // Sat Apr 19 — pool play
    {dayIdx:0,court:"Court 1",time:"8:00 AM"},
    {dayIdx:0,court:"Court 2",time:"8:00 AM"},
    {dayIdx:0,court:"Court 3",time:"8:00 AM"},
    {dayIdx:0,court:"Court 4",time:"8:00 AM"},
    {dayIdx:0,court:"Court 1",time:"10:00 AM"},
    {dayIdx:0,court:"Court 2",time:"10:00 AM"},
    {dayIdx:0,court:"Court 3",time:"10:00 AM"},
    {dayIdx:0,court:"Court 4",time:"10:00 AM"},
    {dayIdx:0,court:"Court 1",time:"12:00 PM"},
  ];
  const poolGames = raw.filter(g=>g.phase==="pool");
  const bracketGames = raw.filter(g=>g.phase==="bracket");
  const placed = poolGames.map((g,i) => {
    const s = schedule[i];
    if (!s) return g;
    const isF = i < 6;
    return { ...g, ...s, status: isF?"final":"upcoming",
      homeScore: isF?Math.floor(Math.random()*18)+26:null,
      awayScore: isF?Math.floor(Math.random()*18)+22:null };
  });
  // Place one bracket game
  const withBracket = [...placed, ...bracketGames.map((g,i)=>
    i===0 ? {...g,dayIdx:1,court:"Court 1",time:"9:00 AM"} :
    i===1 ? {...g,dayIdx:1,court:"Court 2",time:"9:00 AM"} :
    i===2 ? {...g,dayIdx:1,court:"Court 1",time:"11:00 AM"} : g
  )];
  return { tournaments:[{
    id:1, name:"Spring Shootout 2026", startDate:"2026-04-19", numDays:2,
    startTime:"8:00 AM", gameDuration:60, restGap:60,
    location:"Shoebox Sports - Detroit", status:"active",
    divisions:divs, games:withBracket,
  }]};
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Badge = ({c=C.sky,children,sx={}}) => (
  <span style={{background:c+"22",color:c,border:`1px solid ${c}44`,borderRadius:4,
    padding:"2px 8px",fontSize:10,fontWeight:800,letterSpacing:"0.07em",
    textTransform:"uppercase",whiteSpace:"nowrap",...sx}}>{children}</span>
);
const Card = ({children,sx={}}) => (
  <div style={{background:C.navyMid,borderRadius:14,border:`1px solid ${C.grayL}`,padding:20,...sx}}>{children}</div>
);
const Ttl = ({children,sub}) => (
  <div style={{marginBottom:16}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:3,height:18,background:`linear-gradient(180deg,${C.sky},${C.light})`,borderRadius:2}}/>
      <h3 style={{margin:0,fontSize:13,fontWeight:800,color:C.white,letterSpacing:"0.08em",
        textTransform:"uppercase",fontFamily:"'Barlow Condensed',sans-serif"}}>{children}</h3>
    </div>
    {sub&&<div style={{color:C.gray,fontSize:12,marginTop:4,marginLeft:13}}>{sub}</div>}
  </div>
);
const Inp = ({label,...p}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
      textTransform:"uppercase",marginBottom:6}}>{label}</div>}
    <input {...p} style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
      color:C.white,fontSize:14,padding:"11px 14px",outline:"none",boxSizing:"border-box",
      fontFamily:"inherit",...p.style}}/>
  </div>
);
const Sel = ({label,children,...p}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
      textTransform:"uppercase",marginBottom:6}}>{label}</div>}
    <select {...p} style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
      color:C.white,fontSize:14,padding:"11px 14px",outline:"none",boxSizing:"border-box",
      fontFamily:"inherit",...p.style}}>{children}</select>
  </div>
);
const Btn = ({children,v="pri",onClick,sx={},dis=false}) => {
  const base = {padding:"10px 20px",borderRadius:8,border:"none",fontWeight:800,fontSize:13,
    cursor:dis?"not-allowed":"pointer",fontFamily:"'Barlow Condensed',sans-serif",
    letterSpacing:"0.06em",textTransform:"uppercase",opacity:dis?0.45:1,...sx};
  const vs = {
    pri:  {background:`linear-gradient(135deg,${C.sky},${C.navyLight})`,color:"#fff",boxShadow:`0 4px 14px ${C.sky}44`},
    org:  {background:"linear-gradient(135deg,#E8770A,#F59B30)",color:"#fff",boxShadow:"0 4px 14px #E8770A44"},
    gh:   {background:"transparent",color:C.gray,border:`1px solid ${C.grayL}`},
    teal: {background:C.light+"22",color:C.light,border:`1px solid ${C.light}44`},
    ok:   {background:C.green+"22",color:C.green,border:`1px solid ${C.green}44`},
    gold: {background:C.gold+"22",color:C.gold,border:`1px solid ${C.gold}44`},
  };
  return <button onClick={onClick} disabled={dis} style={{...base,...vs[v]}}>{children}</button>;
};
function Logo({sz=40,txt=true}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:txt?10:0}}>
      <svg width={sz} height={sz} viewBox="0 0 100 100" fill="none">
        <rect x="18" y="18" width="64" height="64" rx="6" fill="#0D2B4E"/>
        <rect x="22" y="22" width="56" height="56" rx="4" fill="#0F3460"/>
        <path d="M62 35 Q62 28 50 28 Q30 28 30 42 Q30 50 50 50 Q70 50 70 62 Q70 72 50 72 Q38 72 38 65"
              stroke="#2A9ED8" strokeWidth="8" strokeLinecap="round" fill="none"/>
        <path d="M20 30 Q50 18 80 30" stroke="#5BC8F0" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8"/>
        <path d="M20 70 Q50 82 80 70" stroke="#5BC8F0" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
      {txt&&<div>
        <div style={{color:C.white,fontWeight:900,fontSize:sz*0.42,letterSpacing:"-0.03em",lineHeight:1,
          fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>SHOEBOX</div>
        <div style={{color:C.sky,fontWeight:700,fontSize:sz*0.32,letterSpacing:"0.12em",lineHeight:1,
          fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>SPORTS</div>
      </div>}
    </div>
  );
}

// ─── SCHEDULE BUILDER (drag & drop) ──────────────────────────────────────────
function ScheduleBuilder({tournament, initialGames, onSave, onClose}) {
  const dates   = tDates(tournament);
  const slots   = buildSlots(tournament.startTime, 16, tournament.gameDuration);
  const restGap = tournament.restGap || 0;

  const [games,   setGames]   = useState(initialGames.map(g=>({...g})));
  const [dayIdx,  setDayIdx]  = useState(0);
  const [drag,    setDrag]    = useState(null); // game id being dragged
  const [over,    setOver]    = useState(null); // {dayIdx,court,time}
  const [fDiv,    setFDiv]    = useState("all");

  // Rest-gap violation detection
  const viols = new Set();
  if (restGap > 0) {
    games.forEach(g => {
      if (!g.homeId||!g.awayId||g.dayIdx===null) return;
      [g.homeId,g.awayId].forEach(tid => {
        games.filter(x=>x.id!==g.id&&x.dayIdx===g.dayIdx&&(x.homeId===tid||x.awayId===tid)&&x.time).forEach(o=>{
          if (Math.abs(toMins(g.time)-toMins(o.time)) < restGap) { viols.add(g.id); viols.add(o.id); }
        });
      });
    });
  }

  const placed   = games.filter(g=>g.dayIdx!==null&&g.court&&g.time);
  const unplaced = games.filter(g=>g.dayIdx===null||!g.court||!g.time);

  // Conflict: two games same court+time+day
  const conflicts = new Set();
  const seen = {};
  placed.forEach(g=>{
    const k=`${g.dayIdx}-${g.court}-${g.time}`;
    if(seen[k]) { conflicts.add(g.id); conflicts.add(seen[k]); } else seen[k]=g.id;
  });

  const drop = (e, di, court, time) => {
    e.preventDefault();
    if (!drag) return;
    const target = games.find(g=>g.dayIdx===di&&g.court===court&&g.time===time);
    setGames(prev => prev.map(g => {
      if (g.id===drag) return {...g, dayIdx:di, court, time};
      if (target&&g.id===target.id) {
        const src = prev.find(x=>x.id===drag);
        return {...g, dayIdx:src.dayIdx, court:src.court, time:src.time};
      }
      return g;
    }));
    setDrag(null); setOver(null);
  };

  const unplace = id => setGames(prev=>prev.map(g=>g.id===id?{...g,dayIdx:null,court:null,time:null}:g));

  const dayGames = games.filter(g=>g.dayIdx===dayIdx&&(fDiv==="all"||g.divisionId===fDiv));
  const visibleSlots = slots.filter(s => dayGames.some(g=>g.time===s) || (drag&&over?.dayIdx===dayIdx&&over?.time===s) || drag);

  const issueCount = viols.size/2 + conflicts.size/2;

  const gameCard = (game, inGrid=true) => {
    const div = tournament.divisions.find(d=>d.id===game.divisionId);
    const di  = tournament.divisions.indexOf(div);
    const col = dc(di);
    const hasV = viols.has(game.id);
    const hasC = conflicts.has(game.id);
    const isDrag = drag===game.id;
    return (
      <div key={game.id} draggable
        onDragStart={e=>{setDrag(game.id);e.dataTransfer.effectAllowed="move";}}
        onDragEnd={()=>{setDrag(null);setOver(null);}}
        style={{background:isDrag?"rgba(42,158,216,0.2)":C.navyMid, borderRadius:10,
          padding:inGrid?"9px 11px":"10px 12px",cursor:"grab",userSelect:"none",
          border:`2px solid ${hasC?C.red:hasV?C.gold:col+"66"}`,
          opacity:isDrag?0.45:1, transition:"border-color 0.15s",
          boxShadow:(hasC||hasV)?`0 0 10px ${hasC?C.red:C.gold}44`:"none"}}>
        {div&&<div style={{marginBottom:5,display:"flex",gap:4,flexWrap:"wrap"}}>
          <Badge c={col}>{dshort(div.gradeId,div.gender)}</Badge>
          {game.phase==="pool"
            ?<Badge c={C.gold}>Pool {game.pool}</Badge>
            :<Badge c={C.light}>{game.round}</Badge>}
        </div>}
        <div style={{color:C.white,fontSize:12,fontWeight:700,lineHeight:1.4}}>
          {tname(tournament.divisions,game.homeId)}
          <span style={{color:C.gray,fontSize:11}}> vs </span>
          {tname(tournament.divisions,game.awayId)}
        </div>
        {hasC&&<div style={{color:C.red,fontSize:10,marginTop:3,fontWeight:700}}>⚠ Court conflict</div>}
        {hasV&&!hasC&&<div style={{color:C.gold,fontSize:10,marginTop:3,fontWeight:700}}>⚠ Rest gap conflict</div>}
        {game.status==="final"&&<div style={{color:C.green,fontSize:11,marginTop:3,fontWeight:700}}>{game.homeScore}–{game.awayScore} Final</div>}
        {inGrid&&<button onClick={e=>{e.stopPropagation();unplace(game.id);}}
          style={{marginTop:5,background:"transparent",border:`1px solid ${C.grayL}`,borderRadius:5,
            color:C.gray,fontSize:9,cursor:"pointer",padding:"2px 8px"}}>↩ remove</button>}
        {!inGrid&&<div style={{color:C.gray,fontSize:9,marginTop:3}}>⠿ drag to grid →</div>}
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000d",zIndex:1500,display:"flex",flexDirection:"column",fontFamily:"'DM Sans',sans-serif"}}>

      {/* Top bar */}
      <div style={{background:C.navyMid,borderBottom:`1px solid ${C.grayL}`,padding:"14px 20px",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase"}}>
            ✏️ Schedule Builder — Drag & Drop
          </div>
          <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>{tournament.name}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {issueCount>0&&(
            <div style={{background:C.red+"22",border:`1px solid ${C.red}44`,borderRadius:8,
              padding:"7px 14px",color:C.red,fontSize:12,fontWeight:700}}>
              ⚠ {Math.round(issueCount)} issue{issueCount!==1?"s":""}
            </div>
          )}
          {unplaced.length>0&&(
            <div style={{background:C.gold+"22",border:`1px solid ${C.gold}44`,borderRadius:8,
              padding:"7px 14px",color:C.gold,fontSize:12,fontWeight:700}}>
              {unplaced.length} unscheduled
            </div>
          )}
          <Btn v="ok" onClick={()=>onSave(games)} sx={{padding:"8px 18px",fontSize:12}}>✓ Save Schedule</Btn>
          <Btn v="gh" onClick={onClose} sx={{padding:"8px 14px",fontSize:12}}>✕ Cancel</Btn>
        </div>
      </div>

      {/* Day tabs + filter */}
      <div style={{background:C.navyLight,borderBottom:`1px solid ${C.grayL}`,
        padding:"0 20px",display:"flex",gap:4,alignItems:"flex-end",flexShrink:0,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:4,paddingTop:8}}>
          {dates.map((d,i)=>(
            <button key={i} onClick={()=>setDayIdx(i)} style={{
              padding:"9px 16px",background:dayIdx===i?C.sky:"transparent",
              color:dayIdx===i?"#fff":C.gray,border:"none",borderRadius:"8px 8px 0 0",
              cursor:"pointer",fontWeight:800,fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",
              textTransform:"uppercase"}}>
              {fmtD(d)}
              <span style={{marginLeft:6,fontSize:10,opacity:0.7}}>
                ({games.filter(g=>g.dayIdx===i&&g.court).length} placed)
              </span>
            </button>
          ))}
        </div>
        <select value={fDiv} onChange={e=>setFDiv(e.target.value)}
          style={{marginLeft:"auto",marginBottom:6,background:C.navy,border:`1px solid ${C.grayL}`,
            borderRadius:8,color:C.white,fontSize:12,padding:"7px 12px",outline:"none",cursor:"pointer"}}>
          <option value="all">All Divisions</option>
          {tournament.divisions.map((d,i)=><option key={d.id} value={d.id}>{dlabel(d.gradeId,d.gender)}</option>)}
        </select>
      </div>

      {/* Hint bar */}
      <div style={{background:C.navy,borderBottom:`1px solid ${C.grayL}11`,
        padding:"8px 20px",display:"flex",gap:20,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{color:C.gray,fontSize:12}}>
          Drag games from the sidebar onto any court & time slot.
          {restGap>0&&<span style={{color:C.gold}}> Min rest: {restGap>=60?`${restGap/60}hr`:restGap+"min"} per team.</span>}
        </span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginLeft:"auto"}}>
          {tournament.divisions.map((d,i)=><Badge key={d.id} c={dc(i)}>{dshort(d.gradeId,d.gender)}</Badge>)}
        </div>
      </div>

      {/* Main: sidebar + grid */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── Unscheduled sidebar ── */}
        <div style={{width:230,background:C.navy,borderRight:`1px solid ${C.grayL}`,
          overflowY:"auto",padding:12,flexShrink:0}}>
          <div style={{color:C.gold,fontSize:11,fontWeight:800,textTransform:"uppercase",
            letterSpacing:"0.08em",marginBottom:4}}>Unscheduled</div>
          <div style={{color:C.gray,fontSize:11,marginBottom:12}}>
            {unplaced.length} game{unplaced.length!==1?"s":""} remaining
          </div>

          {/* Group by division */}
          {tournament.divisions.map((div,di)=>{
            const divUnplaced = unplaced.filter(g=>g.divisionId===div.id);
            if (!divUnplaced.length) return null;
            return (
              <div key={div.id} style={{marginBottom:16}}>
                <div style={{color:dc(di),fontSize:10,fontWeight:800,textTransform:"uppercase",
                  letterSpacing:"0.08em",marginBottom:8,display:"flex",justifyContent:"space-between"}}>
                  {dshort(div.gradeId,div.gender)}
                  <span style={{color:C.gray,fontWeight:400}}>{divUnplaced.length}</span>
                </div>
                {divUnplaced.map(g=>(
                  <div key={g.id} style={{marginBottom:7}}>{gameCard(g,false)}</div>
                ))}
              </div>
            );
          })}

          {unplaced.length===0&&(
            <div style={{textAlign:"center",padding:"30px 0"}}>
              <div style={{fontSize:28,marginBottom:8}}>🎉</div>
              <div style={{color:C.green,fontSize:13,fontWeight:700}}>All games scheduled!</div>
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        <div style={{flex:1,overflowX:"auto",overflowY:"auto",padding:16}}>
          <table style={{borderCollapse:"collapse",minWidth:720}}>
            <thead>
              <tr>
                <th style={{padding:"8px 14px",color:C.gray,fontWeight:700,fontSize:11,
                  textAlign:"left",letterSpacing:"0.06em",position:"sticky",left:0,
                  background:C.navy,zIndex:2,whiteSpace:"nowrap"}}>TIME</th>
                {COURTS.map(c=>(
                  <th key={c} style={{padding:"8px 14px",color:C.sky,fontWeight:800,fontSize:12,
                    textAlign:"center",fontFamily:"'Barlow Condensed',sans-serif",
                    letterSpacing:"0.06em",minWidth:195}}>{c.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map(slot=>{
                const rowHasGame = COURTS.some(c=>games.find(g=>g.dayIdx===dayIdx&&g.court===c&&g.time===slot&&(fDiv==="all"||g.divisionId===fDiv)));
                const isOverRow  = over?.dayIdx===dayIdx&&over?.time===slot;
                if (!rowHasGame&&!drag&&!isOverRow) return null;
                return (
                  <tr key={slot} style={{borderBottom:`1px solid ${C.grayL}18`}}>
                    <td style={{padding:"6px 14px",color:C.gold,fontWeight:800,fontSize:13,
                      whiteSpace:"nowrap",fontFamily:"'Barlow Condensed',sans-serif",
                      position:"sticky",left:0,background:C.navy,zIndex:1}}>{slot}</td>
                    {COURTS.map(court=>{
                      const game = games.find(g=>g.dayIdx===dayIdx&&g.court===court&&g.time===slot&&(fDiv==="all"||g.divisionId===fDiv));
                      const anyGame = games.find(g=>g.dayIdx===dayIdx&&g.court===court&&g.time===slot);
                      const isHere = over?.dayIdx===dayIdx&&over?.court===court&&over?.time===slot;
                      return (
                        <td key={court}
                          onDragOver={e=>{e.preventDefault();setOver({dayIdx,court,time:slot});}}
                          onDrop={e=>drop(e,dayIdx,court,slot)}
                          style={{padding:"5px 6px",verticalAlign:"top",
                            background:isHere?"rgba(42,158,216,0.1)":"transparent",
                            border:isHere?`2px dashed ${C.sky}`:"2px solid transparent",
                            borderRadius:8,minHeight:80}}>
                          {game
                            ? gameCard(game, true)
                            : drag&&!anyGame
                              ? <div style={{height:75,borderRadius:10,
                                  border:`2px dashed ${isHere?C.sky:C.grayL}`,
                                  background:isHere?C.sky+"11":"transparent",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  color:isHere?C.sky:C.grayL,fontSize:12}}>
                                  {isHere?"Drop here":"Empty"}
                                </div>
                              : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Always show some empty rows when dragging so user can drop anywhere */}
              {drag&&slots.filter(s=>!games.some(g=>g.dayIdx===dayIdx&&g.time===s)).slice(0,4).map(slot=>(
                <tr key={`empty-${slot}`} style={{borderBottom:`1px solid ${C.grayL}18`}}>
                  <td style={{padding:"6px 14px",color:C.gold,fontWeight:800,fontSize:13,
                    whiteSpace:"nowrap",fontFamily:"'Barlow Condensed',sans-serif",
                    position:"sticky",left:0,background:C.navy,zIndex:1}}>{slot}</td>
                  {COURTS.map(court=>{
                    const isHere=over?.dayIdx===dayIdx&&over?.court===court&&over?.time===slot;
                    return (
                      <td key={court}
                        onDragOver={e=>{e.preventDefault();setOver({dayIdx,court,time:slot});}}
                        onDrop={e=>drop(e,dayIdx,court,slot)}
                        style={{padding:"5px 6px",verticalAlign:"top",
                          background:isHere?"rgba(42,158,216,0.1)":"transparent",
                          border:isHere?`2px dashed ${C.sky}`:"2px solid transparent",
                          borderRadius:8,minHeight:80}}>
                        <div style={{height:75,borderRadius:10,
                          border:`2px dashed ${isHere?C.sky:C.grayL}`,
                          background:isHere?C.sky+"11":"transparent",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:isHere?C.sky:C.grayL,fontSize:12}}>
                          {isHere?"Drop here":"Empty"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── CREATE TOURNAMENT MODAL ──────────────────────────────────────────────────
function CreateModal({onSave, onClose}) {
  const [step,    setStep]    = useState(1);
  const [form,    setForm]    = useState({
    name:"", startDate:"", numDays:"2",
    startTime:"8:00 AM", gameDuration:"60", restGap:"60",
    location:"Shoebox Sports - Fenton, MI",
  });
  const [selDivs,  setSelDivs]  = useState([]);
  const [divTeams, setDivTeams] = useState({});
  const [pending,  setPending]  = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const isDivSel = (g,s) => !!selDivs.find(d=>d.gradeId===g&&d.gender===s);

  const toggleDiv = (gradeId,gender) => {
    const key=`${gradeId}-${gender}`;
    if (isDivSel(gradeId,gender)) {
      setSelDivs(p=>p.filter(d=>!(d.gradeId===gradeId&&d.gender===gender)));
      setDivTeams(dt=>{const n={...dt};delete n[key];return n;});
    } else {
      setSelDivs(p=>[...p,{gradeId,gender}]);
      setDivTeams(dt=>({...dt,[key]:[
        {id:Date.now()+Math.random(),   name:"",pool:"A"},
        {id:Date.now()+Math.random()+1, name:"",pool:"A"},
        {id:Date.now()+Math.random()+2, name:"",pool:"B"},
        {id:Date.now()+Math.random()+3, name:"",pool:"B"},
      ]}));
    }
  };

  const addTeam = key => {
    const cur=divTeams[key]||[];
    const p=["A","B","C","D"][Math.floor(cur.length/2)%4];
    setDivTeams(dt=>({...dt,[key]:[...cur,{id:Date.now()+Math.random(),name:"",pool:p}]}));
  };
  const remTeam = (key,id) => setDivTeams(dt=>({...dt,[key]:dt[key].filter(t=>t.id!==id)}));
  const updTeam = (key,id,f,v) => setDivTeams(dt=>({...dt,[key]:dt[key].map(t=>t.id===id?{...t,[f]:v}:t)}));

  const totalTeams = selDivs.reduce((s,sd)=>s+(divTeams[`${sd.gradeId}-${sd.gender}`]||[]).filter(t=>t.name.trim()).length,0);

  const makeDivisions = () => {
    let tid=Date.now();
    return selDivs.map((sd,i)=>{
      const key=`${sd.gradeId}-${sd.gender}`;
      return {id:`div-${tid}-${i}`,gradeId:sd.gradeId,gender:sd.gender,
        teams:(divTeams[key]||[]).filter(t=>t.name.trim())
          .map((t,ti)=>({...t,id:tid+i*100+ti,wins:0,losses:0,pf:0,pa:0}))};
    }).filter(d=>d.teams.length>=2);
  };

  // Step 3: generate matchups then open builder
  const handleOpenBuilder = () => {
    const divs = makeDivisions();
    const games = genMatchups(divs);
    const base = {
      id:Date.now(), name:form.name, startDate:form.startDate,
      numDays:parseInt(form.numDays), startTime:form.startTime,
      gameDuration:parseInt(form.gameDuration), restGap:parseInt(form.restGap),
      location:form.location, status:"upcoming",
      divisions:divs, games:[],
    };
    setPending({tournament:base, games});
    setShowBuilder(true);
  };

  if (showBuilder&&pending) {
    return (
      <ScheduleBuilder
        tournament={pending.tournament}
        initialGames={pending.games}
        onSave={games=>onSave({...pending.tournament, games})}
        onClose={()=>setShowBuilder(false)}
      />
    );
  }

  const timeOpts = buildSlots("6:00 AM",18,30);

  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:1000,display:"flex",
      alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.navyMid,borderRadius:20,width:560,maxWidth:"100%",
        border:`1px solid ${C.sky}44`,boxShadow:`0 24px 80px #000a`,
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"22px 26px 14px",borderBottom:`1px solid ${C.grayL}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:C.sky,fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase"}}>
                New Tournament
              </div>
              <div style={{color:C.white,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif"}}>
                {step===1?"Details & Settings":step===2?"Select Divisions":"Register Teams"}
              </div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:22}}>×</button>
          </div>
          {/* Step indicators */}
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {["Details","Divisions","Teams"].map((s,i)=>(
              <div key={s} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:11,fontWeight:800,
                  background:step>i+1?C.green:step===i+1?C.sky:C.grayD,
                  color:step>=i+1?"#fff":C.gray}}>{step>i+1?"✓":i+1}</div>
                <span style={{color:step===i+1?C.white:C.gray,fontSize:12,fontWeight:600}}>{s}</span>
                {i<2&&<div style={{width:20,height:1,background:C.grayL}}/>}
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:26,overflowY:"auto",flex:1}}>

          {/* ── STEP 1: Details ── */}
          {step===1&&<>
            <Inp label="Tournament Name" value={form.name} onChange={e=>upd("name",e.target.value)} placeholder="e.g. Spring Shootout 2026"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Inp label="Start Date" type="date" value={form.startDate} onChange={e=>upd("startDate",e.target.value)}/>
              <Sel label="Number of Days" value={form.numDays} onChange={e=>upd("numDays",e.target.value)}>
                {[1,2,3,4].map(n=><option key={n} value={n}>{n} Day{n>1?"s":""}</option>)}
              </Sel>
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:18,marginBottom:14,border:`1px solid ${C.grayL}`}}>
              <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14}}>
                ⚙ Schedule Settings
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Sel label="First Game Start Time" value={form.startTime} onChange={e=>upd("startTime",e.target.value)}>
                  {timeOpts.map(t=><option key={t}>{t}</option>)}
                </Sel>
                <Sel label="Game Duration" value={form.gameDuration} onChange={e=>upd("gameDuration",e.target.value)}>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes (1 hr)</option>
                  <option value="75">75 minutes</option>
                  <option value="90">90 minutes (1.5 hr)</option>
                </Sel>
              </div>
              <Sel label="Minimum Rest Between Games (per team)" value={form.restGap} onChange={e=>upd("restGap",e.target.value)}>
                <option value="0">No minimum rest</option>
                <option value="60">1 hour minimum rest</option>
                <option value="120">2 hour minimum rest</option>
                <option value="180">3 hour minimum rest</option>
              </Sel>
              <div style={{background:C.navyMid,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.sky}33`}}>
                <div style={{color:C.sky,fontSize:12,fontWeight:700,marginBottom:4}}>
                  ✏️ How scheduling works
                </div>
                <div style={{color:C.gray,fontSize:12,lineHeight:1.6}}>
                  After entering your teams, all pool play matchups are automatically generated.
                  You then drag each game onto any court and time slot you choose.
                  Bracket games are added once pool play is complete.
                </div>
              </div>
            </div>
            <Inp label="Location" value={form.location} onChange={e=>upd("location",e.target.value)}/>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
              <Btn v="gh" onClick={onClose}>Cancel</Btn>
              <Btn v="pri" onClick={()=>setStep(2)} dis={!form.name||!form.startDate}>Next → Divisions</Btn>
            </div>
          </>}

          {/* ── STEP 2: Divisions ── */}
          {step===2&&<>
            <div style={{color:C.gray,fontSize:13,marginBottom:18}}>
              Select all grade & gender divisions for this tournament.
            </div>
            {["Boys","Girls"].map(gender=>(
              <div key={gender} style={{marginBottom:20}}>
                <div style={{color:C.gold,fontWeight:800,fontSize:13,textTransform:"uppercase",
                  letterSpacing:"0.1em",marginBottom:10,fontFamily:"'Barlow Condensed',sans-serif"}}>
                  {gender==="Boys"?"👦":"👧"} {gender}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {GD.map(grade=>{
                    const sel=isDivSel(grade.id,gender);
                    return (
                      <button key={grade.id} onClick={()=>toggleDiv(grade.id,gender)} style={{
                        padding:"10px 8px",borderRadius:10,cursor:"pointer",textAlign:"center",
                        border:`2px solid ${sel?C.sky:C.grayL}`,background:sel?C.sky+"22":C.navy,
                        color:sel?C.sky:C.gray,fontWeight:700,fontSize:13,
                        fontFamily:"'Barlow Condensed',sans-serif",transition:"all 0.15s"}}>
                        {sel&&<div style={{color:C.green,fontSize:10,marginBottom:2}}>✓</div>}
                        {grade.s}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {selDivs.length>0&&(
              <div style={{background:C.navy,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",marginBottom:8}}>
                  {selDivs.length} Division{selDivs.length>1?"s":""} Selected
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {selDivs.map(d=><Badge key={`${d.gradeId}-${d.gender}`} c={C.sky}>{dshort(d.gradeId,d.gender)}</Badge>)}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <Btn v="gh" onClick={()=>setStep(1)} sx={{flex:1}}>← Back</Btn>
              <Btn v="pri" onClick={()=>setStep(3)} dis={selDivs.length===0} sx={{flex:2}}>Next → Teams</Btn>
            </div>
          </>}

          {/* ── STEP 3: Teams ── */}
          {step===3&&<>
            <div style={{color:C.gray,fontSize:13,marginBottom:18}}>
              Add teams to each division. Pool play matchups will be generated automatically — then you place each game on the schedule.
            </div>
            {selDivs.map((sd,di)=>{
              const key=`${sd.gradeId}-${sd.gender}`;
              const teams=divTeams[key]||[];
              const col=dc(di);
              const pools=[...new Set(teams.map(t=>t.pool))].sort();
              return (
                <div key={key} style={{marginBottom:20,background:C.navy,borderRadius:14,padding:16,border:`1px solid ${col}44`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{color:col,fontWeight:800,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>{dlabel(sd.gradeId,sd.gender)}</div>
                    <Badge c={col}>{teams.filter(t=>t.name.trim()).length} teams</Badge>
                  </div>
                  {pools.map(pool=>(
                    <div key={pool} style={{marginBottom:10}}>
                      <div style={{color:C.gray,fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Pool {pool}</div>
                      {teams.filter(t=>t.pool===pool).map(team=>(
                        <div key={team.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                          <input value={team.name} onChange={e=>updTeam(key,team.id,"name",e.target.value)}
                            placeholder="Team name..."
                            style={{flex:1,background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,
                              color:C.white,fontSize:14,padding:"9px 12px",outline:"none",fontFamily:"inherit"}}/>
                          <select value={team.pool} onChange={e=>updTeam(key,team.id,"pool",e.target.value)}
                            style={{background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,
                              color:C.white,fontSize:13,padding:"9px 10px",outline:"none",cursor:"pointer"}}>
                            {["A","B","C","D"].map(p=><option key={p}>{p}</option>)}
                          </select>
                          <button onClick={()=>remTeam(key,team.id)}
                            style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                              borderRadius:8,padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:700}}>✕</button>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button onClick={()=>addTeam(key)}
                    style={{width:"100%",padding:"8px 0",background:"transparent",
                      border:`1px dashed ${col}66`,borderRadius:8,color:col,cursor:"pointer",fontWeight:700,fontSize:12}}>
                    + Add Team
                  </button>
                </div>
              );
            })}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <Btn v="gh" onClick={()=>setStep(2)} sx={{flex:1}}>← Back</Btn>
              <Btn v="org" onClick={handleOpenBuilder} dis={totalTeams<2} sx={{flex:2}}>
                ✏️ Generate Matchups & Build Schedule
              </Btn>
            </div>
          </>}

        </div>
      </div>
    </div>
  );
}

// ─── ADMIN: SCHEDULE TAB ──────────────────────────────────────────────────────
function AdminSchedule({tournament, onScore, onUpdateGames}) {
  const [scoreGame, setScoreGame] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [homeS, setHomeS] = useState("");
  const [awayS, setAwayS] = useState("");
  const [fDiv, setFDiv] = useState("all");
  const [fDay, setFDay] = useState("all");
  const dates = tDates(tournament);

  const placed   = tournament.games.filter(g=>g.dayIdx!==null&&g.court&&g.time);
  const unplaced = tournament.games.filter(g=>g.dayIdx===null||!g.court||!g.time);

  const sorted = [...tournament.games]
    .filter(g=>g.dayIdx!==null&&g.court&&g.time)
    .filter(g=>(fDiv==="all"||g.divisionId===fDiv)&&(fDay==="all"||g.dayIdx===parseInt(fDay)))
    .sort((a,b)=>a.dayIdx-b.dayIdx||toMins(a.time)-toMins(b.time));

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <select value={fDiv} onChange={e=>setFDiv(e.target.value)}
          style={{background:C.navyLight,border:`1px solid ${C.grayL}`,borderRadius:8,
            color:C.white,fontSize:13,padding:"9px 14px",outline:"none",cursor:"pointer"}}>
          <option value="all">All Divisions</option>
          {tournament.divisions.map(d=><option key={d.id} value={d.id}>{dlabel(d.gradeId,d.gender)}</option>)}
        </select>
        <select value={fDay} onChange={e=>setFDay(e.target.value)}
          style={{background:C.navyLight,border:`1px solid ${C.grayL}`,borderRadius:8,
            color:C.white,fontSize:13,padding:"9px 14px",outline:"none",cursor:"pointer"}}>
          <option value="all">All Days</option>
          {dates.map((d,i)=><option key={i} value={i}>{fmtD(d)}</option>)}
        </select>
        {unplaced.length>0&&(
          <div style={{background:C.gold+"22",border:`1px solid ${C.gold}44`,borderRadius:8,
            padding:"7px 14px",color:C.gold,fontSize:12,fontWeight:700}}>
            {unplaced.length} game{unplaced.length!==1?"s":""} not yet scheduled
          </div>
        )}
        <Btn v="teal" onClick={()=>setShowBuilder(true)} sx={{marginLeft:"auto",padding:"9px 18px",fontSize:12}}>
          ✏️ Edit Schedule
        </Btn>
      </div>

      {/* Games by day */}
      {dates.map((date,di)=>{
        if (fDay!=="all"&&parseInt(fDay)!==di) return null;
        const dg = sorted.filter(g=>g.dayIdx===di);
        if (!dg.length) return null;
        return (
          <div key={di} style={{marginBottom:26}}>
            <Ttl sub={`${dg.length} game${dg.length!==1?"s":""} scheduled`}>{fmtD(date)}</Ttl>
            {dg.map(game=>{
              const div = tournament.divisions.find(d=>d.id===game.divisionId);
              const col = div?dc(tournament.divisions.indexOf(div)):C.gray;
              return (
                <Card key={game.id} sx={{marginBottom:8,display:"flex",alignItems:"center",gap:14,padding:"12px 16px"}}>
                  <div style={{minWidth:72,borderRight:`1px solid ${C.grayL}`,paddingRight:14}}>
                    <div style={{color:C.sky,fontWeight:800,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>{game.time}</div>
                    <div style={{color:C.gray,fontSize:11,marginTop:2}}>{game.court}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                      {div&&<Badge c={col}>{dshort(div.gradeId,div.gender)}</Badge>}
                      {game.phase==="pool"?<Badge c={C.gold}>Pool {game.pool}</Badge>:<Badge c={C.light}>{game.round}</Badge>}
                    </div>
                    <div style={{color:C.white,fontSize:14,fontWeight:700}}>
                      {tname(tournament.divisions,game.homeId)}
                      <span style={{color:C.gray,margin:"0 8px",fontWeight:400}}>vs</span>
                      {tname(tournament.divisions,game.awayId)}
                    </div>
                  </div>
                  <div style={{textAlign:"right",minWidth:90}}>
                    {game.status==="final"?(
                      <div>
                        <div style={{color:C.white,fontWeight:900,fontSize:19,fontFamily:"'Barlow Condensed',sans-serif"}}>
                          {game.homeScore} <span style={{color:C.gray,fontWeight:400}}>–</span> {game.awayScore}
                        </div>
                        <Badge c={C.green}>Final</Badge>
                      </div>
                    ):game.homeId?(
                      <Btn v="pri" onClick={()=>{setScoreGame(game);setHomeS("");setAwayS("");}} sx={{padding:"7px 12px",fontSize:12}}>+ Score</Btn>
                    ):<Badge c={C.gray}>TBD</Badge>}
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}

      {sorted.length===0&&(
        <div style={{textAlign:"center",padding:"50px 0"}}>
          <div style={{fontSize:40,marginBottom:12}}>📋</div>
          <div style={{color:C.white,fontWeight:700,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>No games scheduled yet</div>
          <div style={{color:C.gray,fontSize:14,marginBottom:20}}>Use the Schedule Builder to drag matchups onto the court grid</div>
          <Btn v="teal" onClick={()=>setShowBuilder(true)}>✏️ Open Schedule Builder</Btn>
        </div>
      )}

      {/* Score modal */}
      {scoreGame&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:28,width:320,maxWidth:"100%",border:`1px solid ${C.sky}55`}}>
            <div style={{textAlign:"center",marginBottom:18}}>
              <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",marginBottom:6}}>Enter Score</div>
              <div style={{color:C.white,fontWeight:700}}>{tname(tournament.divisions,scoreGame.homeId)} vs {tname(tournament.divisions,scoreGame.awayId)}</div>
              <div style={{color:C.gray,fontSize:12}}>{scoreGame.court} · {scoreGame.time}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
              {[{label:tname(tournament.divisions,scoreGame.homeId),val:homeS,set:setHomeS},
                {label:tname(tournament.divisions,scoreGame.awayId),val:awayS,set:setAwayS}].map(({label,val,set})=>(
                <div key={label}>
                  <div style={{color:C.gray,fontSize:10,textAlign:"center",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                  <input type="number" value={val} onChange={e=>set(e.target.value)}
                    style={{width:"100%",background:C.navy,border:`2px solid ${C.sky}55`,borderRadius:10,
                      color:C.white,fontSize:34,fontWeight:900,textAlign:"center",padding:"12px 0",
                      outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setScoreGame(null)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="pri" onClick={()=>{onScore(scoreGame.id,Number(homeS),Number(awayS));setScoreGame(null);}} sx={{flex:1}}>Save</Btn>
            </div>
          </div>
        </div>
      )}

      {showBuilder&&(
        <ScheduleBuilder
          tournament={tournament}
          initialGames={tournament.games}
          onSave={g=>{onUpdateGames(g);setShowBuilder(false);}}
          onClose={()=>setShowBuilder(false)}
        />
      )}
    </div>
  );
}

// ─── ADMIN STANDINGS ─────────────────────────────────────────────────────────
function AdminStandings({tournament}) {
  const [aDiv,setADiv]=useState(tournament.divisions[0]?.id);
  const div=tournament.divisions.find(d=>d.id===aDiv);
  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {tournament.divisions.map((d,i)=>(
          <button key={d.id} onClick={()=>setADiv(d.id)} style={{padding:"8px 14px",borderRadius:8,
            border:`1px solid ${aDiv===d.id?dc(i):C.grayL}`,background:aDiv===d.id?dc(i)+"22":"transparent",
            color:aDiv===d.id?dc(i):C.gray,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>
            {dshort(d.gradeId,d.gender)}
          </button>
        ))}
      </div>
      {div&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
        {[...new Set(div.teams.map(t=>t.pool))].sort().map(pool=>(
          <Card key={pool}>
            <div style={{color:C.gold,fontWeight:800,fontSize:13,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>Pool {pool}</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{color:C.gray}}>
                {["#","Team","W","L","+/-"].map(h=>(
                  <th key={h} style={{textAlign:h==="Team"?"left":"center",paddingBottom:8,fontWeight:700,fontSize:11}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {poolSort(div.teams,pool).map((t,i)=>(
                  <tr key={t.id} style={{borderTop:`1px solid ${C.grayL}`}}>
                    <td style={{padding:"9px 6px 9px 0",fontWeight:800,color:i===0?C.gold:i===1?C.light:C.gray}}>
                      {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                    </td>
                    <td style={{padding:"9px 8px",color:C.white,fontWeight:600}}>{t.name}</td>
                    <td style={{textAlign:"center",color:C.green,fontWeight:800}}>{t.wins}</td>
                    <td style={{textAlign:"center",color:C.red,fontWeight:800}}>{t.losses}</td>
                    <td style={{textAlign:"center",color:t.pf-t.pa>=0?C.green:C.red,fontWeight:700}}>
                      {t.pf-t.pa>0?"+":""}{t.pf-t.pa}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>}
    </div>
  );
}

// ─── ADMIN BRACKET ────────────────────────────────────────────────────────────
function AdminBracket({tournament}) {
  const [aDiv,setADiv]=useState(tournament.divisions[0]?.id);
  const div=tournament.divisions.find(d=>d.id===aDiv);
  const di=tournament.divisions.indexOf(div);
  const col=dc(di);
  const bGames=tournament.games.filter(g=>g.divisionId===aDiv&&g.phase==="bracket");
  const semis=bGames.filter(g=>g.round==="Semi");
  const final=bGames.find(g=>g.round==="Final");
  const GBox=({game,hi})=>(
    <div style={{background:hi?`linear-gradient(135deg,${C.navy},${C.navyLight})`:C.navy,borderRadius:12,
      border:`1px solid ${hi?col:C.grayL}`,padding:"13px 16px",minWidth:210,boxShadow:hi?`0 0 18px ${col}33`:"none"}}>
      <div style={{fontSize:10,color:hi?col:C.sky,fontWeight:800,marginBottom:9,textTransform:"uppercase",letterSpacing:"0.08em"}}>
        {game.round}{game.court?` · ${game.court} · ${game.time}`:" · TBD"}
      </div>
      {[{id:game.homeId,sc:game.homeScore},{id:game.awayId,sc:game.awayScore}].map(({id,sc},idx)=>{
        const won=game.status==="final"&&sc!==null&&(idx===0?game.homeScore>game.awayScore:game.awayScore>game.homeScore);
        return (
          <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"7px 0",borderTop:idx===1?`1px solid ${C.grayL}`:"none"}}>
            <span style={{color:won?C.white:C.gray,fontSize:13,fontWeight:won?800:400}}>{won&&"▶ "}{tname(tournament.divisions,id)}</span>
            <span style={{color:sc!==null?C.gold:C.grayL,fontWeight:900,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>{sc!==null?sc:"—"}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {tournament.divisions.map((d,i)=>(
          <button key={d.id} onClick={()=>setADiv(d.id)} style={{padding:"8px 14px",borderRadius:8,
            border:`1px solid ${aDiv===d.id?dc(i):C.grayL}`,background:aDiv===d.id?dc(i)+"22":"transparent",
            color:aDiv===d.id?dc(i):C.gray,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>
            {dshort(d.gradeId,d.gender)}
          </button>
        ))}
      </div>
      {div&&(()=>{
        const divPoolGames   = tournament.games.filter(g=>g.divisionId===div.id&&g.phase==="pool");
        const poolTotal      = divPoolGames.length;
        const poolDone       = divPoolGames.filter(g=>g.status==="final").length;
        const allPoolDone    = poolTotal>0 && poolDone===poolTotal;
        const semisSeeded    = semis.every(s=>s.homeId&&s.awayId);
        const finalSeeded    = final?.homeId&&final?.awayId;
        const semis1Done     = semis.length>0 && semis.every(s=>s.status==="final");
        return <>
        <Ttl sub={`${dlabel(div.gradeId,div.gender)} — seeded from pool play`}>Championship Bracket</Ttl>

        {/* Seeding status banner */}
        {!allPoolDone ? (
          <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:10,
            padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>⏳</span>
            <div>
              <div style={{color:C.gold,fontWeight:800,fontSize:13}}>Waiting for pool play to finish</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                {poolDone} of {poolTotal} pool games scored — bracket seeds automatically once all are done
              </div>
            </div>
          </div>
        ) : semisSeeded ? (
          <div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:10,
            padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>✅</span>
            <div>
              <div style={{color:C.green,fontWeight:800,fontSize:13}}>Bracket seeded automatically</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                {semis.length>0
                  ? semis1Done
                    ? finalSeeded ? "Final set — ready to play" : "Semis complete — final seeded"
                    : "Semis ready to play"
                  : finalSeeded ? "Final ready to play" : ""}
              </div>
            </div>
          </div>
        ) : (
          <div style={{background:C.sky+"18",border:`1px solid ${C.sky}44`,borderRadius:10,
            padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>🌱</span>
            <div>
              <div style={{color:C.sky,fontWeight:800,fontSize:13}}>Pool play complete — seeding bracket…</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>Teams will appear below once seeded</div>
            </div>
          </div>
        )}

        <div style={{overflowX:"auto",paddingBottom:16}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:0,minWidth:semis.length?560:260}}>
            {semis.length>0&&<div style={{display:"flex",flexDirection:"column",gap:14}}>{semis.map(g=><GBox key={g.id} game={g}/>)}</div>}
            {semis.length>0&&<div style={{display:"flex",flexDirection:"column",justifyContent:"center",height:semis.length>1?180:80,padding:"0 8px"}}>
              {semis.length>1&&<>
                <div style={{width:36,height:"50%",borderRight:`1px solid ${C.grayL}`,borderTop:`1px solid ${C.grayL}`,borderRadius:"0 8px 0 0"}}/>
                <div style={{width:36,height:"50%",borderRight:`1px solid ${C.grayL}`,borderBottom:`1px solid ${C.grayL}`,borderRadius:"0 0 8px 0"}}/>
              </>}
            </div>}
            {final&&<GBox game={final} hi/>}
          </div>
        </div>
        {final?.status==="final"&&(
          <div style={{marginTop:20,background:`linear-gradient(135deg,${col}22,${C.navyLight})`,
            border:`1px solid ${C.gold}66`,borderRadius:16,padding:22,textAlign:"center"}}>
            <div style={{fontSize:30}}>🏆</div>
            <div style={{color:C.gold,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif"}}>
              CHAMPIONS — {dlabel(div.gradeId,div.gender)}
            </div>
            <div style={{color:C.white,fontSize:18,fontWeight:700,marginTop:6}}>
              {tname(tournament.divisions,final.homeScore>final.awayScore?final.homeId:final.awayId)}
            </div>
          </div>
        )}
        </>;
      })()}
    </div>
  );
}

// ─── ADMIN COURTS GRID ────────────────────────────────────────────────────────
function AdminCourts({tournament}) {
  const dates=tDates(tournament);
  const [aDi,setADi]=useState(0);
  const slots=buildSlots(tournament.startTime,14,tournament.gameDuration);
  const dg=tournament.games.filter(g=>g.dayIdx===aDi&&g.court&&g.time);
  const used=slots.filter(s=>dg.some(g=>g.time===s));
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:18,alignItems:"center",flexWrap:"wrap"}}>
        <Ttl>Court Grid</Ttl>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          {dates.map((d,i)=>(
            <Btn key={i} v={aDi===i?"pri":"gh"} onClick={()=>setADi(i)} sx={{padding:"7px 14px",fontSize:12}}>{fmtD(d)}</Btn>
          ))}
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",minWidth:620,width:"100%"}}>
          <thead><tr>
            <th style={{padding:"10px 14px",color:C.gray,fontWeight:700,fontSize:11,textAlign:"left",
              borderBottom:`1px solid ${C.grayL}`,letterSpacing:"0.06em"}}>TIME</th>
            {COURTS.map(c=>(
              <th key={c} style={{padding:"10px 14px",borderBottom:`1px solid ${C.grayL}`,textAlign:"center"}}>
                <div style={{color:C.sky,fontWeight:800,fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.06em"}}>{c.toUpperCase()}</div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {used.map(slot=>(
              <tr key={slot} style={{borderBottom:`1px solid ${C.grayL}22`}}>
                <td style={{padding:"10px 14px",color:C.gold,fontWeight:800,fontSize:13,
                  whiteSpace:"nowrap",fontFamily:"'Barlow Condensed',sans-serif"}}>{slot}</td>
                {COURTS.map(court=>{
                  const game=dg.find(g=>g.court===court&&g.time===slot);
                  const div=game?tournament.divisions.find(d=>d.id===game.divisionId):null;
                  const col=div?dc(tournament.divisions.indexOf(div)):C.gray;
                  return (
                    <td key={court} style={{padding:"5px 7px",textAlign:"center",verticalAlign:"middle"}}>
                      {game?(
                        <div style={{background:C.navy,borderRadius:10,padding:"9px 10px",border:`1px solid ${col}55`}}>
                          {div&&<div style={{marginBottom:4}}><Badge c={col}>{dshort(div.gradeId,div.gender)}</Badge></div>}
                          <div style={{color:C.white,fontSize:11,fontWeight:600,lineHeight:1.5}}>
                            {tname(tournament.divisions,game.homeId)}<br/>
                            <span style={{color:C.gray,fontSize:10}}>vs</span><br/>
                            {tname(tournament.divisions,game.awayId)}
                          </div>
                          {game.status==="final"&&<div style={{color:C.green,fontWeight:800,fontSize:11,marginTop:3}}>{game.homeScore}–{game.awayScore}</div>}
                        </div>
                      ):<span style={{color:C.grayL,fontSize:18}}>·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!used.length&&<tr><td colSpan={5} style={{padding:"40px 0",textAlign:"center",color:C.gray}}>No games scheduled for this day</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ADMIN SETTINGS TAB ───────────────────────────────────────────────────────
function AdminSettings({logoUrl, onSaveLogoUrl}) {
  const [url,setUrl]=useState(logoUrl||"");
  const [preview,setPreview]=useState(logoUrl||"");
  const [saved,setSaved]=useState(false);
  const [fileErr,setFileErr]=useState(false);

  const handleFile=e=>{
    const file=e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith("image/")){setFileErr(true);return;}
    setFileErr(false);
    const reader=new FileReader();
    reader.onload=ev=>{
      setUrl(ev.target.result);
      setPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const save=()=>{
    onSaveLogoUrl(url);
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  };

  return (
    <div style={{maxWidth:520}}>
      <Ttl sub="Customize how your site looks to the public">Site Settings</Ttl>

      <Card sx={{marginBottom:16}}>
        <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",
          letterSpacing:"0.08em",marginBottom:18}}>🖼 Logo</div>

        {/* Current preview */}
        <div style={{background:C.navy,borderRadius:12,padding:24,textAlign:"center",
          marginBottom:20,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.gray,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",
            fontWeight:700,marginBottom:12}}>Current Logo Preview</div>
          {preview ? (
            <img src={preview} alt="Logo preview"
              style={{maxWidth:220,maxHeight:120,objectFit:"contain",borderRadius:8}}
              onError={e=>{e.target.style.display="none";}}
            />
          ) : (
            <div style={{padding:"20px 0"}}>
              <Logo sz={52} txt/>
              <div style={{color:C.gray,fontSize:12,marginTop:10}}>No logo set — using default</div>
            </div>
          )}
        </div>

        {/* Option 1: Upload file */}
        <div style={{marginBottom:20}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
            letterSpacing:"0.06em",marginBottom:10}}>Option 1 — Upload from your computer</div>
          <label style={{display:"block",background:C.navy,border:`2px dashed ${C.sky}66`,
            borderRadius:10,padding:"18px 20px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" onChange={handleFile}
              style={{display:"none"}}/>
            <div style={{fontSize:28,marginBottom:8}}>📁</div>
            <div style={{color:C.sky,fontWeight:700,fontSize:14}}>Click to choose a logo file</div>
            <div style={{color:C.gray,fontSize:12,marginTop:4}}>PNG, JPG, SVG — any image format</div>
          </label>
          {fileErr&&<div style={{color:C.red,fontSize:12,marginTop:6}}>Please select a valid image file</div>}
        </div>

        {/* Option 2: URL */}
        <div style={{marginBottom:20}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
            letterSpacing:"0.06em",marginBottom:10}}>Option 2 — Paste an image URL</div>
          <div style={{display:"flex",gap:10}}>
            <input value={url} onChange={e=>{setUrl(e.target.value);}}
              placeholder="https://yoursite.com/logo.png"
              style={{flex:1,background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                color:C.white,fontSize:13,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}/>
            <Btn v="gh" onClick={()=>setPreview(url)} sx={{padding:"11px 16px",fontSize:12,whiteSpace:"nowrap"}}>
              Preview
            </Btn>
          </div>
        </div>

        {/* Clear logo */}
        {(url||preview)&&(
          <button onClick={()=>{setUrl("");setPreview("");onSaveLogoUrl("");}}
            style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,
              borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,
              fontWeight:700,marginBottom:16,display:"block"}}>
            ✕ Remove logo (use default)
          </button>
        )}

        <Btn v="pri" onClick={save} sx={{width:"100%",padding:"13px 0",fontSize:14}}>
          {saved?"✓ Saved!":"Save Logo"}
        </Btn>

        <div style={{color:C.gray,fontSize:12,marginTop:14,lineHeight:1.6}}>
          <strong style={{color:C.white}}>Tip:</strong> For best results use a PNG with a transparent background, 
          at least 400px wide. After saving, refresh the public home page to see it.
        </div>
      </Card>

      <Card>
        <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",
          letterSpacing:"0.08em",marginBottom:14}}>🔑 Admin Password</div>
        <div style={{color:C.gray,fontSize:13,lineHeight:1.6}}>
          Your current admin password is set in the app code as <code style={{background:C.navy,padding:"2px 8px",borderRadius:4,color:C.white}}>Shoebox2026!</code>
          <br/><br/>
          To change it, open <code style={{background:C.navy,padding:"2px 8px",borderRadius:4,color:C.white}}>src/App.jsx</code> in 
          GitHub, find the line that says <code style={{background:C.navy,padding:"2px 8px",borderRadius:4,color:C.white}}>const ADMIN_PASSWORD</code> near 
          the top and change the value to whatever you want.
        </div>
      </Card>
    </div>
  );
}
function Admin({data,onScore,onUpdateGames,onAdd,logoUrl,onSaveLogoUrl}) {
  const [aTId,setATId]=useState(data.tournaments[0]?.id);
  const [tab,setTab]=useState("schedule");
  const [showCreate,setShowCreate]=useState(false);
  const t=data.tournaments.find(x=>x.id===aTId)||data.tournaments[0];
  const tabs=[{id:"schedule",icon:"📋",l:"Schedule"},{id:"standings",icon:"📊",l:"Standings"},{id:"bracket",icon:"🏆",l:"Bracket"},{id:"courts",icon:"🏟",l:"Courts"},{id:"settings",icon:"⚙️",l:"Settings"}];
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>
      <div style={{background:C.navyMid,borderBottom:`1px solid ${C.grayL}`,padding:"0 22px",position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 18px #00000044`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",height:58,maxWidth:1200,margin:"0 auto"}}>
          <Logo sz={34}/>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Badge c={C.green}>● Admin</Badge>
            <Btn v="org" onClick={()=>setShowCreate(true)} sx={{padding:"8px 16px",fontSize:12}}>+ New Tournament</Btn>
          </div>
        </div>
      </div>

      {data.tournaments.length>1&&(
        <div style={{background:C.navyLight,borderBottom:`1px solid ${C.grayL}`,padding:"0 22px",overflowX:"auto"}}>
          <div style={{display:"flex",gap:4,maxWidth:1200,margin:"0 auto",paddingTop:8}}>
            {data.tournaments.map(x=>(
              <button key={x.id} onClick={()=>{setATId(x.id);setTab("schedule");}} style={{
                padding:"8px 14px",background:aTId===x.id?C.sky+"22":"transparent",
                color:aTId===x.id?C.sky:C.gray,border:`1px solid ${aTId===x.id?C.sky+"66":"transparent"}`,
                borderBottom:"none",borderRadius:"8px 8px 0 0",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {t&&(
        <div style={{background:`linear-gradient(135deg,${C.navyLight},${C.navyMid})`,padding:"18px 22px 0",borderBottom:`1px solid ${C.grayL}`}}>
          <div style={{maxWidth:1200,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{color:C.white,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed',sans-serif"}}>{t.name}</div>
                <div style={{color:C.gray,fontSize:12,marginTop:5,display:"flex",gap:14,flexWrap:"wrap"}}>
                  <span>📅 {tDates(t).map(fmtD).join(" → ")}</span>
                  <span>🕐 First game: {t.startTime}</span>
                  <span>⏱ {t.gameDuration}min games</span>
                  <span>😴 {t.restGap===0?"No min rest":`${t.restGap/60}hr min rest`}</span>
                  <span>🏀 {t.divisions.reduce((s,d)=>s+d.teams.length,0)} teams</span>
                  <span>📋 {t.games.filter(g=>g.court).length}/{t.games.length} games scheduled</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {t.divisions.map((d,i)=><Badge key={d.id} c={dc(i)}>{dshort(d.gradeId,d.gender)}</Badge>)}
                </div>
              </div>
              <Badge c={t.status==="active"?C.green:t.status==="upcoming"?C.gold:C.gray}>{t.status}</Badge>
            </div>
            <div style={{display:"flex",gap:2,overflowX:"auto"}}>
              {tabs.map(x=>(
                <button key={x.id} onClick={()=>setTab(x.id)} style={{
                  padding:"9px 16px",background:tab===x.id?C.sky:"transparent",
                  color:tab===x.id?"#fff":C.gray,border:"none",borderRadius:"8px 8px 0 0",
                  cursor:"pointer",fontWeight:800,fontSize:13,whiteSpace:"nowrap",
                  fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",transition:"all 0.15s"}}>
                  {x.icon} {x.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{padding:22,maxWidth:1200,margin:"0 auto"}}>
        {tab==="settings"
          ? <AdminSettings logoUrl={logoUrl} onSaveLogoUrl={onSaveLogoUrl}/>
          : t?<>
          {tab==="schedule"&&<AdminSchedule tournament={t} onScore={onScore} onUpdateGames={g=>onUpdateGames(t.id,g)}/>}
          {tab==="standings"&&<AdminStandings tournament={t}/>}
          {tab==="bracket"&&<AdminBracket tournament={t}/>}
          {tab==="courts"&&<AdminCourts tournament={t}/>}
        </>:(
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:44,marginBottom:14}}>🏀</div>
            <div style={{color:C.white,fontWeight:800,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:10}}>No Tournaments Yet</div>
            <Btn v="org" onClick={()=>setShowCreate(true)}>+ Create Tournament</Btn>
          </div>
        )}
      </div>
      {showCreate&&<CreateModal onSave={x=>{onAdd(x);setATId(x.id);setTab("schedule");setShowCreate(false);}} onClose={()=>setShowCreate(false)}/>}
    </div>
  );
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "Shoebox2026!";
function AdminLogin({onSuccess}) {
  const [pw,setPw]=useState(""); const [err,setErr]=useState(false); const [show,setShow]=useState(false);
  const attempt=()=>{ if(pw===ADMIN_PASSWORD){onSuccess();}else{setErr(true);setPw("");setTimeout(()=>setErr(false),2000);} };
  return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:C.navyMid,borderRadius:20,padding:36,width:360,maxWidth:"100%",border:`1px solid ${C.grayL}`,boxShadow:`0 20px 60px #00000066`}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo sz={52} txt/>
          <div style={{color:C.gray,fontSize:13,marginTop:14}}>Admin access only</div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Password</div>
          <div style={{position:"relative"}}>
            <input type={show?"text":"password"} value={pw}
              onChange={e=>{setPw(e.target.value);setErr(false);}}
              onKeyDown={e=>e.key==="Enter"&&attempt()}
              placeholder="Enter admin password"
              style={{width:"100%",background:C.navy,border:`2px solid ${err?C.red:C.grayL}`,borderRadius:10,
                color:C.white,fontSize:15,padding:"13px 44px 13px 16px",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"}}/>
            <button onClick={()=>setShow(s=>!s)}
              style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:16}}>
              {show?"🙈":"👁"}
            </button>
          </div>
          {err&&<div style={{color:C.red,fontSize:12,marginTop:6,fontWeight:600}}>Incorrect password. Try again.</div>}
        </div>
        <Btn v="pri" onClick={attempt} sx={{width:"100%",padding:"13px 0",fontSize:15}}>Sign In to Admin</Btn>
        <div style={{textAlign:"center",marginTop:16}}>
          <span style={{color:C.gray,fontSize:12}}>Not an admin? </span>
          <a href="/" style={{color:C.sky,fontSize:12,fontWeight:700,textDecoration:"none"}}>Go to Public Site →</a>
        </div>
      </div>
    </div>
  );
}

// ─── PUBLIC HOME PAGE ─────────────────────────────────────────────────────────
function PublicHome({data, onSelectTournament, logoUrl}) {
  const active   = data.tournaments.filter(t=>t.status==="active");
  const upcoming = data.tournaments.filter(t=>t.status==="upcoming");
  const past     = data.tournaments.filter(t=>t.status==="complete");

  const TCard=({t})=>{
    const dates=tDates(t);
    const totalTeams=t.divisions.reduce((s,d)=>s+d.teams.length,0);
    const isLive=t.status==="active";
    const isUpcoming=t.status==="upcoming";
    return (
      <div onClick={()=>onSelectTournament(t.id)}
        style={{background:C.navyMid,borderRadius:16,border:`1px solid ${isLive?C.green+"66":C.grayL}`,
          padding:20,marginBottom:14,cursor:"pointer",
          boxShadow:isLive?`0 0 20px ${C.green}22`:"0 2px 12px #00000033",
          transition:"transform 0.15s",userSelect:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,paddingRight:10}}>
            <div style={{color:C.white,fontWeight:900,fontSize:19,
              fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"-0.01em",marginBottom:5}}>
              {t.name}
            </div>
            <div style={{color:C.gray,fontSize:13,marginBottom:4}}>
              📅 {dates.map(fmtD).join(" → ")}
            </div>
            <div style={{color:C.gray,fontSize:12}}>📍 {t.location}</div>
          </div>
          <Badge c={isLive?C.green:isUpcoming?C.gold:C.gray}>
            {isLive?"● Live":isUpcoming?"Upcoming":"Complete"}
          </Badge>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          paddingTop:12,borderTop:`1px solid ${C.grayL}`}}>
          <div style={{color:C.gray,fontSize:12}}>
            🏀 {totalTeams} teams · {t.divisions.length} division{t.divisions.length!==1?"s":""}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {t.divisions.slice(0,4).map((d,i)=>(
              <Badge key={d.id} c={dc(i)}>{dshort(d.gradeId,d.gender)}</Badge>
            ))}
            {t.divisions.length>4&&<Badge c={C.gray}>+{t.divisions.length-4}</Badge>}
          </div>
        </div>
        <div style={{marginTop:12,color:C.sky,fontSize:12,fontWeight:700,textAlign:"right"}}>
          View Schedule & Scores →
        </div>
      </div>
    );
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      {/* Hero Header */}
      <div style={{background:`linear-gradient(160deg,${C.navyLight} 0%,${C.navy} 100%)`,
        padding:"40px 20px 32px",textAlign:"center",
        borderBottom:`1px solid ${C.grayL}`}}>
        {/* Logo — custom if set, otherwise SVG default */}
        {logoUrl ? (
          <img src={logoUrl} alt="Shoebox Sports"
            style={{maxWidth:240,maxHeight:140,objectFit:"contain",marginBottom:16,display:"block",margin:"0 auto 16px"}}
            onError={e=>{e.target.style.display="none";}}
          />
        ) : (
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
            <Logo sz={52} txt/>
          </div>
        )}
        <div style={{color:C.sky,fontSize:12,fontWeight:700,letterSpacing:"0.12em",
          textTransform:"uppercase",marginTop:8}}>Tournament Hub</div>
        <div style={{color:C.gray,fontSize:13,marginTop:6}}>
          Fenton, MI · Youth Basketball
        </div>
      </div>

      <div style={{padding:"20px 16px"}}>
        {/* Live tournaments */}
        {active.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.green,
              boxShadow:`0 0 8px ${C.green}`}}/>
            <div style={{color:C.green,fontWeight:800,fontSize:13,textTransform:"uppercase",
              letterSpacing:"0.08em",fontFamily:"'Barlow Condensed',sans-serif"}}>Happening Now</div>
          </div>
          {active.map(t=><TCard key={t.id} t={t}/>)}
        </>}

        {/* Upcoming tournaments */}
        {upcoming.length>0&&<>
          <div style={{color:C.gold,fontWeight:800,fontSize:13,textTransform:"uppercase",
            letterSpacing:"0.08em",fontFamily:"'Barlow Condensed',sans-serif",
            marginBottom:14,marginTop:active.length>0?20:0}}>Upcoming Tournaments</div>
          {upcoming.map(t=><TCard key={t.id} t={t}/>)}
        </>}

        {/* Past tournaments */}
        {past.length>0&&<>
          <div style={{color:C.gray,fontWeight:800,fontSize:13,textTransform:"uppercase",
            letterSpacing:"0.08em",fontFamily:"'Barlow Condensed',sans-serif",
            marginBottom:14,marginTop:20}}>Past Tournaments</div>
          {past.map(t=><TCard key={t.id} t={t}/>)}
        </>}

        {data.tournaments.length===0&&(
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:44,marginBottom:14}}>🏀</div>
            <div style={{color:C.white,fontWeight:800,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
              No Tournaments Yet
            </div>
            <div style={{color:C.gray,fontSize:14}}>Check back soon for upcoming events!</div>
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:"center",padding:"30px 0 20px",borderTop:`1px solid ${C.grayL}`,marginTop:20}}>
          <div style={{color:C.gray,fontSize:12}}>© 2026 Shoebox Sports · Fenton, MI</div>
          <a href="https://theshoeboxsports.com" style={{color:C.sky,fontSize:12,marginTop:4,display:"block",textDecoration:"none"}}>
            theshoeboxsports.com
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── PUBLIC TOURNAMENT DETAIL ─────────────────────────────────────────────────
function PublicTournament({tournament, onBack}) {
  const [aDiv,setADiv]=useState(tournament.divisions[0]?.id);
  const [search,setSearch]=useState("");
  const [selTeam,setSelTeam]=useState(null);
  const [tab,setTab]=useState("schedule");
  const aDivObj=tournament.divisions.find(d=>d.id===aDiv);
  const aDivIdx=tournament.divisions.indexOf(aDivObj);
  const dates=tDates(tournament);
  const allTeams=tournament.divisions.flatMap(d=>d.teams.map(tm=>({...tm,division:d})));
  const filtered=search.length>1?allTeams.filter(x=>x.name.toLowerCase().includes(search.toLowerCase())):[];

  const tabs=[{id:"schedule",l:"Schedule"},{id:"standings",l:"Standings"},{id:"bracket",l:"Bracket"}];

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(160deg,${C.navyLight},${C.navyMid})`,
        padding:"20px 16px 0",borderBottom:`1px solid ${C.grayL}`}}>
        <button onClick={onBack}
          style={{background:"transparent",border:"none",color:C.sky,cursor:"pointer",
            fontSize:13,fontWeight:700,marginBottom:14,padding:0,display:"flex",alignItems:"center",gap:6}}>
          ← Back to Tournaments
        </button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{color:C.white,fontWeight:900,fontSize:22,
              fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"-0.01em"}}>{tournament.name}</div>
            <div style={{color:C.gray,fontSize:12,marginTop:4}}>
              📅 {dates.map(fmtD).join(" → ")} · 📍 {tournament.location}
            </div>
          </div>
          <Badge c={tournament.status==="active"?C.green:tournament.status==="upcoming"?C.gold:C.gray}>
            {tournament.status==="active"?"● Live":tournament.status==="upcoming"?"Upcoming":"Complete"}
          </Badge>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"9px 16px",background:tab===t.id?C.sky:"transparent",
              color:tab===t.id?"#fff":C.gray,border:"none",borderRadius:"8px 8px 0 0",
              cursor:"pointer",fontWeight:800,fontSize:13,
              fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px"}}>
        {/* Team search — always visible */}
        <Card sx={{marginBottom:16}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:C.gray}}>🔍</span>
            <input placeholder="Search your team..." value={search}
              onChange={e=>{setSearch(e.target.value);setSelTeam(null);}}
              style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:10,
                color:C.white,fontSize:14,padding:"11px 14px 11px 40px",
                outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
          {filtered.length>0&&(
            <div style={{marginTop:8,borderRadius:10,overflow:"hidden",border:`1px solid ${C.grayL}`}}>
              {filtered.map((x,i)=>(
                <div key={`${x.id}-${x.division.id}`}
                  onClick={()=>{setSelTeam(x);setSearch("");}}
                  style={{padding:"12px 14px",cursor:"pointer",background:C.navy,color:C.white,
                    fontSize:14,fontWeight:600,borderTop:i>0?`1px solid ${C.grayL}`:"none",
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  🏀 {x.name}
                  <div style={{display:"flex",gap:6}}>
                    <Badge c={dc(tournament.divisions.indexOf(x.division))}>{dshort(x.division.gradeId,x.division.gender)}</Badge>
                    <span style={{color:C.gray,fontSize:11}}>Pool {x.pool}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Selected team games */}
        {selTeam&&(()=>{
          const div=selTeam.division, col=dc(tournament.divisions.indexOf(div));
          const games=tournament.games.filter(g=>g.divisionId===div.id&&(g.homeId===selTeam.id||g.awayId===selTeam.id)&&g.court);
          return (
            <Card sx={{marginBottom:16,border:`1px solid ${col}44`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <Badge c={col} sx={{marginBottom:6}}>{dlabel(div.gradeId,div.gender)}</Badge>
                  <div style={{color:C.white,fontWeight:800,fontSize:18,
                    fontFamily:"'Barlow Condensed',sans-serif",marginTop:5}}>{selTeam.name}</div>
                </div>
                <button onClick={()=>setSelTeam(null)}
                  style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                    borderRadius:8,padding:"6px 11px",cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[{l:"Wins",v:selTeam.wins,c:C.green},{l:"Losses",v:selTeam.losses,c:C.red}].map(({l,v,c})=>(
                  <div key={l} style={{textAlign:"center",background:C.navy,borderRadius:12,padding:13}}>
                    <div style={{fontSize:30,fontWeight:900,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
                    <div style={{color:C.gray,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>{l}</div>
                  </div>
                ))}
              </div>
              {games.length===0&&<div style={{color:C.gray,fontSize:13,textAlign:"center",padding:"10px 0"}}>No scheduled games yet</div>}
              {games.map(game=>{
                const isH=game.homeId===selTeam.id, mySc=isH?game.homeScore:game.awayScore, oppSc=isH?game.awayScore:game.homeScore;
                const won=mySc!==null&&mySc>oppSc;
                return (
                  <div key={game.id} style={{background:C.navy,borderRadius:12,padding:"13px 14px",marginBottom:7,
                    border:`1px solid ${game.phase==="bracket"?col+"55":C.grayL}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                      <span style={{color:C.sky,fontWeight:800,fontSize:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                        {game.dayIdx!==undefined?fmtD(dates[game.dayIdx]):"—"} · {game.time} · {game.court}
                      </span>
                      {game.phase==="pool"?<Badge c={C.gold}>Pool {game.pool}</Badge>:<Badge c={col}>{game.round}</Badge>}
                    </div>
                    <div style={{color:C.gray,fontSize:13}}>vs <span style={{color:C.white,fontWeight:700}}>{tname(tournament.divisions,isH?game.awayId:game.homeId)}</span></div>
                    {game.status==="final"?(
                      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:9}}>
                        <span style={{fontSize:26,fontWeight:900,color:won?C.green:C.red,fontFamily:"'Barlow Condensed',sans-serif"}}>{mySc}</span>
                        <span style={{color:C.gray}}>–</span>
                        <span style={{fontSize:26,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif"}}>{oppSc}</span>
                        <Badge c={won?C.green:C.red}>{won?"WIN":"LOSS"}</Badge>
                      </div>
                    ):<div style={{marginTop:7}}><Badge c={C.gold}>Upcoming</Badge></div>}
                  </div>
                );
              })}
            </Card>
          );
        })()}

        {/* ── SCHEDULE TAB ── */}
        {tab==="schedule"&&(()=>{
          const scheduled=[...tournament.games].filter(g=>g.court&&g.time).sort((a,b)=>a.dayIdx-b.dayIdx||toMins(a.time)-toMins(b.time));
          return (
            <div>
              {dates.map((date,di)=>{
                const dg=scheduled.filter(g=>g.dayIdx===di); if(!dg.length) return null;
                return (
                  <div key={di} style={{marginBottom:22}}>
                    <div style={{color:C.gold,fontWeight:800,fontSize:13,textTransform:"uppercase",
                      letterSpacing:"0.08em",fontFamily:"'Barlow Condensed',sans-serif",marginBottom:12}}>{fmtD(date)}</div>
                    {dg.map(game=>{
                      const div=tournament.divisions.find(d=>d.id===game.divisionId);
                      const col=div?dc(tournament.divisions.indexOf(div)):C.gray;
                      return (
                        <div key={game.id} style={{background:C.navyMid,borderRadius:12,padding:"13px 16px",
                          marginBottom:8,border:`1px solid ${C.grayL}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{color:C.sky,fontWeight:800,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>
                              {game.time} · {game.court}
                            </span>
                            <div style={{display:"flex",gap:4}}>
                              {div&&<Badge c={col}>{dshort(div.gradeId,div.gender)}</Badge>}
                              {game.phase==="pool"?<Badge c={C.gold}>Pool {game.pool}</Badge>:<Badge c={C.light}>{game.round}</Badge>}
                            </div>
                          </div>
                          <div style={{color:C.white,fontWeight:700,fontSize:14}}>
                            {tname(tournament.divisions,game.homeId)}
                            <span style={{color:C.gray,margin:"0 8px",fontWeight:400}}>vs</span>
                            {tname(tournament.divisions,game.awayId)}
                          </div>
                          {game.status==="final"&&(
                            <div style={{marginTop:8,display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:22,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif"}}>
                                {game.homeScore} – {game.awayScore}
                              </span>
                              <Badge c={C.green}>Final</Badge>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {scheduled.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.gray}}>Schedule not yet posted</div>}
            </div>
          );
        })()}

        {/* ── STANDINGS TAB ── */}
        {tab==="standings"&&(
          <div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {tournament.divisions.map((d,i)=>(
                <button key={d.id} onClick={()=>setADiv(d.id)} style={{padding:"6px 11px",borderRadius:8,
                  border:`1px solid ${aDiv===d.id?dc(i):C.grayL}`,background:aDiv===d.id?dc(i)+"22":"transparent",
                  color:aDiv===d.id?dc(i):C.gray,cursor:"pointer",fontWeight:700,fontSize:12,
                  fontFamily:"'Barlow Condensed',sans-serif"}}>{dshort(d.gradeId,d.gender)}</button>
              ))}
            </div>
            {aDivObj&&[...new Set(aDivObj.teams.map(t=>t.pool))].sort().map(pool=>(
              <Card key={pool} sx={{marginBottom:14}}>
                <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",
                  letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>Pool {pool}</div>
                {poolSort(aDivObj.teams,pool).map((tm,i)=>(
                  <div key={tm.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",
                    borderTop:i>0?`1px solid ${C.grayL}`:"none"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                      background:i===0?C.gold:i===1?`linear-gradient(135deg,${C.sky},${C.light})`:C.grayL,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.navy}}>
                      {i===0?"★":i===1?"▲":i+1}
                    </div>
                    <div style={{flex:1,color:C.white,fontSize:13,fontWeight:600}}>{tm.name}</div>
                    <span style={{color:C.green,fontWeight:800,fontSize:13}}>{tm.wins}W</span>
                    <span style={{color:C.red,fontWeight:800,fontSize:13,marginLeft:8}}>{tm.losses}L</span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}

        {/* ── BRACKET TAB ── */}
        {tab==="bracket"&&(
          <div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {tournament.divisions.map((d,i)=>(
                <button key={d.id} onClick={()=>setADiv(d.id)} style={{padding:"6px 11px",borderRadius:8,
                  border:`1px solid ${aDiv===d.id?dc(i):C.grayL}`,background:aDiv===d.id?dc(i)+"22":"transparent",
                  color:aDiv===d.id?dc(i):C.gray,cursor:"pointer",fontWeight:700,fontSize:12,
                  fontFamily:"'Barlow Condensed',sans-serif"}}>{dshort(d.gradeId,d.gender)}</button>
              ))}
            </div>
            {tournament.games.filter(g=>g.divisionId===aDiv&&g.phase==="bracket"&&g.court).map(game=>{
              const col=dc(aDivIdx);
              return (
                <Card key={game.id} sx={{marginBottom:10,border:`1px solid ${game.round==="Final"?C.gold+"66":C.grayL}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{color:C.sky,fontWeight:800,fontSize:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                      {fmtD(dates[game.dayIdx])} · {game.time} · {game.court}
                    </span>
                    <Badge c={game.round==="Final"?C.gold:col}>{game.round}</Badge>
                  </div>
                  <div style={{color:C.white,fontWeight:700,fontSize:15}}>
                    {tname(tournament.divisions,game.homeId)}
                    <span style={{color:C.gray,margin:"0 8px",fontWeight:400}}>vs</span>
                    {tname(tournament.divisions,game.awayId)}
                  </div>
                  {game.status==="final"&&(
                    <div style={{marginTop:10,fontWeight:900,fontSize:22,
                      fontFamily:"'Barlow Condensed',sans-serif",color:C.gold}}>
                      {game.homeScore} – {game.awayScore}
                      {game.round==="Final"&&<span style={{fontSize:16,marginLeft:10}}>🏆 Champions</span>}
                    </div>
                  )}
                </Card>
              );
            })}
            {tournament.games.filter(g=>g.divisionId===aDiv&&g.phase==="bracket").every(g=>!g.court)&&(
              <div style={{textAlign:"center",padding:"40px 0",color:C.gray}}>
                Bracket will be posted after pool play
              </div>
            )}
          </div>
        )}

        <div style={{height:40}}/>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,setData]           = useState(()=>buildSeed());
  const [adminAuth,setAdminAuth] = useState(false);
  const [showAdminLogin,setShowAdminLogin] = useState(false);
  const [selectedTId,setSelectedTId]       = useState(null);
  const [logoUrl,setLogoUrl]               = useState("https://raw.githubusercontent.com/nbrown2423/Shoebox-sports/main/logo.jpg");

  useEffect(()=>{
    const l=document.createElement("link");
    l.href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap";
    l.rel="stylesheet"; document.head.appendChild(l);
  },[]);

  const onScore=(gId,h,a)=>setData(d=>({
    ...d,
    tournaments: d.tournaments.map(t=>{
      const gamesAfterScore=t.games.map(g=>g.id===gId?{...g,homeScore:h,awayScore:a,status:"final"}:g);
      const divisions=t.divisions.map(div=>{
        const teams=div.teams.map(tm=>({...tm,wins:0,losses:0,pf:0,pa:0}));
        gamesAfterScore.filter(g=>g.divisionId===div.id&&g.phase==="pool"&&g.status==="final").forEach(g=>{
          const ht=teams.find(x=>x.id===g.homeId), at=teams.find(x=>x.id===g.awayId);
          if(!ht||!at) return;
          ht.pf+=g.homeScore; ht.pa+=g.awayScore; at.pf+=g.awayScore; at.pa+=g.homeScore;
          if(g.homeScore>g.awayScore){ht.wins++;at.losses++;}else{at.wins++;ht.losses++;}
        });
        return {...div,teams};
      });
      return {...t,divisions,games:seedBracket(divisions,gamesAfterScore)};
    })
  }));
  const onUpdateGames=(tId,games)=>setData(d=>({...d,tournaments:d.tournaments.map(t=>t.id===tId?{...t,games}:t)}));
  const onAdd=t=>setData(d=>({...d,tournaments:[...d.tournaments,t]}));

  // Admin login screen
  if (showAdminLogin && !adminAuth) {
    return <AdminLogin onSuccess={()=>{setAdminAuth(true);setShowAdminLogin(false);}}/>;
  }

  // Admin dashboard (password protected)
  if (adminAuth) {
    return (
      <div style={{background:C.navy,minHeight:"100vh"}}>
        <Admin data={data} onScore={onScore} onUpdateGames={onUpdateGames} onAdd={onAdd} logoUrl={logoUrl} onSaveLogoUrl={setLogoUrl}/>
        {/* Admin logout button */}
        <button onClick={()=>setAdminAuth(false)}
          style={{position:"fixed",bottom:18,right:18,zIndex:999,
            background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:50,
            padding:"8px 18px",color:C.gray,cursor:"pointer",fontWeight:700,fontSize:12,
            fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.06em",
            boxShadow:`0 4px 20px #00000055`}}>
          🔒 Sign Out
        </button>
      </div>
    );
  }

  // Public: tournament detail
  if (selectedTId) {
    const t=data.tournaments.find(x=>x.id===selectedTId);
    if (t) return (
      <div style={{background:C.navy,minHeight:"100vh"}}>
        <PublicTournament tournament={t} onBack={()=>setSelectedTId(null)}/>
      </div>
    );
  }

  // Public: home page
  return (
    <div style={{background:C.navy,minHeight:"100vh"}}>
      <PublicHome data={data} onSelectTournament={id=>setSelectedTId(id)} logoUrl={logoUrl}/>
      {/* Hidden admin access — small link in footer */}
      <div style={{textAlign:"center",paddingBottom:20}}>
        <button onClick={()=>setShowAdminLogin(true)}
          style={{background:"transparent",border:"none",color:C.grayL,
            cursor:"pointer",fontSize:11,fontFamily:"'DM Sans',sans-serif"}}>
          Admin Login
        </button>
      </div>
    </div>
  );
}
