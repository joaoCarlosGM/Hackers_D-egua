import { createClient } from "@supabase/supabase-js";

export function createPlatformIntegration(deps) {
  const url=(process.env.CTF_SUPABASE_URL||"").replace(/\/$/,"");
  const publicKey=process.env.CTF_SUPABASE_PUBLIC_KEY||"";
  const secret=process.env.CTF_SUPABASE_SECRET_KEY||"";
  const ready=Boolean(url&&publicKey&&secret);
  const anon=ready?createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
  const db=ready?createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}):null;
  const identityCache=new Map();
  const pending=[];
  let writing=false;
  const required=()=>{if(!ready)throw Error("Integração Supabase indisponível: configure CTF_SUPABASE_URL, CTF_SUPABASE_PUBLIC_KEY e CTF_SUPABASE_SECRET_KEY no executor local.");};
  const unwrap=(response,label)=>{
    if(response.error)throw Error(label+": "+response.error.message);
    return response.data;
  };
  async function staff(req){
    required();
    const jwt=String(req.headers.authorization||"").replace(/^Bearer /i,"");
    if(jwt.split(".").length!==3)throw Error("Sessão do professor ausente");
    const user=unwrap(await anon.auth.getUser(jwt),"Autenticação").user;
    if(!user)throw Error("Sessão de professor inválida");
    const authorized=unwrap(await db.from("admin_users").select("role").eq("user_id",user.id).maybeSingle(),"Permissões");
    if(!["admin","teacher"].includes(authorized?.role))throw Error("Professor não autorizado");
    return user.id;
  }
  function mirror(review){
    const original=deps.state.ctfs.find(c=>c.id===review.id);
    const shape={id:review.id,title:review.title,description:review.description,
      duration:review.duration_seconds,status:review.status,state:review.status,
      startedAt:review.started_at,deadline:review.deadline_at,pausedAt:review.paused_at,
      challenges:review.challenges,platform:true};
    if(original)Object.assign(original,shape);
    else deps.state.ctfs.push(shape);
    deps.persist();
    return shape;
  }
  async function review(id){
    required();
    return mirror(unwrap(await db.from("ctf_review_catalog").select("*").eq("id",id).single(),"Consultar revisão"));
  }
  function running(c){return c.status==="running"&&!c.pausedAt&&c.deadline&&Date.parse(c.deadline)>Date.now();}
  async function provisionRow(row,reviewInfo,teamToken){
    const s0=deps.state.sessions.find(s=>s.id===row.id);
    if(s0){
      s0.solved=row.solved_ids||[];
      s0.writeups=row.writeups||{};
      s0.platform=true;
      if(teamToken)identityCache.set(s0.id,{teamToken,verifiedAt:0});
      deps.persist();
      return s0;
    }
    const s={id:row.id,ctfId:reviewInfo.id,team:row.team_name,
      token:deps.token(),joinedAt:row.started_at,completedAt:row.completed_at,
      solved:row.solved_ids||[],writeups:row.writeups||{},events:[],platform:true,teamId:row.team_id,staffId:row.staff_id};
    await deps.createLab(s);
    deps.state.sessions.push(s);
    if(teamToken)identityCache.set(s.id,{teamToken,verifiedAt:Date.now()});
    deps.persist();
    return s;
  }
  async function sessionAccess(s){
    if(!s.platform)return true;
    const c=await review(s.ctfId);
    if(!running(c))throw Error("Revisão pausada ou encerrada");
    const cached=identityCache.get(s.id);
    if(!s.teamId){
      if(!cached?.staffJwt)throw Error("A demonstração exige novo login do professor");
      if(Date.now()-cached.verifiedAt<12000)return true;
      const staffId=await staff({headers:{authorization:"Bearer "+cached.staffJwt}});
      if(staffId!==s.staffId)throw Error("Sessão do professor inválida");
      cached.verifiedAt=Date.now();
      return true;
    }
    if(!cached?.teamToken)throw Error("Faça login novamente na dupla para renovar sua sessão");
    if(Date.now()-cached.verifiedAt<12000)return true;
    const visible=unwrap(await anon.rpc("ctf_review_visible",{p_team_token:cached.teamToken}),"Verificação da dupla");
    if(!Array.isArray(visible)||!visible.find(r=>r.id===c.id))throw Error("Acesso à revisão revogado");
    cached.verifiedAt=Date.now();return true;
  }
  async function saveProgress(s){
    if(!s.platform)return;
    unwrap(await db.from("ctf_review_sessions").update({solved_ids:s.solved,writeups:s.writeups,
      completed_at:s.completedAt||null,updated_at:new Date().toISOString()}).eq("id",s.id),"Persistência da revisão");
  }
  function enqueueEvent(s,event){
    if(!s.platform)return;
    pending.push({session_id:s.id,occurred_at:event.at,event_type:event.type,
      payload:Object.fromEntries(Object.entries(event).filter(([k])=>k!=="at"&&k!=="type"))});
    if(pending.length>6000)pending.splice(0,pending.length-6000);
  }
  async function flush(){
    if(!ready||writing||pending.length===0)return;
    writing=true;
    const batch=pending.splice(0,75);
    try{
      unwrap(await db.from("ctf_review_events").insert(batch),"Gravar auditoria");
    }catch(e){
      pending.unshift(...batch);
      console.error("Falha ao gravar auditoria no Supabase:",e.message);
    }finally{writing=false;}
  }
  setInterval(()=>void flush(),1250).unref();
  async function getReport(id){
    const a=unwrap(await db.from("ctf_review_sessions").select("*").eq("id",id).single(),"Relatório");
    const c=await review(a.review_id);
    const events=unwrap(await db.from("ctf_review_events").select("id,occurred_at,event_type,payload")
      .eq("session_id",id).order("id",{ascending:true}).limit(4000),"Eventos");
    return {session:{id:a.id,team:a.team_name,createdAt:a.started_at,completedAt:a.completed_at,
      solved:a.solved_ids,writeups:a.writeups,ctf:deps.publicCtf(c)},
      events:events.map(e=>({at:e.occurred_at,type:e.event_type,...e.payload})),
      truncated:events.length>=4000};
  }
  async function handle(req,res,pathname){
    if(!pathname.startsWith("/api/platform/"))return false;
    const send=deps.send,method=req.method;
    try{
      required();
      if(method==="GET"&&pathname==="/api/platform/health")return send(res,200,{configured:true});
      if(method==="GET"&&pathname==="/api/platform/staff/state"){
        await staff(req);
        const ctfs=unwrap(await db.from("ctf_review_catalog").select("*").order("created_at",{ascending:false}),"Catálogo");
        const sessions=unwrap(await db.from("ctf_review_sessions").select("*").order("started_at",{ascending:false}).limit(500),"Sessões");
        ctfs.forEach(mirror);
        return send(res,200,{ctfs,sessions});
      }
      if(method==="POST"&&pathname==="/api/platform/staff/create"){
        const staffId=await staff(req),b=await deps.body(req),title=deps.clean(b.title,160);
        const duration=Math.trunc(Number(b.duration_seconds)||3600);
        const classes=[...new Set(Array.isArray(b.class_ids)?b.class_ids:[])];
        if(title.length<3||duration<300||duration>7200||classes.length<1||classes.length>20||
          !classes.every(x=>/^[a-f0-9-]{36}$/.test(x)))return send(res,400,{error:"Dados de revisão inválidos"});
        const known=unwrap(await db.from("classes").select("id").in("id",classes).eq("status","active"),"Turmas");
        if(known.length!==classes.length)return send(res,400,{error:"Selecione somente turmas ativas"});
        const challenges=deps.CHALLENGES.map((x,i)=>({
          ...x,description:deps.clean(Array.isArray(b.instructions)?b.instructions[i]:x.description,800)||x.description
        }));
        const row=unwrap(await db.from("ctf_review_catalog").insert({title,
          description:deps.clean(b.description,5000),duration_seconds:duration,class_ids:classes,
          challenges,created_by:staffId}).select("*").single(),"Cadastrar revisão");
        mirror(row);return send(res,201,{review:row});
      }
      const transition=pathname.match(/^\/api\/platform\/staff\/reviews\/([a-f0-9-]+)\/(publish|start|pause|resume|extend|close)$/);
      if(method==="POST"&&transition){
        await staff(req);
        const id=transition[1],action=transition[2],b=await deps.body(req);
        const r=unwrap(await db.from("ctf_review_catalog").select("*").eq("id",id).single(),"Revisão");
        const update={updated_at:new Date().toISOString()};
        if(action==="publish"&&r.status==="draft")update.status="published";
        else if(action==="start"&&r.status==="published"){
          update.status="running";update.started_at=new Date().toISOString();
          update.deadline_at=new Date(Date.now()+r.duration_seconds*1000).toISOString();
        }
        else if(action==="pause"&&r.status==="running"){
          update.status="paused";update.paused_at=new Date().toISOString();
        }
        else if(action==="resume"&&r.status==="paused"){
          update.status="running";
          update.deadline_at=new Date(Date.parse(r.deadline_at)+Date.now()-Date.parse(r.paused_at)).toISOString();
          update.paused_at=null;
        }
        else if(action==="extend"&&["running","paused"].includes(r.status)){
          const seconds=Math.trunc(Number(b.seconds)||0);
          if(seconds<1||seconds>3600)return send(res,400,{error:"Extensão entre 1 e 3600 segundos"});
          update.deadline_at=new Date(Date.parse(r.deadline_at)+seconds*1000).toISOString();
        }
        else if(action==="close"&&["published","running","paused"].includes(r.status)){
          update.status="closed";update.paused_at=null;
        }
        else return send(res,409,{error:"Transição inválida"});
        const result=unwrap(await db.from("ctf_review_catalog").update(update).eq("id",id).eq("status",r.status).select("*").single(),"Atualizar revisão");
        mirror(result);
        const labs=deps.state.sessions.filter(s=>s.platform&&s.ctfId===id);
        if(action==="pause")await Promise.all(labs.map(s=>deps.command("docker",["pause",deps.box(s)]).catch(()=>{})));
        if(action==="resume")await Promise.all(labs.map(s=>deps.command("docker",["unpause",deps.box(s)]).catch(()=>{})));
        if(action==="close")await Promise.all(labs.map(deps.destroyLab));
        return send(res,200,{review:result});
      }
      if(method==="POST"&&pathname==="/api/platform/team/join"){
        const b=await deps.body(req),teamToken=deps.clean(b.team_token,300),reviewId=deps.clean(b.review_id,50);
        if(!/^[a-f0-9-]{36}$/.test(reviewId)||teamToken.length!==64)
          return send(res,400,{error:"Dados de acesso inválidos"});
        const info=unwrap(await anon.rpc("ctf_review_enter",
          {p_team_token:teamToken,p_review_id:reviewId}),"Autorizar dupla");
        const c=await review(reviewId);
        if(!running(c))return send(res,409,{error:"A revisão não está em andamento"});
        const row=unwrap(await db.from("ctf_review_sessions").select("*").eq("id",info.session_id).single(),"Sessão");
        const s=await provisionRow(row,c,teamToken);
        return send(res,200,{token:s.token,session:deps.sessionView(s)});
      }
      if(method==="POST"&&pathname==="/api/platform/staff/demo"){
        const userId=await staff(req),b=await deps.body(req),id=deps.clean(b.review_id,50);
        const c=await review(id);
        if(!running(c))return send(res,409,{error:"Inicie a revisão para demonstrar"});
        let row=unwrap(await db.from("ctf_review_sessions").select("*").eq("review_id",id).eq("staff_id",userId).maybeSingle(),"Sessão demonstrativa");
        if(!row)row=unwrap(await db.from("ctf_review_sessions").insert({review_id:id,
          staff_id:userId,team_name:"Professor — demonstração"}).select("*").single(),"Criar demonstração");
        const s=await provisionRow(row,c,null);
        identityCache.set(s.id,{staffJwt:String(req.headers.authorization).replace(/^Bearer /i,""),verifiedAt:0});
        return send(res,200,{token:s.token,session:deps.sessionView(s)});
      }
      if(method==="GET"&&pathname==="/api/platform/staff/reports"){
        await staff(req);
        const rows=unwrap(await db.from("ctf_review_sessions").select("id,review_id,team_name,started_at,completed_at,solved_ids,updated_at,writeups").order("started_at",{ascending:false}).limit(500),"Sessões");
        return send(res,200,{sessions:rows});
      }
      const report=pathname.match(/^\/api\/platform\/staff\/report\/([a-f0-9-]+)$/);
      if(method==="GET"&&report){await staff(req);return send(res,200,await getReport(report[1]));}
      return send(res,404,{error:"Rota integrada desconhecida"});
    }catch(e){
      console.error("CTF integração:",e.message);
      return send(res,/inválid|negad|autoriz|Sessão do professor/i.test(e.message)?403:500,{error:e.message});
    }
  }
  return {ready,handle,mirror,sessionAccess,saveProgress,enqueueEvent,flush};
}
