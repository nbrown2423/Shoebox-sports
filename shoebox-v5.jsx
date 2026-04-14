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

// ─── TIME HELPERS (unchanged) ────────────────────────────────────────────────
const toMins = t => { /* ... same as your original ... */ };
const fromMins = m => { /* ... same ... */ };
const buildSlots = (start, n=16, gap=60) => Array.from({length:n}, (_,i) => fromMins(toMins(start) + i*gap));
const addDays = (ds,n) => { /* ... */ };
const fmtD = ds => ds ? new Date(ds+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) : "";
const tDates = t => Array.from({length:t.numDays}, (_,i) => addDays(t.startDate, i));
const dlabel = (g,s) => `${GDL[g]||g} ${s}`;
const dshort = (g,s) => `${GD.find(x=>x.id===g)?.s||g} ${s}`;
const tname = (divs,id) => { for(const d of divs){const t=d.teams.find(x=>x.id===id);if(t)return t.name;} return "TBD"; };
const poolSort = (teams,pool) => teams.filter(t=>t.pool===pool).sort((a,b)=>b.wins-a.wins||(b.pf-b.pa)-(a.pf-a.pa));

// ─── MATCHUP + BRACKET SEEDING (unchanged) ───────────────────────────────────
function genMatchups(divs) { /* ... your original ... */ }
function seedBracket(divisions, games) { /* ... your original ... */ }

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://xetqslvyqcydblldqsrc.supabase.co";
const SUPABASE_KEY = "sb_publishable_0Dw8EvFfl1xA-__QXvUI_Q_mUHAGUlq";

async function sbFetch(path, opts={}) { /* ... your original ... */ }
async function loadFromDB() { /* ... */ }
async function saveTournamentToDB(tournament) { /* ... */ }
async function updateTournamentInDB(tournament) { /* ... */ }
async function deleteTournamentFromDB(id) {
  await sbFetch(`/tournaments?id=eq.${id}`, { method: "DELETE" });
}

// ─── SHARED UI COMPONENTS (Badge, Card, Ttl, Inp, Sel, Btn, Logo) ────────────
// (All same as your original – omitted here for brevity but fully present in the file)

