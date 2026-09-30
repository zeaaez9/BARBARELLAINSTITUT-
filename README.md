# Institut Barbarella — Site + Espace Pro

Site public + dashboard de gestion.

## URL live
https://barbarella.netlify.app

## Accès Espace Pro
- Login : `admin`
- Mot de passe : **changez-le jour 1** (Admin → Accès)

## Stack
- Frontend : `index.html` (single page)
- Netlify Functions : Stripe Checkout, webhook, agents Grok
- Stripe : mode Test configuré
- Réseaux : WhatsApp Communauté ×3 + Instagram @glora_institut

## Variables Netlify
- `STRIPE_SECRET_KEY` (sk_test_… / sk_live_…)
- `STRIPE_WEBHOOK_SECRET` (whsec_…)
- `XAI_API_KEY` (optionnel — chat Grok)

## Fonctions
- `/.netlify/functions/create-checkout`
- `/.netlify/functions/stripe-webhook`
- `/.netlify/functions/agent-chat`
- `/.netlify/functions/agent-run`

## Déploiement
Publish directory : `.` · Build : vide · Functions folder : `functions`
