# Sécurité de l’Espace Pro
Les anciens mots de passe publics sont retirés. L’administrateur se connecte avec `admin` et la valeur définie dans `BARBARELLA_ADMIN_PASSWORD` sur Netlify. La rotation de ce mot de passe invalide ses anciennes sessions. Le mot de passe administrateur ne se modifie pas dans le formulaire des autres utilisateurs.

Sessions : cookie Secure, HttpOnly, SameSite Strict, durée de huit heures et révocation serveur à la déconnexion. Rôles vérifiés côté serveur pour chaque opération. Les collaborateurs sont stockés avec un dérivé scrypt ; leur mot de passe n’est pas renvoyé au navigateur.

Données privées : AES-256-GCM avec clé dérivée de `BARBARELLA_SESSION_SECRET`. Garder ce secret et les données sauvegardés dans un espace sécurisé. Sa rotation nécessite une migration des données, pas un remplacement aveugle.

Les clés Stripe et xAI restent uniquement dans les variables Netlify. Ne pas les envoyer dans un chat, les déposer dans GitHub ni les saisir dans l’interface publique. Les formulaires de clés SMS sont désactivés ; l’envoi SMS nécessite une intégration serveur séparée.

Aucune collecte de numéro de carte, CVC ou expiration sur le site. Stripe héberge la saisie. Le serveur impose le montant et l’URL de retour, vérifie la session et refuse les faux retours `?paid=1`.

Limitation des requêtes par IP, contrôle d’origine et validation des entrées. Les sauvegardes partagées utilisent des ETags et refusent les versions périmées. Un CSP compatible avec les gestionnaires inline actuels est configuré ; la suppression totale des scripts inline pourra renforcer ce dispositif ultérieurement.

Les anciennes données locales ne sont pas supprimées globalement. Elles ne sont pas importées automatiquement dans la nouvelle gestion, pour éviter d’y intégrer des données de démonstration ou des mots de passe exposés. Avant usage réel, conserver puis examiner les données d’un ancien navigateur si elles doivent être migrées.
