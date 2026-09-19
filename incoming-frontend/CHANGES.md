# Journal des modifications — Refonte Manhwa Dub Studio v2.0 (Bento Grid Edition)

## 1. Direction Artistique & Thème "Bento Grid"
- **Architecture Modulaire Bento Grid** : Agencement modulaire en tuiles bento asymétriques et harmonieuses avec hiérarchie visuelle claire (Preview vidéo 8 cols, Éditeur de script 4 cols, Moteurs & Voix 4 cols, Recommandations & Export 4 cols, CTA de masse en tuile d'accent 4 cols, Timeline en bento card pleine largeur).
- **Palette Bento Studio** : 
  - Fond d'écran sombre profond : `#0a0b0d`
  - Conteneurs et cartes Bento : `#14161c`
  - En-têtes et sous-couches : `#0d0f14` et `#1a1c22`
  - Bordures de précision : `#1f2128`
  - Accents studio vibrants : Jaune doré ambré `#fbbf24` (hover `#fcd34d`), Vert statut `#22c55e`, Rouge alerte `#ef4444`
  - Typographie & Contrastes : Texte blanc éclatant `#ffffff`, corps adouci `#e0e0e0`, métadonnées atténuées `#63666d`
- **Barre d'état inférieure (Telemetry Footer)** : Affichage direct de la télémétrie matérielle (CPU, RAM, GPU RTX) et du statut de la tâche en cours avec puce d'activité pulsante.

## 2. Nouvelles Capacités & Améliorations Fonctionnelles
- **Lecteur Vidéo Intégré & Synchronisation Frame par Frame** : Canvas de prévisualisation cinématique avec timecodes, scrubber dynamique et affichage en temps réel des sous-titres et débits.
- **Studio de Casting Voix étendu** :
  - Séparation explicite entre **Qwen3-TTS** (inférence 1.93× temps réel) et **OmniVoice** (modèle 48kHz stéréo cinéma).
  - Écoute d'échantillons en un clic, filtrage par moteur et attribution instantanée au projet actif.
- **Hub d'Échange Script ChatGPT & Budget Mots** :
  - Téléchargement du pack script JSON en 1 clic avec schéma d'instructions pour ChatGPT.
  - Réimportation avec validation d'intégrité et synchronisation immédiate.
  - Jauge en temps réel du ratio mots / durée (budget de mots idéal par segment).
- **Timeline Temporelle & Analyse d'Écart** :
  - Calcul du delta de durée (`tts_duration - original_duration`).
  - Badges de synchronisation clairs : `GÉNÉRÉ (IDÉAL)`, `TOLÉRÉ`, `DÉPASSEMENT` avec jauges graphiques.
  - Résolution automatisée de la timeline via `/api/projects/{id}/solve`.
- **Moniteur de Tâches & Estimation Temps Réel** :
  - Suivi en temps réel des tâches en arrière-plan avec ETA, statut et pourcentage de progression.

## 3. Conformité Technique & Rétrocompatibilité
- **Préservation intégrale des 65 IDs DOM** : Tous les IDs documentés dans `required-dom-ids.txt` sont strictement conservés et fonctionnels dans l'arborescence DOM (voir `id-migration.json`).
- **Contrat API 100% conservé** : Aucune altération des chemins, méthodes HTTP ou schémas JSON du backend Python/PyWebView.
- **Zéro dépendance CDN externe** : Styles Tailwind intégrés, icônes Lucide compilées et fonctionnement hors-ligne garanti.
