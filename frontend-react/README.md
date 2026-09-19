# Manhwa Dub Studio — Suite Professionnelle de Doublage

Interface audiovisuelle moderne, rapide et cinématique pour l'application desktop locale **Manhwa Dub** (Python + PyWebView).

---

## Architecture et fonctionnement

- **Frontend Moderne** : Développé en React 19 / TypeScript avec Tailwind CSS, Lucide icons et Motion.
- **Exécution locale & PyWebView** :
  - L'application communique exclusivement via des routes relatives `/api/...`.
  - Fonctionne à 100% hors ligne sans aucun CDN externe ni tracking.
  - S'adapte avec précision aux résolutions d'écran de 1280×720 à 1920×1080+.
- **Rétrocompatibilité Totale** :
  - Les 65 identifiants DOM historiques (`required-dom-ids.txt`) sont conservés à l'identique (voir `id-migration.json`).
  - Toutes les routes et formats d'`api-contract.json` sont strictement respectés.

---

## Workflow de Production

1. **Espace Projets** : Consultation des projets récents avec métadonnées, diagnostic des moteurs locaux et création rapide.
2. **Import Source** : Glisser-déposer de fichiers vidéo locaux (MP4, MKV, MOV, WEBM) ou extraction par URL web (yt-dlp).
3. **Analyse & Découpage** : Extraction audio, ASR (Whisper) et segmentation temporelle avec capture de vignettes.
4. **Hub de Réécriture Script (ChatGPT)** : Export du pack JSON avec structure et budgets de mots recommandés, réimport et validation instantanée.
5. **Casting & Voix (Qwen3-TTS & OmniVoice)** : Sélection des voix françaises avec aperçu audio, distinction claire du moteur, vitesse et style d'interprétation.
6. **Génération & Synchronisation** : Génération par segment ou en lot avec calcul des dépassements temporels et solveur automatique.
7. **Export & Mastering** : Rendu vidéo multiformat avec presets optimisés (YouTube 1080p, 4K Master, TikTok Vertical, Web).

---

## Commandes et Build

```bash
# Lancement du serveur de développement
npm run dev

# Construction du bundle statique prêt pour PyWebView (dist/)
npm run build
```

Le résultat du build dans `dist/` contient le fichier `index.html` et les assets compilés, directement chargeables par le backend Python :
`webview.create_window('Manhwa Dub Studio', 'dist/index.html')`.
