# Les meilleurs TTS français locaux pour Manhwa Dub Studio

_Recherche vérifiée le 6 septembre 2026 — cible : Windows, RTX 4060 Laptop 8 Go, récaps de 30 à 60 minutes._

## Verdict

Le moteur à tester en premier est **Supertonic 3**. C'est le meilleur pari pour obtenir immédiatement un français natif, plusieurs voix masculines/féminines, une diction stable et une génération extrêmement rapide. Pour une voix plus cinématique, les challengers prioritaires sont **CosyVoice 3**, **Chatterbox Multilingual V3**, **Parler-TTS Multilingual** et **Kyutai TTS en/fr**.

| Rang | Moteur | Français | Style | Clonage | Vitesse probable | Pertinence |
|---:|---|---|---|---|---|---|
| 1 | Supertonic 3 | Natif | 10 voix, tags expressifs | Non local libre | Ultra-rapide | Meilleur premier test |
| 2 | CosyVoice 3 0.5B | Natif | Instructions émotion/vitesse | Oui | Rapide GPU | Meilleur compromis potentiel |
| 3 | Chatterbox Multilingual V3 | Natif | Conversationnel, expressif | Oui | Moyen/rapide GPU | Candidat qualité |
| 4 | Kyutai TTS 1.6B en/fr | Natif | Naturel, dialogue, streaming | Conditionnement | Rapide mais lourd | Très bon français, à mesurer |
| 5 | Parler-TTS Mini Multilingual | Natif | Description libre du ton | Voix fixes | Moyen | Excellent pour une narration stylée |
| 6 | NeuTTS Nano French | Modèle français dédié | Style de la référence | Oui | Temps réel CPU annoncé | Challenger GGUF compact |
| 7 | F5-TTS French | Checkpoint communautaire | Naturel | Oui | Variable selon étapes | Expérimental intéressant |
| 8 | Pocket TTS French 24L | Natif, préversion | Style de la référence | Oui | Rapide/CPU | À tester après les précédents |
| 9 | Kokoro 82M | Natif | Une voix française féminine | Non | Ultra-rapide | Moteur de secours |
| 10 | MeloTTS + OpenVoice V2 | Natif | Prosodie classique | Oui via conversion | Très rapide | Moins cinématique |

## Les cinq moteurs réellement intéressants

### 1. Supertonic 3

Supertonic 3 est un modèle ONNX d'environ 99M paramètres, disponible localement, avec 31 langues dont le français. Il fournit cinq voix masculines et cinq voix féminines, sort du 44,1 kHz et accepte des balises comme `<laugh>`, `<breath>` et `<sigh>`. Son éditeur annonce aussi moins de répétitions et d'omissions que la génération précédente. C'est le candidat naturel pour le preset **Rapide stylé**. [Modèle officiel Supertonic 3](https://huggingface.co/Supertone/supertonic-3)

Attention : le dossier Supertonic présent dans DubRoom contient actuellement l'ancien modèle v1.5 anglais. Il faut installer les actifs **Supertonic 3**, pas simplement brancher les anciens fichiers.

### 2. CosyVoice 3

CosyVoice 3 0.5B prend officiellement en charge le français parmi neuf langues. Il combine clonage zero-shot, instructions d'émotion, vitesse et volume, normalisation des nombres/symboles et streaming annoncé à 150 ms. Sur le papier, c'est probablement le meilleur compromis entre Qwen et OmniVoice. [Dépôt officiel CosyVoice](https://github.com/FunAudioLLM/CosyVoice)

Le runtime CUDA/GGUF est déjà présent dans DubRoom, mais les poids CosyVoice manquent actuellement.

### 3. Chatterbox Multilingual V3

La V3 multilingue fait 0.5B, supporte le français et améliore la similitude de voix, la stabilité, l'expressivité et les hallucinations par rapport à la V2. Il ne faut pas la confondre avec Chatterbox Turbo/Nano : ces variantes rapides visent principalement l'anglais. [Dépôt officiel Chatterbox](https://github.com/resemble-ai/chatterbox)

### 4. Parler-TTS Mini Multilingual v1.1

Parler-TTS est particulièrement intéressant sans clonage : on décrit directement la voix souhaitée — grave, proche, rapide, dramatique, claire — et le modèle possède des locuteurs français identifiés, notamment **Daniel** et **Christine**. Il a été entraîné sur environ 9 200 heures non anglophones et accepte le contrôle de hauteur, vitesse, réverbération et expressivité. [Model card Parler-TTS](https://huggingface.co/parler-tts/parler-tts-mini-multilingual-v1.1)

### 5. NeuTTS Nano French

NeuTTS Nano French est un petit modèle français dédié : environ 117M paramètres actifs, versions GGUF Q4/Q8, clonage à partir de quelques secondes et codec ONNX. Le constructeur vise le temps réel sur CPU. Il est récent et doit être testé sur les répétitions et les noms propres, mais il correspond très bien à notre contrainte locale. [NeuTTS Nano French](https://huggingface.co/neuphonic/neutts-nano-french)

## Autres options

- **Kyutai TTS 1.6B en/fr** : modèle français natif de 1.8B paramètres, conditionnement vocal et streaming. Sa fiche annonce une forte capacité de batch, mais cela ne prédit pas son débit pour un seul narrateur sur RTX 4060. [Kyutai TTS en/fr](https://huggingface.co/kyutai/tts-1.6b-en_fr)
- **Pocket TTS French 24L** : la version française est encore non distillée ; Kyutai reconnaît des difficultés de qualité des données. La quantification apporte environ 30 % de gain. Les poids français sans clonage et la voix Estelle sont déjà en cache chez nous. [Versions Pocket TTS](https://github.com/kyutai-labs/pocket-tts/releases)
- **F5-TTS French** : checkpoint français communautaire, potentiellement très naturel, à comparer en 8/12/16 étapes. [Liste officielle F5-TTS](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/SHARED.md)
- **Kokoro 82M** : extrêmement rapide, mais une seule voix française officielle `ff_siwis` et aucun clonage. [Kokoro Open TTS](https://github.com/OpenTTSGroup/kokoro-open-tts)
- **MeloTTS** : français officiel et temps réel CPU, mais rendu généralement plus classique. [MeloTTS officiel](https://github.com/myshell-ai/MeloTTS)
- **Piper/MMS** : parfaits comme baselines de vitesse, trop utilitaires pour être le moteur HQ. [Voix françaises Piper](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR), [MMS français](https://huggingface.co/facebook/mms-tts-fra)

## Ordre du benchmark local

1. Supertonic 3 : voix M1 à M5, qualité 4/8/12 étapes.
2. NeuTTS Nano French Q8 puis Q4.
3. Parler-TTS : Daniel et Christine avec trois descriptions cinématiques.
4. CosyVoice 3 CUDA/GGUF.
5. Chatterbox Multilingual V3.
6. Kyutai TTS 1.6B en/fr.

Chaque moteur doit lire les mêmes douze phrases françaises comportant narration, émotion, chiffres, dates, sigles et noms coréens. Le gagnant doit être choisi par écoute aveugle, puis seulement par vitesse. Un moteur légèrement plus lent mais sans répétition ni mot avalé sera plus rapide sur une vidéo d'une heure après contrôle qualité.

## Limite de la comparaison

Il n'existe pas de benchmark primaire unique comparant tous ces modèles en français sur une RTX 4060. Les chiffres publiés utilisent des matériels et des longueurs différentes. Ce classement est donc une présélection technique ; le benchmark local commun est l'étape décisive.
