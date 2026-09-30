# Paiements réels — checklist

## État actuel (2026-10-01)
- Site : https://barbarella.netlify.app ✅
- pk_live_ : intégrée côté site ✅
- sk_live_ : **MANQUANTE** (Netlify a encore sk_test_) ❌
- Webhook : version Test uniquement
- Compte Stripe connecté à Grok : Test seulement

## Pour encaisser demain (ordre strict)

### 1. Stripe Production
1. dashboard.stripe.com → mode **Production**
2. Compte activé (identité + IBAN validés)
3. Copier **sk_live_…** (même compte que pk_live_ …UJcjq4Tz9iBeoh…)

### 2. Envoyer à Grok / coller ici
```
sk_live_...
```

### 3. Actions automatiques (Grok)
- Remplacer STRIPE_SECRET_KEY sur Netlify
- Créer webhook Live → barbarella.netlify.app/.netlify/functions/stripe-webhook
- Mettre STRIPE_WEBHOOK_SECRET (whsec Live)
- Redeploy

### 4. Test réel
- https://barbarella.netlify.app → Réserver → Carte
- Petite somme (ex. 4,99 € épilation)
- Vraie carte → apparaît dans Stripe Production → Paiements

## Réseaux déjà en place
- WhatsApp communauté (3 liens)
- Instagram : https://www.instagram.com/glora_institut

## Accès Espace Pro
- admin / (changer le mot de passe jour 1)

## Ne pas mélanger
- pk_live + sk_test = erreur Stripe
- pk_test + sk_live = erreur Stripe
- Toujours la paire du même compte
