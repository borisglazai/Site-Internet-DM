import { env } from "cloudflare:workers";
type RuntimeEnv={DB:D1Database;BUCKET:R2Bucket};
export function runtime(){return env as unknown as RuntimeEnv}
export function db(){const value=runtime().DB;if(!value)throw new Error("Base de données indisponible");return value}
export function bucket(){const value=runtime().BUCKET;if(!value)throw new Error("Stockage média indisponible");return value}
export function cleanText(value:unknown,max=5000){return typeof value==="string"?value.trim().slice(0,max):""}
export function cleanInt(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?Math.trunc(parsed):fallback}
export function slugify(value:string){return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90)||"projet"}
export function safeJson(value:unknown,fallback="[]"){try{return JSON.stringify(value??JSON.parse(fallback))}catch{return fallback}}
export function parseJson<T>(value:unknown,fallback:T):T{if(typeof value!=="string")return fallback;try{return JSON.parse(value) as T}catch{return fallback}}
export async function audit(entityType:string,entityId:string,action:string,summary:string,userEmail:string,snapshot?:unknown){await db().prepare("INSERT INTO audit_log (entity_type,entity_id,action,summary,snapshot_json,user_email) VALUES (?,?,?,?,?,?)").bind(entityType,entityId,action,summary,snapshot?JSON.stringify(snapshot):null,userEmail).run()}
