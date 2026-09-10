import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthorizedAdmin } from "../../../../lib/admin-auth";
import { EDITOR_COOKIE } from "../../../../lib/editor-session";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const user=await getAuthorizedAdmin();
  if(!user)redirect("/admin");
  const url=new URL(request.url),action=url.searchParams.get("action"),raw=url.searchParams.get("return")||"/",returnTo=raw.startsWith("/")&&!raw.startsWith("//")?raw:"/",store=await cookies();
  if(action==="stop")store.delete(EDITOR_COOKIE);
  else store.set(EDITOR_COOKIE,"active",{httpOnly:true,sameSite:"lax",secure:true,path:"/",maxAge:60*60*8});
  if(url.searchParams.get("json")==="1")return Response.json({ok:true,active:action!=="stop"});
  redirect(returnTo);
}
