import Image from "next/image";
import Link from "next/link";
import { chatGPTSignInPath, chatGPTSignOutPath } from "../chatgpt-auth";
import { getAuthorizedAdmin, getCurrentUser, isCloudflareAccessConfigured, cloudflareAccessLogoutUrl } from "../../lib/admin-auth";
import { AdminApp } from "./admin-app";
import "./admin.css";
export const dynamic="force-dynamic";
export const metadata={title:"Administration | Divine Motion",robots:{index:false,follow:false}};
export default async function AdminPage(){
  // getCurrentUser() reconnaît SIWC (ChatGPT Sites) et Cloudflare Access,
  // selon lequel est configuré sur cet environnement (voir lib/admin-auth.ts
  // et AUTH_MIGRATION_PLAN.md). Sur le Worker Sites actuel, sans config
  // Access, ce comportement reste identique à l'ancien getChatGPTUser().
  const user=await getCurrentUser();
  // Sur un environnement où Cloudflare Access est configuré, cette route est
  // déjà protégée au niveau de l'edge : atteindre ce point sans identité
  // résolue signifie que le JWT Access est absent/invalide côté serveur
  // (jamais qu'il faut se connecter avec ChatGPT, qui n'existe pas hors
  // Sites — voir STAGING_TEST_REPORT.md). On n'affiche donc jamais l'écran
  // SIWC dans ce cas.
  const accessConfigured=isCloudflareAccessConfigured();
  if(!user){
    if(accessConfigured)return <main className="dm-admin-login"><div className="dm-login-card"><Image src="/assets/divine-motion-header.png" alt="Divine Motion" width={603} height={311}/><p className="dm-kicker">Espace administrateur</p><h1>Session Cloudflare Access requise.</h1><p>Votre session Cloudflare Access est absente ou n’a pas pu être vérifiée. Rechargez cette page pour vous authentifier à nouveau.</p><a className="dm-primary" href="/admin">Réessayer</a><Link className="dm-back" href="/">← Retour au site public</Link></div></main>;
    return <main className="dm-admin-login"><div className="dm-login-card"><Image src="/assets/divine-motion-header.png" alt="Divine Motion" width={603} height={311}/><p className="dm-kicker">Espace administrateur</p><h1>Gérez votre univers,<br/>sans toucher au design.</h1><p>Connectez-vous avec votre compte ChatGPT autorisé. Votre session, votre mot de passe et sa récupération sont sécurisés par ChatGPT.</p><a className="dm-primary" href={chatGPTSignInPath("/admin")} target="_top">Se connecter avec ChatGPT</a><span>Mot de passe oublié ? Utilisez la récupération proposée sur l’écran de connexion ChatGPT.</span><a className="dm-back" href="/">← Retour au site public</a></div></main>;
  }
  const admin=await getAuthorizedAdmin();
  if(!admin){
    const changeAccountHref=accessConfigured?(cloudflareAccessLogoutUrl()??"/"):chatGPTSignOutPath("/admin");
    return <main className="dm-admin-login"><div className="dm-login-card"><p className="dm-kicker">Accès refusé</p><h1>Ce compte n’est pas autorisé.</h1><p>Vous êtes connecté avec <strong>{user.email}</strong>. Demandez au propriétaire Divine Motion d’ajouter ce courriel à la liste des administrateurs.</p><a className="dm-primary" href={changeAccountHref} target={accessConfigured?undefined:"_top"}>{accessConfigured?"Se déconnecter":"Changer de compte"}</a><a className="dm-back" href="/">← Retour au site public</a></div></main>;
  }
  return <AdminApp user={{name:admin.displayName,email:admin.email}} signOutPath={chatGPTSignOutPath("/admin")}/>;
}