// ─── TOURNAMENT MODAL (Create + Edit) – FULLY UPDATED ────────────────────────
function TournamentModal({onSave, onClose, tournamentToEdit = null}) {
  const isEdit = !!tournamentToEdit;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: tournamentToEdit?.name || "",
    startDate: tournamentToEdit?.startDate || "",
    numDays: tournamentToEdit?.numDays?.toString() || "2",
    startTime: tournamentToEdit?.startTime || "8:00 AM",
    gameDuration: tournamentToEdit?.gameDuration?.toString() || "60",
    restGap: tournamentToEdit?.restGap?.toString() || "60",
    location: tournamentToEdit?.location || "Shoebox Sports - Fenton, MI",
  });

  const [selDivs, setSelDivs] = useState(
    isEdit ? tournamentToEdit.divisions.map(d => ({gradeId: d.gradeId, gender: d.gender})) : []
  );

  const [divTeams, setDivTeams] = useState(() => {
    if (!isEdit) return {};
    const map = {};
    tournamentToEdit.divisions.forEach(d => {
      const key = `${d.gradeId}-${d.gender}`;
      map[key] = d.teams.map(t => ({...t}));
    });
    return map;
  });

  const upd = (k,v) => setForm(f => ({...f, [k]: v}));

  const isDivSel = (g,s) => selDivs.some(d => d.gradeId === g && d.gender === s);

  const toggleDiv = (gradeId, gender) => {
    const key = `${gradeId}-${gender}`;
    if (isDivSel(gradeId, gender)) {
      setSelDivs(p => p.filter(d => !(d.gradeId === gradeId && d.gender === gender)));
      setDivTeams(dt => { const n = {...dt}; delete n[key]; return n; });
    } else {
      setSelDivs(p => [...p, {gradeId, gender}]);
      setDivTeams(dt => ({
        ...dt,
        [key]: Array.from({length: 4}, (_, i) => ({
          id: Date.now() + Math.random() + i,
          name: "",
          pool: "A"   // ← Default to Pool A
        }))
      }));
    }
  };

  const addTeam = key => {
    const cur = divTeams[key] || [];
    setDivTeams(dt => ({
      ...dt,
      [key]: [...cur, {id: Date.now() + Math.random(), name: "", pool: "A"}]
    }));
  };

  const remTeam = (key, id) => setDivTeams(dt => ({...dt, [key]: dt[key].filter(t => t.id !== id)}));
  const updTeam = (key, id, f, v) => setDivTeams(dt => ({
    ...dt,
    [key]: dt[key].map(t => t.id === id ? {...t, [f]: v} : t)
  }));

  const totalTeams = selDivs.reduce((s, sd) => s + (divTeams[`${sd.gradeId}-${sd.gender}`] || []).filter(t => t.name.trim()).length, 0);

  const makeDivisions = () => {
    let tid = Date.now();
    return selDivs.map((sd, i) => {
      const key = `${sd.gradeId}-${sd.gender}`;
      const existingDiv = isEdit ? tournamentToEdit.divisions.find(d => d.gradeId === sd.gradeId && d.gender === sd.gender) : null;
      return {
        id: existingDiv ? existingDiv.id : `div-${tid}-${i}`,
        gradeId: sd.gradeId,
        gender: sd.gender,
        teams: (divTeams[key] || []).filter(t => t.name.trim())
          .map(t => ({...t, wins:0, losses:0, pf:0, pa:0}))
      };
    }).filter(d => d.teams.length >= 2);
  };

  const handleSave = () => {
    const newDivs = makeDivisions();

    if (isEdit) {
      const oldT = tournamentToEdit;
      const existingKeys = new Set(oldT.divisions.map(d => `${d.gradeId}-${d.gender}`));

      const updatedOldDivs = oldT.divisions.map(oldD => {
        const key = `${oldD.gradeId}-${oldD.gender}`;
        const matchingNew = newDivs.find(nd => `${nd.gradeId}-${nd.gender}` === key);
        return matchingNew ? {...oldD, teams: matchingNew.teams} : oldD;
      });

      const addedDivs = newDivs.filter(d => !existingKeys.has(`${d.gradeId}-${d.gender}`));
      const finalDivs = [...updatedOldDivs, ...addedDivs];

      const newGamesForAdded = genMatchups(addedDivs);

      const updatedTournament = {
        ...oldT,
        name: form.name,
        startDate: form.startDate,
        numDays: parseInt(form.numDays),
        startTime: form.startTime,
        gameDuration: parseInt(form.gameDuration),
        restGap: parseInt(form.restGap),
        location: form.location,
        divisions: finalDivs,
        games: [...oldT.games, ...newGamesForAdded]
      };

      onSave(updatedTournament);
    } else {
      const games = genMatchups(newDivs);
      const base = {
        id: Date.now(),
        name: form.name,
        startDate: form.startDate,
        numDays: parseInt(form.numDays),
        startTime: form.startTime,
        gameDuration: parseInt(form.gameDuration),
        restGap: parseInt(form.restGap),
        location: form.location,
        status: "upcoming",
        divisions: newDivs,
        games: []
      };
      onSave(base, games); // create flow → open builder
    }
  };

  // ... rest of the modal JSX (steps 1,2,3) is identical to what I sent before, with the pool default fix already applied ...

  // (The full modal JSX is the same as in my previous message – just make sure to use the updated toggleDiv/addTeam logic above)
}

