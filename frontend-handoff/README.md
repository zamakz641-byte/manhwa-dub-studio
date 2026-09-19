# Manhwa Dub — pack frontend

Ce dossier est le frontend autonome de l'application PyWebView. Vous pouvez le modifier dans un autre outil puis renvoyer **tout le dossier**. Le branchement Python sera conservé si les règles ci-dessous sont respectées.

## Fichiers à modifier

- `index.html` : structure et textes de l'interface.
- `style.css`, `tasks.css`, `app-v2.css`, `app-v3.css` : apparence, responsive et états.
- `app.js` : interactions et appels à l'API locale.

## Contrat à conserver

1. Garder les identifiants HTML listés dans `required-dom-ids.txt`, ou fournir une table ancien ID → nouvel ID.
2. Garder les routes et formats décrits dans `api-contract.json`.
3. Utiliser des URL relatives `/api/...` : PyWebView et le navigateur local pointent vers le même serveur.
4. Ne pas intégrer de secret, de modèle IA ou de chemin Windows dans le frontend.
5. Le frontend peut être entièrement redessiné. React/Vue/Svelte sont possibles si le livrable final contient un build statique (`index.html` + assets).

## Retour attendu

Renvoyez le dossier ou le ZIP complet. Je remplacerai l'interface et rebrancherai les événements sur les mêmes fonctions : projets, import vidéo, analyse, script, TTS, synchronisation, export et progression des tâches.

## Lancement local

Le backend sert déjà ces fichiers sur `http://127.0.0.1:8765/`. Pour un aperçu hors backend, les données réelles ne seront pas disponibles : prévoyez éventuellement des mocks visuels, sans modifier le contrat API.
