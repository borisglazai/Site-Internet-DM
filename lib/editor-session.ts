import { cookies } from "next/headers";
import { getAuthorizedAdmin } from "./admin-auth";

export const EDITOR_COOKIE="dm_visual_editor";

export async function getEditorState(preview=false){
  const user=await getAuthorizedAdmin();
  if(!user)return {user:null,edit:false,preview:false};
  const store=await cookies(),active=store.get(EDITOR_COOKIE)?.value==="active";
  return {user,edit:active&&!preview,preview:active&&preview};
}
