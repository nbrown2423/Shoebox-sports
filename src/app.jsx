import { useState, useEffect, useRef } from "react";

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
// ─── 3V3 CONSTANTS ────────────────────────────────────────────────────────────
const COURTS_5V5 = ["Court 1","Court 2","Court 3","Court 4"];
const COURTS_3V3 = ["Court 1","Court 2","Court 3","Court 4","Court 5","Court 6","Court 7","Court 8"];
const GAME_DURATION_3V3 = 15;

// ─── 3V3 MATCHUP GENERATOR ───────────────────────────────────────────────────
// 8 teams, 2 pools of 4. Each team plays gamesPerTeam pool games.
// Bracket: top 4 from each pool → quarterfinals (8 teams, seeded 1v8,2v7,3v6,4v5)
// Then semis → final. Single elimination throughout.
function gen3v3Matchups(divs, gamesPerTeam=3) {
  let gid = Date.now();
  const games = [];
  divs.forEach(div => {
    const poolA = div.teams.filter(t=>t.pool==="A");
    const poolB = div.teams.filter(t=>t.pool==="B");

    // Pool play — round robin subset for each pool
    [["A",poolA],["B",poolB]].forEach(([pool,pts])=>{
      if(!pts.length) return;
      const used = new Set();
      pts.forEach((team,idx)=>{
        let count=0;
        for(let j=1; j<=pts.length-1&&count<gamesPerTeam; j++){
          const oppIdx=(idx+j)%pts.length;
          const opp=pts[oppIdx];
          const pairKey=[team.id,opp.id].sort().join("-");
          if(!used.has(pairKey)){
            used.add(pairKey);
            games.push({id:gid++,divisionId:div.id,phase:"pool",pool,
              homeId:team.id,awayId:opp.id,
              dayIdx:null,court:null,time:null,
              homeScore:null,awayScore:null,status:"upcoming"});
            count++;
          }
        }
      });
    });

    // Bracket shells: 4 quarterfinals (1v8, 2v7, 3v6, 4v5), 2 semis, 1 final
    // Seeded after pool play: A1,A2,A3,A4 + B1,B2,B3,B4
    // QF matchups: seed1vseed8, seed2vseed7, seed3vseed6, seed4vseed5
    const qfMatchups = [["QF1","1v8"],["QF2","2v7"],["QF3","3v6"],["QF4","4v5"]];
    qfMatchups.forEach(([round])=>{
      games.push({id:gid++,divisionId:div.id,phase:"bracket",round,
        homeId:null,awayId:null,dayIdx:null,court:null,time:null,
        homeScore:null,awayScore:null,status:"upcoming"});
    });
    // Semis: winners of QF1/QF4 and QF2/QF3
    ["Semi1","Semi2"].forEach(round=>{
      games.push({id:gid++,divisionId:div.id,phase:"bracket",round,
        homeId:null,awayId:null,dayIdx:null,court:null,time:null,
        homeScore:null,awayScore:null,status:"upcoming"});
    });
    // Final
    games.push({id:gid++,divisionId:div.id,phase:"bracket",round:"Final",
      homeId:null,awayId:null,dayIdx:null,court:null,time:null,
      homeScore:null,awayScore:null,status:"upcoming"});
  });
  return games;
}

// ─── 3V3 BRACKET SEEDER ──────────────────────────────────────────────────────
function seed3v3Bracket(divisions, games) {
  const result = [...games];
  divisions.forEach(div=>{
    const poolGames = result.filter(g=>g.divisionId===div.id&&g.phase==="pool");
    const allPoolDone = poolGames.length>0&&poolGames.every(g=>g.status==="final");
    if(!allPoolDone) return;

    // Build standings per pool
    const standingsFor=(pool)=>{
      const teams=div.teams.filter(t=>t.pool===pool);
      const stats={};
      teams.forEach(t=>{stats[t.id]={id:t.id,wins:0,losses:0,pf:0,pa:0};});
      poolGames.filter(g=>g.pool===pool&&g.status==="final").forEach(g=>{
        if(stats[g.homeId]){stats[g.homeId].pf+=g.homeScore;stats[g.homeId].pa+=g.awayScore;}
        if(stats[g.awayId]){stats[g.awayId].pf+=g.awayScore;stats[g.awayId].pa+=g.homeScore;}
        if(g.homeScore>g.awayScore){if(stats[g.homeId])stats[g.homeId].wins++;if(stats[g.awayId])stats[g.awayId].losses++;}
        else{if(stats[g.awayId])stats[g.awayId].wins++;if(stats[g.homeId])stats[g.homeId].losses++;}
      });
      return Object.values(stats).sort((a,b)=>b.wins-a.wins||(b.pf-b.pa)-(a.pf-a.pa));
    };

    const sA=standingsFor("A"); // A1,A2,A3,A4
    const sB=standingsFor("B"); // B1,B2,B3,B4

    // Overall seeds 1-8: A1,B1,A2,B2,A3,B3,A4,B4
    const seeds=[
      sA[0],sB[0],sA[1],sB[1],sA[2],sB[2],sA[3],sB[3]
    ].filter(Boolean).map(s=>s?.id);

    // QF pairings: 1v8, 2v7, 3v6, 4v5
    const qfPairs=[
      [seeds[0],seeds[7]],[seeds[1],seeds[6]],[seeds[2],seeds[5]],[seeds[3],seeds[4]]
    ];
    const qfRounds=["QF1","QF2","QF3","QF4"];
    const divBracket=result.filter(g=>g.divisionId===div.id&&g.phase==="bracket");
    const qfGames=divBracket.filter(g=>qfRounds.includes(g.round));
    qfGames.forEach((g,i)=>{
      const gi=result.findIndex(x=>x.id===g.id);
      if(gi>=0){
        result[gi]={...result[gi],homeId:qfPairs[i]?.[0]||null,awayId:qfPairs[i]?.[1]||null};
      }
    });

    // Seed semis from QF results
    const qfResults=qfRounds.map(r=>result.find(g=>g.divisionId===div.id&&g.round===r));
    const getWinner=(g)=>!g||g.status!=="final"?null:g.homeScore>g.awayScore?g.homeId:g.awayId;
    const semi1Game=result.find(g=>g.divisionId===div.id&&g.round==="Semi1");
    const semi2Game=result.find(g=>g.divisionId===div.id&&g.round==="Semi2");
    const allQFDone=qfResults.every(g=>g?.status==="final");
    if(allQFDone){
      if(semi1Game){
        const i=result.findIndex(x=>x.id===semi1Game.id);
        result[i]={...result[i],homeId:getWinner(qfResults[0]),awayId:getWinner(qfResults[3])};
      }
      if(semi2Game){
        const i=result.findIndex(x=>x.id===semi2Game.id);
        result[i]={...result[i],homeId:getWinner(qfResults[1]),awayId:getWinner(qfResults[2])};
      }
    }

    // Seed final from semis
    const finalGame=result.find(g=>g.divisionId===div.id&&g.round==="Final");
    const allSemiDone=semi1Game?.status==="final"&&semi2Game?.status==="final";
    if(allSemiDone&&finalGame){
      const i=result.findIndex(x=>x.id===finalGame.id);
      result[i]={...result[i],homeId:getWinner(semi1Game),awayId:getWinner(semi2Game)};
    }
  });
  return result;
}

