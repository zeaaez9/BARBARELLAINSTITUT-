# Paiements Stripe
Configurer `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` dans Netlify, jamais dans une conversation.

1. Utiliser d’abord le mode Test.
2. Configurer le webhook : `https://barbarella.netlify.app/.netlify/functions/stripe-webhook`.
3. Événements : `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
4. Après déploiement, vérifier une demande de test : redirection Stripe, retour vérifié, demande visible dans l’agenda.
5. Passer au mode Live seulement lorsque le compte Stripe est activé, avec la clé serveur et le secret webhook Live correspondants, puis redéployer.

La page reçoit une URL Stripe Checkout : aucune clé publiable Stripe n’est nécessaire pour cette redirection. Les anciennes options de clé publiable et proxy dans le formulaire sont conservées visuellement mais n’autorisent pas le paiement : la configuration du serveur fait foi.

Montants serveur : massage 29,99 €, manucure 9,99 €, épilation 4,99 € ou 29,99 € pour intégrale. Les produits sont vendus sur place.

Un acompte payé n’est pas une garantie de disponibilité : le créneau demandé doit être validé par l’institut. Aucun SMS ni email automatique n’est annoncé comme envoyé. En cas d’erreur de stockage, le webhook renvoie 500 pour demander une nouvelle livraison par Stripe.

Aucun paiement réel n’a été exécuté pendant l’audit. L’état Test/Live du compte Netlify n’a pas été vérifié.
