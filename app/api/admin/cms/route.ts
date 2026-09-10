import { audit, bucket, cleanInt, cleanText, db, parseJson, safeJson, slugify } from "../../../../lib/cms-db";
import { requireAdminApi } from "../../../../lib/admin-auth";
export const dynamic="force-dynamic";
const allowedTables:Record<string,string>={projects:"projects",media:"media",services:"services",team:"team_members"};

export async function GET(request:Request){
  try{
    await requireAdminApi();
    const url=new URL(request.url),resource=url.searchParams.get("resource")||"dashboard",q=cleanText(url.searchParams.get("q"),120);
    if(resource==="dashboard"){
      const [published,drafts,inquiries,newMessages,recent,mediaUsage,lastProjects,lastInquiries,lastMedia]=await Promise.all([
        db().prepare("SELECT COUNT(*) total FROM projects WHERE status='published' AND deleted_at IS NULL").first(),
        db().prepare("SELECT COUNT(*) total FROM projects WHERE status='draft' AND deleted_at IS NULL").first(),
        db().prepare("SELECT COUNT(*) total FROM inquiries WHERE archived_at IS NULL").first(),
        db().prepare("SELECT COUNT(*) total FROM inquiries WHERE status='new' AND archived_at IS NULL").first(),
        db().prepare("SELECT entity_type,entity_id,action,summary,user_email,created_at FROM audit_log ORDER BY id DESC LIMIT 6").all(),
        db().prepare("SELECT COALESCE(SUM(size_bytes),0) total FROM media WHERE deleted_at IS NULL").first(),
        db().prepare("SELECT id,title,status,updated_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 4").all(),
        db().prepare("SELECT id,name,event_type,status,created_at FROM inquiries WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 4").all(),
        db().prepare("SELECT id,name,type,size_bytes,created_at FROM media WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5").all()
      ]);
      return Response.json({published:Number(published?.total||0),drafts:Number(drafts?.total||0),inquiries:Number(inquiries?.total||0),newMessages:Number(newMessages?.total||0),recent:recent.results,mediaBytes:Number(mediaUsage?.total||0),lastProjects:lastProjects.results,lastInquiries:lastInquiries.results,lastMedia:lastMedia.results});
    }
    if(resource==="settings"){
      const rows=await db().prepare("SELECT key,value,updated_at FROM cms_settings ORDER BY key").all();
      return Response.json({items:rows.results.map((row:any)=>({...row,value:parseJson(row.value,{})}))});
    }
    if(resource==="projects"){
      const sql=q?"SELECT * FROM projects WHERE deleted_at IS NULL AND (title LIKE ? OR people_names LIKE ? OR category LIKE ?) ORDER BY display_order,updated_at DESC":"SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY display_order,updated_at DESC";
      const result=q?await db().prepare(sql).bind(...Array(3).fill("%"+q+"%")).all():await db().prepare(sql).all();
      const items=await Promise.all(result.results.map(async(row:any)=>{const sections=await db().prepare("SELECT * FROM project_sections WHERE project_id=? ORDER BY display_order").bind(row.id).all();return {...row,gallery:parseJson(row.gallery_json,[]),videos:parseJson(row.videos_json,[]),tags:parseJson(row.tags_json,[]),sections:sections.results.map((section:any)=>({...section,media:parseJson(section.media_json,[]),videos:parseJson(section.videos_json,[])}))}}));
      return Response.json({items});
    }
    if(resource==="inquiries"){
      const filter=cleanText(url.searchParams.get("status"),40);
      let statement="SELECT * FROM inquiries WHERE archived_at IS NULL",args:any[]=[];
      if(filter){statement+=" AND status=?";args.push(filter)}
      if(q){statement+=" AND (name LIKE ? OR email LIKE ? OR event_type LIKE ?)";args.push(...Array(3).fill("%"+q+"%"))}
      statement+=" ORDER BY created_at DESC";
      const result=await db().prepare(statement).bind(...args).all();
      return Response.json({items:result.results.map((row:any)=>({...row,extra:parseJson(row.extra_json,{})}))});
    }
    if(resource==="audit"){const result=await db().prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 80").all();return Response.json({items:result.results.map((row:any)=>({...row,snapshot:parseJson(row.snapshot_json,null)}))})}
    if(resource==="trash"){const [projects,media,services,team]=await Promise.all([db().prepare("SELECT id,title name,'projects' entity,deleted_at FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(),db().prepare("SELECT id,name,'media' entity,deleted_at FROM media WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(),db().prepare("SELECT id,name,'services' entity,deleted_at FROM services WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(),db().prepare("SELECT id,first_name||' '||last_name name,'team' entity,deleted_at FROM team_members WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all()]);return Response.json({items:[...projects.results,...media.results,...services.results,...team.results]})}
    if(!allowedTables[resource])return Response.json({error:"Ressource inconnue"},{status:404});
    const definitions:Record<string,{table:string,search:string,order:string}>={
      media:{table:"media",search:"name LIKE ? OR alt_text LIKE ? OR type LIKE ?",order:"updated_at DESC"},
      services:{table:"services",search:"name LIKE ? OR category LIKE ? OR description LIKE ?",order:"display_order,updated_at DESC"},
      team:{table:"team_members",search:"first_name LIKE ? OR last_name LIKE ? OR role LIKE ?",order:"display_order,updated_at DESC"}
    };
    const definition=definitions[resource];
    const sql=q?"SELECT * FROM "+definition.table+" WHERE deleted_at IS NULL AND ("+definition.search+") ORDER BY "+definition.order:"SELECT * FROM "+definition.table+" WHERE deleted_at IS NULL ORDER BY "+definition.order;
    const result=q?await db().prepare(sql).bind(...Array(3).fill("%"+q+"%")).all():await db().prepare(sql).all();
    if(resource==="media"){const type=cleanText(url.searchParams.get("type"),30),rows=(result.results as any[]).filter(row=>!type||row.category===type||(type==="photo"&&row.type==="image")||(type==="video"&&(row.type==="video"||row.type==="external_video")));const [projectRows,sectionRows,settingRows,serviceRows,teamRows]=await Promise.all([db().prepare("SELECT id,title,cover_media_id,gallery_json,videos_json FROM projects WHERE deleted_at IS NULL").all(),db().prepare("SELECT project_id,title,section_key,media_json,videos_json FROM project_sections").all(),db().prepare("SELECT key,value FROM cms_settings").all(),db().prepare("SELECT id,name,image_media_id FROM services WHERE deleted_at IS NULL").all(),db().prepare("SELECT id,first_name,last_name,photo_media_id FROM team_members WHERE deleted_at IS NULL").all()]);const items=rows.map(row=>{const id=Number(row.id),usages:string[]=[];for(const project of projectRows.results as any[]){if(Number(project.cover_media_id)===id)usages.push(`Projet > ${project.title} > Couverture`);if(JSON.stringify(parseJson(project.gallery_json,[])).includes(`\"${id}\"`)||parseJson<any[]>(project.gallery_json,[]).some(value=>Number(typeof value==="object"?value.id:value)===id))usages.push(`Projet > ${project.title} > Galerie`);if(parseJson<any[]>(project.videos_json,[]).some(value=>Number(value.mediaId||value.thumbnailMediaId)===id))usages.push(`Projet > ${project.title} > Vidéo`)}for(const section of sectionRows.results as any[]){if(parseJson<any[]>(section.media_json,[]).some(value=>Number(typeof value==="object"?value.id:value)===id))usages.push(`Projet > ${section.title||section.section_key}`)}for(const setting of settingRows.results as any[]){if(JSON.stringify(parseJson(setting.value,{})).match(new RegExp(`(^|[^0-9])${id}([^0-9]|$)`)))usages.push(`${setting.key} > Contenu`)}for(const service of serviceRows.results as any[])if(Number(service.image_media_id)===id)usages.push(`Services > ${service.name}`);for(const member of teamRows.results as any[])if(Number(member.photo_media_id)===id)usages.push(`Équipe > ${member.first_name} ${member.last_name}`);return {...row,usages:[...new Set(usages)]}});return Response.json({items})}
    return Response.json({items:result.results});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Erreur serveur"},{status:500})}
}

export async function POST(request:Request){
  try{
    const user=await requireAdminApi();const payload=await request.json() as any;const resource=cleanText(payload.resource,40);
    if(resource==="settings"){
      const entries=Object.entries(payload.values||{});
      const statements=entries.map(([key,value])=>db().prepare("INSERT INTO cms_settings (key,value,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(cleanText(key,80),JSON.stringify(value),user.email));
      if(statements.length)await db().batch(statements);await audit("settings","global","update","Paramètres mis à jour",user.email,payload.values);return Response.json({ok:true});
    }
    if(resource==="project"){
      const item=payload.item||{},id=cleanInt(item.id),title=cleanText(item.title,180),slug=slugify(cleanText(item.slug,100)||title);
      if(!title)return Response.json({error:"Le titre est obligatoire"},{status:400});
      const values=[title,cleanText(item.peopleNames,220),slug,cleanText(item.category,80)||"Autre",cleanText(item.projectDate,30)||null,cleanText(item.location,180),cleanText(item.excerpt,500),cleanText(item.description,12000),item.coverMediaId?cleanInt(item.coverMediaId):null,safeJson(item.gallery),safeJson(item.videos),safeJson(item.tags),cleanText(item.seoTitle,180),cleanText(item.seoDescription,320),item.seoImageMediaId?cleanInt(item.seoImageMediaId):null,["draft","published","archived"].includes(item.status)?item.status:"draft",item.visible===false?0:1,item.featured?1:0,cleanInt(item.displayOrder),user.email];
      let projectId=id;
      if(id){await db().prepare("UPDATE projects SET title=?,people_names=?,slug=?,category=?,project_date=?,location=?,excerpt=?,description=?,cover_media_id=?,gallery_json=?,videos_json=?,tags_json=?,seo_title=?,seo_description=?,seo_image_media_id=?,status=?,visible=?,featured=?,display_order=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(...values,id).run()}
      else{const result=await db().prepare("INSERT INTO projects (title,people_names,slug,category,project_date,location,excerpt,description,cover_media_id,gallery_json,videos_json,tags_json,seo_title,seo_description,seo_image_media_id,status,visible,featured,display_order,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...values).run();projectId=Number(result.meta.last_row_id)}
      if(item.featured)await db().prepare("UPDATE projects SET featured=0 WHERE id<>?").bind(projectId).run();
      if(Array.isArray(item.sections)){const statements=[db().prepare("DELETE FROM project_sections WHERE project_id=?").bind(projectId),...item.sections.map((section:any,index:number)=>db().prepare("INSERT INTO project_sections (project_id,section_key,title,intro,media_json,videos_json,enabled,display_order) VALUES (?,?,?,?,?,?,?,?)").bind(projectId,cleanText(section.sectionKey,60),cleanText(section.title,180),cleanText(section.intro,800),safeJson(section.media),safeJson(section.videos),section.enabled===false?0:1,index))];await db().batch(statements)}
      await audit("project",String(projectId),id?"update":"create",title,user.email,item);return Response.json({ok:true,id:projectId,slug});
    }
    if(resource==="service"){
      const item=payload.item||{},id=cleanInt(item.id),values=[cleanText(item.name,150),cleanText(item.category,80),cleanText(item.description,3000),item.imageMediaId?cleanInt(item.imageMediaId):null,cleanText(item.cta,120)||"Découvrir",cleanText(item.ctaUrl,300)||"/contact",cleanText(item.price,80)||null,cleanText(item.pricePrefix,80)||null,item.visible===false?0:1,cleanInt(item.displayOrder)];
      if(!values[0])return Response.json({error:"Le nom est obligatoire"},{status:400});
      if(id)await db().prepare("UPDATE services SET name=?,category=?,description=?,image_media_id=?,cta=?,cta_url=?,price=?,price_prefix=?,visible=?,display_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(...values,id).run();
      else{const result=await db().prepare("INSERT INTO services (name,category,description,image_media_id,cta,cta_url,price,price_prefix,visible,display_order) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(...values).run();item.id=Number(result.meta.last_row_id)}
      await audit("service",String(id||item.id),id?"update":"create",String(values[0]),user.email,item);return Response.json({ok:true,id:id||item.id});
    }
    if(resource==="team"){
      const item=payload.item||{},id=cleanInt(item.id),values=[cleanText(item.firstName,100),cleanText(item.lastName,100),cleanText(item.role,140),cleanText(item.bio,2000),item.photoMediaId?cleanInt(item.photoMediaId):null,item.visible===false?0:1,cleanInt(item.displayOrder)];
      if(!values[0]||!values[2])return Response.json({error:"Prénom et rôle obligatoires"},{status:400});
      if(id)await db().prepare("UPDATE team_members SET first_name=?,last_name=?,role=?,bio=?,photo_media_id=?,visible=?,display_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(...values,id).run();
      else{const result=await db().prepare("INSERT INTO team_members (first_name,last_name,role,bio,photo_media_id,visible,display_order) VALUES (?,?,?,?,?,?,?)").bind(...values).run();item.id=Number(result.meta.last_row_id)}
      await audit("team",String(id||item.id),id?"update":"create",String(values[0]),user.email,item);return Response.json({ok:true,id:id||item.id});
    }
    if(resource==="inquiry"){
      const id=cleanInt(payload.id),status=cleanText(payload.status,40),followUpAt=cleanText(payload.followUpAt,40)||null;
      if(!id)return Response.json({error:"Demande invalide"},{status:400});
      await db().prepare("UPDATE inquiries SET status=?,priority=?,follow_up_at=?,handled=?,archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status||"new",payload.priority?1:0,followUpAt,payload.handled?1:0,status==="archived"?new Date().toISOString():null,id).run();
      if(cleanText(payload.note,3000))await db().prepare("INSERT INTO inquiry_notes (inquiry_id,note,author_email) VALUES (?,?,?)").bind(id,cleanText(payload.note,3000),user.email).run();
      await audit("inquiry",String(id),"update","Statut: "+status,user.email);return Response.json({ok:true});
    }
    if(resource==="trash"){
      const entity=cleanText(payload.entity,30),table=allowedTables[entity],id=cleanInt(payload.id);if(!table||!id)return Response.json({error:"Élément invalide"},{status:400});
      if(payload.permanent){if(entity==="media"){const row=await db().prepare("SELECT original_key,thumbnail_key,mobile_key,desktop_key FROM media WHERE id=? AND deleted_at IS NOT NULL").bind(id).first<Record<string,string|null>>();if(!row)return Response.json({error:"Le média doit d’abord être placé dans la corbeille."},{status:409});for(const key of [row.original_key,row.thumbnail_key,row.mobile_key,row.desktop_key])if(key)await bucket().delete(key)}await db().prepare("DELETE FROM "+table+" WHERE id=? AND deleted_at IS NOT NULL").bind(id).run();await audit(entity,String(id),"delete","Suppression définitive",user.email);return Response.json({ok:true})}
      const restore=Boolean(payload.restore);await db().prepare("UPDATE "+table+" SET deleted_at="+(restore?"NULL":"CURRENT_TIMESTAMP")+",updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await audit(entity,String(id),restore?"restore":"trash",restore?"Élément restauré":"Élément placé dans la corbeille",user.email);return Response.json({ok:true});
    }
    return Response.json({error:"Action inconnue"},{status:400});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Erreur serveur"},{status:500})}
}