// ─── ADMIN STANDINGS (UPDATED) ───────────────────────────────────────────────
function AdminStandings({tournament}) {
  const [aDiv, setADiv] = useState(tournament.divisions[0]?.id);
  const div = tournament.divisions.find(d => d.id === aDiv);

  return (
    <div>
      {/* Division tabs ... same */}
      {div && <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px,1fr))", gap:16}}>
        {[...new Set(div.teams.map(t=>t.pool))].sort().map(pool => (
          <Card key={pool}>
            <div style={{color:C.gold, fontWeight:800, fontSize:13, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12}}>
              Pool {pool}
            </div>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
              <thead>
                <tr style={{color:C.gray}}>
                  {["#","Team","W","L","PF","PA","Diff"].map(h => (
                    <th key={h} style={{textAlign: h==="Team" ? "left" : "center", paddingBottom:8, fontWeight:700, fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poolSort(div.teams, pool).map((t, i) => {
                  const diff = t.pf - t.pa;
                  return (
                    <tr key={t.id} style={{borderTop: `1px solid ${C.grayL}`}}>
                      <td style={{padding:"9px 6px 9px 0", fontWeight:800, color: i===0 ? C.gold : i===1 ? C.light : C.gray}}>
                        {i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : i+1}
                      </td>
                      <td style={{padding:"9px 8px", color:C.white, fontWeight:600}}>{t.name}</td>
                      <td style={{textAlign:"center", color:C.green, fontWeight:800}}>{t.wins}</td>
                      <td style={{textAlign:"center", color:C.red, fontWeight:800}}>{t.losses}</td>
                      <td style={{textAlign:"center", color:C.white, fontWeight:700}}>{t.pf}</td>
                      <td style={{textAlign:"center", color:C.white, fontWeight:700}}>{t.pa}</td>
                      <td style={{textAlign:"center", color:diff >= 0 ? C.green : C.red, fontWeight:700}}>
                        {diff >= 0 ? "+" : ""}{diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))}
      </div>}
    </div>
  );
}

// ─── ADMIN COMPONENT (with Edit, Delete, Clickable Logo) ─────────────────────
function Admin({data, onScore, onUpdateGames, onAdd, onUpdateTournament, onDelete, logoUrl}) {
  const [aTId, setATId] = useState(data.tournaments[0]?.id);
  const [tab, setTab] = useState("schedule");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const t = data.tournaments.find(x => x.id === aTId) || data.tournaments[0];

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif", minHeight:"100vh", background:`linear-gradient(160deg,${C.navy},${C.navyMid})`}}>
      {/* Top Bar with Clickable Logo */}
      <div style={{background:C.navyMid, borderBottom:`1px solid ${C.grayL}`, padding:"0 22px", position:"sticky", top:0, zIndex:100}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", height:58, maxWidth:1200, margin:"0 auto"}}>
          <div 
            onClick={() => window.location.reload()} // or set a state to exit admin to public
            style={{cursor:"pointer"}}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Shoebox Sports" style={{height:34, objectFit:"contain"}} />
            ) : (
              <Logo sz={34} txt />
            )}
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <Badge c={C.green}>● Admin</Badge>
            <Btn v="org" onClick={() => setShowCreate(true)} sx={{padding:"8px 16px", fontSize:12}}>+ New Tournament</Btn>
          </div>
        </div>
      </div>

      {/* Tournament Selector with Delete */}
      {data.tournaments.length > 1 && (
        <div style={{background:C.navyLight, borderBottom:`1px solid ${C.grayL}`, padding:"0 22px", overflowX:"auto"}}>
          <div style={{display:"flex", gap:4, maxWidth:1200, margin:"0 auto", paddingTop:8}}>
            {data.tournaments.map(x => (
              <div key={x.id} style={{display:"flex", alignItems:"center", gap:4}}>
                <button 
                  onClick={() => {setATId(x.id); setTab("schedule");}}
                  style={{/* your original style */}}>
                  {x.name}
                </button>
                <button 
                  onClick={() => { if (confirm("Delete this tournament permanently?")) onDelete(x.id); }}
                  style={{background:"transparent", border:"none", color:C.red, fontSize:18, cursor:"pointer"}}>
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tournament Header with Edit Button */}
      {t && (
        <div style={{/* your original header */}}>
          {/* ... existing header content ... */}
          <div style={{display:"flex", gap:8}}>
            <Btn v="teal" onClick={() => setShowEdit(t)} sx={{padding:"8px 16px", fontSize:12}}>✏️ Edit Tournament</Btn>
            <Badge c={t.status==="active" ? C.green : t.status==="upcoming" ? C.gold : C.gray}>{t.status}</Badge>
          </div>
        </div>
      )}

      {/* Tabs and Content */}
      <div style={{padding:22, maxWidth:1200, margin:"0 auto"}}>
        {tab === "standings" ? <AdminStandings tournament={t} /> : /* other tabs as before */}
      </div>

      {/* Modals */}
      {showCreate && <TournamentModal onSave={(base, games) => { onAdd({...base, games: games || []}); setShowCreate(false); }} onClose={() => setShowCreate(false)} />}
      {showEdit && <TournamentModal tournamentToEdit={showEdit} onSave={onUpdateTournament} onClose={() => setShowEdit(null)} />}
    </div>
  );
}

// The rest of your App (PublicHome, PublicTournament with updated standings, ScheduleBuilder, etc.) remains the same as your original, except:
// - Public standings now uses the same full table logic as AdminStandings (W, L, PF, PA, Diff)
// - Logo is consistent because it's passed down properly

export default function App() {
  // ... your state and useEffect ...

  const onUpdateTournament = updated => {
    updateTournamentInDB(updated);
    setData(d => ({...d, tournaments: d.tournaments.map(t => t.id === updated.id ? updated : t)}));
  };

  const onDelete = id => {
    deleteTournamentFromDB(id);
    setData(d => ({...d, tournaments: d.tournaments.filter(t => t.id !== id)}));
    if (aTId === id) setATId(data.tournaments[0]?.id); // fallback
  };

  // ... rest of App logic with the new handlers passed to Admin ...
}
