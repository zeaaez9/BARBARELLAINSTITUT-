# Guide opérateur — Institut Barbarella

## Chaque jour
1. Espace Pro → Dashboard : réservations du jour
2. Agenda : vérifier les créneaux
3. WhatsApp Communauté : messages clients

## Nouvelle réservation client
1. Site → Réserver → catégorie → soin
2. Paiement carte (acompte) ou sur place
3. Après Stripe : le RDV apparaît dans **Agenda**

## Acomptes
- Massages : 29,99 €
- Épilation : 4,99 € (intégrale 29,99 €)
- Manucure : 9,99 €

## Carte test Stripe
`4242 4242 4242 4242` · date future · CVC 123

## Instagram / WhatsApp
- Admin → Liens WhatsApp + Instagram
- Footer site mis à jour automatiquement

## Inventaire
- Onglet Inventaire (toutes les 2 semaines)
- Seuils d'alerte dans le Dashboard

## Passer en Live (argent réel)
1. Stripe → désactiver Test mode
2. Remplacer sk_test / pk_test par sk_live / pk_live
3. Nouveau webhook Live + whsec Live
4. Redeploy Netlify
