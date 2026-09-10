import { setting } from "../../../../lib/public-cms";
export const dynamic="force-dynamic";
export async function GET(){const general=await setting("general",{}),seo=await setting("seo",{});return Response.json({general,seo},{headers:{"cache-control":"public, max-age=60, stale-while-revalidate=300"}})}