function genMatchups(divs, gamesPerTeam=null) {
  let gid = Date.now();
  const games = [];
  divs.forEach(div => {
    const pools = {};
    div.teams.forEach(t => { if (!pools[t.pool]) pools[t.pool]=[]; pools[t.pool].push(t); });
    // Pool play matchups
    Object.entries(pools).forEach(([pool, pts]) => {
      if (gamesPerTeam && gamesPerTeam < pts.length - 1) {
        // Limit games per team — each team plays exactly gamesPerTeam games
        // Use round-robin subset: pair each team with the next N opponents
        const used = new Set();
        pts.forEach((team, idx) => {
          let count = 0;
          for (let j = 1; j <= pts.length - 1 && count < gamesPerTeam; j++) {
            const oppIdx = (idx + j) % pts.length;
            const opp = pts[oppIdx];
            const pairKey = [team.id, opp.id].sort().join("-");
            if (!used.has(pairKey)) {
              used.add(pairKey);
              games.push({ id:gid++, divisionId:div.id, phase:"pool", pool,
                homeId:team.id, awayId:opp.id,
                dayIdx:null, court:null, time:null,
                homeScore:null, awayScore:null, status:"upcoming" });
              count++;
            }
          }
        });
      } else {
        // Full round robin — every team plays every other team once
        for (let i=0; i<pts.length; i++) for (let j=i+1; j<pts.length; j++)
          games.push({ id:gid++, divisionId:div.id, phase:"pool", pool,
            homeId:pts[i].id, awayId:pts[j].id,
            dayIdx:null, court:null, time:null,
            homeScore:null, awayScore:null, status:"upcoming" });
      }
    });
    // Bracket shells — single elimination
    const nPools = Object.keys(pools).length;
    const nSemis = Math.min(nPools, 2);
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
    startTime:"8:00 AM", gameDuration:60,
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
    danger:{background:C.red+"22",color:C.red,border:`1px solid ${C.red}44`},
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
  const is3v3   = tournament.type === "3v3";
  const COURTS  = is3v3 ? COURTS_3V3 : COURTS_5V5;
  const slots   = buildSlots(tournament.startTime, is3v3?48:24, tournament.gameDuration);

  const [games,   setGames]   = useState(initialGames.map(g=>({...g})));
  const [dayIdx,  setDayIdx]  = useState(0);
  const [drag,    setDrag]    = useState(null);
  const [over,    setOver]    = useState(null);
  const [fDiv,    setFDiv]    = useState("all");

  const viols = new Set(); // rest gap removed — manual scheduling

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

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [expandedDivs, setExpandedDivs] = useState(()=>{
    const init={};
    tournament.divisions.forEach(d=>{ init[d.id]=true; });
    return init;
  });
  const toggleDiv=(id)=>setExpandedDivs(prev=>({...prev,[id]:!prev[id]}));

  const resetSchedule = () => {
    setGames(prev => prev.map(g => ({...g, dayIdx:null, court:null, time:null})));
    setShowResetConfirm(false);
  };

  // Drop onto sidebar = unplace the game
  // We use a ref to track drag id because onDragEnd fires before onDrop in some browsers
  const dragRef = useRef(null);

  const dropOnSidebar = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = dragRef.current || drag;
    if (!id) return;
    unplace(id);
    dragRef.current = null;
    setDrag(null);
    setOver(null);
  };

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
        onDragStart={e=>{
          dragRef.current=game.id;
          setDrag(game.id);
          e.dataTransfer.effectAllowed="move";
          e.dataTransfer.setData("text/plain", String(game.id));
        }}
        onDragEnd={e=>{
          // Small delay so onDrop fires first
          setTimeout(()=>{
            dragRef.current=null;
            setDrag(null);
            setOver(null);
          }, 50);
        }}
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
          <Btn v="danger" onClick={()=>setShowResetConfirm(true)} sx={{padding:"8px 14px",fontSize:12}}>🔄 Reset</Btn>
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
          Drag games from sidebar → grid to schedule · Drag from grid → sidebar to unschedule.
        </span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginLeft:"auto"}}>
          {tournament.divisions.map((d,i)=><Badge key={d.id} c={dc(i)}>{dshort(d.gradeId,d.gender)}</Badge>)}
        </div>
      </div>

      {/* Main: sidebar + grid */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── Unscheduled sidebar — also a drop target to unschedule ── */}
        <div
          onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
          onDrop={dropOnSidebar}
          style={{width:240,background:drag?C.navy+"ee":C.navy,
            borderRight:`1px solid ${C.grayL}`,
            overflowY:"auto",padding:"12px 10px",flexShrink:0,
            border:drag?`2px dashed ${C.sky}66`:"2px solid transparent",
            transition:"border 0.15s",boxSizing:"border-box"}}>

          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:C.gold,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em"}}>
              Unscheduled
            </div>
            <div style={{color:C.gray,fontSize:11}}>{unplaced.length} left</div>
          </div>

          {/* Drop hint when dragging a placed game */}
          {drag&&games.find(g=>g.id===drag)?.court&&(
            <div style={{background:C.sky+"18",border:`1px dashed ${C.sky}`,borderRadius:10,
              padding:"10px 12px",marginBottom:10,textAlign:"center",color:C.sky,fontSize:12,fontWeight:700}}>
              ↩ Drop here to unschedule
            </div>
          )}

          {/* Division dropdowns */}
          {tournament.divisions.map((div,di)=>{
            const col = dc(di);
            const divAllGames = games.filter(g=>g.divisionId===div.id);
            const divUnplaced = unplaced.filter(g=>g.divisionId===div.id);
            const divPlaced   = divAllGames.length - divUnplaced.length;
            const isOpen      = expandedDivs[div.id];
            return (
              <div key={div.id} style={{marginBottom:8,borderRadius:10,overflow:"hidden",border:`1px solid ${col}44`}}>
                {/* Division header — click to expand/collapse */}
                <button onClick={()=>toggleDiv(div.id)}
                  style={{width:"100%",background:col+"22",border:"none",cursor:"pointer",
                    padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:col,fontWeight:900,fontSize:11}}>{isOpen?"▾":"▸"}</span>
                    <span style={{color:col,fontWeight:800,fontSize:12,
                      fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      {dshort(div.gradeId,div.gender)}
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {divUnplaced.length>0
                      ? <span style={{background:col+"33",color:col,borderRadius:50,
                          padding:"1px 8px",fontSize:10,fontWeight:800}}>{divUnplaced.length}</span>
                      : <span style={{color:C.green,fontSize:11,fontWeight:700}}>✓</span>}
                    <span style={{color:C.gray,fontSize:10}}>{divPlaced}/{divAllGames.length}</span>
                  </div>
                </button>

                {/* Games list — shown when expanded */}
                {isOpen&&(
                  <div style={{background:C.navy,padding:"8px"}}>
                    {divUnplaced.length===0?(
                      <div style={{color:C.green,fontSize:11,fontWeight:700,textAlign:"center",padding:"8px 0"}}>
                        ✓ All placed
                      </div>
                    ):(
                      divUnplaced.map(g=>(
                        <div key={g.id} style={{marginBottom:6}}>{gameCard(g,false)}</div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {unplaced.length===0&&!drag&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:26,marginBottom:6}}>🎉</div>
              <div style={{color:C.green,fontSize:13,fontWeight:700}}>All games scheduled!</div>
              <div style={{color:C.gray,fontSize:10,marginTop:4}}>Drag any game here to unschedule</div>
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

      {/* Reset confirmation modal */}
      {showResetConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:32,width:360,maxWidth:"100%",
            border:`1px solid ${C.red}55`,textAlign:"center",boxShadow:`0 20px 60px #00000088`}}>
            <div style={{fontSize:36,marginBottom:12}}>🔄</div>
            <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
              Reset Schedule?
            </div>
            <div style={{color:C.gray,fontSize:14,marginBottom:24,lineHeight:1.5}}>
              All games will be moved back to the unscheduled sidebar. Your matchups are kept — you just start placing them from scratch.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setShowResetConfirm(false)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="danger" onClick={resetSchedule} sx={{flex:1}}>Yes, Reset</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CREATE TOURNAMENT MODAL ──────────────────────────────────────────────────
function CreateModal({onSave, onClose}) {
  const [step,    setStep]    = useState(0); // 0=type select, 1=details, 2=divs, 3=counts
  const [type,    setType]    = useState(""); // "5v5" or "3v3"
  const [form,    setForm]    = useState({
    name:"", startDate:"", regCloseDate:"", numDays:"1",
    startTime:"8:00 AM", gameDuration:"60",
    location:"Shoebox Sports - Fenton, MI",
  });
  const [selDivs,   setSelDivs]   = useState([]);
  const [divCounts, setDivCounts] = useState({});
  const [sel3v3Divs, setSel3v3Divs] = useState([]); // for 3v3
  const [pending,   setPending]   = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const isDivSel = (g,s) => !!selDivs.find(d=>d.gradeId===g&&d.gender===s);
  const is3v3DivSel = (id) => sel3v3Divs.includes(id);

  const toggleDiv = (gradeId,gender) => {
    const key=`${gradeId}-${gender}`;
    if (isDivSel(gradeId,gender)) {
      setSelDivs(p=>p.filter(d=>!(d.gradeId===gradeId&&d.gender===gender)));
      setDivCounts(dc=>{const n={...dc};delete n[key];return n;});
    } else {
      setSelDivs(p=>[...p,{gradeId,gender}]);
      setDivCounts(dc=>({...dc,[key]:{count:8,capacity:8}}));
    }
  };

  const toggle3v3Div = (id) => {
    const key=id;
    if (is3v3DivSel(id)) {
      setSel3v3Divs(p=>p.filter(x=>x!==id));
      setDivCounts(dc=>{const n={...dc};delete n[key];return n;});
    } else {
      setSel3v3Divs(p=>[...p,id]);
      setDivCounts(dc=>({...dc,[key]:{count:8,capacity:8}}));
    }
  };

  const updDivCount=(key,field,val)=>setDivCounts(dc=>({...dc,[key]:{...dc[key],[field]:parseInt(val)}}));

  const makeDivisions5v5 = () => {
    let tid=Date.now();
    return selDivs.map((sd,i)=>{
      const key=`${sd.gradeId}-${sd.gender}`;
      const {count=4,capacity=4}=divCounts[key]||{};
      const teams=Array.from({length:count},(_,ti)=>({
        id:tid+i*100+ti, name:`TBD ${ti+1}`, pool:"A", wins:0,losses:0,pf:0,pa:0
      }));
      return {id:`div-${tid}-${i}`,gradeId:sd.gradeId,gender:sd.gender,teams,capacity};
    });
  };

  const makeDivisions3v3 = () => {
    let tid=Date.now();
    return sel3v3Divs.map((divId,i)=>{
      const divDef=THREEV3_DIVISIONS.find(d=>d.id===divId);
      const {count=8,capacity=8}=divCounts[divId]||{};
      // 2 pools of 4 — first half Pool A, second half Pool B
      const teams=Array.from({length:count},(_,ti)=>({
        id:tid+i*100+ti,
        name:`TBD ${ti+1}`,
        pool:ti<Math.ceil(count/2)?"A":"B",
        wins:0,losses:0,pf:0,pa:0,
        players:[] // roster slots
      }));
      return {id:`div-${tid}-${i}`,gradeId:divId,gender:"",
        label:divDef?.label||divId,color:divDef?.color||C.sky,
        type:"3v3",teams,capacity};
    });
  };

  const totalDivs = type==="3v3"?sel3v3Divs.length:selDivs.length;

  const handleCreate = () => {
    const divs = type==="3v3" ? makeDivisions3v3() : makeDivisions5v5();
    const base = {
      id:Date.now(), name:form.name, startDate:form.startDate,
      regCloseDate:form.regCloseDate,
      numDays:parseInt(form.numDays),
      startTime:form.startTime,
      gameDuration:type==="3v3"?GAME_DURATION_3V3:parseInt(form.gameDuration),
      location:form.location, status:"upcoming",
      type, // "5v5" or "3v3"
      divisions:divs, games:[], registrations:[],
    };
    onSave(base);
  };

  if (showBuilder&&pending) {
    return (
      <ScheduleBuilder
        tournament={pending.tournament}
        initialGames={pending.games}
        onSave={games=>onSave({...pending.tournament,games})}
        onClose={()=>setShowBuilder(false)}
      />
    );
  }

  const timeOpts = buildSlots("6:00 AM",24,30);

  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:1000,display:"flex",
      alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.navyMid,borderRadius:20,width:560,maxWidth:"100%",
        border:`1px solid ${type==="3v3"?C.sky+"88":C.sky+"44"}`,boxShadow:`0 24px 80px #000a`,
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"22px 26px 14px",borderBottom:`1px solid ${C.grayL}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:step>0?14:0}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{color:C.sky,fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase"}}>
                  New Tournament
                </div>
                {type&&<div style={{background:type==="3v3"?C.sky+"33":C.green+"33",
                  color:type==="3v3"?C.sky:C.green,borderRadius:6,padding:"2px 8px",
                  fontSize:11,fontWeight:800}}>{type}</div>}
              </div>
              <div style={{color:C.white,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginTop:2}}>
                {step===0?"Choose Tournament Type":step===1?"Details & Settings":step===2?"Select Divisions":"Team Counts"}
              </div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:22}}>×</button>
          </div>
          {/* Step indicators — only show after type is selected */}
          {step>0&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            {["Details","Divisions","Counts"].map((s,i)=>(
              <div key={s} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:11,fontWeight:800,
                  background:step>i+1?C.green:step===i+1?C.sky:C.grayD,
                  color:step>=i+1?"#fff":C.gray}}>{step>i+1?"✓":i+1}</div>
                <span style={{color:step===i+1?C.white:C.gray,fontSize:12,fontWeight:600}}>{s}</span>
                {i<2&&<div style={{width:20,height:1,background:C.grayL}}/>}
              </div>
            ))}
          </div>}
        </div>

        <div style={{padding:26,overflowY:"auto",flex:1}}>

          {/* ── STEP 0: Tournament Type ── */}
          {step===0&&<>
            <div style={{color:C.gray,fontSize:13,marginBottom:20,textAlign:"center"}}>
              What type of tournament are you creating?
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[
                {id:"5v5",icon:"🏀",title:"5v5 Tournament",desc:"Standard basketball tournament with grade/gender divisions"},
                {id:"3v3",icon:"🏃",title:"3v3 Tournament",desc:"3-on-3 with HS Boys, Men's 19-30, Men's 30+, Women's"},
              ].map(opt=>(
                <button key={opt.id} onClick={()=>{setType(opt.id);setStep(1);}}
                  style={{background:C.navy,borderRadius:14,padding:24,cursor:"pointer",textAlign:"center",
                    border:`2px solid ${C.grayL}`,transition:"all 0.15s",
                    ':hover':{border:`2px solid ${C.sky}`}}}>
                  <div style={{fontSize:36,marginBottom:10}}>{opt.icon}</div>
                  <div style={{color:C.white,fontWeight:800,fontSize:16,
                    fontFamily:"'Barlow Condensed',sans-serif",marginBottom:6}}>{opt.title}</div>
                  <div style={{color:C.gray,fontSize:12,lineHeight:1.5}}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={onClose}
              style={{width:"100%",background:"transparent",border:"none",color:C.gray,
                cursor:"pointer",fontSize:13,padding:"8px 0"}}>Cancel</button>
          </>}

          {/* ── STEP 1: Details ── */}
          {step===1&&<>
            <Inp label="Tournament Name" value={form.name} onChange={e=>upd("name",e.target.value)} placeholder={type==="3v3"?"e.g. Summer 3v3 Classic":"e.g. Spring Shootout 2026"}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Inp label="Start Date" type="date" value={form.startDate} onChange={e=>upd("startDate",e.target.value)}/>
              <Sel label="Number of Days" value={form.numDays} onChange={e=>upd("numDays",e.target.value)}>
                {[1,2,3,4].map(n=><option key={n} value={n}>{n} Day{n>1?"s":""}</option>)}
              </Sel>
            </div>
            <div style={{marginBottom:14}}>
              <Inp label="Registration Close Date" type="date" value={form.regCloseDate} onChange={e=>upd("regCloseDate",e.target.value)}/>
              <div style={{color:C.gray,fontSize:11,marginTop:4}}>
                Teams will not be able to register after this date. Leave blank for no close date.
              </div>
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
              <div style={{background:C.navyMid,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.sky}33`}}>
                <div style={{color:C.sky,fontSize:12,fontWeight:700,marginBottom:4}}>🏀 How it works</div>
                <div style={{color:C.gray,fontSize:12,lineHeight:1.6}}>
                  Create the tournament now with your divisions and team counts. Once teams are signed up and finalized, go to the Schedule tab to generate matchups and build the schedule.
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
          {/* ── STEP 2: Divisions ── */}
          {step===2&&type==="5v5"&&<>
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
              <Btn v="pri" onClick={()=>setStep(3)} dis={selDivs.length===0} sx={{flex:2}}>Next → Counts</Btn>
            </div>
          </>}

          {/* ── STEP 2: 3v3 Divisions ── */}
          {step===2&&type==="3v3"&&<>
            <div style={{color:C.gray,fontSize:13,marginBottom:18}}>
              Select which 3v3 divisions this tournament will include.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {THREEV3_DIVISIONS.map(div=>{
                const sel=is3v3DivSel(div.id);
                return (
                  <button key={div.id} onClick={()=>toggle3v3Div(div.id)}
                    style={{padding:"16px 12px",borderRadius:12,cursor:"pointer",textAlign:"center",
                      border:`2px solid ${sel?div.color:C.grayL}`,
                      background:sel?div.color+"22":C.navy,
                      color:sel?div.color:C.gray,
                      fontWeight:700,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif",
                      transition:"all 0.15s"}}>
                    {sel&&<div style={{color:C.green,fontSize:11,marginBottom:4}}>✓</div>}
                    {div.label}
                  </button>
                );
              })}
            </div>
            {sel3v3Divs.length>0&&(
              <div style={{background:C.navy,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",marginBottom:8}}>
                  {sel3v3Divs.length} Division{sel3v3Divs.length>1?"s":""} Selected
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {sel3v3Divs.map(id=>{
                    const d=THREEV3_DIVISIONS.find(x=>x.id===id);
                    return <Badge key={id} c={d?.color||C.sky}>{d?.label}</Badge>;
                  })}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <Btn v="gh" onClick={()=>setStep(1)} sx={{flex:1}}>← Back</Btn>
              <Btn v="pri" onClick={()=>setStep(3)} dis={sel3v3Divs.length===0} sx={{flex:2}}>Next → Counts</Btn>
            </div>
          </>}

          {/* ── STEP 3: Team Counts ── */}
          {step===3&&<>
            <div style={{color:C.gray,fontSize:13,marginBottom:6}}>
              Set team counts and registration capacity per division.
              {type==="3v3"&&" Teams are split evenly into Pool A and Pool B."}
            </div>
            <div style={{background:C.navy,borderRadius:10,padding:"10px 14px",marginBottom:18,border:`1px solid ${C.sky}33`}}>
              <div style={{color:C.sky,fontSize:12,fontWeight:700}}>
                💡 Team names are TBD — update them in Edit Tournament or when approving registrations.
              </div>
            </div>

            {/* 5v5 division counts */}
            {type==="5v5"&&selDivs.map((sd,di)=>{
              const key=`${sd.gradeId}-${sd.gender}`;
              const {count=4,capacity=4}=divCounts[key]||{};
              const col=dc(di);
              return (
                <div key={key} style={{marginBottom:14,background:C.navy,borderRadius:14,padding:16,border:`1px solid ${col}44`}}>
                  <div style={{color:col,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",
                    textTransform:"uppercase",marginBottom:14}}>{dlabel(sd.gradeId,sd.gender)}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Number of Teams</div>
                      <select value={count} onChange={e=>updDivCount(key,"count",e.target.value)}
                        style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}>
                        {[2,3,4,5,6,7,8,10,12,16].map(n=><option key={n} value={n}>{n} teams</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Registration Capacity</div>
                      <select value={capacity} onChange={e=>updDivCount(key,"capacity",e.target.value)}
                        style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}>
                        {[4,5,6,7,8,10,12,16].map(n=><option key={n} value={n}>{n} max</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{marginTop:10,background:col+"11",borderRadius:8,padding:"8px 12px",color:col,fontSize:12,fontWeight:600}}>
                    {count} slots · up to {capacity} registrations
                  </div>
                </div>
              );
            })}

            {/* 3v3 division counts */}
            {type==="3v3"&&sel3v3Divs.map((divId,di)=>{
              const divDef=THREEV3_DIVISIONS.find(d=>d.id===divId);
              const col=divDef?.color||dc(di);
              const {count=8,capacity=8}=divCounts[divId]||{};
              const halfA=Math.ceil(count/2), halfB=Math.floor(count/2);
              return (
                <div key={divId} style={{marginBottom:14,background:C.navy,borderRadius:14,padding:16,border:`1px solid ${col}44`}}>
                  <div style={{color:col,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",
                    textTransform:"uppercase",marginBottom:14}}>{divDef?.label}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Total Teams</div>
                      <select value={count} onChange={e=>updDivCount(divId,"count",e.target.value)}
                        style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}>
                        {[4,6,8,10,12,16].map(n=><option key={n} value={n}>{n} teams</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Registration Cap</div>
                      <select value={capacity} onChange={e=>updDivCount(divId,"capacity",e.target.value)}
                        style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}>
                        {[4,6,8,10,12,16].map(n=><option key={n} value={n}>{n} max</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{marginTop:10,background:col+"11",borderRadius:8,padding:"8px 12px",color:col,fontSize:12,fontWeight:600}}>
                    Pool A: {halfA} teams · Pool B: {halfB} teams · {capacity} registration slots
                  </div>
                </div>
              );
            })}

            <div style={{display:"flex",gap:10,marginTop:8}}>
              <Btn v="gh" onClick={()=>setStep(2)} sx={{flex:1}}>← Back</Btn>
              <Btn v="org" onClick={handleCreate} dis={totalDivs===0} sx={{flex:2}}>
                🏀 Create {type} Tournament
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
  const [showGenModal, setShowGenModal] = useState(false);
  const [gamesPerTeam, setGamesPerTeam] = useState(2);
  const [homeS, setHomeS] = useState("");
  const [awayS, setAwayS] = useState("");
  const [fDiv, setFDiv] = useState("all");
  const [fDay, setFDay] = useState("all");
  const dates = tDates(tournament);
  const is3v3 = tournament.type === "3v3";
  const courts = is3v3 ? COURTS_3V3 : COURTS_5V5;

  const noGames = tournament.games.length === 0;

  const handleGenerate = () => {
    const games = is3v3
      ? gen3v3Matchups(tournament.divisions, gamesPerTeam)
      : genMatchups(tournament.divisions, gamesPerTeam);
    onUpdateGames(games);
    setShowGenModal(false);
    setShowBuilder(true);
  };

  const placed   = tournament.games.filter(g=>g.dayIdx!==null&&g.court&&g.time);
  const unplaced = tournament.games.filter(g=>g.dayIdx===null||!g.court||!g.time);

  const sorted = [...tournament.games]
    .filter(g=>g.dayIdx!==null&&g.court&&g.time)
    .filter(g=>(fDiv==="all"||g.divisionId===fDiv)&&(fDay==="all"||g.dayIdx===parseInt(fDay)))
    .sort((a,b)=>a.dayIdx-b.dayIdx||toMins(a.time)-toMins(b.time));

  // Max games per team = team count - 1 (full round robin)
  const maxGames = Math.max(...tournament.divisions.map(d=>
    Math.max(...[...new Set(d.teams.map(t=>t.pool))].map(pool=>{
      const poolTeams = d.teams.filter(t=>t.pool===pool);
      return poolTeams.length - 1;
    }))
  ), 1);

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
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Btn v="org" onClick={()=>setShowGenModal(true)} sx={{padding:"9px 16px",fontSize:12}}>
            ⚡ Generate Matchups
          </Btn>
          {!noGames&&<Btn v="teal" onClick={()=>setShowBuilder(true)} sx={{padding:"9px 16px",fontSize:12}}>
            ✏️ Edit Schedule
          </Btn>}
        </div>
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
          <div style={{color:C.white,fontWeight:700,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
            {noGames?"No matchups generated yet":"No games scheduled yet"}
          </div>
          <div style={{color:C.gray,fontSize:14,marginBottom:20}}>
            {noGames
              ?"Click \"Generate Matchups\" to create pool play games, then drag them onto the schedule"
              :"All matchups are in the sidebar — open the Schedule Builder to place them"}
          </div>
          {noGames
            ? <Btn v="org" onClick={()=>setShowGenModal(true)}>⚡ Generate Matchups</Btn>
            : <Btn v="teal" onClick={()=>setShowBuilder(true)}>✏️ Open Schedule Builder</Btn>}
        </div>
      )}

      {/* Generate matchups modal */}
      {showGenModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:28,width:420,maxWidth:"100%",border:`1px solid ${C.sky}55`,boxShadow:`0 20px 60px #00000088`}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:32,marginBottom:8}}>⚡</div>
              <div style={{color:C.white,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:6}}>
                Generate {is3v3?"3v3":"Pool Play"} Matchups
              </div>
              <div style={{color:C.gray,fontSize:13,lineHeight:1.6}}>
                {is3v3
                  ? "Choose pool play games per team (3-6). 2 pools of 4. Top 8 advance to single elimination bracket."
                  : "Choose how many pool play games each team plays. Bracket is always single elimination."}
              </div>
            </div>

            {/* Divisions summary */}
            <div style={{background:C.navy,borderRadius:10,padding:14,marginBottom:20}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                {is3v3?"Divisions":"Divisions & Teams"}
              </div>
              {tournament.divisions.map((d,i)=>(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:i>0?`1px solid ${C.grayL}`:"none"}}>
                  <span style={{color:is3v3?(d.color||dc(i)):dc(i),fontWeight:700,fontSize:13}}>
                    {is3v3?(d.label||d.gradeId):dlabel(d.gradeId,d.gender)}
                  </span>
                  <span style={{color:C.gray,fontSize:12}}>
                    {d.teams.length} teams{is3v3?" · 2 pools of "+Math.ceil(d.teams.length/2):""}
                  </span>
                </div>
              ))}
            </div>

            {/* Games per team */}
            <div style={{marginBottom:20}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                Pool Play Games Per Team
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(is3v3?[3,4,5,6]:[1,2,3,4,5,6].filter(n=>n<=maxGames)).map(n=>(
                  <button key={n} onClick={()=>setGamesPerTeam(n)}
                    style={{flex:1,minWidth:50,padding:"12px 8px",borderRadius:10,cursor:"pointer",
                      border:`2px solid ${gamesPerTeam===n?C.sky:C.grayL}`,
                      background:gamesPerTeam===n?C.sky+"22":C.navy,
                      color:gamesPerTeam===n?C.sky:C.gray,fontWeight:800,fontSize:16,
                      fontFamily:"'Barlow Condensed',sans-serif"}}>
                    {n}
                  </button>
                ))}
                {!is3v3&&maxGames<1&&<div style={{color:C.gold,fontSize:13}}>Add teams first</div>}
              </div>
              <div style={{color:C.gray,fontSize:12,marginTop:10,lineHeight:1.5}}>
                Each team plays <strong style={{color:C.white}}>{gamesPerTeam}</strong> pool play game{gamesPerTeam>1?"s":""}
                {is3v3?" · QF: 1v8, 2v7, 3v6, 4v5 · Semis · Final":" · Single elimination bracket"}
              </div>
            </div>

            {/* 3v3 info box */}
            {is3v3&&(
              <div style={{background:C.sky+"18",border:`1px solid ${C.sky}44`,borderRadius:10,
                padding:"10px 14px",marginBottom:16}}>
                <div style={{color:C.sky,fontSize:12,fontWeight:700,marginBottom:4}}>🏀 3v3 Format</div>
                <div style={{color:C.gray,fontSize:12,lineHeight:1.6}}>
                  8 courts · 15 min games · Pool A seeds 1,3,5,7 · Pool B seeds 2,4,6,8
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setShowGenModal(false)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="org" onClick={handleGenerate} dis={!is3v3&&maxGames<1} sx={{flex:2}}>
                ⚡ Generate & Build Schedule
              </Btn>
            </div>
          </div>
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
      {div&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
        {[...new Set(div.teams.map(t=>t.pool))].sort().map(pool=>(
          <Card key={pool}>
            <div style={{color:C.gold,fontWeight:800,fontSize:13,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>Pool {pool}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:340}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.grayL}`}}>
                    {[
                      {h:"#",     tip:"Rank"},
                      {h:"Team",  tip:"Team Name"},
                      {h:"W",     tip:"Wins"},
                      {h:"L",     tip:"Losses"},
                      {h:"PF",    tip:"Points For (Total Scored)"},
                      {h:"PA",    tip:"Points Against (Total Allowed)"},
                      {h:"DIFF",  tip:"Point Differential (tiebreaker)"},
                    ].map(({h,tip})=>(
                      <th key={h} title={tip} style={{textAlign:h==="Team"?"left":"center",
                        padding:"0 6px 10px",fontWeight:700,fontSize:10,letterSpacing:"0.06em",
                        color:h==="DIFF"?C.sky:C.gray,whiteSpace:"nowrap"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poolSort(div.teams,pool).map((t,i)=>{
                    const diff=t.pf-t.pa;
                    const isTied = i>0 && poolSort(div.teams,pool)[i-1].wins===t.wins;
                    return (
                      <tr key={t.id} style={{borderTop:`1px solid ${C.grayL}`}}>
                        <td style={{padding:"10px 6px 10px 0",fontWeight:800,whiteSpace:"nowrap",
                          color:i===0?C.gold:i===1?C.light:C.gray}}>
                          {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                        </td>
                        <td style={{padding:"10px 6px",color:C.white,fontWeight:600,
                          maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</td>
                        <td style={{textAlign:"center",color:C.green,fontWeight:800,padding:"10px 6px"}}>{t.wins}</td>
                        <td style={{textAlign:"center",color:C.red,fontWeight:800,padding:"10px 6px"}}>{t.losses}</td>
                        <td style={{textAlign:"center",color:C.gray,padding:"10px 6px"}}>{t.pf}</td>
                        <td style={{textAlign:"center",color:C.gray,padding:"10px 6px"}}>{t.pa}</td>
                        <td style={{textAlign:"center",fontWeight:800,padding:"10px 6px",
                          color:diff>0?C.green:diff<0?C.red:C.gray}}>
                          {diff>0?"+":""}{diff}
                          {isTied&&<div style={{fontSize:9,color:C.sky,fontWeight:700}}>TB</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:10,color:C.gray,fontSize:10}}>
              Ranked by: Wins → Point Differential · TB = Tiebreaker active
            </div>
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
  const is3v3=tournament.type==="3v3";
  const col=is3v3?(div?.color||dc(di)):dc(di);
  const bGames=tournament.games.filter(g=>g.divisionId===aDiv&&g.phase==="bracket");
  const qfGames=bGames.filter(g=>["QF1","QF2","QF3","QF4"].includes(g.round));
  const semis=bGames.filter(g=>["Semi","Semi1","Semi2"].includes(g.round));
  const final=bGames.find(g=>g.round==="Final");

  const getDivLabel=(d,i)=>is3v3?(d.label||d.gradeId):dshort(d.gradeId,d.gender);

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
            border:`1px solid ${aDiv===d.id?(is3v3?(d.color||dc(i)):dc(i)):C.grayL}`,
            background:aDiv===d.id?(is3v3?(d.color||dc(i)):dc(i))+"22":"transparent",
            color:aDiv===d.id?(is3v3?(d.color||dc(i)):dc(i)):C.gray,
            cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>
            {getDivLabel(d,i)}
          </button>
        ))}
      </div>
      {div&&(()=>{
        const divPoolGames=tournament.games.filter(g=>g.divisionId===div.id&&g.phase==="pool");
        const poolTotal=divPoolGames.length;
        const poolDone=divPoolGames.filter(g=>g.status==="final").length;
        const allPoolDone=poolTotal>0&&poolDone===poolTotal;
        const qfSeeded=is3v3?qfGames.every(g=>g.homeId&&g.awayId):false;
        const semisSeeded=semis.every(s=>s.homeId&&s.awayId);
        const finalSeeded=final?.homeId&&final?.awayId;
        const semis1Done=semis.length>0&&semis.every(s=>s.status==="final");
        const divLabel=is3v3?(div.label||div.gradeId):dlabel(div.gradeId,div.gender);
        return <>
        <Ttl sub={`${divLabel} — seeded from pool play`}>
          {is3v3?"3v3 Bracket":"Championship Bracket"}
        </Ttl>

        {/* Seeding status */}
        {!allPoolDone?(
          <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:10,
            padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>⏳</span>
            <div>
              <div style={{color:C.gold,fontWeight:800,fontSize:13}}>Waiting for pool play to finish</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                {poolDone} of {poolTotal} pool games scored
              </div>
            </div>
          </div>
        ):(is3v3?qfSeeded:semisSeeded)?(
          <div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:10,
            padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>✅</span>
            <div>
              <div style={{color:C.green,fontWeight:800,fontSize:13}}>Bracket seeded automatically</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                {is3v3?"Quarterfinals ready to play":"Semis ready to play"}
              </div>
            </div>
          </div>
        ):null}

        {/* 3v3 Bracket: QF → Semis → Final */}
        {is3v3&&<>
          {qfGames.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                Quarterfinals
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                {qfGames.map(g=><GBox key={g.id} game={g} hi={false}/>)}
              </div>
            </div>
          )}
          {semis.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{color:C.sky,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                Semifinals
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                {semis.map(g=><GBox key={g.id} game={g} hi={false}/>)}
              </div>
            </div>
          )}
          {final&&(
            <div>
              <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                🏆 Championship Final
              </div>
              <GBox game={final} hi={true}/>
            </div>
          )}
        </>}

        {/* 5v5 Bracket */}
        {!is3v3&&<>
          {semis.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{color:C.sky,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                Semifinals
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                {semis.map(g=><GBox key={g.id} game={g} hi={false}/>)}
              </div>
            </div>
          )}
          {final&&(
            <div>
              <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
                🏆 Championship Final
              </div>
              <GBox game={final} hi={true}/>
            </div>
          )}
        </>}
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

// ─── EDIT TOURNAMENT MODAL ────────────────────────────────────────────────────
function EditTournamentModal({tournament, onSave, onClose}) {
  const [form,setForm]=useState({
    name:tournament.name, startDate:tournament.startDate,
    regCloseDate:tournament.regCloseDate||"",
    numDays:String(tournament.numDays), startTime:tournament.startTime,
    gameDuration:String(tournament.gameDuration),
    location:tournament.location, status:tournament.status,
  });
  const [divisions,setDivisions]=useState(tournament.divisions.map(d=>({...d,teams:d.teams.map(t=>({...t}))})));
  const [activeDiv,setActiveDiv]=useState(tournament.divisions[0]?.id||null);
  const [tab,setTab]=useState("details");
  const [showAddDiv,setShowAddDiv]=useState(false);
  const [newGrade,setNewGrade]=useState("3rd");
  const [newGender,setNewGender]=useState("Boys");
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updTeam=(divId,teamId,field,val)=>setDivisions(ds=>ds.map(d=>d.id!==divId?d:{...d,teams:d.teams.map(t=>t.id!==teamId?t:{...t,[field]:val})}));
  const addTeam=(divId)=>setDivisions(ds=>ds.map(d=>d.id!==divId?d:{...d,teams:[...d.teams,{id:Date.now()+Math.random(),name:"",pool:"A",wins:0,losses:0,pf:0,pa:0}]}));
  const remTeam=(divId,teamId)=>setDivisions(ds=>ds.map(d=>d.id!==divId?d:{...d,teams:d.teams.filter(t=>t.id!==teamId)}));
  const remDiv=(divId)=>{ setDivisions(ds=>ds.filter(d=>d.id!==divId)); setActiveDiv(divisions.find(d=>d.id!==divId)?.id||null); };
  const addDivision=()=>{
    const id=`div-${Date.now()}`;
    const newDiv={id,gradeId:newGrade,gender:newGender,teams:[
      {id:Date.now()+1,name:"",pool:"A",wins:0,losses:0,pf:0,pa:0},
      {id:Date.now()+2,name:"",pool:"A",wins:0,losses:0,pf:0,pa:0},
    ]};
    setDivisions(ds=>[...ds,newDiv]);
    setActiveDiv(id); setShowAddDiv(false); setTab("divisions");
  };
  const handleSave=()=>{
    const existingGameDivIds=new Set(tournament.games.map(g=>g.divisionId));
    const newDivs=divisions.filter(d=>!existingGameDivIds.has(d.id)&&d.teams.filter(t=>t.name.trim()).length>=2);
    const newGames=genMatchups(newDivs);
    onSave({...tournament,...form,numDays:parseInt(form.numDays),gameDuration:parseInt(form.gameDuration),divisions,games:[...tournament.games,...newGames]});
  };
  const timeOpts=buildSlots("6:00 AM",18,30);
  const div=divisions.find(d=>d.id===activeDiv);
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.navyMid,borderRadius:20,width:580,maxWidth:"100%",border:`1px solid ${C.sky}44`,boxShadow:`0 24px 80px #000a`,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"22px 26px 14px",borderBottom:`1px solid ${C.grayL}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:C.sky,fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase"}}>Edit Tournament</div>
              <div style={{color:C.white,fontWeight:900,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif"}}>{tournament.name}</div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:22}}>×</button>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[{id:"details",l:"Details"},{id:"divisions",l:"Divisions & Teams"}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,
                border:`1px solid ${tab===t.id?C.sky:C.grayL}`,background:tab===t.id?C.sky+"22":"transparent",
                color:tab===t.id?C.sky:C.gray,cursor:"pointer",fontWeight:700,fontSize:13}}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div style={{padding:26,overflowY:"auto",flex:1}}>
          {tab==="details"&&<>
            <Inp label="Tournament Name" value={form.name} onChange={e=>upd("name",e.target.value)}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Inp label="Start Date" type="date" value={form.startDate} onChange={e=>upd("startDate",e.target.value)}/>
              <Sel label="Number of Days" value={form.numDays} onChange={e=>upd("numDays",e.target.value)}>
                {[1,2,3,4].map(n=><option key={n} value={n}>{n} Day{n>1?"s":""}</option>)}
              </Sel>
            </div>
            <div style={{marginBottom:14}}>
              <Inp label="Registration Close Date" type="date" value={form.regCloseDate} onChange={e=>upd("regCloseDate",e.target.value)}/>
              <div style={{color:C.gray,fontSize:11,marginTop:4}}>
                Teams cannot register after this date. Leave blank for no close date.
                {form.regCloseDate&&<span style={{color:C.gold,fontWeight:700}}> Currently: {fmtD(form.regCloseDate)}</span>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Sel label="First Game Start Time" value={form.startTime} onChange={e=>upd("startTime",e.target.value)}>
                {timeOpts.map(t=><option key={t}>{t}</option>)}
              </Sel>
              <Sel label="Game Duration" value={form.gameDuration} onChange={e=>upd("gameDuration",e.target.value)}>
                <option value="45">45 minutes</option><option value="60">60 minutes</option>
                <option value="75">75 minutes</option><option value="90">90 minutes</option>
              </Sel>
            </div>
            <Sel label="Status" value={form.status} onChange={e=>upd("status",e.target.value)}>
              <option value="upcoming">Upcoming</option><option value="active">Active (Live)</option>
              <option value="complete">Complete</option>
            </Sel>
            <Inp label="Location" value={form.location} onChange={e=>upd("location",e.target.value)}/>
          </>}
          {tab==="divisions"&&<>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18,alignItems:"center"}}>
              {divisions.map((d,i)=>(
                <button key={d.id} onClick={()=>setActiveDiv(d.id)} style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",
                  fontWeight:700,fontSize:13,border:`1px solid ${activeDiv===d.id?dc(i):C.grayL}`,
                  background:activeDiv===d.id?dc(i)+"22":"transparent",color:activeDiv===d.id?dc(i):C.gray,
                  fontFamily:"'Barlow Condensed',sans-serif"}}>{dshort(d.gradeId,d.gender)}</button>
              ))}
              <Btn v="gh" onClick={()=>setShowAddDiv(s=>!s)} sx={{padding:"7px 14px",fontSize:12}}>+ Add Division</Btn>
            </div>
            {showAddDiv&&(
              <div style={{background:C.navy,borderRadius:12,padding:16,marginBottom:16,border:`1px solid ${C.sky}44`}}>
                <div style={{color:C.sky,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>New Division</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <Sel label="Grade" value={newGrade} onChange={e=>setNewGrade(e.target.value)}>
                    {GD.map(g=><option key={g.id} value={g.id}>{g.s}</option>)}
                  </Sel>
                  <Sel label="Gender" value={newGender} onChange={e=>setNewGender(e.target.value)}>
                    <option>Boys</option><option>Girls</option>
                  </Sel>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <Btn v="gh" onClick={()=>setShowAddDiv(false)} sx={{flex:1}}>Cancel</Btn>
                  <Btn v="pri" onClick={addDivision} sx={{flex:1}}>Add Division</Btn>
                </div>
              </div>
            )}
            {div&&(
              <div style={{background:C.navy,borderRadius:14,padding:18,border:`1px solid ${dc(divisions.indexOf(div))}44`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{color:dc(divisions.indexOf(div)),fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>{dlabel(div.gradeId,div.gender)}</div>
                  <Btn v="danger" onClick={()=>remDiv(div.id)} sx={{padding:"6px 12px",fontSize:11}}>Remove Division</Btn>
                </div>
                {[...new Set(div.teams.map(t=>t.pool))].sort().map(pool=>(
                  <div key={pool} style={{marginBottom:12}}>
                    <div style={{color:C.gray,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Pool {pool}</div>
                    {div.teams.filter(t=>t.pool===pool).map(team=>(
                      <div key={team.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                        <input value={team.name} onChange={e=>updTeam(div.id,team.id,"name",e.target.value)} placeholder="Team name..."
                          style={{flex:1,background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"9px 12px",outline:"none",fontFamily:"inherit"}}/>
                        <select value={team.pool} onChange={e=>updTeam(div.id,team.id,"pool",e.target.value)}
                          style={{background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"9px 10px",outline:"none",cursor:"pointer"}}>
                          {["A","B","C","D"].map(p=><option key={p}>{p}</option>)}
                        </select>
                        <button onClick={()=>remTeam(div.id,team.id)}
                          style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,borderRadius:8,padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:700}}>✕</button>
                      </div>
                    ))}
                  </div>
                ))}
                <button onClick={()=>addTeam(div.id)}
                  style={{width:"100%",padding:"9px 0",background:"transparent",border:`1px dashed ${dc(divisions.indexOf(div))}66`,borderRadius:8,color:dc(divisions.indexOf(div)),cursor:"pointer",fontWeight:700,fontSize:12}}>
                  + Add Team
                </button>
              </div>
            )}
            {!div&&!showAddDiv&&<div style={{textAlign:"center",padding:"30px 0",color:C.gray}}>No divisions yet — click "+ Add Division"</div>}
          </>}
          <div style={{display:"flex",gap:10,marginTop:20}}>
            <Btn v="gh" onClick={onClose} sx={{flex:1}}>Cancel</Btn>
            <Btn v="pri" onClick={handleSave} sx={{flex:2}}>✓ Save Changes</Btn>
          </div>
        </div>
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

// ─── ADMIN TEAMS TAB ─────────────────────────────────────────────────────────
function AdminTeams({tournament, onUpdateTournament}) {
  const [activeDiv, setActiveDiv] = useState(tournament.divisions[0]?.id||null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const div = tournament.divisions.find(d=>d.id===activeDiv);
  const is3v3 = tournament.type==="3v3";

  const updTeamName=(divId,teamId,name)=>{
    const updated={...tournament,divisions:tournament.divisions.map(d=>
      d.id!==divId?d:{...d,teams:d.teams.map(t=>t.id!==teamId?t:{...t,name})}
    )};
    onUpdateTournament(updated);
  };

  const updRoster=(divId,teamId,players)=>{
    const updated={...tournament,divisions:tournament.divisions.map(d=>
      d.id!==divId?d:{...d,teams:d.teams.map(t=>t.id!==teamId?t:{...t,players})}
    )};
    onUpdateTournament(updated);
  };

  const getDivLabel=(d)=>is3v3?(d.label||d.gradeId):dlabel(d.gradeId,d.gender);
  const getDivColor=(i)=>is3v3?(tournament.divisions[i]?.color||dc(i)):dc(i);

  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {tournament.divisions.map((d,i)=>(
          <button key={d.id} onClick={()=>{setActiveDiv(d.id);setExpandedTeam(null);}} style={{
            padding:"8px 16px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,
            border:`1px solid ${activeDiv===d.id?getDivColor(i):C.grayL}`,
            background:activeDiv===d.id?getDivColor(i)+"22":"transparent",
            color:activeDiv===d.id?getDivColor(i):C.gray,
            fontFamily:"'Barlow Condensed',sans-serif"}}>
            {getDivLabel(d)}
          </button>
        ))}
      </div>

      {div&&<>
        {/* Pool summary for 3v3 */}
        {is3v3&&(
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            {["A","B"].map(pool=>(
              <div key={pool} style={{flex:1,background:C.navyMid,borderRadius:10,padding:"10px 14px",
                border:`1px solid ${C.grayL}`,textAlign:"center"}}>
                <div style={{color:C.gold,fontWeight:800,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>Pool {pool}</div>
                <div style={{color:C.gray,fontSize:12}}>{div.teams.filter(t=>t.pool===pool).length} teams</div>
              </div>
            ))}
          </div>
        )}

        {/* Teams by pool */}
        {(is3v3?["A","B"]:[...new Set(div.teams.map(t=>t.pool))].sort()).map(pool=>(
          <div key={pool} style={{marginBottom:20}}>
            <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:10,fontFamily:"'Barlow Condensed',sans-serif"}}>Pool {pool}</div>
            {div.teams.filter(t=>t.pool===pool).map((team,ti)=>(
              <div key={team.id} style={{marginBottom:8}}>
                <div style={{background:C.navyMid,borderRadius:expandedTeam===team.id?"12px 12px 0 0":12,
                  padding:"12px 16px",border:`1px solid ${C.grayL}`,
                  display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                    background:getDivColor(tournament.divisions.indexOf(div))+"33",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:getDivColor(tournament.divisions.indexOf(div)),fontWeight:800,fontSize:12}}>
                    {ti+1}
                  </div>
                  <input value={team.name} onChange={e=>updTeamName(div.id,team.id,e.target.value)}
                    placeholder="Enter team name..."
                    style={{flex:1,background:"transparent",border:"none",
                      color:team.name&&!team.name.startsWith("TBD")?C.white:C.gray,
                      fontSize:14,fontWeight:700,outline:"none",fontFamily:"inherit"}}/>
                  {is3v3&&(
                    <button onClick={()=>setExpandedTeam(expandedTeam===team.id?null:team.id)}
                      style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                        color:C.gray,cursor:"pointer",padding:"5px 12px",fontSize:12,fontWeight:700}}>
                      {expandedTeam===team.id?"▲ Roster":"▼ Roster"}
                    </button>
                  )}
                </div>
                {is3v3&&expandedTeam===team.id&&(
                  <div style={{background:C.navy,borderRadius:"0 0 12px 12px",
                    border:`1px solid ${C.grayL}`,borderTop:"none",padding:14}}>
                    <div style={{color:C.sky,fontSize:11,fontWeight:700,textTransform:"uppercase",
                      letterSpacing:"0.06em",marginBottom:10}}>Player Roster</div>
                    {[0,1,2,3,4].map(pi=>{
                      const players=team.players||[];
                      const req=pi<3;
                      return (
                        <div key={pi} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,
                            background:req?C.sky+"33":C.grayL,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            color:req?C.sky:C.gray,fontSize:10,fontWeight:800}}>{pi+1}</div>
                          <input value={players[pi]||""}
                            onChange={e=>{const p=[...(team.players||[])];p[pi]=e.target.value;updRoster(div.id,team.id,p);}}
                            placeholder={req?`Player ${pi+1} (required)`:`Sub ${pi-1} (optional)`}
                            style={{flex:1,background:C.navyMid,border:`1px solid ${req?C.grayL:C.grayD}`,
                              borderRadius:8,color:C.white,fontSize:13,padding:"9px 12px",
                              outline:"none",fontFamily:"inherit"}}/>
                        </div>
                      );
                    })}
                    <div style={{color:C.gray,fontSize:11,marginTop:4}}>Changes save automatically</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{background:C.navyMid,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.sky}33`}}>
          <div style={{color:C.sky,fontSize:12,fontWeight:700,marginBottom:4}}>💡 Tip</div>
          <div style={{color:C.gray,fontSize:12,lineHeight:1.6}}>
            Click any team name field to edit it.{is3v3?" Click \"▼ Roster\" to expand and edit each team's player list.":""} Changes save to the database automatically.
          </div>
        </div>
      </>}
    </div>
  );
}

function Admin({data,onScore,onUpdateGames,onAdd,onEditTournament,onDeleteTournament,logoUrl,onSaveLogoUrl,onGoHome,bookings,coachSchedule,onUpdateBooking,onUpdateSchedule,role}) {
  const [aTId,setATId]             = useState(null);
  const [tab,setTab]               = useState("schedule");
  const [showCreate,setShowCreate] = useState(false);
  const [showEdit,setShowEdit]     = useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm] = useState(false);
  const [view,setView]             = useState("tournaments");
  const isDirector = role==="director";
  const t = data.tournaments.find(x=>x.id===aTId);
  const is3v3 = t?.type==="3v3";
  const tabs=[
    {id:"schedule",icon:"📋",l:"Schedule"},
    {id:"teams",icon:"🏀",l:"Teams"},
    {id:"standings",icon:"📊",l:"Standings"},
    {id:"bracket",icon:"🏆",l:"Bracket"},
    {id:"courts",icon:"🏟",l:"Courts"},
    {id:"registrations",icon:"📝",l:"Registrations"},
    {id:"settings",icon:"⚙️",l:"Settings"},
  ];

  const NavBar=({showNew=true})=>(
    <div style={{background:C.navyMid,borderBottom:`1px solid ${C.grayL}`,padding:"0 22px",position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 18px #00000044`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",height:58,maxWidth:1200,margin:"0 auto"}}>
        <button onClick={()=>{setATId(null);setView("tournaments");}}
          style={{background:"transparent",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:10}}>
          {logoUrl
            ? <img src={logoUrl} alt="Shoebox Sports" style={{height:38,maxWidth:140,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            : <Logo sz={34}/>}
          {aTId&&<span style={{color:C.gray,fontSize:12,fontWeight:600}}>← All Tournaments</span>}
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {!isDirector&&(
            <div style={{display:"flex",background:C.navy,borderRadius:50,padding:3,border:`1px solid ${C.grayL}`}}>
              {[{id:"tournaments",l:"🏀 Tournaments"},{id:"coach",l:"🏋️ Coach Star"}].map(v=>(
                <button key={v.id} onClick={()=>{setView(v.id);setATId(null);}}
                  style={{padding:"6px 14px",borderRadius:50,border:"none",
                    background:view===v.id?C.sky:"transparent",
                    color:view===v.id?"#fff":C.gray,cursor:"pointer",fontWeight:700,fontSize:12,
                    fontFamily:"'Barlow Condensed',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                  {v.l}
                </button>
              ))}
            </div>
          )}
          <Badge c={isDirector?C.sky:C.green}>● {isDirector?"Director":"Admin"}</Badge>
          {showNew&&view==="tournaments"&&(
            <Btn v="org" onClick={()=>setShowCreate(true)} sx={{padding:"8px 16px",fontSize:12}}>+ New Tournament</Btn>
          )}
        </div>
      </div>
    </div>
  );

  // ── LANDING PAGE ──────────────────────────────────────────────────────────
  if (view==="tournaments"&&!aTId) {
    const sections=[
      {key:"active",  label:"Live",     dot:"🟢", color:C.green},
      {key:"upcoming",label:"Upcoming", dot:"🟡", color:C.gold},
      {key:"complete",label:"Past",     dot:"🔴", color:C.red},
    ];
    return (
      <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>
        <NavBar/>
        <div style={{padding:"28px 22px",maxWidth:900,margin:"0 auto"}}>
          <div style={{marginBottom:28}}>
            <div style={{color:C.white,fontWeight:900,fontSize:28,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:4}}>Tournament Dashboard</div>
            <div style={{color:C.gray,fontSize:14}}>Select a tournament to manage it</div>
          </div>
          {data.tournaments.length===0&&(
            <div style={{textAlign:"center",padding:"60px 0"}}>
              <div style={{fontSize:48,marginBottom:16}}>🏀</div>
              <div style={{color:C.white,fontWeight:800,fontSize:22,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>No Tournaments Yet</div>
              <div style={{color:C.gray,fontSize:14,marginBottom:24}}>Create your first tournament to get started</div>
              <Btn v="org" onClick={()=>setShowCreate(true)} sx={{padding:"12px 28px",fontSize:15}}>+ Create Tournament</Btn>
            </div>
          )}
          {sections.map(sec=>{
            const tourns=data.tournaments.filter(x=>x.status===sec.key);
            if(!tourns.length) return null;
            return (
              <div key={sec.key} style={{marginBottom:32}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{fontSize:18}}>{sec.dot}</div>
                  <div style={{color:sec.color,fontWeight:800,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>{sec.label}</div>
                  <div style={{flex:1,height:1,background:sec.color+"33",marginLeft:4}}/>
                  <div style={{color:sec.color,fontSize:12,fontWeight:700,background:sec.color+"18",borderRadius:50,padding:"3px 12px"}}>{tourns.length}</div>
                </div>
                {tourns.map(x=>{
                  const dates=tDates(x);
                  const divCount=x.divisions?.length||0;
                  const teamCount=x.divisions?.reduce((s,d)=>s+(d.teams?.length||0),0)||0;
                  const gamesPlayed=x.games?.filter(g=>g.status==="final").length||0;
                  const totalGames=x.games?.filter(g=>g.phase==="pool").length||0;
                  return (
                    <div key={x.id} onClick={()=>{setATId(x.id);setTab("schedule");}}
                      style={{background:C.navyMid,borderRadius:16,padding:"18px 22px",marginBottom:10,
                        cursor:"pointer",border:`1px solid ${x.status==="active"?C.green+"66":x.status==="complete"?C.red+"33":C.grayL}`,
                        boxShadow:x.status==="active"?`0 0 20px ${C.green}22`:"none",transition:"border 0.15s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:sec.color,flexShrink:0}}/>
                            <div style={{color:C.white,fontWeight:800,fontSize:19,fontFamily:"'Barlow Condensed',sans-serif"}}>{x.name}</div>
                            {x.type&&<div style={{background:C.sky+"22",color:C.sky,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:800}}>{x.type}</div>}
                          </div>
                          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                            <span style={{color:C.gray,fontSize:13}}>📅 {dates.map(fmtD).join(" – ")}</span>
                            <span style={{color:C.gray,fontSize:13}}>📍 {x.location}</span>
                            {x.regCloseDate&&(()=>{
                              const closed=new Date(x.regCloseDate+"T23:59:59")<new Date();
                              return <span style={{color:closed?C.red:C.gold,fontSize:12,fontWeight:600}}>
                                {closed?"⛔ Reg. closed":"⏰ Reg. closes"} {fmtD(x.regCloseDate)}
                              </span>;
                            })()}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:20,alignItems:"center"}}>
                          {[["Divisions",divCount],["Teams",teamCount],totalGames>0?["Games",`${gamesPlayed}/${totalGames}`]:null].filter(Boolean).map(([l,v])=>(
                            <div key={l} style={{textAlign:"center"}}>
                              <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
                              <div style={{color:C.gray,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
                            </div>
                          ))}
                          <div style={{color:C.sky,fontWeight:700,fontSize:22}}>›</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {showCreate&&<CreateModal onSave={x=>{onAdd(x);setATId(x.id);setTab("schedule");setShowCreate(false);}} onClose={()=>setShowCreate(false)}/>}
      </div>
    );
  }

  // ── COACH STAR VIEW ──────────────────────────────────────────────────────
  if (view==="coach") return (
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>
      <NavBar showNew={false}/>
      <div style={{padding:22,maxWidth:1200,margin:"0 auto"}}>
        <AdminBookings bookings={bookings} schedule={coachSchedule}
          onUpdateBooking={onUpdateBooking}
          onDeleteBooking={async(id)=>{await deleteBooking(id);onUpdateBooking({id},"delete");}}
          onUpdateSchedule={onUpdateSchedule}/>
      </div>
    </div>
  );

  // ── TOURNAMENT DETAIL VIEW ────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>
      <NavBar/>

      {/* Tournament header */}
      {t&&(
        <div style={{background:`linear-gradient(135deg,${C.navyLight},${C.navyMid})`,padding:"18px 22px 0",borderBottom:`1px solid ${C.grayL}`}}>
          <div style={{maxWidth:1200,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{fontSize:14}}>{t.status==="active"?"🟢":t.status==="complete"?"🔴":"🟡"}</div>
                  <div style={{color:C.white,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed',sans-serif"}}>{t.name}</div>
                  {t.type&&<div style={{background:C.sky+"22",color:C.sky,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:800}}>{t.type}</div>}
                </div>
                <div style={{color:C.gray,fontSize:12,marginTop:5,display:"flex",gap:14,flexWrap:"wrap"}}>
                  <span>📅 {tDates(t).map(fmtD).join(" → ")}</span>
                  <span>🕐 {t.startTime}</span>
                  <span>⏱ {t.gameDuration}min</span>
                  {t.regCloseDate&&(()=>{
                    const closed=new Date(t.regCloseDate+"T23:59:59")<new Date();
                    return <span style={{color:closed?C.red:C.gold}}>
                      {closed?"⛔ Reg. closed":"⏰ Reg. closes"} {fmtD(t.regCloseDate)}
                    </span>;
                  })()}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn v="gh" onClick={()=>setShowEdit(true)} sx={{padding:"8px 14px",fontSize:12}}>✏️ Edit</Btn>
                <Btn v="danger" onClick={()=>setShowDeleteConfirm(true)} sx={{padding:"8px 14px",fontSize:12}}>🗑 Delete</Btn>
              </div>
            </div>
            {/* Tabs */}
            <div style={{display:"flex",gap:2,overflowX:"auto"}}>
              {tabs.map(tb=>(
                <button key={tb.id} onClick={()=>setTab(tb.id)} style={{
                  padding:"10px 14px",background:tab===tb.id?C.sky+"22":"transparent",
                  color:tab===tb.id?C.sky:C.gray,border:"none",borderBottom:`2px solid ${tab===tb.id?C.sky:"transparent"}`,
                  cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif"}}>
                  {tb.icon} {tb.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!t&&(
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:44,marginBottom:14}}>🏀</div>
          <div style={{color:C.white,fontWeight:800,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:10}}>Tournament not found</div>
          <Btn v="pri" onClick={()=>setATId(null)} sx={{padding:"10px 24px"}}>← Back to Dashboard</Btn>
        </div>
      )}

      {t&&(
        <div style={{padding:"22px 22px",maxWidth:1200,margin:"0 auto"}}>
          {tab==="settings"
            ? <AdminSettings logoUrl={logoUrl} onSaveLogoUrl={onSaveLogoUrl}/>
            : tab==="registrations"
            ? <AdminRegistrations tournament={t} onUpdateTournament={onEditTournament}/>
            : tab==="teams"
            ? <AdminTeams tournament={t} onUpdateTournament={onEditTournament}/>
            : <>
              {tab==="schedule"&&<AdminSchedule tournament={t} onScore={onScore} onUpdateGames={g=>onUpdateGames(t.id,g)}/>}
              {tab==="standings"&&<AdminStandings tournament={t}/>}
              {tab==="bracket"&&<AdminBracket tournament={t}/>}
              {tab==="courts"&&<AdminCourts tournament={t}/>}
            </>}
        </div>
      )}

      {showCreate&&<CreateModal onSave={x=>{onAdd(x);setATId(x.id);setTab("schedule");setShowCreate(false);}} onClose={()=>setShowCreate(false)}/>}
      {showEdit&&t&&<EditTournamentModal tournament={t} onSave={updated=>{onEditTournament(updated);setShowEdit(false);}} onClose={()=>setShowEdit(false)}/>}
      {showDeleteConfirm&&t&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:32,width:360,maxWidth:"100%",border:`1px solid ${C.red}55`,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>Delete Tournament?</div>
            <div style={{color:C.gray,fontSize:14,marginBottom:24}}>"<span style={{color:C.white}}>{t.name}</span>" will be permanently deleted.</div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setShowDeleteConfirm(false)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="danger" onClick={()=>{onDeleteTournament(t.id);setShowDeleteConfirm(false);setATId(null);}} sx={{flex:1}}>Yes, Delete</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
// ─── USER CREDENTIALS ────────────────────────────────────────────────────────
const USERS = {
  Admin:    { password:"Shoebox2026!", role:"admin"    },
  Star:     { password:"Coachstar26",  role:"coach"    },
  Cballard: { password:"CoachCornell26", role:"director" },
};
const ADMIN_SESSION_KEY = "shoebox_admin_auth";

// ─── UNIFIED LOGIN PAGE ───────────────────────────────────────────────────────
function LoginPage({onSuccess, logoUrl}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [err,  setErr]          = useState("");

  const attempt = () => {
    const user = USERS[username];
    if (user && user.password === password) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, user.role);
      onSuccess(user.role);
    } else {
      setErr("Incorrect username or password. Try again.");
      setPassword("");
      setTimeout(()=>setErr(""),2500);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",
      justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:C.navyMid,borderRadius:20,padding:36,width:380,maxWidth:"100%",
        border:`1px solid ${C.grayL}`,boxShadow:`0 20px 60px #00000066`}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          {logoUrl
            ? <img src={logoUrl} alt="Shoebox Sports"
                style={{maxWidth:200,maxHeight:100,objectFit:"contain",marginBottom:12}}
                onError={e=>e.target.style.display="none"}/>
            : <Logo sz={52} txt/>}
          <div style={{color:C.gray,fontSize:13,marginTop:8}}>Staff Login</div>
        </div>

        {/* Username */}
        <div style={{marginBottom:12}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
            textTransform:"uppercase",marginBottom:8}}>Username</div>
          <input value={username} onChange={e=>setUsername(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&attempt()}
            placeholder="Enter username"
            style={{width:"100%",background:C.navy,border:`2px solid ${err?C.red:C.grayL}`,
              borderRadius:10,color:C.white,fontSize:15,padding:"13px 16px",outline:"none",
              boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"}}/>
        </div>

        {/* Password */}
        <div style={{marginBottom:20}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
            textTransform:"uppercase",marginBottom:8}}>Password</div>
          <div style={{position:"relative"}}>
            <input type={show?"text":"password"} value={password}
              onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&attempt()}
              placeholder="Enter password"
              style={{width:"100%",background:C.navy,border:`2px solid ${err?C.red:C.grayL}`,
                borderRadius:10,color:C.white,fontSize:15,padding:"13px 44px 13px 16px",
                outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"}}/>
            <button onClick={()=>setShow(s=>!s)}
              style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:16}}>
              {show?"🙈":"👁"}
            </button>
          </div>
          {err&&<div style={{color:C.red,fontSize:12,marginTop:6,fontWeight:600}}>{err}</div>}
        </div>

        <Btn v="pri" onClick={attempt} sx={{width:"100%",padding:"13px 0",fontSize:15}}>
          Sign In
        </Btn>
        <div style={{textAlign:"center",marginTop:16}}>
          <a href="/" style={{color:C.sky,fontSize:12,fontWeight:700,textDecoration:"none"}}>
            ← Back to Public Site
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── COACH STAR DASHBOARD ─────────────────────────────────────────────────────
// ─── PENDING BOOKINGS COMPONENT ──────────────────────────────────────────────
function PendingBookings({bookings, onUpdateBooking}) {
  const [declineId, setDeclineId] = useState(null);
  const [declineMsg, setDeclineMsg] = useState("");

  const pending = [...bookings]
    .filter(b=>b.status==="pending")
    .sort((a,b)=>(a.bookedAt||"").localeCompare(b.bookedAt||""));

  const approve = async(b) => {
    const updated = {...b, status:"confirmed"};
    await updateBooking(updated);
    onUpdateBooking(updated, "update");
    await sendEmail(EJS.approvedTemplate, {
      coach_name: b.clientName,
      coach_email: b.clientEmail,
      tournament_name: b.sessionLabel,
      tournament_dates: b.dateLabel ? `${b.dateLabel} at ${b.time}` : `${b.groupName||""} at ${b.time}`,
      location: "Shoebox Sports - Fenton, MI",
      teams_list: `Session: ${b.sessionLabel}\nDate: ${b.dateLabel||"Recurring"} at ${b.time}\nPayment: ${b.payMethod==="online"?"Online via Clover":"Pay in person"}`,
      team_count: "1",
      payment_link: b.payMethod==="online" ? PAYMENT_LINK : "Pay at your session",
    });
  };

  const decline = async(b, msg) => {
    const updated = {...b, status:"declined", declineReason: msg};
    await updateBooking(updated);
    onUpdateBooking(updated, "update");
    await sendEmail(EJS.declinedTemplate, {
      coach_name: b.clientName, coach_email: b.clientEmail,
      tournament_name: b.sessionLabel,
      tournament_dates: b.dateLabel ? `${b.dateLabel} at ${b.time}` : `${b.time}`,
      location: "Shoebox Sports - Fenton, MI",
      teams_list: msg ? `Reason: ${msg}` : "No reason provided.",
      team_count: "1",
      payment_link: "N/A",
    });
    setDeclineId(null);
    setDeclineMsg("");
  };

  if (!pending.length) return (
    <div style={{textAlign:"center",padding:"50px 0"}}>
      <div style={{fontSize:42,marginBottom:12}}>✅</div>
      <div style={{color:C.white,fontWeight:700,fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
        All Caught Up!
      </div>
      <div style={{color:C.gray,fontSize:13}}>No pending bookings to review right now</div>
    </div>
  );

  return (
    <div>
      <div style={{color:C.gray,fontSize:13,marginBottom:16}}>
        Review and respond to each booking request. Clients will receive an email notification.
      </div>
      {pending.map(b=>(
        <div key={b.id} style={{background:C.navyMid,borderRadius:14,padding:18,marginBottom:12,
          border:`1px solid ${C.gold}44`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
            flexWrap:"wrap",gap:10,marginBottom:14}}>
            <div>
              <div style={{color:C.white,fontWeight:700,fontSize:16}}>{b.clientName}</div>
              <div style={{color:C.gold,fontSize:13,fontWeight:600,marginTop:3}}>{b.sessionLabel}</div>
              <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                {b.dateLabel ? `${b.dateLabel} at ${b.time}` : `Every ${b.groupName||""} at ${b.time}`}
              </div>
              {b.clientPhone&&<div style={{color:C.sky,fontSize:12,marginTop:5}}>📞 {b.clientPhone}</div>}
              {b.clientEmail&&<div style={{color:C.gray,fontSize:11,marginTop:2}}>✉️ {b.clientEmail}</div>}
              <div style={{color:C.grayL,fontSize:11,marginTop:6}}>
                Requested {b.bookedAt
                  ? new Date(b.bookedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})
                  : ""}
              </div>
            </div>
            <Badge c={C.gold}>⏳ Pending</Badge>
          </div>

          {declineId===b.id ? (
            <div style={{background:C.navy,borderRadius:10,padding:14,border:`1px solid ${C.red}44`}}>
              <div style={{color:C.red,fontSize:12,fontWeight:700,marginBottom:8}}>
                Reason for declining (optional — will be sent to client)
              </div>
              <textarea value={declineMsg} onChange={e=>setDeclineMsg(e.target.value)}
                placeholder="e.g. That slot is no longer available. Please rebook for another time..."
                rows={3}
                style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,
                  color:C.white,fontSize:13,padding:"10px 12px",outline:"none",
                  boxSizing:"border-box",fontFamily:"inherit",resize:"none"}}/>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <Btn v="gh" onClick={()=>{setDeclineId(null);setDeclineMsg("");}} sx={{flex:1}}>Cancel</Btn>
                <Btn v="danger" onClick={()=>decline(b,declineMsg)} sx={{flex:2}}>✕ Send Decline</Btn>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setDeclineId(b.id);setDeclineMsg("");}}
                style={{flex:1,padding:"11px 0",background:C.red+"22",border:`1px solid ${C.red}44`,
                  color:C.red,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
                ✕ Decline
              </button>
              <button onClick={()=>approve(b)}
                style={{flex:2,padding:"11px 0",background:`linear-gradient(135deg,${C.green},#007A3D)`,
                  border:"none",color:"#fff",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:14,fontFamily:"inherit"}}>
                ✓ Approve
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CoachDashboard({bookings, schedule, onUpdateBooking, onUpdateSchedule, onSignOut, logoUrl}) {
  const [selDate, setSelDate]     = useState(dateKey(new Date()));
  const [tab, setTab]             = useState("calendar");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]     = useState({name:"",email:"",phone:"",sessionId:"1on1",time:"4:00 PM"});
  const [localSched, setLocalSched] = useState(schedule);
  useEffect(()=>{ setLocalSched(s=>({...schedule,...s,groupSlots:schedule?.groupSlots||s?.groupSlots||[]})); },[schedule]);
  const upd = (k,v) => setAddForm(f=>({...f,[k]:v}));

  const dates = getUpcomingDates(28);
  const selDateObj = dates.find(d=>dateKey(d)===selDate) || new Date(selDate+"T12:00:00");
  const selDow = DAYS_OF_WEEK[selDateObj.getDay()];
  const allSlots = isWeekend(selDateObj)
    ? (localSched?.availability?.[selDow]||WEEKEND_SLOTS)
    : (localSched?.weekdaySlots?.[selDow]||WEEKDAY_SLOTS_ALL);
  const todayBookings = bookings.filter(b=>b.date===selDate&&b.status!=="cancelled");
  const blockedSlots = (localSched?.blocked||[]).filter(b=>b.date===selDate).map(b=>b.time);
  const bookedSlots = todayBookings.map(b=>b.time);
  // Group slots for this day of week
  const groupSlotsToday = (localSched?.groupSlots||[]).filter(gs=>{
    if(!gs.endDate||new Date(gs.endDate+"T23:59:59")<new Date()) return false;
    return gs.day===selDow;
  });

  const toggleBlock = async(date,time) => {
    const blocked=[...(localSched.blocked||[])];
    const idx=blocked.findIndex(b=>b.date===date&&b.time===time);
    const newSched = idx>=0
      ? {...localSched,blocked:blocked.filter((_,i)=>i!==idx)}
      : {...localSched,blocked:[...blocked,{date,time}]};
    setLocalSched(newSched);
    await saveSchedule(newSched);
    onUpdateSchedule(newSched);
  };

  const addClient = async() => {
    const s = SESSIONS.find(x=>x.id===addForm.sessionId);
    const b = {
      id:Date.now(), sessionId:s.id, sessionLabel:s.label, price:s.price,
      date:selDate, dateLabel:fmtDate(selDateObj), time:addForm.time,
      clientName:addForm.name.trim(), clientEmail:addForm.email.trim(),
      clientPhone:addForm.phone.trim(), payMethod:"inperson",
      payStatus:"unpaid", status:"confirmed",
      bookedAt:new Date().toISOString(), addedByAdmin:true,
    };
    await saveBooking(b);
    onUpdateBooking(b,"add");
    setShowAddModal(false);
    setAddForm({name:"",email:"",phone:"",sessionId:"1on1",time:"4:00 PM"});
  };

  const cancelBooking = async(b) => {
    if(!window.confirm(`Cancel ${b.clientName}'s session?`)) return;
    const updated = {...b,status:"cancelled"};
    await updateBooking(updated);
    onUpdateBooking(updated,"update");
  };

  const removeBooking = async(b) => {
    if(!window.confirm(`Remove ${b.clientName}'s booking?`)) return;
    await deleteBooking(b.id);
    onUpdateBooking(b,"delete");
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",
      background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>

      {/* Top nav */}
      <div style={{background:C.navyMid,borderBottom:`1px solid ${C.grayL}`,padding:"0 22px",
        position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 18px #00000044`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          height:58,maxWidth:900,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {logoUrl
              ? <img src={logoUrl} alt="Shoebox Sports"
                  style={{height:34,maxWidth:120,objectFit:"contain"}}
                  onError={e=>e.target.style.display="none"}/>
              : <Logo sz={30}/>}
            <div>
              <div style={{color:C.white,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif"}}>
                {COACH_NAME}
              </div>
              <div style={{color:C.sky,fontSize:11,fontWeight:600}}>Training Schedule</div>
            </div>
          </div>
          <button onClick={onSignOut}
            style={{background:"transparent",border:`1px solid ${C.grayL}`,borderRadius:50,
              padding:"7px 16px",color:C.gray,cursor:"pointer",fontWeight:700,fontSize:12,
              fontFamily:"'Barlow Condensed',sans-serif"}}>
            🔒 Sign Out
          </button>
        </div>
      </div>

      <div style={{padding:22,maxWidth:900,margin:"0 auto"}}>

        {/* Pending Bookings Alert */}
        {(()=>{
          const pending=bookings.filter(b=>b.status==="pending");
          if(!pending.length) return null;
          return (
            <div style={{background:C.gold+"18",border:`1px solid ${C.gold}55`,borderRadius:12,
              padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:20}}>⏳</div>
                <div>
                  <div style={{color:C.gold,fontWeight:800,fontSize:14}}>{pending.length} Pending Booking{pending.length!==1?"s":""}</div>
                  <div style={{color:C.gray,fontSize:12}}>Awaiting your approval</div>
                </div>
              </div>
              <button onClick={()=>setTab("pending")}
                style={{background:C.gold,border:"none",borderRadius:8,color:"#000",
                  cursor:"pointer",fontWeight:800,fontSize:13,padding:"8px 16px",fontFamily:"'Barlow Condensed',sans-serif"}}>
                Review →
              </button>
            </div>
          );
        })()}

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {[
            {l:"Today",v:bookings.filter(b=>b.date===dateKey(new Date())&&b.status==="confirmed").length,c:C.sky},
            {l:"This Week",v:(()=>{const week=getUpcomingDates(7).map(dateKey);return bookings.filter(b=>week.includes(b.date)&&b.status==="confirmed").length;})(),c:C.gold},
            {l:"Confirmed",v:bookings.filter(b=>b.status==="confirmed").length,c:C.green},
            {l:"Pending",v:bookings.filter(b=>b.status==="pending").length,c:C.gold},
          ].map(({l,v,c})=>(
            <div key={l} style={{background:C.navyMid,borderRadius:12,padding:"14px 16px",
              border:`1px solid ${C.grayL}`,textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
              <div style={{color:C.gray,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
          {[
            {id:"calendar",l:"📅 My Schedule"},
            {id:"upcoming",l:"📋 Upcoming"},
            {id:"pending",l:`⏳ Pending${bookings.filter(b=>b.status==="pending").length>0?" ("+bookings.filter(b=>b.status==="pending").length+")":""}`},
            {id:"groups",l:"👥 Groups"},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",
              border:`1px solid ${tab===t.id?C.sky:t.id==="pending"&&bookings.filter(b=>b.status==="pending").length>0?C.gold:C.grayL}`,
              background:tab===t.id?C.sky+"22":"transparent",
              color:tab===t.id?C.sky:t.id==="pending"&&bookings.filter(b=>b.status==="pending").length>0?C.gold:C.gray,
              fontWeight:700,fontSize:13}}>
              {t.l}
            </button>
          ))}
        </div>

        {/* ── CALENDAR TAB ── */}
        {tab==="calendar"&&<>
          {/* Date strip */}
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:16}}>
            {dates.map(d=>{
              const key=dateKey(d);
              const cnt=bookings.filter(b=>b.date===key&&b.status!=="cancelled").length;
              const isSel=selDate===key;
              const isToday=key===dateKey(new Date());
              return (
                <div key={key} onClick={()=>setSelDate(key)}
                  style={{flexShrink:0,width:60,background:isSel?C.sky:C.navyMid,
                    borderRadius:10,padding:"9px 6px",textAlign:"center",cursor:"pointer",
                    border:`2px solid ${isSel?C.sky:isToday?C.gold:C.grayL}`}}>
                  <div style={{color:isSel?"#fff":isToday?C.gold:C.gray,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>
                    {DAYS_OF_WEEK[d.getDay()].slice(0,3)}
                  </div>
                  <div style={{color:isSel?"#fff":C.white,fontWeight:800,fontSize:15,margin:"3px 0"}}>{d.getDate()}</div>
                  {cnt>0
                    ? <div style={{background:isSel?"rgba(255,255,255,0.3)":C.sky,borderRadius:50,
                        width:18,height:18,margin:"0 auto",display:"flex",alignItems:"center",
                        justifyContent:"center",color:"#fff",fontSize:10,fontWeight:800}}>{cnt}</div>
                    : <div style={{height:18}}/>}
                </div>
              );
            })}
          </div>

          {/* Day header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:C.white,fontWeight:800,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>
                {fmtDate(selDateObj)}
              </div>
              <div style={{color:C.gray,fontSize:12}}>
                {todayBookings.length} session{todayBookings.length!==1?"s":""} booked
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn v="teal" onClick={()=>setTab("groups")} sx={{padding:"8px 14px",fontSize:12}}>👥 + Group</Btn>
              <Btn v="org" onClick={()=>setShowAddModal(true)} sx={{padding:"8px 14px",fontSize:12}}>+ Add Client</Btn>
            </div>
          </div>

          {/* Time slots */}
          {allSlots.map(slot=>{
            const booking = todayBookings.find(b=>b.time===slot);
            const isBlocked = blockedSlots.includes(slot);
            const groupSlot = groupSlotsToday.find(gs=>gs.time===slot);
            return (
              <div key={slot} style={{display:"flex",gap:12,alignItems:"stretch",marginBottom:8}}>
                <div style={{width:70,flexShrink:0,color:C.gold,fontWeight:700,fontSize:12,
                  fontFamily:"'Barlow Condensed',sans-serif",paddingTop:14}}>{slot}</div>
                {groupSlot?(
                  <div style={{flex:1,background:C.sky+"11",borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${C.sky}44`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{color:C.sky,fontWeight:700,fontSize:14}}>👥 {groupSlot.name}</div>
                        <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                          Group Session · {(groupSlot.registrants||[]).length}/{groupSlot.maxPlayers} players
                        </div>
                      </div>
                      <Badge c={C.sky}>Group</Badge>
                    </div>
                  </div>
                ):booking?(
                  <div style={{flex:1,background:C.navyMid,borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${C.sky}44`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                      <div>
                        <div style={{color:C.white,fontWeight:700,fontSize:15}}>{booking.clientName}</div>
                        <div style={{color:C.gray,fontSize:12,marginTop:2}}>{booking.sessionLabel} · 1 hour</div>
                        {booking.clientPhone&&<div style={{color:C.sky,fontSize:12,marginTop:2}}>📞 {booking.clientPhone}</div>}
                        {booking.clientEmail&&<div style={{color:C.gray,fontSize:11,marginTop:1}}>✉️ {booking.clientEmail}</div>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <Badge c={booking.payStatus==="paid"?C.green:C.gold}>
                          {booking.payStatus==="paid"?"✓ Paid":"Unpaid"}
                        </Badge>
                        <button onClick={()=>cancelBooking(booking)}
                          style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                            borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Cancel
                        </button>
                        <button onClick={()=>removeBooking(booking)}
                          style={{background:C.grayD,border:`1px solid ${C.grayL}`,color:C.gray,
                            borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ):isBlocked?(
                  <div style={{flex:1,background:C.red+"11",borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${C.red}33`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color:C.red,fontSize:13,fontWeight:600}}>🚫 Blocked</div>
                    <button onClick={()=>toggleBlock(selDate,slot)}
                      style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,
                        borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      Unblock
                    </button>
                  </div>
                ):(
                  <div style={{flex:1,background:C.navy,borderRadius:10,padding:"12px 16px",
                    border:`1px dashed ${C.grayL}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color:C.grayL,fontSize:13}}>Available</div>
                    <button onClick={()=>toggleBlock(selDate,slot)}
                      style={{background:"transparent",border:`1px solid ${C.grayL}`,color:C.gray,
                        borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      Block
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>}

        {/* ── UPCOMING SESSIONS TAB ── */}
        {tab==="upcoming"&&<>
          {(() => {
            const upcoming = [...bookings]
              .filter(b=>b.status!=="cancelled"&&b.date>=dateKey(new Date()))
              .sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
            if(upcoming.length===0) return (
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <div style={{fontSize:36,marginBottom:12}}>📋</div>
                <div style={{color:C.white,fontWeight:700,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>No Upcoming Sessions</div>
                <div style={{color:C.gray,fontSize:13}}>Sessions will appear here when clients book</div>
              </div>
            );
            return upcoming.map(b=>(
              <div key={b.id} style={{background:C.navyMid,borderRadius:12,padding:"14px 16px",
                marginBottom:10,border:`1px solid ${C.sky}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{color:C.white,fontWeight:700,fontSize:15}}>{b.clientName}</div>
                    <div style={{color:C.gold,fontSize:13,fontWeight:600,marginTop:2}}>{b.dateLabel} · {b.time}</div>
                    <div style={{color:C.gray,fontSize:12,marginTop:2}}>{b.sessionLabel}</div>
                    {b.clientPhone&&<div style={{color:C.sky,fontSize:12,marginTop:4}}>📞 {b.clientPhone}</div>}
                    {b.clientEmail&&<div style={{color:C.gray,fontSize:11,marginTop:1}}>✉️ {b.clientEmail}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <Badge c={b.payStatus==="paid"?C.green:C.gold}>
                      {b.payStatus==="paid"?"✓ Paid":"Unpaid"}
                    </Badge>
                    <button onClick={()=>cancelBooking(b)}
                      style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                        borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                      Cancel
                    </button>
                    <button onClick={()=>removeBooking(b)}
                      style={{background:C.grayD,border:`1px solid ${C.grayL}`,color:C.gray,
                        borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ));
          })()}
        </>}

        {/* ── PENDING TAB ── */}
        {tab==="pending"&&<PendingBookings bookings={bookings} onUpdateBooking={onUpdateBooking}/>}

        {/* ── GROUPS TAB ── */}
        {tab==="groups"&&<>
          <div style={{color:C.gray,fontSize:13,marginBottom:16,lineHeight:1.6}}>
            Your recurring group training slots. Add players and create new groups here.
          </div>
          {(localSched?.groupSlots||[]).length===0&&<div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{fontSize:36,marginBottom:10}}>👥</div>
            <div style={{color:C.white,fontWeight:700,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:6}}>No Group Slots Yet</div>
            <div style={{color:C.gray,fontSize:13}}>Create a group using the form below</div>
          </div>}
          {(localSched?.groupSlots||[]).map((gs,gi)=>(
            <GroupSlotCard key={gs.id} gs={gs} gi={gi} schedule={localSched} onUpdateSchedule={(ns)=>{setLocalSched(ns);onUpdateSchedule(ns);}} showRemove={true} localSched={localSched} setLocalSched={setLocalSched}/>
          ))}
          <GroupCreateForm localSched={localSched} setLocalSched={setLocalSched} onUpdateSchedule={(ns)=>{setLocalSched(ns);onUpdateSchedule(ns);}} isCoach={false}/>
        </>}

      </div>

      {/* Add Client Modal */}
      {showAddModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",
          alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:28,width:400,maxWidth:"100%",
            border:`1px solid ${C.sky}55`,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>Add Client</div>
              <button onClick={()=>setShowAddModal(false)} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:20}}>×</button>
            </div>
            <div style={{color:C.sky,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14}}>
              {fmtDate(selDateObj)}
            </div>
            {[{k:"name",l:"Client Name *",p:"Full name",t:"text"},{k:"phone",l:"Phone",p:"(555) 555-5555",t:"tel"},{k:"email",l:"Email",p:"email@example.com",t:"email"}].map(({k,l,p,t})=>(
              <div key={k} style={{marginBottom:12}}>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
                <input value={addForm[k]||""} onChange={e=>upd(k,e.target.value)} placeholder={p} type={t}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                    color:C.white,fontSize:14,padding:"10px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Session</div>
                <select value={addForm.sessionId} onChange={e=>upd("sessionId",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                    color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  {SESSIONS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Time</div>
                <select value={addForm.time} onChange={e=>upd("time",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                    color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  {allSlots.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setShowAddModal(false)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="pri" onClick={addClient} dis={!addForm.name?.trim()} sx={{flex:2}}>Add to Schedule</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PUBLIC HOME PAGE ─────────────────────────────────────────────────────────
function PublicHome({data, onSelectTournament, logoUrl, onRegister, onRegister3v3, onBooking}) {
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
            <div style={{color:C.gray,fontSize:12,marginBottom:4}}>📍 {t.location}</div>
            {t.regCloseDate&&(()=>{
              const closed=new Date(t.regCloseDate+"T23:59:59")<new Date();
              return (
                <div style={{color:closed?C.red:C.gold,fontSize:12,fontWeight:600}}>
                  {closed?`⛔ Registration closed ${fmtD(t.regCloseDate)}`:`⏰ Reg. closes ${fmtD(t.regCloseDate)}`}
                </div>
              );
            })()}
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
        {/* Register CTA — 5v5 tournaments */}
        <div onClick={onRegister}
          style={{background:`linear-gradient(135deg,#E8770A,#F59B30)`,borderRadius:14,
            padding:"16px 20px",marginBottom:12,cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            boxShadow:"0 4px 20px #E8770A44"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <div style={{background:"rgba(255,255,255,0.25)",borderRadius:6,padding:"2px 8px",
                color:"#fff",fontWeight:900,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>5v5</div>
              <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>Register Your Team</div>
            </div>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:13}}>Sign up for an upcoming 5v5 tournament</div>
          </div>
          <div style={{color:"#fff",fontSize:24}}>📝</div>
        </div>

        {/* 3v3 Register CTA */}
        <div onClick={onRegister3v3}
          style={{background:`linear-gradient(135deg,${C.sky},${C.light})`,borderRadius:14,
            padding:"16px 20px",marginBottom:12,cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            boxShadow:`0 4px 20px ${C.sky}44`}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <div style={{background:"rgba(255,255,255,0.25)",borderRadius:6,padding:"2px 8px",
                color:"#fff",fontWeight:900,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>3v3</div>
              <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>Register Your Team</div>
            </div>
            <div style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>Sign up for 3v3 tournament play</div>
          </div>
          <div style={{color:"#fff",fontSize:24}}>🏀</div>
        </div>

        {/* Training Sessions CTA */}
        <div onClick={onBooking}
          style={{background:`linear-gradient(135deg,#6B3FA0,#9B59B6)`,borderRadius:14,
            padding:"16px 20px",marginBottom:20,cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            boxShadow:"0 4px 20px #6B3FA044"}}>
          <div>
            <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:3}}>
              Training Sessions
            </div>
            <div style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>Book a session with {COACH_NAME} · 1-on-1 & Group</div>
          </div>
          <div style={{color:"#fff",fontSize:24}}>🏋️</div>
        </div>
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
function PublicTournament({tournament, onBack, onRegister, onViewTeams}) {
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
        padding:"16px 16px 0",borderBottom:`1px solid ${C.grayL}`}}>
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
        {/* Register + View Teams buttons */}
        {(tournament.status==="upcoming"||tournament.status==="active")&&(
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <Btn v="org" onClick={onRegister} sx={{flex:1,padding:"10px 0",fontSize:13}}>📝 Register Your Team</Btn>
            <Btn v="teal" onClick={onViewTeams} sx={{flex:1,padding:"10px 0",fontSize:13}}>👀 View Registered Teams</Btn>
          </div>
        )}
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

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://xetqslvyqcydblldqsrc.supabase.co";
const SUPABASE_KEY = "sb_publishable_0Dw8EvFfl1xA-__QXvUI_Q_mUHAGUlq";
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

// Public fetch — used for tournaments and registrations
async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "",
      ...opts.headers,
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Secure fetch — used for bookings and coach schedule (bypasses RLS)
async function sbSecure(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "",
      ...opts.headers,
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadFromDB() {
  const rows = await sbFetch("/tournaments?select=*&order=created_at.asc");
  if (!rows || rows.length === 0) return { tournaments: [] };
  return { tournaments: rows.map(r => r.data) };
}

async function updateTournamentInDB(tournament) {
  const res = await sbSecure(`/tournaments?id=eq.${tournament.id}`, {
    method: "PATCH",
    body: JSON.stringify({ data: tournament }),
    prefer: "return=minimal",
  });
  if(res===null) console.error("updateTournamentInDB failed for id:", tournament.id);
  return res;
}

async function saveTournamentToDB(tournament) {
  const res = await sbSecure("/tournaments", {
    method: "POST",
    body: JSON.stringify({ id: tournament.id, data: tournament }),
    prefer: "resolution=merge-duplicates",
  });
  if(res===null) console.error("saveTournamentToDB failed for id:", tournament.id);
  return res;
}

async function loadRegistrations() {
  const rows = await sbSecure("/registrations?select=*&order=created_at.asc");
  return rows || [];
}

async function saveRegistration(reg) {
  await sbSecure("/registrations", {
    method: "POST",
    body: JSON.stringify({ id: reg.id, data: reg }),
    prefer: "resolution=merge-duplicates",
  });
}

async function updateRegistration(reg) {
  await sbSecure(`/registrations?id=eq.${reg.id}`, {
    method: "PATCH",
    body: JSON.stringify({ data: reg }),
  });
}

async function deleteRegistration(id) {
  await sbSecure(`/registrations?id=eq.${id}`, { method: "DELETE" });
}

// Bookings — use service role for all operations (data is protected)
async function loadBookings() {
  const rows = await sbSecure("/bookings?select=*&order=created_at.asc");
  return rows || [];
}
async function saveBooking(b) {
  await sbSecure("/bookings", {
    method:"POST", headers:{"Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify({id:b.id, data:b}),
  });
}
async function updateBooking(b) {
  await sbSecure(`/bookings?id=eq.${b.id}`, {
    method:"PATCH", body:JSON.stringify({data:b}),
  });
}
async function deleteBooking(id) {
  await sbSecure(`/bookings?id=eq.${id}`, {method:"DELETE"});
}

// Coach schedule — use service role for all operations (data is protected)
async function loadSchedule() {
  const rows = await sbSecure("/coach_schedule?select=*");
  if(!rows||!rows.length) return {availability:{},blocked:[]};
  return rows[0].data || {availability:{},blocked:[]};
}
async function saveSchedule(sched) {
  await sbSecure("/coach_schedule", {
    method:"POST", headers:{"Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify({id:1, data:sched}),
  });
}

// ─── PUBLIC REGISTRATION FORM ────────────────────────────────────────────────
const PAYMENT_LINK = "https://theshoeboxsports.cloveronline.com/shop#Tournament";
const PAYMENT_LABEL = "theshoeboxsports.cloveronline.com/shop#Tournament";
// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────────
const EJS = {
  serviceId:              "service_5zrpxvj",
  bookingRequestTemplate: "template_zjkndgr",  // → customer: booking request received
  trainingRequestTemplate:"template_l2hcfe7",  // → Coach Star/Admin: new booking notification
  approvedTemplate:       "template_h6s6hlk",  // → customer: session approved
  declinedTemplate:       "template_471677p",  // → customer: session declined
  coachTemplate:          "template_xzsta4c",  // → coach/team: new tournament registration
  adminTemplate:          "template_yykska3",  // → admin: new team registered
  publicKey:              "iFaGCl_1cFBylbGdi",
};

async function sendEmail(templateId, params) {
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:      EJS.serviceId,
        template_id:     templateId,
        user_id:         EJS.publicKey,
        template_params: params,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`EmailJS failed [${templateId}]: ${res.status} — ${text}`);
      return false;
    }
    console.log(`EmailJS success [${templateId}]:`, text);
    return true;
  } catch(e) {
    console.error(`EmailJS exception [${templateId}]:`, e);
    return false;
  }
}

function RegistrationForm({data, onSubmit, onBack}) {
  const [form,setForm]=useState({
    tournamentId:"", coachName:"", phone:"", email:"", agreed:false
  });
  // Multiple teams — each has its own name, grade, gender
  const [teams,setTeams]=useState([
    {id:1, teamName:"", gradeId:"", gender:"Boys"}
  ]);
  const [submitted,setSubmitted]=useState(false);
  const [submittedTeams,setSubmittedTeams]=useState([]);
  const [submitting,setSubmitting]=useState(false);
  const [errors,setErrors]=useState({});

  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updTeam=(id,k,v)=>setTeams(ts=>ts.map(t=>t.id===id?{...t,[k]:v}:t));
  const addTeam=()=>setTeams(ts=>[...ts,{id:Date.now(),teamName:"",gradeId:"",gender:"Boys"}]);
  const removeTeam=(id)=>{ if(teams.length>1) setTeams(ts=>ts.filter(t=>t.id!==id)); };

  const selTournament = data.tournaments.find(t=>
    t.id===parseInt(form.tournamentId)||t.id===form.tournamentId
  );

  // Check if registration is closed
  const isRegClosed = selTournament?.regCloseDate
    ? new Date(selTournament.regCloseDate+"T23:59:59") < new Date()
    : false;

  const isDivFull=(gradeId,gender)=>{
    if(!selTournament) return false;
    const div=selTournament.divisions.find(d=>d.gradeId===gradeId&&d.gender===gender);
    if(!div) return false;
    const cap=div.capacity||8;
    const regs=(selTournament.registrations||[]).filter(r=>r.gradeId===gradeId&&r.gender===gender&&r.status!=="rejected");
    return regs.length>=cap;
  };

  const validate=()=>{
    const e={};
    if(!form.tournamentId) e.tournamentId="Please select a tournament";
    if(isRegClosed) e.tournamentId="Registration for this tournament is closed";
    if(!form.coachName.trim()) e.coachName="Coach name is required";
    if(!form.phone.trim()) e.phone="Phone number is required";
    if(!form.email.trim()||!form.email.includes("@")) e.email="Valid email is required";
    if(!form.agreed) e.agreed="You must agree to the terms";
    teams.forEach((t,i)=>{
      if(!t.teamName.trim()) e[`teamName_${t.id}`]=`Team ${i+1} name is required`;
      if(!t.gradeId) e[`gradeId_${t.id}`]=`Team ${i+1} needs a grade division`;
      if(isDivFull(t.gradeId,t.gender)) e[`full_${t.id}`]=`${dlabel(t.gradeId,t.gender)} is full`;
    });
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const handleSubmit=async()=>{
    if(!validate()) return;
    setSubmitting(true);
    const now=new Date().toISOString();
    const regs=teams.map((t,i)=>({
      id:Date.now()+i,
      tournamentId:selTournament.id,
      tournamentName:selTournament.name,
      teamName:t.teamName.trim(),
      coachName:form.coachName.trim(),
      phone:form.phone.trim(),
      email:form.email.trim(),
      gradeId:t.gradeId,
      gender:t.gender,
      status:"pending",
      paymentStatus:"unpaid",
      submittedAt:now,
    }));

    // Save all registrations to DB
    for(const reg of regs) await onSubmit(reg);

    // Build teams list string for emails
    const teamsList = regs.map((r,i)=>
      `${i+1}. ${r.teamName} — ${dlabel(r.gradeId,r.gender)}`
    ).join("\n");

    const tournamentDates = tDates(selTournament).map(fmtD).join(" → ");

    // Send admin notification email
    await sendEmail(EJS.adminTemplate, {
      tournament_dates: tournamentDates,
      location:         selTournament.location,
      coach_name:       form.coachName.trim(),
      coach_email:      form.email.trim(),
      coach_phone:      form.phone.trim(),
      teams_list:       teamsList,
      team_count:       String(regs.length),
      submitted_at:     new Date(now).toLocaleString(),
    });

    // Send coach confirmation email
    await sendEmail(EJS.coachTemplate, {
      coach_name:       form.coachName.trim(),
      coach_email:      form.email.trim(),
      tournament_name:  selTournament.name,
      tournament_dates: tournamentDates,
      location:         selTournament.location,
      teams_list:       teamsList,
      team_count:       String(regs.length),
      payment_link:     PAYMENT_LINK,
    });

    setSubmittedTeams(regs);
    setSubmitting(false);
    setSubmitted(true);
  };

  const FErr=({k})=>errors[k]
    ?<div style={{color:C.red,fontSize:11,marginTop:4,fontWeight:600}}>{errors[k]}</div>
    :null;

  // ── Confirmation screen ──
  if(submitted) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      <div style={{padding:"40px 24px 24px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🎉</div>
        <div style={{color:C.green,fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
          Registration Submitted!
        </div>
        <div style={{color:C.gray,fontSize:14,marginBottom:20,lineHeight:1.6}}>
          <strong style={{color:C.white}}>{submittedTeams.length} team{submittedTeams.length>1?"s":""}</strong> registered for <strong style={{color:C.white}}>{selTournament?.name}</strong>.<br/>
          You'll be contacted at <span style={{color:C.sky}}>{form.email}</span> once approved.
        </div>

        {/* Teams summary */}
        <div style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:20,textAlign:"left"}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
            Registered Teams
          </div>
          {submittedTeams.map((t,i)=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"10px 0",borderTop:i>0?`1px solid ${C.grayL}`:"none"}}>
              <div>
                <div style={{color:C.white,fontWeight:700,fontSize:14}}>{t.teamName}</div>
                <div style={{color:C.gray,fontSize:12}}>{dlabel(t.gradeId,t.gender)}</div>
              </div>
              <Badge c={C.gold}>Pending</Badge>
            </div>
          ))}
        </div>

        {/* Clover payment */}
        <div style={{background:C.navyMid,borderRadius:16,padding:24,marginBottom:20,border:`1px solid ${C.gold}44`}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
            💰 Complete Your Payment
          </div>
          <div style={{color:C.gray,fontSize:13,marginBottom:16,lineHeight:1.6}}>
            Send your registration fee{submittedTeams.length>1?" for each team":""} through our secure Clover payment page.
            Include <strong style={{color:C.white}}>each team name</strong> and the <strong style={{color:C.white}}>tournament name</strong> in the note.
          </div>
          <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
            style={{display:"inline-block",background:`linear-gradient(135deg,#00A651,#007A3D)`,color:"#fff",fontWeight:800,fontSize:15,
              padding:"13px 28px",borderRadius:10,textDecoration:"none",
              fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.06em",textTransform:"uppercase"}}>
            Pay Now →
          </a>
          <div style={{color:C.gray,fontSize:11,marginTop:10}}>{PAYMENT_LABEL}</div>
        </div>

        <Btn v="pri" onClick={onBack} sx={{padding:"11px 24px"}}>← Back to Tournaments</Btn>
      </div>
    </div>
  );

  // ── Registration Form ──
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      <div style={{background:`linear-gradient(160deg,${C.navyLight},${C.navyMid})`,
        padding:"24px 20px",borderBottom:`1px solid ${C.grayL}`}}>
        <div style={{color:C.sky,fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Shoebox Sports</div>
        <div style={{color:C.white,fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed',sans-serif"}}>Team Registration</div>
        <div style={{color:C.gray,fontSize:13,marginTop:4}}>Register one or more teams for an upcoming tournament</div>
      </div>

      <div style={{padding:20}}>

        {/* Tournament */}
        <div style={{marginBottom:18}}>
          <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tournament *</div>
          <select value={form.tournamentId} onChange={e=>{upd("tournamentId",e.target.value);setTeams(ts=>ts.map(t=>({...t,gradeId:""})));}}
            style={{width:"100%",background:C.navyMid,border:`1px solid ${errors.tournamentId?C.red:C.grayL}`,
              borderRadius:8,color:form.tournamentId?C.white:C.gray,fontSize:14,padding:"11px 14px",
              outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}>
            <option value="">Select a tournament...</option>
            {data.tournaments.filter(t=>t.status==="upcoming"||t.status==="active").map(t=>{
              const closed=t.regCloseDate&&new Date(t.regCloseDate+"T23:59:59")<new Date();
              return (
                <option key={t.id} value={t.id}>
                  {t.name} — {tDates(t).map(fmtD).join(" → ")}{closed?" (Registration Closed)":""}
                </option>
              );
            })}
          </select>
          {selTournament?.regCloseDate&&(
            <div style={{marginTop:6}}>
              {isRegClosed?(
                <div style={{background:C.red+"22",border:`1px solid ${C.red}44`,borderRadius:8,
                  padding:"8px 12px",color:C.red,fontSize:12,fontWeight:700}}>
                  ⛔ Registration closed on {fmtD(selTournament.regCloseDate)}
                </div>
              ):(
                <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:8,
                  padding:"8px 12px",color:C.gold,fontSize:12,fontWeight:600}}>
                  ⏰ Registration closes {fmtD(selTournament.regCloseDate)}
                </div>
              )}
            </div>
          )}
          <FErr k="tournamentId"/>
        </div>

        {/* Coach info */}
        <div style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:18,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14}}>
            Coach / Contact Information
          </div>
          {[
            {k:"coachName",l:"Coach Name *",p:"Full name",type:"text"},
            {k:"phone",l:"Phone Number *",p:"(555) 555-5555",type:"tel"},
            {k:"email",l:"Email Address *",p:"coach@email.com",type:"email"},
          ].map(({k,l,p,type})=>(
            <div key={k} style={{marginBottom:12}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
              <input value={form[k]} onChange={e=>upd(k,e.target.value)} placeholder={p} type={type}
                style={{width:"100%",background:C.navy,border:`1px solid ${errors[k]?C.red:C.grayL}`,
                  borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",
                  outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              <FErr k={k}/>
            </div>
          ))}
        </div>

        {/* Teams */}
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:C.white,fontWeight:800,fontSize:16,fontFamily:"'Barlow Condensed',sans-serif"}}>
              Teams ({teams.length})
            </div>
            <Btn v="teal" onClick={addTeam} sx={{padding:"7px 16px",fontSize:12}}>+ Add Team</Btn>
          </div>

          {teams.map((team,i)=>(
            <div key={team.id} style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:12,
              border:`1px solid ${errors[`teamName_${team.id}`]||errors[`gradeId_${team.id}`]||errors[`full_${team.id}`]?C.red:C.grayL}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:C.gold,fontWeight:800,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                  Team {i+1}
                </div>
                {teams.length>1&&(
                  <button onClick={()=>removeTeam(team.id)}
                    style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                      borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    ✕ Remove
                  </button>
                )}
              </div>

              {/* Team Name */}
              <div style={{marginBottom:12}}>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Team Name *</div>
                <input value={team.teamName} onChange={e=>updTeam(team.id,"teamName",e.target.value)}
                  placeholder="e.g. Detroit Ballers"
                  style={{width:"100%",background:C.navy,border:`1px solid ${errors[`teamName_${team.id}`]?C.red:C.grayL}`,
                    borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",
                    outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                <FErr k={`teamName_${team.id}`}/>
              </div>

              {/* Grade + Gender */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Grade *</div>
                  <select value={team.gradeId} onChange={e=>updTeam(team.id,"gradeId",e.target.value)}
                    style={{width:"100%",background:C.navy,border:`1px solid ${errors[`gradeId_${team.id}`]?C.red:C.grayL}`,
                      borderRadius:8,color:team.gradeId?C.white:C.gray,fontSize:13,padding:"11px 12px",
                      outline:"none",fontFamily:"inherit"}}>
                    <option value="">Select grade...</option>
                    {selTournament
                      ? [...new Set(selTournament.divisions.map(d=>d.gradeId))].map(g=>{
                          const full=isDivFull(g,team.gender);
                          return <option key={g} value={g} disabled={full}>{GDL[g]||g}{full?" (FULL)":""}</option>;
                        })
                      : GD.map(g=><option key={g.id} value={g.id}>{GDL[g.id]||g.id}</option>)
                    }
                  </select>
                  <FErr k={`gradeId_${team.id}`}/>
                </div>
                <div>
                  <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Gender *</div>
                  <select value={team.gender} onChange={e=>updTeam(team.id,"gender",e.target.value)}
                    style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,
                      borderRadius:8,color:C.white,fontSize:13,padding:"11px 12px",outline:"none",fontFamily:"inherit"}}>
                    <option>Boys</option><option>Girls</option>
                  </select>
                </div>
              </div>
              {errors[`full_${team.id}`]&&(
                <div style={{color:C.red,fontSize:11,marginTop:8,fontWeight:600}}>⚠ {errors[`full_${team.id}`]}</div>
              )}
            </div>
          ))}

          {/* Add team button at bottom */}
          <button onClick={addTeam}
            style={{width:"100%",padding:"12px 0",background:"transparent",
              border:`2px dashed ${C.sky}55`,borderRadius:12,color:C.sky,cursor:"pointer",
              fontWeight:700,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif",
              letterSpacing:"0.06em",textTransform:"uppercase"}}>
            + Add Another Team
          </button>
        </div>

        {/* Payment info */}
        <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:13,marginBottom:4}}>💰 Payment Info</div>
          <div style={{color:C.gray,fontSize:13,lineHeight:1.6}}>
            After submitting, complete payment through our secure Clover page at <strong style={{color:C.white}}>{PAYMENT_LABEL}</strong>.
            Include each team name and tournament name in the note. Registration is not confirmed until payment is received.
          </div>
        </div>

        {/* Terms */}
        <div style={{background:C.navyMid,borderRadius:10,padding:"14px 16px",marginBottom:16,
          border:`1px solid ${errors.agreed?C.red:C.grayL}`}}>
          <div style={{color:C.white,fontWeight:700,fontSize:13,marginBottom:10}}>Terms & Waiver</div>
          <div style={{color:C.gray,fontSize:12,lineHeight:1.7,marginBottom:14,maxHeight:120,overflowY:"auto"}}>
            By registering, I acknowledge that: (1) All participants must follow Shoebox Sports rules and code of conduct. (2) Shoebox Sports is not liable for injuries sustained during tournament play. (3) Registration fees are non-refundable unless the tournament is cancelled by Shoebox Sports. (4) Teams may be disqualified for unsportsmanlike conduct. (5) Photo and video of participants may be used for promotional purposes. (6) The coach listed is responsible for all players on the roster. (7) Shoebox Sports reserves the right to refuse registration at their discretion.
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={form.agreed} onChange={e=>upd("agreed",e.target.checked)}
              style={{width:18,height:18,cursor:"pointer",accentColor:C.sky}}/>
            <span style={{color:C.white,fontSize:13,fontWeight:600}}>I agree to the terms and waiver above</span>
          </label>
          <FErr k="agreed"/>
        </div>

        <Btn v="org" onClick={handleSubmit} dis={submitting||isRegClosed}
          sx={{width:"100%",padding:"14px 0",fontSize:15,marginBottom:12,
            opacity:isRegClosed?0.5:1}}>
          {isRegClosed?"Registration Closed":submitting?"Submitting...":
            `Submit ${teams.length} Team Registration${teams.length>1?"s":""} →`}
        </Btn>
        <button onClick={onBack}
          style={{width:"100%",background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:13,padding:"8px 0"}}>
          ← Back to Tournaments
        </button>
      </div>
    </div>
  );
}

// ─── PUBLIC TEAM LIST ─────────────────────────────────────────────────────────
function PublicTeamList({tournament, onBack}) {
  const dates = tDates(tournament);
  const regs = (tournament.registrations||[]).filter(r=>r.status==="approved");
  const byDiv = {};
  tournament.divisions.forEach(d=>{
    const key=`${d.gradeId}-${d.gender}`;
    byDiv[key]={div:d, teams:regs.filter(r=>r.gradeId===d.gradeId&&r.gender===d.gender)};
  });

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      <div style={{background:`linear-gradient(160deg,${C.navyLight},${C.navyMid})`,padding:"20px 18px",borderBottom:`1px solid ${C.grayL}`}}>
        <div style={{color:C.white,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed',sans-serif"}}>{tournament.name}</div>
        <div style={{color:C.gray,fontSize:12,marginTop:4}}>📅 {dates.map(fmtD).join(" → ")} · Registered Teams</div>
      </div>
      <div style={{padding:16}}>
        {Object.entries(byDiv).map(([key,{div,teams}],i)=>{
          const cap=div.capacity||8;
          const pendingCount=(tournament.registrations||[]).filter(r=>r.gradeId===div.gradeId&&r.gender===div.gender&&r.status==="pending").length;
          return (
            <Card key={key} sx={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:dc(i),fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>{dlabel(div.gradeId,div.gender)}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <Badge c={teams.length>=cap?C.red:C.green}>{teams.length}/{cap} teams</Badge>
                  {pendingCount>0&&<Badge c={C.gold}>{pendingCount} pending</Badge>}
                </div>
              </div>
              {teams.length===0?(
                <div style={{color:C.gray,fontSize:13,textAlign:"center",padding:"10px 0"}}>No approved teams yet</div>
              ):(
                teams.map((reg,ti)=>(
                  <div key={reg.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:ti>0?`1px solid ${C.grayL}`:"none"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:dc(i)+"33",border:`1px solid ${dc(i)}66`,
                      display:"flex",alignItems:"center",justifyContent:"center",color:dc(i),fontWeight:800,fontSize:12,flexShrink:0}}>{ti+1}</div>
                    <div style={{flex:1}}>
                      <div style={{color:C.white,fontWeight:700,fontSize:14}}>{reg.teamName}</div>
                      <div style={{color:C.gray,fontSize:11}}>Coach: {reg.coachName}</div>
                    </div>
                    <Badge c={C.green}>Registered</Badge>
                  </div>
                ))
              )}
              {/* Capacity bar */}
              <div style={{marginTop:12,background:C.grayL,borderRadius:4,height:4}}>
                <div style={{width:`${Math.min(teams.length/cap*100,100)}%`,height:"100%",
                  background:teams.length>=cap?C.red:C.green,borderRadius:4,transition:"width 0.3s"}}/>
              </div>
              <div style={{color:C.gray,fontSize:10,marginTop:4}}>
                {cap-teams.length>0?`${cap-teams.length} spot${cap-teams.length!==1?"s":""} remaining`:"Division Full"}
              </div>
            </Card>
          );
        })}
        <button onClick={onBack} style={{width:"100%",background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:13,padding:"12px 0"}}>← Back</button>
      </div>
    </div>
  );
}

// ─── ADMIN REGISTRATIONS TAB ──────────────────────────────────────────────────
function AdminRegistrations({tournament, onUpdateTournament}) {
  const [filterDiv,setFilterDiv]=useState("all");
  const [filterStatus,setFilterStatus]=useState("all");
  const [showCapModal,setShowCapModal]=useState(false);
  const regs = (tournament.registrations||[]).filter(r=>{
    const divMatch = filterDiv==="all"||(r.gradeId+"-"+r.gender===filterDiv);
    const statusMatch = filterStatus==="all"||r.status===filterStatus||r.paymentStatus===filterStatus;
    return divMatch&&statusMatch;
  });

  const updateReg=(regId,changes)=>{
    const updated={...tournament,registrations:(tournament.registrations||[]).map(r=>r.id===regId?{...r,...changes}:r)};
    onUpdateTournament(updated);
  };

  const deleteReg=(regId)=>{
    const updated={...tournament,registrations:(tournament.registrations||[]).filter(r=>r.id!==regId)};
    onUpdateTournament(updated);
  };

  const approveAndAdd=(reg)=>{
    const teamId = Date.now() + Math.floor(Math.random()*10000);
    const regId  = Date.now() + Math.floor(Math.random()*10000) + 1;
    const is3v3  = tournament.type==="3v3";

    let divisions=[...tournament.divisions];
    let div = is3v3
      ? divisions.find(d=>d.gradeId===reg.gradeId)
      : divisions.find(d=>d.gradeId===reg.gradeId&&d.gender===reg.gender);

    if(!div){
      // Auto-create the division
      if(is3v3){
        const divDef=THREEV3_DIVISIONS.find(d=>d.id===reg.gradeId);
        div={id:`div-${regId}`,gradeId:reg.gradeId,gender:"",
          label:divDef?.label||reg.gradeId,color:divDef?.color||C.sky,
          type:"3v3",teams:[],capacity:8};
      } else {
        div={id:`div-${regId}`,gradeId:reg.gradeId,gender:reg.gender,teams:[],capacity:8};
      }
      divisions=[...divisions,div];
    }

    // Find first empty placeholder slot in this division
    const emptySlotIdx = div.teams.findIndex(t=>!t.name||t.name.trim()==="");

    let updatedTeams;
    if(emptySlotIdx>=0){
      // Fill the existing empty slot
      updatedTeams = div.teams.map((t,i)=>i===emptySlotIdx
        ? {...t, name:reg.teamName, players:reg.players||[]}
        : t
      );
    } else {
      // No empty slot — assign pool balance for 3v3, pool A for 5v5
      let pool="A";
      if(is3v3){
        const poolA=div.teams.filter(t=>t.pool==="A").length;
        const poolB=div.teams.filter(t=>t.pool==="B").length;
        pool=poolA<=poolB?"A":"B";
      }
      const newTeam={id:teamId,name:reg.teamName,pool,wins:0,losses:0,pf:0,pa:0,players:reg.players||[]};
      updatedTeams=[...div.teams,newTeam];
    }

    const updated={
      ...tournament,
      divisions:divisions.map(d=>d.id===div.id?{...d,teams:updatedTeams}:d),
      registrations:(tournament.registrations||[]).map(r=>
        r.id===reg.id?{...r,status:"approved",teamId:emptySlotIdx>=0?div.teams[emptySlotIdx].id:teamId}:r),
    };
    onUpdateTournament(updated);
  };

  const totalRegs=(tournament.registrations||[]).length;
  const pendingCount=(tournament.registrations||[]).filter(r=>r.status==="pending").length;
  const paidCount=(tournament.registrations||[]).filter(r=>r.paymentStatus==="paid").length;

  return (
    <div>
      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
        {[{l:"Total",v:totalRegs,c:C.sky},{l:"Pending",v:pendingCount,c:C.gold},{l:"Paid",v:paidCount,c:C.green},{l:"Unpaid",v:totalRegs-paidCount,c:C.red}].map(({l,v,c})=>(
          <div key={l} style={{background:C.navyMid,borderRadius:12,padding:"14px 16px",border:`1px solid ${C.grayL}`,textAlign:"center"}}>
            <div style={{fontSize:28,fontWeight:900,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
            <div style={{color:C.gray,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters + capacity button */}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <select value={filterDiv} onChange={e=>setFilterDiv(e.target.value)}
          style={{background:C.navyLight,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"9px 14px",outline:"none",cursor:"pointer"}}>
          <option value="all">All Divisions</option>
          {tournament.divisions.map(d=><option key={d.id} value={`${d.gradeId}-${d.gender}`}>{dlabel(d.gradeId,d.gender)}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{background:C.navyLight,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"9px 14px",outline:"none",cursor:"pointer"}}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <Btn v="teal" onClick={()=>setShowCapModal(true)} sx={{marginLeft:"auto",padding:"9px 16px",fontSize:12}}>⚙️ Division Capacity</Btn>
      </div>

      {/* Registration cards */}
      {regs.length===0?(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <div style={{color:C.white,fontWeight:700,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>No Registrations Yet</div>
          <div style={{color:C.gray,fontSize:13}}>Registrations will appear here when teams sign up</div>
        </div>
      ):regs.map(reg=>{
        const div=tournament.divisions.find(d=>d.gradeId===reg.gradeId&&d.gender===reg.gender);
        const divIdx=tournament.divisions.indexOf(div);
        const col=divIdx>=0?dc(divIdx):C.gray;
        const isApproved=reg.status==="approved";
        const isPaid=reg.paymentStatus==="paid";
        return (
          <Card key={reg.id} sx={{marginBottom:12,border:`1px solid ${isApproved?C.green+"44":C.grayL}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{color:C.white,fontWeight:800,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>{reg.teamName}</div>
                <div style={{color:C.gray,fontSize:12,marginTop:2}}>Coach: {reg.coachName} · {reg.phone} · {reg.email}</div>
                <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                  <Badge c={col}>{dlabel(reg.gradeId,reg.gender)}</Badge>
                  <Badge c={reg.status==="approved"?C.green:reg.status==="rejected"?C.red:C.gold}>{reg.status}</Badge>
                  <Badge c={isPaid?C.green:C.red}>{reg.paymentStatus}</Badge>
                </div>
                <div style={{color:C.gray,fontSize:10,marginTop:6}}>Submitted: {new Date(reg.submittedAt).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:12,borderTop:`1px solid ${C.grayL}`}}>
              {/* Status */}
              <select value={reg.status} onChange={e=>updateReg(reg.id,{status:e.target.value})}
                style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:12,padding:"7px 10px",outline:"none",cursor:"pointer"}}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              {/* Payment */}
              <select value={reg.paymentStatus} onChange={e=>updateReg(reg.id,{paymentStatus:e.target.value})}
                style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:12,padding:"7px 10px",outline:"none",cursor:"pointer"}}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
              {/* Approve & Add to Division */}
              {!isApproved&&(
                <Btn v="ok" onClick={()=>approveAndAdd(reg)} sx={{padding:"7px 14px",fontSize:12}}>
                  ✓ Approve & Add to Division
                </Btn>
              )}
              {isApproved&&(
                <div style={{display:"flex",alignItems:"center",gap:6,color:C.green,fontSize:12,fontWeight:700}}>
                  ✓ Added to {dlabel(reg.gradeId,reg.gender)}
                </div>
              )}
              {/* Delete */}
              <Btn v="danger" onClick={()=>{if(window.confirm(`Remove ${reg.teamName}?`))deleteReg(reg.id);}} sx={{padding:"7px 12px",fontSize:12,marginLeft:"auto"}}>🗑</Btn>
            </div>
          </Card>
        );
      })}

      {/* Division Capacity Modal */}
      {showCapModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:28,width:420,maxWidth:"100%",border:`1px solid ${C.sky}55`,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>Division Capacity</div>
              <button onClick={()=>setShowCapModal(false)} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:20}}>×</button>
            </div>
            <div style={{color:C.gray,fontSize:13,marginBottom:18}}>Set the maximum number of teams allowed per division. Registration will close automatically when full.</div>
            {tournament.divisions.map((div,i)=>{
              const cap=div.capacity||8;
              const regCount=(tournament.registrations||[]).filter(r=>r.gradeId===div.gradeId&&r.gender===div.gender&&r.status!=="rejected").length;
              return (
                <div key={div.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.grayL}`}}>
                  <div style={{flex:1,color:C.white,fontWeight:600,fontSize:13}}>{dlabel(div.gradeId,div.gender)}</div>
                  <div style={{color:C.gray,fontSize:12}}>{regCount} registered</div>
                  <select value={cap} onChange={e=>{
                    const updated={...tournament,divisions:tournament.divisions.map(d=>d.id===div.id?{...d,capacity:parseInt(e.target.value)}:d)};
                    onUpdateTournament(updated);
                  }} style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"7px 10px",outline:"none",cursor:"pointer"}}>
                    {[4,5,6,7,8].map(n=><option key={n} value={n}>{n} teams max</option>)}
                  </select>
                </div>
              );
            })}
            <div style={{marginTop:20}}>
              <Btn v="pri" onClick={()=>setShowCapModal(false)} sx={{width:"100%",padding:"12px 0"}}>Done</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3V3 CONSTANTS ────────────────────────────────────────────────────────────
const THREEV3_DIVISIONS = [
  { id:"hs_boys",   label:"High School Boys",  color:"#2A9ED8" },
  { id:"mens_1930", label:"Men's 19-30",        color:"#27C97A" },
  { id:"mens_30p",  label:"Men's 30+",          color:"#B57BFF" },
  { id:"womens",    label:"Women's",            color:"#FF6B9D" },
];

// ─── 3V3 REGISTRATION FORM ────────────────────────────────────────────────────
function ThreevThreeForm({onBack, logoUrl, data, onSubmit}) {
  const [form, setForm] = useState({
    teamName:"", division:"", tournamentId:"", email:"", phone:"",
    player1:"", player2:"", player3:"",
    player4:"", player5:"",
    agreed:false,
  });
  const [errors, setErrors]     = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  // Only show 3v3 tournaments
  const tournaments3v3 = (data?.tournaments||[]).filter(t=>t.type==="3v3"&&t.status!=="complete");

  const validate = () => {
    const e = {};
    if (!form.teamName.trim())  e.teamName  = "Team name is required";
    if (!form.division)         e.division  = "Please select a division";
    if (!form.email.trim()||!form.email.includes("@")) e.email = "Valid email is required";
    if (!form.phone.trim())     e.phone     = "Phone number is required";
    if (!form.player1.trim())   e.player1   = "Player 1 name is required";
    if (!form.player2.trim())   e.player2   = "Player 2 name is required";
    if (!form.player3.trim())   e.player3   = "Player 3 name is required";
    if (!form.agreed)           e.agreed    = "You must agree to the terms";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const players = [form.player1, form.player2, form.player3, form.player4, form.player5]
      .filter(p=>p.trim())
      .map((p,i)=>`${i+1}. ${p.trim()}`)
      .join("\n");

    const div = THREEV3_DIVISIONS.find(d=>d.id===form.division);
    const selTournament = tournaments3v3.find(t=>t.id===parseInt(form.tournamentId)) || tournaments3v3[0];

    // Save registration to Supabase
    const reg = {
      id: Date.now(),
      tournamentId: selTournament?.id,
      tournamentName: selTournament?.name || "3v3 Tournament",
      teamName: form.teamName.trim(),
      coachName: form.teamName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gradeId: form.division,
      gender: div?.label || form.division,
      status: "pending",
      paymentStatus: "unpaid",
      submittedAt: new Date().toISOString(),
      type: "3v3",
      players: [form.player1,form.player2,form.player3,form.player4,form.player5].filter(p=>p.trim()),
    };
    if (onSubmit) await onSubmit(reg);

    // Send admin notification
    await sendEmail(EJS.adminTemplate, {
      tournament_name:  selTournament?.name || "3v3 Tournament",
      tournament_dates: selTournament ? tDates(selTournament).map(fmtD).join(" → ") : "TBD",
      location:         selTournament?.location || "Fenton, MI",
      coach_name:       form.teamName.trim(),
      coach_email:      form.email.trim(),
      coach_phone:      form.phone.trim(),
      teams_list:       `Team: ${form.teamName}\nDivision: ${div?.label||form.division}\n\nPlayers:\n${players}`,
      team_count:       "1",
      submitted_at:     new Date().toLocaleString(),
    });

    // Send confirmation to registrant
    await sendEmail(EJS.coachTemplate, {
      coach_name:       form.teamName.trim(),
      coach_email:      form.email.trim(),
      tournament_name:  selTournament?.name || "3v3 Tournament",
      tournament_dates: selTournament ? tDates(selTournament).map(fmtD).join(" → ") : "TBD",
      location:         selTournament?.location || "Fenton, MI",
      teams_list:       `Team: ${form.teamName}\nDivision: ${div?.label||form.division}\n\nPlayers:\n${players}`,
      team_count:       "1",
      payment_link:     PAYMENT_LINK,
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  const FErr = ({k}) => errors[k]
    ? <div style={{color:C.red,fontSize:11,marginTop:4,fontWeight:600}}>{errors[k]}</div>
    : null;

  const selDiv = THREEV3_DIVISIONS.find(d=>d.id===form.division);

  // ── Confirmation ──
  if (submitted) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      <div style={{padding:"50px 24px 24px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🏀</div>
        <div style={{color:C.green,fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
          You're Registered!
        </div>
        <div style={{color:C.gray,fontSize:14,marginBottom:24,lineHeight:1.6}}>
          <strong style={{color:C.white}}>{form.teamName}</strong> has been registered for the{" "}
          <strong style={{color:selDiv?.color||C.sky}}>{selDiv?.label}</strong> division.
          A confirmation has been sent to <span style={{color:C.sky}}>{form.email}</span>.
        </div>

        {/* Summary card */}
        <div style={{background:C.navyMid,borderRadius:14,padding:20,marginBottom:20,textAlign:"left",border:`1px solid ${selDiv?.color||C.sky}44`}}>
          <div style={{color:selDiv?.color||C.sky,fontWeight:800,fontSize:13,textTransform:"uppercase",
            letterSpacing:"0.08em",marginBottom:14,fontFamily:"'Barlow Condensed',sans-serif"}}>
            Registration Summary
          </div>
          <div style={{display:"grid",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:C.gray,fontSize:13}}>Team</span>
              <span style={{color:C.white,fontWeight:700,fontSize:13}}>{form.teamName}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:C.gray,fontSize:13}}>Division</span>
              <span style={{color:selDiv?.color||C.sky,fontWeight:700,fontSize:13}}>{selDiv?.label}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:C.gray,fontSize:13}}>Players</span>
              <span style={{color:C.white,fontSize:13}}>
                {[form.player1,form.player2,form.player3,form.player4,form.player5].filter(p=>p.trim()).length}
              </span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div style={{background:C.navyMid,borderRadius:14,padding:20,marginBottom:20,border:`1px solid ${C.gold}44`}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:15,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
            💰 Complete Your Payment
          </div>
          <div style={{color:C.gray,fontSize:13,marginBottom:16,lineHeight:1.6}}>
            Pay your entry fee through our secure Clover page. Include your <strong style={{color:C.white}}>team name</strong> and <strong style={{color:C.white}}>division</strong> in the payment note.
          </div>
          <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
            style={{display:"inline-block",background:`linear-gradient(135deg,#00A651,#007A3D)`,
              color:"#fff",fontWeight:800,fontSize:15,padding:"13px 28px",borderRadius:10,
              textDecoration:"none",fontFamily:"'Barlow Condensed',sans-serif",
              letterSpacing:"0.06em",textTransform:"uppercase"}}>
            Pay Now →
          </a>
          <div style={{color:C.gray,fontSize:11,marginTop:10}}>{PAYMENT_LABEL}</div>
        </div>

        <Btn v="pri" onClick={onBack} sx={{padding:"11px 28px"}}>← Back to Home</Btn>
      </div>
    </div>
  );

  // ── Form ──
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,#1a1a2e,#16213e)`,
        padding:"24px 20px",borderBottom:`1px solid ${C.grayL}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{background:`linear-gradient(135deg,${C.sky},${C.light})`,borderRadius:10,
            padding:"8px 14px",fontWeight:900,fontSize:20,color:"#fff",
            fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.04em"}}>3v3</div>
          <div>
            <div style={{color:C.white,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed',sans-serif"}}>
              Tournament Registration
            </div>
            <div style={{color:C.gray,fontSize:13}}>Shoebox Sports · Fenton, MI</div>
          </div>
        </div>

        {/* Tournament selector */}
        {tournaments3v3.length>1&&(
          <div style={{marginBottom:16}}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Select Tournament</div>
            <select value={form.tournamentId} onChange={e=>upd("tournamentId",e.target.value)}
              style={{width:"100%",background:"#0F3460",border:`1px solid ${C.grayL}`,borderRadius:8,
                color:C.white,fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"inherit"}}>
              <option value="">Select a tournament...</option>
              {tournaments3v3.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Division selector */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {THREEV3_DIVISIONS.map(d=>(
            <button key={d.id} onClick={()=>upd("division",d.id)}
              style={{padding:"12px 10px",borderRadius:10,cursor:"pointer",textAlign:"center",
                border:`2px solid ${form.division===d.id?d.color:C.grayL}`,
                background:form.division===d.id?d.color+"22":"transparent",
                color:form.division===d.id?d.color:C.gray,
                fontWeight:700,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif",
                transition:"all 0.15s"}}>
              {d.label}
            </button>
          ))}
        </div>
        <FErr k="division"/>
      </div>

      <div style={{padding:20}}>

        {/* Team & contact */}
        <div style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:18,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",
            letterSpacing:"0.08em",marginBottom:14}}>Team & Contact Info</div>
          {[
            {k:"teamName", l:"Team Name *",      p:"e.g. Fenton Ballers", type:"text"},
            {k:"email",    l:"Email Address *",  p:"yourname@email.com",   type:"email"},
            {k:"phone",    l:"Phone Number *",   p:"(555) 555-5555",       type:"tel"},
          ].map(({k,l,p,type})=>(
            <div key={k} style={{marginBottom:12}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
              <input value={form[k]} onChange={e=>upd(k,e.target.value)} placeholder={p} type={type}
                style={{width:"100%",background:C.navy,border:`1px solid ${errors[k]?C.red:C.grayL}`,
                  borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",
                  outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              <FErr k={k}/>
            </div>
          ))}
        </div>

        {/* Players */}
        <div style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:18,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",
            letterSpacing:"0.08em",marginBottom:4}}>Player Roster</div>
          <div style={{color:C.gray,fontSize:12,marginBottom:14}}>
            3 players required · up to 5 total (2 optional subs)
          </div>

          {/* Required players */}
          {[
            {k:"player1", l:"Player 1 *", req:true},
            {k:"player2", l:"Player 2 *", req:true},
            {k:"player3", l:"Player 3 *", req:true},
          ].map(({k,l})=>(
            <div key={k} style={{marginBottom:10}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
              <input value={form[k]} onChange={e=>upd(k,e.target.value)}
                placeholder="Full name"
                style={{width:"100%",background:C.navy,border:`1px solid ${errors[k]?C.red:C.grayL}`,
                  borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",
                  outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              <FErr k={k}/>
            </div>
          ))}

          {/* Optional subs */}
          <div style={{borderTop:`1px solid ${C.grayL}`,marginTop:14,paddingTop:14}}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.06em",marginBottom:10}}>Optional Substitutes</div>
            {[
              {k:"player4", l:"Sub Player 4"},
              {k:"player5", l:"Sub Player 5"},
            ].map(({k,l})=>(
              <div key={k} style={{marginBottom:10}}>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",
                  letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
                <input value={form[k]} onChange={e=>upd(k,e.target.value)}
                  placeholder="Full name (optional)"
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,
                    borderRadius:8,color:C.gray,fontSize:14,padding:"11px 14px",
                    outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              </div>
            ))}
          </div>
        </div>

        {/* Payment info */}
        <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:10,
          padding:"14px 16px",marginBottom:16}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:13,marginBottom:4}}>💰 Payment Info</div>
          <div style={{color:C.gray,fontSize:13,lineHeight:1.6}}>
            After submitting, complete payment through our secure Clover page at{" "}
            <strong style={{color:C.white}}>{PAYMENT_LABEL}</strong>.
            Include your <strong style={{color:C.white}}>team name</strong> and{" "}
            <strong style={{color:C.white}}>division</strong> in the note.
          </div>
        </div>

        {/* Terms */}
        <div style={{background:C.navyMid,borderRadius:10,padding:"14px 16px",marginBottom:16,
          border:`1px solid ${errors.agreed?C.red:C.grayL}`}}>
          <div style={{color:C.white,fontWeight:700,fontSize:13,marginBottom:10}}>Terms & Waiver</div>
          <div style={{color:C.gray,fontSize:12,lineHeight:1.7,marginBottom:14,maxHeight:120,overflowY:"auto"}}>
            By registering, I acknowledge that: (1) All participants must follow Shoebox Sports rules and code of conduct. (2) Shoebox Sports is not liable for injuries sustained during tournament play. (3) Registration fees are non-refundable unless the tournament is cancelled by Shoebox Sports. (4) Teams may be disqualified for unsportsmanlike conduct. (5) Photo and video of participants may be used for promotional purposes. (6) The team captain listed is responsible for all players on the roster. (7) All players must be eligible for their registered division. (8) Shoebox Sports reserves the right to refuse registration at their discretion.
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={form.agreed} onChange={e=>upd("agreed",e.target.checked)}
              style={{width:18,height:18,cursor:"pointer",accentColor:C.sky}}/>
            <span style={{color:C.white,fontSize:13,fontWeight:600}}>I agree to the terms and waiver above</span>
          </label>
          <FErr k="agreed"/>
        </div>

        <Btn v="pri" onClick={handleSubmit} dis={submitting}
          sx={{width:"100%",padding:"14px 0",fontSize:15,
            background:`linear-gradient(135deg,${C.sky},${C.light})`,marginBottom:12}}>
          {submitting?"Submitting...":"Submit 3v3 Registration →"}
        </Btn>
        <button onClick={onBack}
          style={{width:"100%",background:"transparent",border:"none",color:C.gray,
            cursor:"pointer",fontSize:13,padding:"8px 0"}}>
          ← Back to Home
        </button>
      </div>
    </div>
  );
}

// ─── BOOKING CONSTANTS ────────────────────────────────────────────────────────
const COACH_NAME = "Coach Star";
const SESSIONS = [
  {id:"1on1", label:"1-on-1 Session", price:60, desc:"Private 1 hour session"},
  {id:"group", label:"Group Session",  price:50, desc:"Group 1 hour session"},
];
// All possible weekday 1-on-1 slots (3:15pm–8:15pm, 15-min increments)
const WEEKDAY_SLOTS_ALL = buildSlots("3:15 PM", 21, 15); // 3:15,3:30,...8:15
const WEEKDAY_SLOTS = WEEKDAY_SLOTS_ALL; // kept for backwards compat
const WEEKEND_SLOTS = ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM",
  "1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM"];
const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// Helper — get dates for next N days starting today
function getUpcomingDates(n=28) {
  const dates=[];
  const today=new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<n;i++){
    const d=new Date(today); d.setDate(today.getDate()+i);
    dates.push(d);
  }
  return dates;
}
function dateKey(d) {
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}
function isWeekday(d) { return d.getDay()>=1&&d.getDay()<=5; }
function isWeekend(d) { return d.getDay()===0||d.getDay()===6; }
function fmtDate(d) {
  return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
}

// ─── GROUP SUB-COMPONENTS (proper hooks at top level) ────────────────────────
function GroupCreateForm({schedule, localSched, setLocalSched, onUpdateSchedule, isCoach}) {
  const [show, setShow] = useState(false);
  const [gf, setGf] = useState({name:"",customName:false,day:"Monday",time:"4:00 PM",maxPlayers:"6",endDate:""});
  const PRESETS = ["HS Boys","HS Girls","MS Boys","MS Girls","Custom..."];
  const allDays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  // 15-min increments from 6:00 AM to 9:00 PM
  const allTimes = buildSlots("6:00 AM", 61, 15);
  const reset = () => { setShow(false); setGf({name:"",customName:false,day:"Monday",time:"4:00 PM",maxPlayers:"6",endDate:""}); };
  const src = isCoach ? schedule : localSched;
  const save = async(ns) => {
    if(isCoach) { await saveSchedule(ns); onUpdateSchedule(ns); }
    else { if(setLocalSched) setLocalSched(ns); await saveSchedule(ns); onUpdateSchedule(ns); }
  };
  if (!show) return (
    <button onClick={()=>setShow(true)}
      style={{width:"100%",padding:"11px 0",background:"transparent",marginTop:4,
        border:`2px dashed ${C.sky}55`,borderRadius:10,color:C.sky,cursor:"pointer",
        fontWeight:700,fontSize:13,fontFamily:"'Barlow Condensed',sans-serif"}}>
      + Create New Group
    </button>
  );
  return (
    <div style={{background:C.navyMid,borderRadius:12,padding:16,border:`1px solid ${C.sky}44`,marginTop:8}}>
      <div style={{color:C.sky,fontWeight:800,fontSize:14,marginBottom:14}}>New Group Slot</div>
      <div style={{marginBottom:10}}>
        <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Group Name</div>
        <select value={gf.customName?"Custom...":gf.name}
          onChange={e=>{ if(e.target.value==="Custom...") setGf(f=>({...f,customName:true,name:""})); else setGf(f=>({...f,customName:false,name:e.target.value})); }}
          style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none",marginBottom:gf.customName?8:0}}>
          <option value="">Select group...</option>
          {PRESETS.map(n=><option key={n}>{n}</option>)}
        </select>
        {gf.customName&&<input value={gf.name} onChange={e=>setGf(f=>({...f,name:e.target.value}))} placeholder="Type group name..."
          style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        {[{l:"Day",k:"day",opts:allDays},{l:"Time",k:"time",opts:allTimes},{l:"Max Players",k:"maxPlayers",opts:["4","5","6"]}].map(({l,k,opts})=>(
          <div key={k}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
            <select value={gf[k]} onChange={e=>setGf(f=>({...f,[k]:e.target.value}))}
              style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:12,padding:"9px 8px",outline:"none"}}>
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Recurring Until *</div>
        <input type="date" value={gf.endDate} onChange={e=>setGf(f=>({...f,endDate:e.target.value}))}
          style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        <div style={{color:C.gray,fontSize:11,marginTop:4}}>Repeats every {gf.day} until this date</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn v="gh" onClick={reset} sx={{flex:1}}>Cancel</Btn>
        <Btn v="pri" onClick={async()=>{
          if(!gf.name.trim()||!gf.endDate) return;
          const ns2={...(src||{}),groupSlots:[...((src?.groupSlots)||[]),{id:Date.now(),name:gf.name.trim(),day:gf.day,time:gf.time,maxPlayers:parseInt(gf.maxPlayers),endDate:gf.endDate,registrants:[],createdAt:new Date().toISOString()}]};
          await save(ns2); reset();
        }} dis={!gf.name.trim()||!gf.endDate} sx={{flex:2}}>✓ Create Group</Btn>
      </div>
    </div>
  );
}

function AddPlayerForm({gs, schedule, onUpdateSchedule, col}) {
  const [show, setShow] = useState(false);
  const [pf, setPf] = useState({name:"",phone:"",email:""});
  const regs = gs.registrants||[];
  if (!show) return (
    <button onClick={()=>setShow(true)}
      style={{width:"100%",padding:"8px 0",background:"transparent",marginTop:10,
        border:`1px dashed ${col}55`,borderRadius:8,color:col,cursor:"pointer",fontWeight:700,fontSize:12}}>
      + Add Player ({gs.maxPlayers-regs.length} spot{gs.maxPlayers-regs.length!==1?"s":""} left)
    </button>
  );
  return (
    <div style={{background:C.navy,borderRadius:10,padding:12,marginTop:10,border:`1px solid ${col}44`}}>
      <div style={{color:col,fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Add Player</div>
      {[{k:"name",p:"Full name (required)",t:"text"},{k:"phone",p:"Phone number",t:"tel"},{k:"email",p:"Email address",t:"email"}].map(({k,p,t})=>(
        <input key={k} value={pf[k]} onChange={e=>setPf(f=>({...f,[k]:e.target.value}))} placeholder={p} type={t}
          style={{width:"100%",background:C.navyMid,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,
            fontSize:13,padding:"9px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:8}}/>
      ))}
      <div style={{display:"flex",gap:8}}>
        <Btn v="gh" onClick={()=>{setShow(false);setPf({name:"",phone:"",email:""});}} sx={{flex:1}}>Cancel</Btn>
        <Btn v="pri" onClick={async()=>{
          if(!pf.name.trim()) return;
          const nr=[...regs,{name:pf.name.trim(),phone:pf.phone.trim(),email:pf.email.trim()}];
          const ng=(schedule.groupSlots||[]).map(x=>x.id===gs.id?{...x,registrants:nr}:x);
          const ns={...schedule,groupSlots:ng};
          await saveSchedule(ns); onUpdateSchedule(ns);
          setShow(false); setPf({name:"",phone:"",email:""});
        }} dis={!pf.name.trim()} sx={{flex:2}}>Add Player</Btn>
      </div>
    </div>
  );
}

function GroupSlotCard({gs, gi, schedule, onUpdateSchedule, showRemove, localSched, setLocalSched}) {
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({name:gs.name,day:gs.day,time:gs.time,maxPlayers:String(gs.maxPlayers),endDate:gs.endDate||""});
  const regs = gs.registrants||[];
  const isFull = regs.length>=gs.maxPlayers;
  const isExpired = gs.endDate&&new Date(gs.endDate+"T23:59:59")<new Date();
  const col = dc(gi);
  const src = localSched || schedule;
  const allDays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const allTimes = buildSlots("6:00 AM", 61, 15);

  const saveEdit = async() => {
    const updated = {...gs, name:ef.name.trim(), day:ef.day, time:ef.time,
      maxPlayers:parseInt(ef.maxPlayers), endDate:ef.endDate};
    const ng = (src.groupSlots||[]).map(x=>x.id===gs.id?updated:x);
    const ns = {...src, groupSlots:ng};
    if(setLocalSched) setLocalSched(ns);
    await saveSchedule(ns); onUpdateSchedule(ns);
    setEditing(false);
  };

  const removePlayer = async(ri) => {
    const nr = regs.filter((_,idx)=>idx!==ri);
    const ng = (src.groupSlots||[]).map(x=>x.id===gs.id?{...x,registrants:nr}:x);
    const ns = {...src,groupSlots:ng};
    if(setLocalSched) setLocalSched(ns);
    await saveSchedule(ns); onUpdateSchedule(ns);
  };

  const removeGroup = async() => {
    if(!window.confirm(`Remove group "${gs.name}"?`)) return;
    const ng = (src.groupSlots||[]).filter(x=>x.id!==gs.id);
    const ns = {...src,groupSlots:ng};
    if(setLocalSched) setLocalSched(ns);
    await saveSchedule(ns); onUpdateSchedule(ns);
  };

  return (
    <div style={{background:C.navyMid,borderRadius:14,padding:18,marginBottom:14,
      border:`1px solid ${isExpired?C.red+"44":col+"44"}`,opacity:isExpired?0.65:1}}>

      {/* Edit form */}
      {editing?(
        <div>
          <div style={{color:col,fontWeight:800,fontSize:13,marginBottom:12}}>Edit Group</div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Group Name</div>
            <input value={ef.name} onChange={e=>setEf(f=>({...f,name:e.target.value}))}
              style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,
                fontSize:13,padding:"9px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            {[{l:"Day",k:"day",opts:allDays},{l:"Time",k:"time",opts:allTimes},{l:"Max Players",k:"maxPlayers",opts:["4","5","6"]}].map(({l,k,opts})=>(
              <div key={k}>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{l}</div>
                <select value={ef[k]} onChange={e=>setEf(f=>({...f,[k]:e.target.value}))}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:12,padding:"8px 6px",outline:"none"}}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{marginBottom:12}}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Recurring Until</div>
            <input type="date" value={ef.endDate} onChange={e=>setEf(f=>({...f,endDate:e.target.value}))}
              style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,
                fontSize:13,padding:"9px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn v="gh" onClick={()=>setEditing(false)} sx={{flex:1}}>Cancel</Btn>
            <Btn v="pri" onClick={saveEdit} dis={!ef.name.trim()||!ef.endDate} sx={{flex:2}}>Save Changes</Btn>
          </div>
        </div>
      ):(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{color:col,fontWeight:800,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>{gs.name}</span>
                {isExpired&&<span style={{background:C.red+"22",color:C.red,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>Expired</span>}
              </div>
              <div style={{color:C.gray,fontSize:12,marginTop:3}}>Every {gs.day} · {gs.time} · 1 hour</div>
              {gs.endDate&&<div style={{color:isExpired?C.red:C.gold,fontSize:11,fontWeight:600,marginTop:2}}>
                {isExpired?"Ended":"Runs until"} {fmtD(gs.endDate)}
              </div>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:isFull?C.red+"22":C.green+"22",color:isFull?C.red:C.green,
                borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{regs.length}/{gs.maxPlayers}</span>
              <button onClick={()=>setEditing(true)}
                style={{background:C.sky+"22",border:`1px solid ${C.sky}44`,color:C.sky,
                  borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Edit</button>
              {showRemove&&<button onClick={removeGroup}
                style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                  borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>}
            </div>
          </div>
          <div style={{background:C.grayL,borderRadius:4,height:4,marginBottom:12}}>
            <div style={{width:`${Math.min((regs.length/gs.maxPlayers)*100,100)}%`,height:"100%",
              background:isFull?C.red:col,borderRadius:4,transition:"width 0.3s"}}/>
          </div>
          {regs.map((r,ri)=>(
            <div key={ri} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:`1px solid ${C.grayL}`}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:col+"33",flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",color:col,fontWeight:800,fontSize:11}}>{ri+1}</div>
              <div style={{flex:1}}>
                <div style={{color:C.white,fontWeight:600,fontSize:13}}>{r.name}</div>
                <div style={{color:C.gray,fontSize:11}}>{r.phone&&`📞 ${r.phone}`}{r.phone&&r.email?" · ":""}{r.email&&`✉️ ${r.email}`}</div>
              </div>
              <button onClick={()=>removePlayer(ri)}
                style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14,fontWeight:700}}>✕</button>
            </div>
          ))}
          {!isFull&&!isExpired&&<AddPlayerForm gs={gs} schedule={src} onUpdateSchedule={onUpdateSchedule} col={col}/>}
          {isFull&&<div style={{color:C.red,fontSize:12,fontWeight:700,textAlign:"center",padding:"8px 0",marginTop:6}}>⚠ Group Full</div>}
        </>
      )}
    </div>
  );
}

// ─── PUBLIC BOOKING FORM ──────────────────────────────────────────────────────
function BookingForm({bookings, schedule, onSubmit, onBack, logoUrl}) {
  const [step, setStep]             = useState(1);
  const [session, setSession]       = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null); // for group session
  const [selections, setSelections] = useState([]);
  const [activeDate, setActiveDate] = useState(null);
  const [form, setForm]             = useState({name:"",email:"",phone:"",payMethod:"online"});
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState({});
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  // 60 days out
  const dates = getUpcomingDates(60);

  // Active (non-expired) groups from schedule
  const activeGroups = (schedule?.groupSlots||[]).filter(gs=>{
    if(!gs.endDate) return true;
    return new Date(gs.endDate+"T23:59:59") >= new Date();
  });

  // Get times that conflict with group sessions on a given date.
  // A 1-on-1 slot conflicts if:
  //   - It starts within 60 min BEFORE a group (would still be running when group starts)
  //   - It starts at the same time as a group
  const getGroupBlockedTimes = (d) => {
    const dow = DAYS_OF_WEEK[d.getDay()];
    const groupTimes = activeGroups
      .filter(gs=>gs.day===dow)
      .map(gs=>toMins(gs.time));
    const allPossible = [...WEEKDAY_SLOTS,...WEEKEND_SLOTS]
      .filter((v,i,a)=>a.indexOf(v)===i);
    return allPossible.filter(slot=>{
      const slotMins = toMins(slot);
      return groupTimes.some(gMins=>
        // slot starts within 60 min before group (would overlap)
        (slotMins > gMins - 60 && slotMins < gMins) ||
        // slot starts exactly at group time
        slotMins === gMins
      );
    });
  };

  const getSlotsForDate = (d) => {
    if(!d) return [];
    const key = dateKey(d);
    const dow = d.getDay();
    const dayName = DAYS_OF_WEEK[dow];
    // Weekdays: use coach-set per-day availability, fall back to all slots if not set
    // Weekends: use coach-set weekend availability
    let base;
    if(isWeekday(d)) {
      base = schedule?.weekdaySlots?.[dayName] || WEEKDAY_SLOTS_ALL;
    } else {
      base = schedule?.availability?.[dayName] || [];
    }
    const blocked = (schedule?.blocked||[]).filter(b=>b.date===key).map(b=>b.time);
    const booked  = bookings.filter(b=>b.date===key&&b.status!=="cancelled").map(b=>b.time);
    const alreadyPicked = selections.filter(s=>s.date===key).map(s=>s.time);
    const groupTimes = getGroupBlockedTimes(d);
    return base.filter(s=>!blocked.includes(s)&&!booked.includes(s)&&!alreadyPicked.includes(s)&&!groupTimes.includes(s));
  };

  const toggleTime = (d, time) => {
    const key = dateKey(d);
    const exists = selections.find(s=>s.date===key&&s.time===time);
    if(exists) {
      setSelections(prev=>prev.filter(s=>!(s.date===key&&s.time===time)));
    } else {
      setSelections(prev=>[...prev,{date:key,dateObj:d,dateLabel:fmtDate(d),time}]);
    }
  };

  const isSelected = (d, time) => !!selections.find(s=>s.date===dateKey(d)&&s.time===time);

  const validate = () => {
    const e={};
    if(!form.name.trim()) e.name="Name is required";
    if(!form.email.trim()||!form.email.includes("@")) e.email="Valid email is required";
    if(!form.phone.trim()) e.phone="Phone is required";
    setErrors(e); return Object.keys(e).length===0;
  };

  const handleSubmit = async() => {
    if(!validate()) return;
    setSubmitting(true);

    if(session?.id==="group"&&selectedGroup) {
      // Group session — register as a player in the group slot
      const newReg = {name:form.name.trim(), phone:form.phone.trim(), email:form.email.trim()};
      const updatedGroup = {...selectedGroup, registrants:[...(selectedGroup.registrants||[]),newReg]};
      const newGroupSlots = (schedule?.groupSlots||[]).map(g=>g.id===selectedGroup.id?updatedGroup:g);
      const ns = {...schedule, groupSlots:newGroupSlots};
      await saveSchedule(ns);
      // Also save a booking record so it appears in admin
      const booking = {
        id: Date.now()+Math.random(),
        sessionId:"group", sessionLabel:`Group: ${selectedGroup.name}`, price:SESSIONS.find(s=>s.id==="group")?.price||50,
        date:"recurring", dateLabel:`Every ${selectedGroup.day} at ${selectedGroup.time}`,
        time:selectedGroup.time, groupId:selectedGroup.id, groupName:selectedGroup.name,
        clientName:form.name.trim(), clientEmail:form.email.trim(), clientPhone:form.phone.trim(),
        payMethod:form.payMethod, payStatus:form.payMethod==="inperson"?"pay_inperson":"unpaid",
        status:"confirmed", bookedAt:new Date().toISOString(),
      };
      await onSubmit(booking, ns);
      // → Coach Star/Admin: new training session notification
      await sendEmail(EJS.trainingRequestTemplate,{
        tournament_name:"Group Training Registration",
        tournament_dates:`Every ${selectedGroup.day} at ${selectedGroup.time} (until ${fmtD(selectedGroup.endDate)})`,
        location:"Shoebox Sports - Fenton, MI",
        coach_name:form.name.trim(), coach_email:form.email.trim(), coach_phone:form.phone.trim(),
        teams_list:`Group: ${selectedGroup.name}\nDay: Every ${selectedGroup.day} at ${selectedGroup.time}\nUntil: ${fmtD(selectedGroup.endDate)}\nPayment: ${form.payMethod==="online"?"Online (Clover)":"In Person"}`,
        team_count:"1", submitted_at:new Date().toLocaleString(),
      });
      // → Customer: booking request received
      await sendEmail(EJS.bookingRequestTemplate,{
        coach_name:form.name.trim(), coach_email:form.email.trim(),
        tournament_name:`Group Training: ${selectedGroup.name}`,
        tournament_dates:`Every ${selectedGroup.day} at ${selectedGroup.time}`,
        location:"Shoebox Sports - Fenton, MI",
        teams_list:`Group: ${selectedGroup.name}\nRecurring: Every ${selectedGroup.day} at ${selectedGroup.time}\nUntil: ${fmtD(selectedGroup.endDate)}\nPrice: $${SESSIONS.find(s=>s.id==="group")?.price||50}/session`,
        team_count:"1",
        payment_link:form.payMethod==="online"?PAYMENT_LINK:"Pay at your session",
      });
    } else {
      // 1-on-1 or regular group by date/time
      for(const sel of selections) {
        const booking = {
          id: Date.now()+Math.random(),
          sessionId: session.id, sessionLabel: session.label, price: session.price,
          date: sel.date, dateLabel: sel.dateLabel, time: sel.time,
          clientName: form.name.trim(), clientEmail: form.email.trim(), clientPhone: form.phone.trim(),
          payMethod: form.payMethod,
          payStatus: form.payMethod==="inperson"?"pay_inperson":"unpaid",
          status: "pending", bookedAt: new Date().toISOString(),
        };
        await onSubmit(booking);
      }
      const sessionList = selections.map(s=>`${s.dateLabel} at ${s.time}`).join(", ");
      // → Coach Star/Admin: new training session notification
      await sendEmail(EJS.trainingRequestTemplate,{
        tournament_name:"Training Session Booking",
        tournament_dates:sessionList, location:"Shoebox Sports - Fenton, MI",
        coach_name:form.name.trim(), coach_email:form.email.trim(), coach_phone:form.phone.trim(),
        teams_list:`Session: ${session.label} ($${session.price} each)\nDates: ${sessionList}\nPayment: ${form.payMethod==="online"?"Online (Clover)":"In Person"}`,
        team_count:String(selections.length), submitted_at:new Date().toLocaleString(),
      });
      // → Customer: booking request received
      await sendEmail(EJS.bookingRequestTemplate,{
        coach_name:form.name.trim(), coach_email:form.email.trim(),
        tournament_name:`Training Sessions with ${COACH_NAME}`,
        tournament_dates:sessionList, location:"Shoebox Sports - Fenton, MI",
        teams_list:`Session type: ${session.label}\nSessions booked: ${selections.length}\nTotal: $${session.price*selections.length}\nDates: ${sessionList}`,
        team_count:String(selections.length),
        payment_link:form.payMethod==="online"?PAYMENT_LINK:"Pay at your session",
      });
    }
    setSubmitting(false); setSubmitted(true);
  };

  const FErr=({k})=>errors[k]?<div style={{color:C.red,fontSize:11,marginTop:4,fontWeight:600}}>{errors[k]}</div>:null;

  if(submitted) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh",maxWidth:520,margin:"0 auto"}}>
      <div style={{padding:"50px 24px 24px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>✅</div>
        <div style={{color:C.green,fontWeight:900,fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>
          {session?.id==="group"?`You've Joined ${selectedGroup?.name}!`:"Booking Request Sent!"}
        </div>
        <div style={{color:C.gray,fontSize:14,marginBottom:24,lineHeight:1.6}}>
          {session?.id==="group"
            ? <>You're registered for <strong style={{color:C.white}}>{selectedGroup?.name}</strong> every <strong style={{color:C.sky}}>{selectedGroup?.day} at {selectedGroup?.time}</strong>.</>
            : <><strong style={{color:C.white}}>{COACH_NAME}</strong> will review your request and confirm shortly.</>}
          {" "}A confirmation was sent to <span style={{color:C.sky}}>{form.email}</span>.
        </div>
        <div style={{background:C.navyMid,borderRadius:14,padding:20,marginBottom:20,textAlign:"left",border:`1px solid ${C.green}44`}}>
          <div style={{color:C.green,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Booking Summary</div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
            <span style={{color:C.gray,fontSize:13}}>Session Type</span>
            <span style={{color:C.white,fontWeight:700,fontSize:13}}>{session?.label}</span>
          </div>
          {session?.id==="group"&&selectedGroup?<>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Group</span>
              <span style={{color:C.sky,fontWeight:700,fontSize:13}}>{selectedGroup.name}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Schedule</span>
              <span style={{color:C.white,fontWeight:600,fontSize:13}}>Every {selectedGroup.day} · {selectedGroup.time}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Runs Until</span>
              <span style={{color:C.white,fontWeight:600,fontSize:13}}>{fmtD(selectedGroup.endDate)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Price</span>
              <span style={{color:C.gold,fontWeight:800,fontSize:15}}>${session?.price}/session</span>
            </div>
          </>:<>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Sessions</span>
              <span style={{color:C.white,fontWeight:700,fontSize:13}}>{selections.length}</span>
            </div>
            {selections.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
                <span style={{color:C.gray,fontSize:12}}>Session {i+1}</span>
                <span style={{color:C.sky,fontWeight:600,fontSize:12}}>{s.dateLabel} · {s.time}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:13}}>Total</span>
              <span style={{color:C.gold,fontWeight:800,fontSize:15}}>${(session?.price||0)*selections.length}</span>
            </div>
          </>}
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
            <span style={{color:C.gray,fontSize:13}}>Payment</span>
            <span style={{color:C.white,fontWeight:700,fontSize:13}}>{form.payMethod==="online"?"Online via Clover":"In Person"}</span>
          </div>
        </div>
        {form.payMethod==="online"&&(
          <div style={{background:C.navyMid,borderRadius:14,padding:20,marginBottom:20,border:`1px solid ${C.gold}44`}}>
            <div style={{color:C.gold,fontWeight:800,fontSize:14,marginBottom:8}}>💰 Complete Payment</div>
            <div style={{color:C.gray,fontSize:13,marginBottom:14,lineHeight:1.5}}>
              {session?.id==="group"
                ? <>Pay <strong style={{color:C.white}}>${session?.price}/session</strong> via Clover. Include your name and group name in the note.</>
                : <>Pay <strong style={{color:C.white}}>${(session?.price||0)*selections.length}</strong> ({selections.length} × ${session?.price}) via Clover.</>}
            </div>
            <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
              style={{display:"inline-block",background:"linear-gradient(135deg,#00A651,#007A3D)",
                color:"#fff",fontWeight:800,fontSize:15,padding:"12px 28px",borderRadius:10,
                textDecoration:"none",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.06em",textTransform:"uppercase"}}>
              Pay Now →
            </a>
          </div>
        )}
        <Btn v="pri" onClick={onBack} sx={{padding:"11px 28px"}}>← Back to Home</Btn>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.navy,minHeight:"100vh"}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
      <div style={{background:`linear-gradient(135deg,${C.navyLight},${C.navyMid})`,padding:"24px 20px 20px",borderBottom:`1px solid ${C.grayL}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{fontSize:32}}>🏋️</div>
          <div>
            <div style={{color:C.white,fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed',sans-serif"}}>Training Session</div>
            <div style={{color:C.sky,fontSize:13,fontWeight:600}}>with {COACH_NAME} · Shoebox Sports</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {["Session","Dates & Times","Your Info","Payment"].map((s,i)=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:10,fontWeight:800,
                background:step>i+1?C.green:step===i+1?C.sky:C.grayD,
                color:step>=i+1?"#fff":C.gray}}>{step>i+1?"✓":i+1}</div>
              {i<3&&<div style={{width:12,height:1,background:C.grayL}}/>}
            </div>
          ))}
        </div>
      </div>
      </div>{/* end maxWidth wrapper */}

      {/* Steps content */}
      <div style={{padding:"0"}}>

        {/* STEP 1 — Session Type */}
        {step===1&&<div style={{padding:"20px 20px 20px",maxWidth:560,margin:"0 auto"}}>
          <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:4}}>Choose Session Type</div>
          <div style={{color:C.gray,fontSize:13,marginBottom:20}}>All sessions are 1 hour</div>
          {SESSIONS.map(s=>(
            <div key={s.id} onClick={()=>{setSession(s);setSelectedGroup(null);setSelections([]);}}
              style={{background:session?.id===s.id?C.sky+"22":C.navyMid,borderRadius:14,
                padding:20,marginBottom:12,cursor:"pointer",
                border:`2px solid ${session?.id===s.id?C.sky:C.grayL}`,transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:C.white,fontWeight:800,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>{s.label}</div>
                  <div style={{color:C.gray,fontSize:13,marginTop:4}}>
                    {s.id==="group"?"Join one of Coach Star's recurring group sessions":s.desc}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.gold,fontWeight:900,fontSize:24,fontFamily:"'Barlow Condensed',sans-serif"}}>${s.price}</div>
                  <div style={{color:C.gray,fontSize:11}}>per session</div>
                </div>
              </div>
              {session?.id===s.id&&<div style={{color:C.sky,fontSize:12,fontWeight:700,marginTop:10}}>✓ Selected</div>}
            </div>
          ))}

          {/* Group picker — shown when group session is selected */}
          {session?.id==="group"&&(
            <div style={{marginTop:4,marginBottom:16}}>
              <div style={{color:C.gold,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
                Available Groups
              </div>
              {activeGroups.length===0?(
                <div style={{background:C.navyMid,borderRadius:12,padding:20,textAlign:"center",border:`1px solid ${C.grayL}`}}>
                  <div style={{fontSize:28,marginBottom:8}}>👥</div>
                  <div style={{color:C.white,fontWeight:700,fontSize:15,marginBottom:4}}>No Groups Available</div>
                  <div style={{color:C.gray,fontSize:13}}>Coach Star hasn't set up any group sessions yet. Check back soon or book a 1-on-1 session.</div>
                </div>
              ):activeGroups.map((gs,i)=>{
                const regs=gs.registrants||[];
                const isFull=regs.length>=gs.maxPlayers;
                const spotsLeft=gs.maxPlayers-regs.length;
                const isSelected=selectedGroup?.id===gs.id;
                const col=dc(i);
                return (
                  <div key={gs.id} onClick={()=>{if(!isFull)setSelectedGroup(isSelected?null:gs);}}
                    style={{background:isSelected?col+"22":C.navyMid,borderRadius:14,padding:18,marginBottom:10,
                      cursor:isFull?"not-allowed":"pointer",opacity:isFull?0.55:1,
                      border:`2px solid ${isSelected?col:isFull?C.red+"44":C.grayL}`,transition:"all 0.15s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{color:isSelected?col:C.white,fontWeight:800,fontSize:16,fontFamily:"'Barlow Condensed',sans-serif"}}>{gs.name}</div>
                        <div style={{color:C.gray,fontSize:13,marginTop:3}}>Every {gs.day} · {gs.time} · 1 hour</div>
                        {gs.endDate&&<div style={{color:C.gray,fontSize:11,marginTop:2}}>Until {fmtD(gs.endDate)}</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        {isFull
                          ? <div style={{background:C.red+"22",color:C.red,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700}}>Full</div>
                          : <div>
                              <div style={{color:isSelected?col:C.green,fontWeight:800,fontSize:15}}>{spotsLeft} spot{spotsLeft!==1?"s":""} left</div>
                              <div style={{color:C.gray,fontSize:11}}>{regs.length}/{gs.maxPlayers} joined</div>
                            </div>}
                      </div>
                    </div>
                    {/* Capacity bar */}
                    <div style={{background:C.grayL,borderRadius:4,height:4,marginTop:12}}>
                      <div style={{width:`${Math.min((regs.length/gs.maxPlayers)*100,100)}%`,height:"100%",
                        background:isFull?C.red:col,borderRadius:4}}/>
                    </div>
                    {isSelected&&<div style={{color:col,fontSize:12,fontWeight:700,marginTop:10}}>✓ Selected</div>}
                  </div>
                );
              })}
            </div>
          )}

          <Btn v="pri"
            onClick={()=>setStep(session?.id==="group"?3:2)}
            dis={!session||(session?.id==="group"&&!selectedGroup)}
            sx={{width:"100%",padding:"13px 0",fontSize:15,marginTop:8}}>
            {session?.id==="group"?"Next → Your Info":"Next → Pick Dates & Times"}
          </Btn>
        </div>}

        {/* STEP 2 — Dates & Times */}
        {step===2&&<>
          <div style={{padding:"20px 20px 0",maxWidth:560,margin:"0 auto"}}>
          <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:4}}>Pick Dates & Times</div>
          <div style={{color:C.gray,fontSize:13,marginBottom:16}}>Select as many sessions as you want · Up to 60 days out</div>

          {/* Selected sessions summary */}
          {selections.length>0&&(
            <div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
              <div style={{color:C.green,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                ✓ {selections.length} Session{selections.length!==1?"s":""} Selected · Total ${session.price*selections.length}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {selections.map((s,i)=>(
                  <div key={i} style={{background:C.green+"22",borderRadius:6,padding:"4px 10px",
                    display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:C.white,fontSize:12,fontWeight:600}}>{s.dateLabel} · {s.time}</span>
                    <button onClick={()=>toggleTime(s.dateObj,s.time)}
                      style={{background:"transparent",border:"none",color:C.green,cursor:"pointer",fontSize:12,fontWeight:800,padding:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          <div style={{padding:"0 20px",maxWidth:560,margin:"0 auto"}}>

          {/* 8-per-row date grid */}
          <div style={{marginBottom:16}}>
            {Array.from({length:Math.ceil(dates.length/8)},(_,rowIdx)=>{
              const rowDates=dates.slice(rowIdx*8,rowIdx*8+8);
              const firstDate=rowDates[0];
              const showMonth=rowIdx===0||firstDate.getMonth()!==dates[rowIdx*8-1]?.getMonth();
              return (
                <div key={rowIdx} style={{marginBottom:6}}>
                  {showMonth&&(
                    <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",
                      letterSpacing:"0.08em",marginBottom:6,marginTop:rowIdx>0?10:0}}>
                      {firstDate.toLocaleDateString("en-US",{month:"long",year:"numeric"})}
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4}}>
                    {rowDates.map(d=>{
                      const key=dateKey(d);
                      const slots=getSlotsForDate(d);
                      const selCount=selections.filter(s=>s.date===key).length;
                      const hasSlots=slots.length>0||selCount>0;
                      const isActive=activeDate&&dateKey(activeDate)===key;
                      return (
                        <div key={key} onClick={()=>{if(!hasSlots&&!selCount)return;setActiveDate(isActive?null:d);}}
                          style={{background:isActive?C.sky:selCount>0?C.green+"33":hasSlots?C.navyMid:C.grayD,
                            borderRadius:8,padding:"8px 2px",textAlign:"center",
                            cursor:hasSlots||selCount>0?"pointer":"default",
                            border:`2px solid ${isActive?C.sky:selCount>0?C.green:hasSlots?C.grayL:C.grayD}`,
                            opacity:hasSlots||selCount>0?1:0.3}}>
                          <div style={{color:isActive?"#fff":selCount>0?C.green:C.gray,
                            fontSize:8,fontWeight:700,textTransform:"uppercase",marginBottom:1}}>
                            {DAYS_OF_WEEK[d.getDay()].slice(0,2)}
                          </div>
                          <div style={{color:isActive?"#fff":C.white,fontWeight:800,fontSize:14}}>
                            {d.getDate()}
                          </div>
                          {selCount>0
                            ?<div style={{background:C.green,borderRadius:50,width:14,height:14,
                                margin:"2px auto 0",display:"flex",alignItems:"center",
                                justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800}}>{selCount}</div>
                            :<div style={{color:isActive?"rgba(255,255,255,0.6)":C.gray,fontSize:7,marginTop:1}}>
                              {hasSlots?`${slots.length}`:"–"}
                            </div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time slots for selected date */}
          {activeDate&&(()=>{
            const slots=getSlotsForDate(activeDate);
            const key=dateKey(activeDate);
            return (
              <div style={{background:C.navyMid,borderRadius:12,padding:16,marginBottom:16,border:`1px solid ${C.sky}44`}}>
                <div style={{color:C.gold,fontWeight:800,fontSize:13,marginBottom:12,
                  fontFamily:"'Barlow Condensed',sans-serif"}}>
                  {fmtDate(activeDate)}
                </div>
                {slots.length===0&&selections.filter(s=>s.date===key).length===0?(
                  <div style={{color:C.gray,fontSize:13,textAlign:"center",padding:"12px 0"}}>
                    No available slots this day
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[...WEEKDAY_SLOTS,...WEEKEND_SLOTS]
                      .filter((v,i,a)=>a.indexOf(v)===i)
                      .sort((a,b)=>toMins(a)-toMins(b))
                      .filter(s=>slots.includes(s)||isSelected(activeDate,s))
                      .map(s=>{
                        const sel=isSelected(activeDate,s);
                        return (
                          <button key={s} onClick={()=>toggleTime(activeDate,s)}
                            style={{padding:"11px 8px",borderRadius:10,cursor:"pointer",textAlign:"center",
                              border:`2px solid ${sel?C.green:C.grayL}`,
                              background:sel?C.green+"22":C.navy,
                              color:sel?C.green:C.white,fontWeight:700,fontSize:13}}>
                            {sel?"✓ ":""}{s}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{display:"flex",gap:10}}>
            <Btn v="gh" onClick={()=>setStep(1)} sx={{flex:1}}>← Back</Btn>
            <Btn v="pri" onClick={()=>setStep(3)} dis={selections.length===0} sx={{flex:2}}>
              Next → Your Info {selections.length>0?`(${selections.length} session${selections.length!==1?"s":""})`:""}
            </Btn>
          </div>
          </div>
        </>}

        {/* STEP 3 — Info */}
        {step===3&&<div style={{padding:"20px 20px 20px",maxWidth:560,margin:"0 auto"}}>
          <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:16}}>Your Information</div>
          {[{k:"name",l:"Full Name *",p:"Your full name",type:"text"},{k:"email",l:"Email Address *",p:"yourname@email.com",type:"email"},{k:"phone",l:"Phone Number *",p:"(555) 555-5555",type:"tel"}].map(({k,l,p,type})=>(
            <div key={k} style={{marginBottom:14}}>
              <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
              <input value={form[k]} onChange={e=>upd(k,e.target.value)} placeholder={p} type={type}
                style={{width:"100%",background:C.navyMid,border:`1px solid ${errors[k]?C.red:C.grayL}`,
                  borderRadius:8,color:C.white,fontSize:14,padding:"11px 14px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              <FErr k={k}/>
            </div>
          ))}
          <div style={{background:C.navyMid,borderRadius:12,padding:14,marginBottom:16,border:`1px solid ${C.grayL}`}}>
            <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Booking Summary</div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:12}}>Session Type</span>
              <span style={{color:C.white,fontWeight:600,fontSize:12}}>{session?.label}</span>
            </div>
            {/* Group session summary */}
            {session?.id==="group"&&selectedGroup&&<>
              <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
                <span style={{color:C.gray,fontSize:12}}>Group</span>
                <span style={{color:C.sky,fontWeight:600,fontSize:12}}>{selectedGroup.name}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
                <span style={{color:C.gray,fontSize:12}}>Schedule</span>
                <span style={{color:C.white,fontWeight:600,fontSize:12}}>Every {selectedGroup.day} · {selectedGroup.time}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
                <span style={{color:C.gray,fontSize:12}}>Until</span>
                <span style={{color:C.white,fontWeight:600,fontSize:12}}>{fmtD(selectedGroup.endDate)}</span>
              </div>
            </>}
            {/* 1-on-1 session summary */}
            {session?.id!=="group"&&selections.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.grayL}`}}>
                <span style={{color:C.gray,fontSize:12}}>Session {i+1}</span>
                <span style={{color:C.sky,fontWeight:600,fontSize:12}}>{s.dateLabel} · {s.time}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.grayL}`}}>
              <span style={{color:C.gray,fontSize:12,fontWeight:700}}>Price</span>
              <span style={{color:C.gold,fontWeight:800,fontSize:15}}>
                {session?.id==="group"
                  ? `$${session?.price}/session`
                  : `$${(session?.price||0)*selections.length}`}
              </span>
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn v="gh" onClick={()=>setStep(session?.id==="group"?1:2)} sx={{flex:1}}>← Back</Btn>
            <Btn v="pri" onClick={()=>{if(validate())setStep(4);}} sx={{flex:2}}>Next → Payment</Btn>
          </div>
        </div>}

        {/* STEP 4 — Payment */}
        {step===4&&<div style={{padding:"20px 20px 20px",maxWidth:560,margin:"0 auto"}}>
          <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:4}}>Payment Method</div>
          <div style={{color:C.gray,fontSize:13,marginBottom:20}}>
            {session?.id==="group"&&selectedGroup
              ? <>Group: <strong style={{color:C.white}}>{selectedGroup.name}</strong> · <strong style={{color:C.gold}}>${session?.price}/session</strong></>
              : <>Total due: <strong style={{color:C.gold}}>${(session?.price||0)*selections.length}</strong> ({selections.length} session{selections.length!==1?"s":""})</>}
          </div>
          {[{id:"online",icon:"💳",title:"Pay Online",desc:`Secure payment via Clover`,color:C.green},{id:"inperson",icon:"💵",title:"Pay In Person",desc:"Bring cash or card to your session",color:C.sky}].map(opt=>(
            <div key={opt.id} onClick={()=>upd("payMethod",opt.id)}
              style={{background:form.payMethod===opt.id?opt.color+"18":C.navyMid,borderRadius:14,
                padding:18,marginBottom:12,cursor:"pointer",
                border:`2px solid ${form.payMethod===opt.id?opt.color:C.grayL}`,transition:"all 0.15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:28}}>{opt.icon}</div>
                <div>
                  <div style={{color:C.white,fontWeight:800,fontSize:15}}>{opt.title}</div>
                  <div style={{color:C.gray,fontSize:12,marginTop:3}}>{opt.desc}</div>
                </div>
                {form.payMethod===opt.id&&<div style={{marginLeft:"auto",color:opt.color,fontWeight:800,fontSize:16}}>✓</div>}
              </div>
            </div>
          ))}
          <div style={{background:C.gold+"18",border:`1px solid ${C.gold}44`,borderRadius:10,padding:"12px 14px",marginBottom:20}}>
            <div style={{color:C.gold,fontSize:12,fontWeight:700,marginBottom:2}}>📌 Note</div>
            <div style={{color:C.gray,fontSize:12,lineHeight:1.5}}>Your request will be reviewed by {COACH_NAME}. You'll receive a confirmation email once approved. Payment is due after approval.</div>
          </div>
          <Btn v="org" onClick={handleSubmit} dis={submitting} sx={{width:"100%",padding:"14px 0",fontSize:15,marginBottom:10}}>
            {submitting?"Booking..."
              : session?.id==="group"&&selectedGroup
              ? `✓ Join ${selectedGroup.name}`
              : `✓ Confirm ${selections.length} Session${selections.length!==1?"s":""}`}
          </Btn>
          <Btn v="gh" onClick={()=>setStep(3)} sx={{width:"100%",padding:"11px 0"}}>← Back</Btn>
        </div>}

      </div>
    </div>
  );
}

// ─── ADMIN BOOKING CALENDAR ───────────────────────────────────────────────────
function AdminBookings({bookings, schedule, onUpdateBooking, onDeleteBooking, onUpdateSchedule}) {
  const [tab, setTab] = useState("calendar");
  const [selDate, setSelDate] = useState(dateKey(new Date()));
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [addForm, setAddForm] = useState({name:"",email:"",phone:"",sessionId:"1on1",time:"4:00 PM",payMethod:"inperson",payStatus:"unpaid"});
  const [localSched, setLocalSched] = useState(schedule);
  const upd=(k,v)=>setAddForm(f=>({...f,[k]:v}));

  const dates = getUpcomingDates(28);
  const todayBookings = bookings.filter(b=>b.date===selDate&&b.status!=="cancelled");
  const selDateObj = dates.find(d=>dateKey(d)===selDate)||new Date(selDate+"T12:00:00");

  const addManual=async()=>{
    const s=SESSIONS.find(x=>x.id===addForm.sessionId);
    const b={
      id:Date.now(), sessionId:s.id, sessionLabel:s.label, price:s.price,
      date:selDate, dateLabel:fmtDate(selDateObj), time:addForm.time,
      clientName:addForm.name.trim(), clientEmail:addForm.email.trim(),
      clientPhone:addForm.phone.trim(), payMethod:addForm.payMethod,
      payStatus:addForm.payStatus, status:"confirmed",
      bookedAt:new Date().toISOString(), addedByAdmin:true,
    };
    await saveBooking(b);
    onUpdateBooking(b,"add");
    setShowAddModal(false);
    setAddForm({name:"",email:"",phone:"",sessionId:"1on1",time:"4:00 PM",payMethod:"inperson",payStatus:"unpaid"});
  };

  const toggleBlock=async(date,time)=>{
    const blocked=[...(localSched.blocked||[])];
    const idx=blocked.findIndex(b=>b.date===date&&b.time===time);
    let newSched;
    if(idx>=0){ blocked.splice(idx,1); newSched={...localSched,blocked}; }
    else { newSched={...localSched,blocked:[...blocked,{date,time}]}; }
    setLocalSched(newSched);
    await saveSchedule(newSched);
    onUpdateSchedule(newSched);
  };

  const saveWeekendAvail=async()=>{
    await saveSchedule(localSched);
    onUpdateSchedule(localSched);
    setShowScheduleModal(false);
  };

  const allSlots=isWeekend(selDateObj)
    ?(localSched?.availability?.[selDowAdmin]||WEEKEND_SLOTS)
    :(localSched?.weekdaySlots?.[selDowAdmin]||WEEKDAY_SLOTS_ALL);
  const selDowAdmin=DAYS_OF_WEEK[selDateObj.getDay()];
  const groupSlotsAdmin=(localSched?.groupSlots||[]).filter(gs=>{
    if(!gs.endDate||new Date(gs.endDate+"T23:59:59")<new Date()) return false;
    return gs.day===selDowAdmin;
  });
  const blockedSlots=(localSched?.blocked||[]).filter(b=>b.date===selDate).map(b=>b.time);
  const bookedSlots=todayBookings.map(b=>b.time);

  const totalRevenue=bookings.filter(b=>b.payStatus==="paid").reduce((s,b)=>s+b.price,0);
  const pendingPay=bookings.filter(b=>b.status!=="cancelled"&&b.payStatus!=="paid").length;

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:20}}>
        {[
          {l:"Total Bookings",v:bookings.filter(b=>b.status!=="cancelled").length,c:C.sky},
          {l:"Confirmed",v:bookings.filter(b=>b.status==="confirmed").length,c:C.green},
          {l:"Pending Pay",v:pendingPay,c:C.gold},
          {l:"Revenue",v:`$${totalRevenue}`,c:C.green},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:C.navyMid,borderRadius:12,padding:"14px 16px",border:`1px solid ${C.grayL}`,textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
            <div style={{color:C.gray,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
        {[{id:"calendar",l:"📅 Calendar"},{id:"list",l:"📋 All Bookings"},{id:"availability",l:"🔁 Availability"},{id:"schedule",l:"👥 Groups"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",
            border:`1px solid ${tab===t.id?C.sky:C.grayL}`,background:tab===t.id?C.sky+"22":"transparent",
            color:tab===t.id?C.sky:C.gray,fontWeight:700,fontSize:13}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── CALENDAR TAB ── */}
      {tab==="calendar"&&<>
        {/* Date strip */}
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:16}}>
          {dates.map(d=>{
            const key=dateKey(d);
            const cnt=bookings.filter(b=>b.date===key&&b.status!=="cancelled").length;
            const isSel=selDate===key;
            return (
              <div key={key} onClick={()=>setSelDate(key)}
                style={{flexShrink:0,width:60,background:isSel?C.sky:C.navyMid,borderRadius:10,
                  padding:"9px 6px",textAlign:"center",cursor:"pointer",
                  border:`2px solid ${isSel?C.sky:C.grayL}`}}>
                <div style={{color:isSel?"#fff":C.gray,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>
                  {DAYS_OF_WEEK[d.getDay()].slice(0,3)}
                </div>
                <div style={{color:isSel?"#fff":C.white,fontWeight:800,fontSize:15,margin:"3px 0"}}>{d.getDate()}</div>
                {cnt>0&&<div style={{background:isSel?"rgba(255,255,255,0.3)":C.sky,borderRadius:50,
                  width:18,height:18,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",
                  color:"#fff",fontSize:10,fontWeight:800}}>{cnt}</div>}
              </div>
            );
          })}
        </div>

        {/* Day header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{color:C.white,fontWeight:800,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif"}}>
              {fmtDate(selDateObj)}
            </div>
            <div style={{color:C.gray,fontSize:12}}>
              {todayBookings.length} booking{todayBookings.length!==1?"s":""} · {blockedSlots.length} blocked
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn v="teal" onClick={()=>setTab("schedule")} sx={{padding:"8px 14px",fontSize:12}}>👥 + Group</Btn>
            <Btn v="org" onClick={()=>setShowAddModal(true)} sx={{padding:"8px 14px",fontSize:12}}>+ Add Client</Btn>
          </div>
        </div>

        {/* Time slots grid */}
        <div>
          {allSlots.map(slot=>{
            const booking=todayBookings.find(b=>b.time===slot);
            const isBlocked=blockedSlots.includes(slot);
            const groupSlot=groupSlotsAdmin.find(gs=>gs.time===slot);
            return (
              <div key={slot} style={{display:"flex",gap:12,alignItems:"stretch",marginBottom:8}}>
                <div style={{width:70,flexShrink:0,color:C.gold,fontWeight:700,fontSize:12,
                  fontFamily:"'Barlow Condensed',sans-serif",paddingTop:14}}>{slot}</div>
                {groupSlot?(
                  <div style={{flex:1,background:C.sky+"11",borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${C.sky}44`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:C.sky,fontWeight:700,fontSize:14}}>👥 {groupSlot.name}</div>
                      <div style={{color:C.gray,fontSize:12,marginTop:2}}>
                        Group · {(groupSlot.registrants||[]).length}/{groupSlot.maxPlayers} players
                      </div>
                    </div>
                    <Badge c={C.sky}>Group</Badge>
                  </div>
                ):booking?(
                  <div style={{flex:1,background:C.navyMid,borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${booking.payStatus==="paid"?C.green:C.sky}44`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{color:C.white,fontWeight:700,fontSize:14}}>{booking.clientName}</div>
                        <div style={{color:C.gray,fontSize:12}}>{booking.sessionLabel} · ${booking.price}</div>
                        {booking.clientPhone&&<div style={{color:C.gray,fontSize:11,marginTop:2}}>{booking.clientPhone}</div>}
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <select value={booking.payStatus} onChange={e=>{
                          const updated={...booking,payStatus:e.target.value};
                          updateBooking(updated); onUpdateBooking(updated,"update");
                        }} style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:6,
                          color:booking.payStatus==="paid"?C.green:C.gold,fontSize:11,padding:"4px 8px",outline:"none",cursor:"pointer"}}>
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid ✓</option>
                          <option value="pay_inperson">Pay In Person</option>
                        </select>
                        <button onClick={async()=>{
                          if(!window.confirm(`Cancel ${booking.clientName}'s session?`)) return;
                          const u={...booking,status:"cancelled"};
                          await updateBooking(u); onUpdateBooking(u,"update");
                        }} style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                          borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
                      </div>
                    </div>
                  </div>
                ):isBlocked?(
                  <div style={{flex:1,background:C.red+"11",borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${C.red}33`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color:C.red,fontSize:13,fontWeight:600}}>🚫 Blocked</div>
                    <button onClick={()=>toggleBlock(selDate,slot)}
                      style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,
                        borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Unblock</button>
                  </div>
                ):(
                  <div style={{flex:1,background:C.navy,borderRadius:10,padding:"12px 16px",
                    border:`1px dashed ${C.grayL}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color:C.grayL,fontSize:13}}>Available</div>
                    <button onClick={()=>toggleBlock(selDate,slot)}
                      style={{background:"transparent",border:`1px solid ${C.grayL}`,color:C.gray,
                        borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Block</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>}

      {/* ── ALL BOOKINGS TAB ── */}
      {tab==="list"&&<>
        {bookings.length===0?(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>📋</div>
            <div style={{color:C.white,fontWeight:700,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:8}}>No Bookings Yet</div>
            <div style={{color:C.gray,fontSize:13}}>Bookings will appear here when clients register</div>
          </div>
        ):([...bookings].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(b=>(
          <div key={b.id} style={{background:C.navyMid,borderRadius:12,padding:"14px 16px",marginBottom:10,
            border:`1px solid ${b.status==="cancelled"?C.red+"44":b.payStatus==="paid"?C.green+"44":C.grayL}`,
            opacity:b.status==="cancelled"?0.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{color:C.white,fontWeight:700,fontSize:15}}>{b.clientName}</div>
                <div style={{color:C.gray,fontSize:12,marginTop:2}}>{b.sessionLabel} · {b.dateLabel} · {b.time}</div>
                <div style={{color:C.gray,fontSize:11,marginTop:2}}>{b.clientEmail} · {b.clientPhone}</div>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <Badge c={b.status==="cancelled"?C.red:C.green}>{b.status}</Badge>
                  <Badge c={b.payStatus==="paid"?C.green:C.gold}>${b.price} · {b.payStatus}</Badge>
                  {b.addedByAdmin&&<Badge c={C.sky}>Admin Added</Badge>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select value={b.payStatus} onChange={e=>{
                  const u={...b,payStatus:e.target.value};
                  updateBooking(u); onUpdateBooking(u,"update");
                }} style={{background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,
                  color:C.white,fontSize:12,padding:"7px 10px",outline:"none",cursor:"pointer"}}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid ✓</option>
                  <option value="pay_inperson">Pay In Person</option>
                </select>
                <button onClick={async()=>{
                  if(!window.confirm(`Delete ${b.clientName}'s booking?`)) return;
                  await deleteBooking(b.id); onUpdateBooking(b,"delete");
                }} style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,
                  borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>🗑</button>
              </div>
            </div>
          </div>
        )))}
      </>}

      {/* ── AVAILABILITY TAB ── */}
      {tab==="availability"&&<>
        <div style={{color:C.gray,fontSize:13,marginBottom:20,lineHeight:1.6}}>
          Set which time slots Coach Star offers for 1-on-1 sessions each day. Weekdays are in 15-min increments from 3:15pm–8:15pm. Weekend slots are set separately below.
        </div>

        {/* Weekday 1-on-1 slots */}
        <div style={{background:C.navyMid,borderRadius:12,padding:18,marginBottom:16,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
            📅 Weekday 1-on-1 Hours (Mon–Fri)
          </div>
          <div style={{color:C.gray,fontSize:12,marginBottom:16}}>
            Toggle which time slots to offer each day. Each slot is 1 hour.
          </div>
          {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(day=>{
            const daySlots=localSched?.weekdaySlots?.[day]||[];
            const allOn=WEEKDAY_SLOTS_ALL.every(s=>daySlots.includes(s));
            return (
              <div key={day} style={{marginBottom:16,background:C.navy,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{color:C.white,fontWeight:800,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif"}}>{day}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:C.gray,fontSize:11}}>{daySlots.length} slot{daySlots.length!==1?"s":""} selected</span>
                    <button onClick={()=>{
                      const cur=localSched?.weekdaySlots||{};
                      const newSlots=allOn?[]:[...WEEKDAY_SLOTS_ALL];
                      setLocalSched(p=>({...p,weekdaySlots:{...cur,[day]:newSlots}}));
                    }} style={{background:"transparent",border:`1px solid ${C.grayL}`,borderRadius:6,
                      color:C.gray,cursor:"pointer",fontSize:11,padding:"3px 10px",fontWeight:600}}>
                      {allOn?"Clear all":"Select all"}
                    </button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                  {WEEKDAY_SLOTS_ALL.map(s=>{
                    const on=daySlots.includes(s);
                    return (
                      <button key={s} onClick={()=>{
                        const cur=localSched?.weekdaySlots||{};
                        const ds=cur[day]||[];
                        const ns=on?ds.filter(x=>x!==s):[...ds,s].sort((a,b)=>toMins(a)-toMins(b));
                        setLocalSched(p=>({...p,weekdaySlots:{...cur,[day]:ns}}));
                      }} style={{padding:"7px 3px",borderRadius:7,cursor:"pointer",textAlign:"center",
                        border:`2px solid ${on?C.sky:C.grayL}`,background:on?C.sky+"22":C.navyMid,
                        color:on?C.sky:C.gray,fontWeight:700,fontSize:10,transition:"all 0.1s"}}>
                        {on?"✓ ":""}{s}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Btn v="pri" onClick={async()=>{await saveSchedule(localSched);onUpdateSchedule(localSched);}}
            sx={{width:"100%",padding:"12px 0",fontSize:14}}>
            💾 Save Weekday Hours
          </Btn>
        </div>

        {/* Weekend slots */}
        <div style={{background:C.navyMid,borderRadius:12,padding:18,border:`1px solid ${C.grayL}`}}>
          <div style={{color:C.sky,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
            📅 Weekend Hours (Sat–Sun)
          </div>
          <div style={{color:C.gray,fontSize:12,marginBottom:16}}>
            Toggle Saturday and Sunday time slots — they repeat every week automatically.
          </div>
          {["Saturday","Sunday"].map(day=>{
            const slots=localSched?.availability?.[day]||[];
            return (
              <div key={day} style={{marginBottom:16}}>
                <div style={{color:C.white,fontWeight:800,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:10}}>{day}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {WEEKEND_SLOTS.map(s=>{
                    const on=slots.includes(s);
                    return (
                      <button key={s} onClick={()=>{
                        const cur=localSched?.availability||{};
                        const ds2=cur[day]||[];
                        const ns2=on?ds2.filter(x=>x!==s):[...ds2,s].sort((a,b)=>toMins(a)-toMins(b));
                        setLocalSched(p=>({...p,availability:{...cur,[day]:ns2}}));
                      }} style={{padding:"9px 4px",borderRadius:8,cursor:"pointer",textAlign:"center",
                        border:`2px solid ${on?C.gold:C.grayL}`,background:on?C.gold+"22":C.navy,
                        color:on?C.gold:C.gray,fontWeight:700,fontSize:11,transition:"all 0.15s"}}>
                        {on?"✓ ":""}{s}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Btn v="pri" onClick={async()=>{await saveSchedule(localSched);onUpdateSchedule(localSched);}}
            sx={{width:"100%",padding:"12px 0",fontSize:14}}>
            💾 Save Weekend Hours
          </Btn>
        </div>
      </>}

      {/* ── GROUPS TAB ── */}
      {tab==="schedule"&&<>
        <div style={{color:C.gray,fontSize:13,marginBottom:20,lineHeight:1.6}}>
          Create named recurring group training slots. Each group repeats weekly until its end date.
        </div>
        {(localSched?.groupSlots||[]).length===0&&(
          <div style={{textAlign:"center",padding:"32px 0",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:10}}>👥</div>
            <div style={{color:C.white,fontWeight:700,fontSize:17,fontFamily:"'Barlow Condensed',sans-serif",marginBottom:6}}>No Group Slots Yet</div>
            <div style={{color:C.gray,fontSize:13}}>Create a group using the button below</div>
          </div>
        )}
        {(localSched?.groupSlots||[]).map((gs,gi)=>(
          <GroupSlotCard key={gs.id} gs={gs} gi={gi} schedule={localSched} onUpdateSchedule={onUpdateSchedule}
            showRemove={true} localSched={localSched} setLocalSched={setLocalSched}/>
        ))}
        <GroupCreateForm localSched={localSched} setLocalSched={setLocalSched} onUpdateSchedule={onUpdateSchedule} isCoach={false}/>
      </>}

      {/* Add Client Modal */}
      {showAddModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.navyMid,borderRadius:18,padding:28,width:420,maxWidth:"100%",border:`1px solid ${C.sky}55`,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{color:C.white,fontWeight:800,fontSize:18,fontFamily:"'Barlow Condensed',sans-serif"}}>Add Client to Calendar</div>
              <button onClick={()=>setShowAddModal(false)} style={{background:"transparent",border:"none",color:C.gray,cursor:"pointer",fontSize:20}}>×</button>
            </div>
            <div style={{color:C.sky,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14}}>
              {fmtDate(selDateObj)}
            </div>
            {[{k:"name",l:"Client Name *",p:"Full name",t:"text"},{k:"email",l:"Email",p:"email@example.com",t:"email"},{k:"phone",l:"Phone",p:"(555) 555-5555",t:"tel"}].map(({k,l,p,t})=>(
              <div key={k} style={{marginBottom:12}}>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{l}</div>
                <input value={addForm[k]||""} onChange={e=>upd(k,e.target.value)} placeholder={p} type={t}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:14,padding:"10px 12px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Session</div>
                <select value={addForm.sessionId} onChange={e=>upd("sessionId",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  {SESSIONS.map(s=><option key={s.id} value={s.id}>{s.label} (${s.price})</option>)}
                </select>
              </div>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Time</div>
                <select value={addForm.time} onChange={e=>upd("time",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  {allSlots.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Payment</div>
                <select value={addForm.payMethod} onChange={e=>upd("payMethod",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  <option value="inperson">In Person</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div>
                <div style={{color:C.gray,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Pay Status</div>
                <select value={addForm.payStatus} onChange={e=>upd("payStatus",e.target.value)}
                  style={{width:"100%",background:C.navy,border:`1px solid ${C.grayL}`,borderRadius:8,color:C.white,fontSize:13,padding:"10px 12px",outline:"none"}}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid ✓</option>
                  <option value="pay_inperson">Pay In Person</option>
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="gh" onClick={()=>setShowAddModal(false)} sx={{flex:1}}>Cancel</Btn>
              <Btn v="pri" onClick={addManual} dis={!addForm.name?.trim()} sx={{flex:2}}>Add to Calendar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,setData]           = useState({ tournaments: [] });
  const [bookings,setBookings]   = useState([]);
  const [coachSchedule,setCoachSchedule] = useState({availability:{},blocked:[]});
  const [loading,setLoading]     = useState(true);
  const [adminAuth,setAdminAuth] = useState(()=>sessionStorage.getItem(ADMIN_SESSION_KEY)||"");
  const [showAdminLogin,setShowAdminLogin] = useState(false);
  const [selectedTId,setSelectedTId]       = useState(null);
  const [showRegister,setShowRegister]     = useState(false);
  const [showTeamList,setShowTeamList]     = useState(false);
  const [show3v3,setShow3v3]               = useState(false);
  const [showBooking,setShowBooking]       = useState(false);
  const [logoUrl,setLogoUrl]               = useState("https://raw.githubusercontent.com/nbrown2423/Shoebox-sports/main/logo.jpg");

  // Load fonts
  useEffect(()=>{
    const l=document.createElement("link");
    l.href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap";
    l.rel="stylesheet"; document.head.appendChild(l);
  },[]);

  // Load data from Supabase on mount
  useEffect(()=>{
    Promise.all([loadFromDB(), loadBookings(), loadSchedule()]).then(([d,b,s])=>{
      setData(d);
      setBookings(b.map(r=>r.data||r));
      setCoachSchedule(s);
      setLoading(false);
    });
  },[]);

  const onScore=(gId,h,a)=>setData(d=>{
    const next = {
      ...d,
      tournaments: d.tournaments.map(t=>{
        if(!t.games.find(g=>g.id===gId)) return t; // skip tournaments that don't have this game
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
        // Use correct bracket seeder based on tournament type
        const seededGames = t.type==="3v3"
          ? seed3v3Bracket(divisions, gamesAfterScore)
          : seedBracket(divisions, gamesAfterScore);
        const updated = {...t,divisions,games:seededGames};
        updateTournamentInDB(updated);
        return updated;
      })
    };
    return next;
  });

  const onUpdateGames=(tId,games)=>setData(d=>{
    const next = {...d,tournaments:d.tournaments.map(t=>{
      if(t.id!==tId) return t;
      const updated = {...t,games};
      updateTournamentInDB(updated); // save to DB
      return updated;
    })};
    return next;
  });

  const onAdd=t=>{
    saveTournamentToDB(t);
    setData(d=>({...d,tournaments:[...d.tournaments,t]}));
  };

  const onEditTournament=async(t)=>{
    setData(d=>({...d,tournaments:d.tournaments.map(x=>x.id===t.id?t:x)}));
    await updateTournamentInDB(t);
  };

  const onDeleteTournament=async(tId)=>{
    await sbSecure(`/tournaments?id=eq.${tId}`,{method:"DELETE"});
    setData(d=>({...d,tournaments:d.tournaments.filter(x=>x.id!==tId)}));
  };

  const onSubmitBooking=async(b, updatedSchedule)=>{
    await saveBooking(b);
    setBookings(prev=>[...prev,b]);
    if(updatedSchedule){
      setCoachSchedule(updatedSchedule);
    }
  };

  const onUpdateBooking=(b,action)=>{
    if(action==="add") setBookings(prev=>[...prev,b]);
    else if(action==="update") setBookings(prev=>prev.map(x=>x.id===b.id?b:x));
    else if(action==="delete") setBookings(prev=>prev.filter(x=>x.id!==b.id));
  };

  const onUpdateSchedule=(s)=>setCoachSchedule(s);

  const onSubmitRegistration=async(reg)=>{
    // Store registration inside tournament data only (single source of truth)
    setData(d=>({...d,tournaments:d.tournaments.map(t=>{
      if(t.id!==reg.tournamentId) return t;
      const updated={...t,registrations:[...(t.registrations||[]),reg]};
      updateTournamentInDB(updated); // persist to DB
      return updated;
    })}));
  };

  const onUpdateTournamentRegs=async(t)=>{
    setData(d=>({...d,tournaments:d.tournaments.map(x=>x.id===t.id?t:x)}));
    await updateTournamentInDB(t);
  };

  // Shared logo header for public pages
  const PublicHeader=({onBack})=>(
    <div style={{background:C.navyMid,borderBottom:`1px solid ${C.grayL}`,padding:"0 18px",
      display:"flex",alignItems:"center",height:60,gap:12}}>
      {onBack&&(
        <button onClick={onBack} style={{background:"transparent",border:"none",color:C.sky,
          cursor:"pointer",fontSize:13,fontWeight:700,padding:0,display:"flex",alignItems:"center",gap:4}}>
          ←
        </button>
      )}
      <button onClick={()=>setSelectedTId(null)} style={{background:"transparent",border:"none",cursor:"pointer",padding:0}}>
        {logoUrl
          ? <img src={logoUrl} alt="Shoebox Sports" style={{height:36,maxWidth:140,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
          : <Logo sz={32}/>}
      </button>
      {onBack&&<span style={{color:C.gray,fontSize:12,fontWeight:600}}>← Back to Tournaments</span>}
    </div>
  );

  // Loading screen
  if (loading) return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      {logoUrl
        ? <img src={logoUrl} alt="Shoebox Sports" style={{maxWidth:200,maxHeight:120,objectFit:"contain",marginBottom:20}} onError={e=>e.target.style.display="none"}/>
        : <Logo sz={60} txt/>}
      <div style={{color:C.gray,fontSize:14,marginTop:24,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700}}>Loading...</div>
      <div style={{width:40,height:3,background:C.sky,borderRadius:2,marginTop:16,animation:"pulse 1.2s ease-in-out infinite"}}/>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );

  const signOut = () => { setAdminAuth(""); sessionStorage.removeItem(ADMIN_SESSION_KEY); };

  // Login screen — show when explicitly requested or not yet authed
  if (showAdminLogin) {
    return <LoginPage logoUrl={logoUrl} onSuccess={(role)=>{setAdminAuth(role);setShowAdminLogin(false);}}/>;
  }

  // Coach Star dashboard
  if (adminAuth==="coach") {
    return (
      <CoachDashboard
        bookings={bookings} schedule={coachSchedule}
        onUpdateBooking={onUpdateBooking} onUpdateSchedule={onUpdateSchedule}
        onSignOut={signOut} logoUrl={logoUrl}/>
    );
  }

  // Admin / Director dashboard
  if (adminAuth==="admin"||adminAuth==="director") {
    return (
      <div style={{background:C.navy,minHeight:"100vh"}}>
        <Admin data={data} onScore={onScore} onUpdateGames={onUpdateGames} onAdd={onAdd}
          onEditTournament={onEditTournament} onDeleteTournament={onDeleteTournament}
          logoUrl={logoUrl} onSaveLogoUrl={setLogoUrl}
          onGoHome={()=>setATId?setATId(null):null}
          bookings={bookings} coachSchedule={coachSchedule}
          onUpdateBooking={onUpdateBooking} onUpdateSchedule={onUpdateSchedule}
          role={adminAuth}/>
        <button onClick={signOut}
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

  // Public: booking form
  if (showBooking) return (
    <div style={{background:C.navy,minHeight:"100vh"}}>
      <PublicHeader onBack={()=>setShowBooking(false)}/>
      <BookingForm bookings={bookings} schedule={coachSchedule} onSubmit={onSubmitBooking} onBack={()=>setShowBooking(false)} logoUrl={logoUrl}/>
    </div>
  );

  // Public: 3v3 registration
  if (show3v3) return (
    <div style={{background:C.navy,minHeight:"100vh"}}>
      <PublicHeader onBack={()=>setShow3v3(false)}/>
      <ThreevThreeForm onBack={()=>setShow3v3(false)} logoUrl={logoUrl} data={data} onSubmit={onSubmitRegistration}/>
    </div>
  );

  // Public: registration form
  if (showRegister) return (
    <div style={{background:C.navy,minHeight:"100vh"}}>
      <PublicHeader onBack={()=>setShowRegister(false)}/>
      <RegistrationForm data={data} onSubmit={onSubmitRegistration} onBack={()=>setShowRegister(false)}/>
    </div>
  );

  // Public: team list
  if (showTeamList&&selectedTId) {
    const t=data.tournaments.find(x=>x.id===selectedTId);
    if(t) return (
      <div style={{background:C.navy,minHeight:"100vh"}}>
        <PublicHeader onBack={()=>setShowTeamList(false)}/>
        <PublicTeamList tournament={t} onBack={()=>setShowTeamList(false)}/>
      </div>
    );
  }

  // Public: tournament detail
  if (selectedTId) {
    const t=data.tournaments.find(x=>x.id===selectedTId);
    if (t) return (
      <div style={{background:C.navy,minHeight:"100vh"}}>
        <PublicHeader onBack={()=>setSelectedTId(null)}/>
        <PublicTournament tournament={t} onBack={()=>setSelectedTId(null)}
          onRegister={()=>setShowRegister(true)}
          onViewTeams={()=>setShowTeamList(true)}/>
      </div>
    );
  }

  // Public: home page
  return (
    <div style={{background:C.navy,minHeight:"100vh"}}>
      <PublicHome data={data} onSelectTournament={id=>setSelectedTId(id)} logoUrl={logoUrl} onRegister={()=>setShowRegister(true)} onRegister3v3={()=>setShow3v3(true)} onBooking={()=>setShowBooking(true)}/>
      <div style={{textAlign:"center",paddingBottom:20}}>
        <button onClick={()=>{
          // If already authed, sign out first so they can pick a role
          if(adminAuth) signOut();
          setShowAdminLogin(true);
        }}
          style={{background:"transparent",border:"none",color:C.grayL,
            cursor:"pointer",fontSize:11,fontFamily:"'DM Sans',sans-serif"}}>
          Admin Login
        </button>
      </div>
    </div>
  );
}
