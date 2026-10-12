# Institut Barbarella — site et gestion
Le dépôt `BARBARELLAINSTITUT-` est la source active. `BARBARELLA` conserve l’archive historique ; la page HTML était identique dans les deux dépôts au début de l’audit.

Le design, les prestations et les profils existants sont conservés. Les modifications publiques sont enregistrées sur Netlify Blobs, avec contrôle de version pour éviter d’écraser une modification provenant d’un autre appareil. Les fiches clients, comptes, sessions et demandes sont chiffrés côté serveur.

## Installation et vérification
Node 22 ou supérieur.
```sh
npm ci
npm run check
npm test
npm run build
```
Netlify : commande de build définie dans `netlify.toml`, publication `dist`, fonctions `functions`. Le dossier public contient seulement la page et son script. Les guides et le code serveur ne sont pas publiés.

## Configuration Netlify
Saisir les valeurs uniquement dans les variables d’environnement Netlify, accessibles aux Functions :
- `BARBARELLA_ADMIN_PASSWORD` : au moins 8 caractères ; aucun mot de passe fourni dans le code.
- `BARBARELLA_SESSION_SECRET` : secret aléatoire d’au moins 32 caractères. Conserver sa valeur : elle sert aussi au chiffrement des données. La remplacer sans migration rend les anciennes données illisibles.
- `STRIPE_SECRET_KEY` : clé Test ou Live du compte de l’institut.
- `STRIPE_WEBHOOK_SECRET` : signature du webhook correspondant au même mode.
- `XAI_API_KEY` et éventuellement `GROK_MODEL` : assistant et génération de textes.
- `URL` : normalement fournie par Netlify ; `SITE_URL` est le secours hors plateforme.

Les Blobs sont provisionnés par Netlify, sans jeton personnel ajouté au code. Prévoir les limites et coûts du compte Netlify et du fournisseur IA.

## Parcours réel
La demande inclut soin, durée sélectionnée, coordonnées, date, heure et experte souhaitées. L’acompte est calculé sur le serveur. Le retour Stripe et le webhook vérifient le paiement ; ils ne confirment pas automatiquement la disponibilité du créneau. L’institut valide le créneau avec le client.

L’Espace Pro utilise une session serveur avec cookie HttpOnly. Les accès sont créés par un administrateur ; mots de passe dérivés par scrypt. Les modifications des prestations, profils, actualités, promotions, stocks et configurations d’agents sont partagées. Les demandes apparaissent dans le dashboard et l’agenda. Actualisation toutes les 60 secondes pendant l’utilisation de l’espace pro.

## Limites actuelles et déploiement
Voir `AUDIT-2026-10-11.md`. Les tests locaux utilisent un stockage et Stripe simulés ; ils ne prouvent pas la configuration du compte Netlify ni un encaissement réel. La publication et un essai complet sur Netlify restent à effectuer après connexion du compte et saisie des secrets. Aucun test avec carte bancaire réelle n’est automatisé.
