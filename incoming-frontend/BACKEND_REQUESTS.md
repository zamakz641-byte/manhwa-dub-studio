# Suggestions et requêtes d'évolutions Backend (Optionnelles)

Ce document récapitule les améliorations côté serveur Python qui enrichiraient l'expérience de production sans rompre la compatibilité actuelle. Le frontend actuel fonctionne sans ces ajouts et ne fait aucune hypothèse bloquante.

---

### 1. Endpoint d'annulation de tâche (`POST /api/projects/{projectId}/tasks/{taskId}/cancel`)
- **Utilité** : Permettre à l'opérateur d'interrompre une génération batch TTS ou une analyse vidéo trop longue sans redémarrer le processus Python.
- **Retour suggéré** : `{ "status": "cancelled", "taskId": "..." }`.

### 2. Données de pics de forme d'onde (`GET /api/projects/{projectId}/audio/{segmentId}/waveform`)
- **Utilité** : Renvoyer un tableau JSON de 100 à 200 valeurs normalisées d'amplitude audio (`[0.12, 0.45, 0.88, ...]`) pour afficher la forme d'onde instantanément sans devoir décoder le fichier audio complet dans le navigateur.
- **Retour suggéré** : `{ "segment_id": "...", "duration": 4.5, "peaks": [...] }`.

### 3. Streaming d'événements serveur (SSE ou WebSocket : `/api/events`)
- **Utilité** : Remplacer le polling HTTP (1000ms sur `/tasks`) par un flux SSE unidirectionnel léger pour notifier le frontend dès qu'un segment est généré ou qu'une étape d'encodage progresse.

### 4. Export groupé de tous les audios (`GET /api/projects/{projectId}/audio-zip`)
- **Utilité** : Permettre de télécharger une archive ZIP de tous les fichiers TTS individuels (`segment_001.wav`, etc.) pour les ingénieurs du son souhaitant faire un mixage manuel dans un logiciel tiers (Reaper, Pro Tools).
