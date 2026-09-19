# Prompt à envoyer avec le frontend

Tu es un excellent designer produit et développeur frontend senior. Je te fournis le frontend actuel de **Manhwa Dub**, une application desktop locale construite avec Python, PyWebView, HTML, CSS et JavaScript.

Ta mission est de **refaire complètement l’interface pour qu’elle ressemble à une vraie application professionnelle de production audiovisuelle**, moderne, rapide, cohérente et agréable à utiliser. Ne réalise pas une simple landing page et ne produis pas une maquette statique : toutes les fonctions existantes doivent rester utilisables.

## But de l’application

Manhwa Dub transforme une vidéo de manhwa en narration française :

1. création ou ouverture d’un projet ;
2. import d’une vidéo locale ou depuis une URL ;
3. analyse, transcription et découpage en segments ;
4. réécriture du script avec ChatGPT ;
5. choix et clonage d’une voix française ;
6. génération TTS avec Qwen ou OmniVoice ;
7. contrôle de la durée de chaque narration par rapport au segment original ;
8. correction de la timeline et des dépassements ;
9. export de la vidéo finale avec plusieurs presets.

## Direction artistique

Créer une interface desktop sombre, cinématique et haut de gamme. Elle doit évoquer un studio de montage/doublage moderne, sans copier un produit existant. Utiliser une hiérarchie claire, des espacements réguliers, des cartes sobres, de beaux états interactifs et une excellente lisibilité.

Éviter l’apparence de tableau de bord générique rempli de grosses cartes inutiles. Donner la priorité au projet actif, à la timeline, au script, aux voix, à la progression et aux actions réellement nécessaires.

L’interface doit rester utilisable en 1280×720 et devenir particulièrement confortable en 1920×1080. Prévoir les états vides, chargement, erreur, succès, désactivé, survol et focus clavier.

## Écrans et composants demandés

- Accueil avec projets récents, recherche, statut du moteur local et bouton Nouveau projet.
- Studio principal avec navigation latérale compacte.
- Import vidéo par glisser-déposer, sélection de fichier ou URL.
- Lecteur vidéo et aperçu de la frame du segment sélectionné.
- Pipeline visuel : Import → Analyse → Script → Voix → Génération → Synchronisation → Export.
- Progression détaillée de chaque tâche avec pourcentage, état, message actuel, temps écoulé et estimation restante lorsqu’elle existe.
- Liste paginée et recherchable des segments.
- Pour chaque segment : timecode vidéo, transcription source, script français éditable, budget de mots, durée originale, durée audio, différence de durée, avertissement de dépassement, lecture audio, sauvegarde et régénération.
- Bibliothèque de voix avec moteur, genre/style, aperçu audio et sélection de la voix active.
- Distinction claire entre Qwen et OmniVoice.
- Boutons pour générer un segment ou toute la narration.
- Zone d’échange JSON avec ChatGPT : téléchargement du pack script, réimport du JSON réécrit et validation des erreurs.
- Choix du preset d’export avec résolution, codec, FPS, qualité et estimation de taille.
- Journal compact des tâches et erreurs utiles, sans afficher de détails techniques incompréhensibles par défaut.
- Notifications élégantes et non bloquantes.

## Contraintes techniques impératives

- Lire `README.md`, `api-contract.json` et `required-dom-ids.txt` avant de modifier l’interface.
- Conserver toutes les routes `/api/...` et leurs formats.
- Employer uniquement des URL relatives pour les appels API.
- Conserver les IDs DOM existants. Si la nouvelle architecture impose de les changer, fournir un fichier clair `id-migration.json` contenant chaque ancien ID et son nouvel équivalent.
- Ne supprimer aucune fonction présente dans `app.js`.
- Le résultat doit fonctionner dans PyWebView, sans serveur frontend séparé.
- Ne mettre aucun secret, token, modèle ou chemin Windows dans le code frontend.
- Éviter les dépendances externes chargées depuis un CDN : l’application doit fonctionner hors ligne.
- Si React, Vue ou Svelte est utilisé, fournir également le build statique final prêt à être servi par Python.
- Ne simuler aucune donnée dans le livrable final. Les mocks peuvent exister uniquement dans un mode de démonstration clairement séparé.

## Organisation attendue du livrable

Retourner le dossier frontend complet, pas seulement des captures d’écran :

- `index.html` ;
- tous les fichiers CSS ;
- tous les fichiers JavaScript ;
- les éventuels assets locaux ;
- les sources du framework si un framework est utilisé ;
- le build statique final ;
- un court fichier `CHANGES.md` ;
- `id-migration.json` si des IDs ont changé.

Avant de livrer, vérifier chaque action : création de projet, import, analyse, édition d’un segment, génération TTS, lecture audio, export/réimport du script JSON, synchronisation, suivi des tâches et export final.

Ne modifie pas le backend Python. Si une nouvelle donnée backend te semble nécessaire, documente-la séparément dans `BACKEND_REQUESTS.md` sans inventer de route ni bloquer le reste de l’interface.
