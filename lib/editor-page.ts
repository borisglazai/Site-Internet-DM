import { db } from "./cms-db";
import { getEditorState } from "./editor-session";
import { visualContent } from "./visual-editor";

export async function editorPage<T extends Record<string,any>>(pageKey:string,published:T,previewRequested=false){
  const state=await getEditorState(previewRequested),content=await visualContent(pageKey,published,state.edit||state.preview);
  let media:any[]=[];
  if(state.user&&(state.edit||state.preview)){const result=await db().prepare("SELECT * FROM media WHERE deleted_at IS NULL AND visible=1 ORDER BY updated_at DESC LIMIT 500").all();media=result.results||[]}
  return {...state,content,media};
}
