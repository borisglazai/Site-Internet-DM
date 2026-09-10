import { requireAdminApi } from "../../../../lib/admin-auth";
import { cleanText } from "../../../../lib/cms-db";
import { discardVisualDraft, publishVisualHome, publishVisualProject, publishVisualSettingsPage, restoreVisualPage, saveVisualDraft } from "../../../../lib/visual-editor";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const user=await requireAdminApi(),payload=await request.json() as any,pageKey=cleanText(payload.pageKey,80),action=cleanText(payload.action,30),content=payload.content||{};
    if(!pageKey)return Response.json({error:"Page invalide."},{status:400});
    if(action==="save"){await saveVisualDraft(pageKey,content,user.email);return Response.json({ok:true,state:"draft"})}
    if(action==="discard"){await discardVisualDraft(pageKey,user.email);return Response.json({ok:true,state:"published"})}
    if(action==="publish"){if(pageKey==="home")await publishVisualHome(content,user.email);else if(pageKey.startsWith("project_"))await publishVisualProject(content,user.email);else if(["work","services","about","contact"].includes(pageKey))await publishVisualSettingsPage(pageKey,content,user.email);else return Response.json({error:"Page non prise en charge."},{status:400});return Response.json({ok:true,state:"published"})}
    if(action==="restore"){const restored=await restoreVisualPage(pageKey,user.email);return Response.json({ok:true,state:"restored",content:restored})}
    return Response.json({error:"Action inconnue."},{status:400});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Erreur serveur"},{status:500})}
}
