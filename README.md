# Manhwa Dub Studio

Application locale de traduction, réécriture, doublage Qwen et resynchronisation de recaps manhwa.

## Lancer

Double-cliquez sur `LANCER_MANHWA_DUB.bat`. Le lanceur ouvre directement l'application dans une fenêtre Windows pywebview et ferme le serveur local avec la fenêtre.

Pour le mode navigateur destiné au diagnostic, exécutez :

```powershell
python app.py
```

L'interface de diagnostic s'ouvre sur `http://127.0.0.1:8765`.

## Ressources réutilisées

- FFmpeg et FFprobe installés sur Windows
- yt-dlp installé sur Windows
- Faster-Whisper : environnement et modèle existants dans DubRoom
- Qwen3-TTS 0.6B Base : environnement et modèle existants dans DubRoom, accélérés par `faster-qwen3-tts` et ses graphes CUDA
- voix clonée Qwen existante dans NarratorStudio

Les chemins sont détectés dans `runtime.py` et peuvent être remplacés avec les variables d'environnement `MANHWA_*` correspondantes.

## Périmètre V1

La V1 fournit la gestion de projets, l'import local/YouTube, l'analyse vidéo, l'ASR horodaté, l'échange du Script Pack, la génération TTS segmentée, le solveur de timeline, la revue segmentaire, l'export FFmpeg et le nettoyage des caches reconstructibles.

Les tâches longues s'exécutent en arrière-plan avec progression, compteur, temps écoulé et ETA. Quatre presets d'export sont disponibles : YouTube 1080p, aperçu rapide, compact HEVC et master archive. Le Script Pack 2.0 embarque le récit complet, le prompt ChatGPT, le contexte adjacent, le budget de mots et la limite audio de chaque segment.

## Performance Qwen mesurée

Le benchmark reproductible `tools/benchmark_qwen.py`, relancé sur secteur, a produit 184,4 secondes de narration française en 95,8 secondes après préchauffage, soit 1,925× temps réel et environ 31,2 minutes de calcul pour une heure audio. Le rapport est conservé dans `work/qwen_benchmark_secteur/report.json`.

## Installation pour le développement

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Le frontend React se trouve dans `frontend-react` :

```powershell
cd frontend-react
npm install
npm run build
```

## Contenu non versionné

Les modèles IA, voix clonées, runtimes partagés, vidéos source, projets utilisateur, caches et exports ne sont pas publiés. Ils doivent être installés ou configurés localement.
