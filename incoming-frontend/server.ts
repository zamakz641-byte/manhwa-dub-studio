import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.raw({ type: "*/*", limit: "500mb" }));

// Pre-seeded voices catalogue distinguishing Qwen3-TTS and OmniVoice
const VOICES_CATALOGUE = {
  default: "qwen_narrator_fr",
  voices: [
    {
      id: "qwen_narrator_fr",
      name: "Qwen3 — Alexandre (Narrateur Sombre)",
      engine: "Qwen3-TTS" as const,
      gender: "Masculin" as const,
      style: "Épique & Posé",
      description: "Timbre grave et solennel, idéal pour les monologues intérieurs et scènes de donjon manhwa.",
      tags: ["Clonage Neural", "Inférence 1.93×", "Recommandé"],
      speed_factor: 1.0,
      sample_url: "/api/samples/alexandre"
    },
    {
      id: "qwen_shonen_fr",
      name: "Qwen3 — Lucas (Protagoniste Shonen)",
      engine: "Qwen3-TTS" as const,
      gender: "Masculin" as const,
      style: "Énergique & Déterminé",
      description: "Voix vive avec modulation rapide, parfaite pour les scènes d'action et les montées de niveau.",
      tags: ["Combats", "Rythmé", "1.93×"],
      speed_factor: 1.08,
      sample_url: "/api/samples/lucas"
    },
    {
      id: "qwen_fem_fr",
      name: "Qwen3 — Éléonore (Monarque / Mage)",
      engine: "Qwen3-TTS" as const,
      gender: "Féminin" as const,
      style: "Mystérieux & Noble",
      description: "Voix posée, articulée et captivante pour les personnages féminins d'autorité.",
      tags: ["Clair", "Fantasy", "1.93×"],
      speed_factor: 0.98,
      sample_url: "/api/samples/eleonore"
    },
    {
      id: "omni_cinema_deep",
      name: "OmniVoice — Maximilien (Cinéma Dubbing)",
      engine: "OmniVoice" as const,
      gender: "Masculin" as const,
      style: "Cinématique & Texturé",
      description: "Modèle OmniVoice émotionnel haute définition simulant un doublage professionnel de studio.",
      tags: ["OmniVoice", "Multi-Émotion", "HQ 48kHz"],
      speed_factor: 1.0,
      sample_url: "/api/samples/maximilien"
    },
    {
      id: "omni_villain_dark",
      name: "OmniVoice — Vane (Antagoniste Épique)",
      engine: "OmniVoice" as const,
      gender: "Masculin" as const,
      style: "Sombre & Menaçant",
      description: "Grain rocailleux avec tension dramatique pour les souverains ennemis et ombres.",
      tags: ["OmniVoice", "Tension", "HQ 48kHz"],
      speed_factor: 0.95,
      sample_url: "/api/samples/vane"
    },
    {
      id: "omni_celeste_narrator",
      name: "OmniVoice — Céleste (Voix Off Documentaire)",
      engine: "OmniVoice" as const,
      gender: "Féminin" as const,
      style: "Fluide & Immersif",
      description: "Narration douce et rythmée sans fatigue auditive sur les longs récaps de 45 minutes.",
      tags: ["OmniVoice", "Long Form", "HQ 48kHz"],
      speed_factor: 1.02,
      sample_url: "/api/samples/celeste"
    }
  ]
};

// Export presets matching api-contract.json
const EXPORT_PRESETS = {
  youtube_1080p: {
    id: "youtube_1080p",
    name: "YouTube 1080p (Recommandé)",
    description: "H.264 / NVENC 1080p60 · Bitrate 12 Mbps · Audio AAC 320 kbps · Optimisé pour le streaming.",
    resolution: "1920x1080",
    codec: "h264_nvenc",
    fps: 60,
    quality: "Haute (CBR 12M)",
    est_mb_per_min: 92
  },
  tiktok_vertical: {
    id: "tiktok_vertical",
    name: "TikTok / Shorts 9:16 Vertical",
    description: "Crop intelligent 1080x1920 à 60 FPS avec centrage sur les vignettes d'action.",
    resolution: "1080x1920",
    codec: "h264_nvenc",
    fps: 60,
    quality: "Optimisé Mobile (14M)",
    est_mb_per_min: 105
  },
  "4k_master": {
    id: "4k_master",
    name: "Master Pro 4K UHD",
    description: "ProRes 422 HQ ou HEVC 3840x2160 pour archivage et diffusion premium sans perte.",
    resolution: "3840x2160",
    codec: "hevc_nvenc",
    fps: 60,
    quality: "Master Sans Perte (CRF 14)",
    est_mb_per_min: 280
  },
  web_light: {
    id: "web_light",
    name: "Aperçu Léger Web 720p",
    description: "720p30 H.264 rapide pour validation express d'équipe et tests mobiles.",
    resolution: "1280x720",
    codec: "libx264",
    fps: 30,
    quality: "Rapide (CRF 24)",
    est_mb_per_min: 32
  }
};

// In-memory persistent state for studio projects & tasks
interface StoredProject {
  id: string;
  title: string;
  status: 'draft' | 'imported' | 'analyzed' | 'script_ready' | 'tts' | 'review' | 'done';
  source_language: string;
  target_language: string;
  voice_id: string;
  duration: number;
  progress: number;
  source?: {
    filename: string;
    url?: string;
    size?: number;
  } | null;
  segments: any[];
  tts_benchmark?: {
    measured_audio_per_compute: number;
    estimated_minutes_for_one_hour: number;
  };
  created_at: string;
  updated_at: string;
  export_path?: string | null;
}

let storedProjects: StoredProject[] = [
  {
    id: "proj_solo_leveling_12",
    title: "Solo Leveling — L'Éveil de l'Ombre (Chapitres 40-52)",
    status: "review",
    source_language: "ko",
    target_language: "fr",
    voice_id: "qwen_narrator_fr",
    duration: 864, // 14 min 24s
    progress: 88,
    source: {
      filename: "solo_leveling_ep12_raw_recap.mp4",
      size: 489201000
    },
    tts_benchmark: {
      measured_audio_per_compute: 1.93,
      estimated_minutes_for_one_hour: 31.1
    },
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    updated_at: new Date().toISOString(),
    segments: [
      {
        id: "seg_001",
        index: 1,
        video_start: 0,
        video_end: 6.4,
        original_duration: 6.4,
        transcript: "이 던전의 마력 농도는 지금까지 들어간 그 어떤 곳과도 달랐다.",
        rewritten_text: "La densité magique de ce donjon de rang S dépassait tout ce qu'il avait affronté jusqu'alors.",
        script_word_budget: 14,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_001",
        tts_duration: 6.2,
        frame: "frame_001.jpg",
        sync: { status: "ideal", delta_seconds: -0.2 }
      },
      {
        id: "seg_002",
        index: 2,
        video_start: 6.4,
        video_end: 14.8,
        original_duration: 8.4,
        transcript: "문이 닫히는 순간, 붉은 안개 속에서 수백 개의 푸른 눈동자가 번쩍였다.",
        rewritten_text: "À l'instant où le portail se referma violemment, des centaines d'yeux écarlates s'allumèrent dans la brume toxique.",
        script_word_budget: 18,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_002",
        tts_duration: 8.1,
        frame: "frame_002.jpg",
        sync: { status: "ideal", delta_seconds: -0.3 }
      },
      {
        id: "seg_003",
        index: 3,
        video_start: 14.8,
        video_end: 21.2,
        original_duration: 6.4,
        transcript: "하지만 진우는 물러서지 않았다. 단검을 고쳐 쥐고 그림자를 소환했다.",
        rewritten_text: "Mais Jinwoo n'hésita pas une seconde. Empoignant sa dague céleste, il ordonna à son armée d'ombres d'émerger du sol.",
        script_word_budget: 14,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_003",
        tts_duration: 7.2,
        frame: "frame_003.jpg",
        sync: { status: "tolerable", delta_seconds: 0.8 }
      },
      {
        id: "seg_004",
        index: 4,
        video_start: 21.2,
        video_end: 29.0,
        original_duration: 7.8,
        transcript: "어둠 속에서 일어난 기사들이 굉음과 함께 전방으로 돌진하기 시작했다.",
        rewritten_text: "Surgissant des ténèbres avec un fracas assourdissant, les chevaliers fantômes balayèrent la première ligne ennemie.",
        script_word_budget: 17,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_004",
        tts_duration: 7.6,
        frame: "frame_004.jpg",
        sync: { status: "ideal", delta_seconds: -0.2 }
      },
      {
        id: "seg_005",
        index: 5,
        video_start: 29.0,
        video_end: 36.5,
        original_duration: 7.5,
        transcript: "시스템 알림이 눈앞에 떠올랐다. '숨겨진 퀘스트: 군주의 자격이 발동되었습니다.'",
        rewritten_text: "Une fenêtre holographique apparut alors devant ses yeux : Quête secrète activée — La Légitimité du Monarque.",
        script_word_budget: 16,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_005",
        tts_duration: 7.3,
        frame: "frame_005.jpg",
        sync: { status: "ideal", delta_seconds: -0.2 }
      },
      {
        id: "seg_006",
        index: 6,
        video_start: 36.5,
        video_end: 45.0,
        original_duration: 8.5,
        transcript: "모든 것이 계산대로였다. 이제 남은 것은 보스 룸으로 향하는 일뿐이었다.",
        rewritten_text: "Chaque détail s'était déroulé selon ses prévisions. Il ne restait plus qu'à franchir la porte scellée de la chambre royale.",
        script_word_budget: 18,
        tts_path: "/api/projects/proj_solo_leveling_12/audio/seg_006",
        tts_duration: 8.3,
        frame: "frame_006.jpg",
        sync: { status: "ideal", delta_seconds: -0.2 }
      }
    ]
  },
  {
    id: "proj_orv_recap",
    title: "Omniscient Reader — Le Premier Scénario de Séoul",
    status: "script_ready",
    source_language: "ko",
    target_language: "fr",
    voice_id: "omni_cinema_deep",
    duration: 1120, // 18 min 40s
    progress: 50,
    source: {
      filename: "orv_subway_prologue.mp4",
      size: 612400000
    },
    tts_benchmark: {
      measured_audio_per_compute: 1.88,
      estimated_minutes_for_one_hour: 31.9
    },
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    segments: [
      {
        id: "orv_001",
        index: 1,
        video_start: 0,
        video_end: 8.0,
        original_duration: 8.0,
        transcript: "지하철이 갑자기 멈춰 서고 안내 방송 대신 기괴한 도깨비가 공중에 나타났다.",
        rewritten_text: "La rame de métro se figea brusquement dans l'obscurité. Au lieu de l'annonce habituelle, une créature à cornes apparut.",
        script_word_budget: 18,
        tts_path: null,
        tts_duration: null,
        frame: "frame_orv_001.jpg",
        sync: { status: "ideal" }
      },
      {
        id: "orv_002",
        index: 2,
        video_start: 8.0,
        video_end: 16.5,
        original_duration: 8.5,
        transcript: "무료 서비스 기간이 종료되었습니다. 생존을 위해 살아있는 생명을 죽이십시오.",
        rewritten_text: "« Votre période d'essai gratuite est désormais terminée. Pour survivre, vous devez éliminer au moins un être vivant. »",
        script_word_budget: 19,
        tts_path: null,
        tts_duration: null,
        frame: "frame_orv_002.jpg",
        sync: { status: "ideal" }
      }
    ]
  },
  {
    id: "proj_tbate_intro",
    title: "The Beginning After The End — Réincarnation & Royaume de Dicathen",
    status: "done",
    source_language: "en",
    target_language: "fr",
    voice_id: "qwen_shonen_fr",
    duration: 1450,
    progress: 100,
    source: {
      filename: "tbate_arc1_final.mp4",
      size: 890000000
    },
    tts_benchmark: {
      measured_audio_per_compute: 1.93,
      estimated_minutes_for_one_hour: 31.2
    },
    created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    updated_at: new Date().toISOString(),
    segments: []
  }
];

// Tasks dictionary by project
const projectTasks: Record<string, Record<string, any>> = {};

// Helper to simulate asynchronous pipeline tasks
function triggerTask(projectId: string, kind: 'analyze' | 'tts' | 'export', payload: any = {}) {
  const project = storedProjects.find(p => p.id === projectId);
  if (!project) return null;

  if (!projectTasks[projectId]) projectTasks[projectId] = {};

  const taskId = `task_${kind}_${Date.now()}`;
  const totalSteps = kind === 'tts' ? Math.max(1, project.segments.length) : 100;

  const task = {
    id: taskId,
    kind,
    state: "running",
    progress: 5,
    eta_seconds: kind === 'tts' ? Math.round(totalSteps * 2.2) : 25,
    message: kind === 'analyze'
      ? "Extraction audio & découpage Whisper..."
      : kind === 'tts'
      ? "Inférence Qwen3-TTS en cours..."
      : "Rendu vidéo FFmpeg NVENC...",
    current: 1,
    total: totalSteps,
    error: null
  };

  projectTasks[projectId][taskId] = task;

  // Simulate progress steps over time
  let currentStep = 0;
  const interval = setInterval(() => {
    currentStep++;
    const fraction = currentStep / 10;
    task.progress = Math.min(100, Math.round(fraction * 100));
    task.eta_seconds = Math.max(0, Math.round((10 - currentStep) * 2.5));

    if (kind === 'tts') {
      task.current = Math.min(task.total, Math.round(fraction * task.total));
      task.message = `Génération segment ${task.current}/${task.total} avec Qwen3-TTS`;
    } else if (kind === 'analyze') {
      task.message = currentStep < 4 ? "Décodage vidéo FFmpeg..." : currentStep < 7 ? "ASR Faster-Whisper en cours..." : "Génération des timecodes & frames...";
    } else {
      task.message = `Multiplexage audio/vidéo ${task.progress}%`;
    }

    if (currentStep >= 10) {
      clearInterval(interval);
      task.state = "completed";
      task.progress = 100;
      task.eta_seconds = 0;
      task.message = "Terminé avec succès";

      if (kind === 'analyze') {
        project.status = "analyzed";
        project.progress = 40;
        if (!project.segments.length) {
          // Generate 6 default segments if none
          project.segments = [
            {
              id: "seg_001",
              index: 1,
              video_start: 0,
              video_end: 7.2,
              original_duration: 7.2,
              transcript: "이 던전의 마력 농도는 지금까지 들어간 그 어떤 곳과도 달랐다.",
              rewritten_text: "La densité magique de ce donjon surpassait tout ce qu'il avait affronté auparavant.",
              script_word_budget: 15,
              tts_path: null,
              tts_duration: null,
              frame: "frame_001.jpg",
              sync: { status: "ideal" }
            },
            {
              id: "seg_002",
              index: 2,
              video_start: 7.2,
              video_end: 15.0,
              original_duration: 7.8,
              transcript: "문이 닫히는 순간 붉은 안개 속에서 수백 개의 눈동자가 번쩍였다.",
              rewritten_text: "Au moment où les portes se refermèrent, des yeux incandescents jaillirent de la brume.",
              script_word_budget: 17,
              tts_path: null,
              tts_duration: null,
              frame: "frame_002.jpg",
              sync: { status: "ideal" }
            },
            {
              id: "seg_003",
              index: 3,
              video_start: 15.0,
              video_end: 22.5,
              original_duration: 7.5,
              transcript: "단검을 고쳐 쥐고 그림자의 군단을 소환하기 시작했다.",
              rewritten_text: "Resserrant sa prise sur sa dague, il fit sortir son armée des ombres.",
              script_word_budget: 16,
              tts_path: null,
              tts_duration: null,
              frame: "frame_003.jpg",
              sync: { status: "ideal" }
            }
          ];
        }
      } else if (kind === 'tts') {
        project.status = "tts";
        project.progress = 75;
        project.segments.forEach(s => {
          s.tts_path = `/api/projects/${projectId}/audio/${s.id}`;
          s.tts_duration = s.tts_duration || Number((s.original_duration * (0.95 + Math.random() * 0.1)).toFixed(1));
          const delta = Number((s.tts_duration - s.original_duration).toFixed(1));
          s.sync = {
            status: Math.abs(delta) <= 0.4 ? "ideal" : delta <= 1.0 ? "tolerable" : "too_long",
            delta_seconds: delta
          };
        });
      } else if (kind === 'export') {
        project.status = "done";
        project.progress = 100;
        project.export_path = `/exports/${project.id}_${payload.preset || 'youtube_1080p'}.mp4`;
      }
    }
  }, 1000);

  return task;
}

// ---------------- API ROUTES ----------------

// GET /api/runtime
app.get("/api/runtime", (req, res) => {
  res.json({
    ffmpeg: {
      ready: true,
      path: "/usr/bin/ffmpeg",
      version: "6.1.1-static",
      engine: "Hardware Accelerated (NVENC/CUDA)"
    },
    ffprobe: {
      ready: true,
      path: "/usr/bin/ffprobe",
      version: "6.1.1",
      engine: "Metadata Extractor"
    },
    yt_dlp: {
      ready: true,
      path: "/usr/local/bin/yt-dlp",
      version: "2024.08.06",
      engine: "Web Video Streamer"
    },
    asr: {
      ready: true,
      model: "large-v3-turbo (FP16)",
      engine: "Faster-Whisper CUDA",
      python: "Python 3.10.12 · CTranslate2"
    },
    tts: {
      ready: true,
      voice: "Qwen3-TTS / Alexandre (FR)",
      engine: "Qwen3-TTS Neural (vLLM / Torch)",
      measured_audio_per_compute: 1.93,
      estimated_minutes_per_hour: 31.2
    },
    omni_voice: {
      ready: true,
      voice: "OmniVoice Cinema Pro",
      engine: "OmniVoice 48kHz Stereo",
      measured_audio_per_compute: 1.45,
      estimated_minutes_per_hour: 41.4
    }
  });
});

// GET /api/voices
app.get("/api/voices", (req, res) => {
  res.json(VOICES_CATALOGUE);
});

// GET /api/export-presets
app.get("/api/export-presets", (req, res) => {
  res.json(EXPORT_PRESETS);
});

// GET /api/projects
app.get("/api/projects", (req, res) => {
  res.json(storedProjects);
});

// POST /api/projects
app.post("/api/projects", (req, res) => {
  const { title, target_language = "fr", voice_id = "qwen_narrator_fr" } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Le titre du projet est requis" });
  }

  const newProject: StoredProject = {
    id: `proj_${Date.now()}`,
    title,
    status: "draft",
    source_language: "ko",
    target_language,
    voice_id,
    duration: 0,
    progress: 0,
    source: null,
    segments: [],
    tts_benchmark: {
      measured_audio_per_compute: 1.93,
      estimated_minutes_for_one_hour: 31.2
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  storedProjects.unshift(newProject);
  res.status(201).json(newProject);
});

// GET /api/projects/:projectId
app.get("/api/projects/:projectId", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: "Projet introuvable" });
  }
  res.json(project);
});

// PATCH /api/projects/:projectId
app.patch("/api/projects/:projectId", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: "Projet introuvable" });
  }

  if (req.body.voice_id) project.voice_id = req.body.voice_id;
  if (req.body.title) project.title = req.body.title;
  project.updated_at = new Date().toISOString();

  res.json(project);
});

// GET /api/projects/:projectId/tasks
app.get("/api/projects/:projectId/tasks", (req, res) => {
  const tasks = projectTasks[req.params.projectId] || {};
  res.json(tasks);
});

// POST /api/projects/:projectId/tasks/analyze
app.post("/api/projects/:projectId/tasks/analyze", (req, res) => {
  const task = triggerTask(req.params.projectId, "analyze");
  if (!task) return res.status(404).json({ error: "Projet introuvable" });
  res.json({ ok: true, taskId: task.id });
});

// POST /api/projects/:projectId/tasks/tts
app.post("/api/projects/:projectId/tasks/tts", (req, res) => {
  const task = triggerTask(req.params.projectId, "tts");
  if (!task) return res.status(404).json({ error: "Projet introuvable" });
  res.json({ ok: true, taskId: task.id });
});

// POST /api/projects/:projectId/tasks/export
app.post("/api/projects/:projectId/tasks/export", (req, res) => {
  const task = triggerTask(req.params.projectId, "export", req.body);
  if (!task) return res.status(404).json({ error: "Projet introuvable" });
  res.json({ ok: true, taskId: task.id });
});

// POST /api/projects/:projectId/source
app.post("/api/projects/:projectId/source", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const rawFilename = req.headers["x-filename"];
  const filename = typeof rawFilename === "string" ? decodeURIComponent(rawFilename) : "video_source.mp4";

  project.source = {
    filename,
    size: 245000000
  };
  project.status = "imported";
  project.duration = 480; // 8 minutes default
  project.progress = 20;
  project.updated_at = new Date().toISOString();

  res.json(project);
});

// POST /api/projects/:projectId/source-url
app.post("/api/projects/:projectId/source-url", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "URL manquante" });

  project.source = {
    filename: `web_source_${Date.now()}.mp4`,
    url,
    size: 180000000
  };
  project.status = "imported";
  project.duration = 640;
  project.progress = 20;
  project.updated_at = new Date().toISOString();

  res.json(project);
});

// PATCH /api/projects/:projectId/segments/:segmentId
app.patch("/api/projects/:projectId/segments/:segmentId", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const segment = project.segments.find(s => s.id === req.params.segmentId);
  if (!segment) return res.status(404).json({ error: "Segment introuvable" });

  if (typeof req.body.rewritten_text === "string") {
    segment.rewritten_text = req.body.rewritten_text;
    const words = segment.rewritten_text.trim().split(/\s+/).filter(Boolean).length;
    const budget = segment.script_word_budget || Math.floor(segment.original_duration * 2.2);
    // recalculate sync status if duration exists
    if (segment.tts_duration) {
      const delta = Number((segment.tts_duration - segment.original_duration).toFixed(1));
      segment.sync = {
        status: Math.abs(delta) <= 0.4 ? "ideal" : delta <= 1.0 ? "tolerable" : "too_long",
        delta_seconds: delta
      };
    }
  }

  project.updated_at = new Date().toISOString();
  res.json(segment);
});

// POST /api/projects/:projectId/segments/:segmentId/tts
app.post("/api/projects/:projectId/segments/:segmentId/tts", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const segment = project.segments.find(s => s.id === req.params.segmentId);
  if (!segment) return res.status(404).json({ error: "Segment introuvable" });

  // Compute realistic duration based on word count
  const words = (segment.rewritten_text || "").trim().split(/\s+/).filter(Boolean).length;
  // French average speech rate ~ 2.4 words per second
  const computedDuration = Number(Math.max(1.5, words / 2.3).toFixed(1));
  segment.tts_duration = computedDuration;
  segment.tts_path = `/api/projects/${project.id}/audio/${segment.id}`;

  const delta = Number((segment.tts_duration - segment.original_duration).toFixed(1));
  segment.sync = {
    status: Math.abs(delta) <= 0.4 ? "ideal" : delta <= 1.0 ? "tolerable" : "too_long",
    delta_seconds: delta
  };

  project.status = "tts";
  project.progress = Math.max(68, project.progress);
  project.updated_at = new Date().toISOString();

  res.json(segment);
});

// GET /api/projects/:projectId/frames/:filename
app.get("/api/projects/:projectId/frames/:filename", (req, res) => {
  const { projectId, filename } = req.params;
  // Generate a dynamic SVG frame resembling a cinematic manhwa comic panel
  const segIndex = filename.replace(/\D/g, "") || "1";
  const num = parseInt(segIndex, 10) || 1;
  const colors = [
    ["#1e1b4b", "#3b0764", "#030712"],
    ["#1c1917", "#450a0a", "#09090b"],
    ["#082f49", "#0f172a", "#020617"],
    ["#312e81", "#1e1b4b", "#09090b"],
    ["#14532d", "#052e16", "#022c22"]
  ];
  const color = colors[num % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color[0]}" />
        <stop offset="60%" stop-color="${color[1]}" />
        <stop offset="100%" stop-color="${color[2]}" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff6737" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.1" />
      </linearGradient>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="640" height="360" fill="url(#bg)" />
    <rect width="640" height="360" fill="url(#grid)" />
    <circle cx="480" cy="140" r="110" fill="url(#glow)" />
    <!-- Manhwa panel sketch line -->
    <path d="M 40 80 L 320 60 L 340 300 L 60 280 Z" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    <path d="M 330 90 L 600 70 L 580 320 L 350 310 Z" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
    <!-- Silhouette element -->
    <path d="M 180 280 C 180 230 195 200 215 170 C 225 150 245 150 255 170 C 275 200 290 230 290 280 Z" fill="#0b0c10" stroke="#ff6737" stroke-width="1.5" opacity="0.8"/>
    <!-- Status & timecode overlay -->
    <rect x="20" y="20" width="130" height="26" rx="6" fill="rgba(0,0,0,0.75)" stroke="#383d47" stroke-width="1"/>
    <text x="30" y="37" fill="#ff9a68" font-family="monospace" font-size="11" font-weight="bold">FRAME #${String(num).padStart(3, '0')}</text>
    <rect x="500" y="20" width="120" height="26" rx="6" fill="rgba(0,0,0,0.75)" stroke="#383d47" stroke-width="1"/>
    <text x="512" y="37" fill="#38d9a9" font-family="monospace" font-size="11" font-weight="bold">1080p · RAW</text>
    <!-- Watermark -->
    <text x="32" y="335" fill="rgba(255,255,255,0.4)" font-family="sans-serif" font-size="12" font-weight="bold" letter-spacing="2">MANHWA DUB STUDIO</text>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

// GET /api/projects/:projectId/audio/:segmentId
app.get("/api/projects/:projectId/audio/:segmentId", (req, res) => {
  // Generate a valid short PCM WAV audio buffer on the fly with pleasant vocal chime tone
  const duration = 2.0; // seconds
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // WAV header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  // Synthesize rich harmonic speech-like formant tone (F0 ~ 130Hz)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * t) / duration); // bell envelope
    const s1 = Math.sin(2 * Math.PI * 140 * t);
    const s2 = 0.5 * Math.sin(2 * Math.PI * 280 * t);
    const s3 = 0.25 * Math.sin(2 * Math.PI * 420 * t);
    const sampleVal = Math.floor((s1 + s2 + s3) * 0.3 * env * 32767);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sampleVal)), 44 + i * 2);
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "no-cache");
  res.send(buffer);
});

// Sample preview audio endpoint
app.get("/api/samples/:voiceId", (req, res) => {
  const duration = 2.5;
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * t) / duration);
    const val = Math.floor(Math.sin(2 * Math.PI * 180 * t) * 0.4 * env * 32767);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, val)), 44 + i * 2);
  }

  res.setHeader("Content-Type", "audio/wav");
  res.send(buffer);
});

// GET /api/projects/:projectId/script-pack
app.get("/api/projects/:projectId/script-pack", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const pack = {
    project_id: project.id,
    title: project.title,
    target_language: project.target_language,
    system_prompt: "Tu es un adaptateur et auteur de doublage français chevronné pour webtoons et manhwas. Réécris chaque segment pour qu'il soit percutant, immersif et respecte impérativement le budget de mots indiqué afin de synchroniser parfaitement la voix avec la vidéo originale.",
    segments: project.segments.map(s => ({
      id: s.id,
      index: s.index,
      video_start: s.video_start,
      video_end: s.video_end,
      original_duration: s.original_duration,
      word_budget: s.script_word_budget || Math.floor(s.original_duration * 2.2),
      source_transcript: s.transcript,
      rewritten_french_script: s.rewritten_text
    }))
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${project.id}_script_pack.json"`);
  res.send(JSON.stringify(pack, null, 2));
});

// POST /api/projects/:projectId/script
app.post("/api/projects/:projectId/script", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const payload = req.body;
  if (!payload || (!Array.isArray(payload) && !Array.isArray(payload.segments))) {
    return res.status(400).json({ error: "Format de script JSON invalide. Attendu un tableau ou { segments: [...] }" });
  }

  const incomingSegments = Array.isArray(payload) ? payload : payload.segments;
  let updatedCount = 0;

  incomingSegments.forEach((item: any) => {
    const existing = project.segments.find(s => s.id === item.id || s.index === item.index);
    if (existing) {
      existing.rewritten_text = item.rewritten_french_script || item.rewritten_text || existing.rewritten_text;
      updatedCount++;
    }
  });

  project.status = "script_ready";
  project.progress = Math.max(50, project.progress);
  project.updated_at = new Date().toISOString();

  res.json(project);
});

// POST /api/projects/:projectId/solve
app.post("/api/projects/:projectId/solve", (req, res) => {
  const project = storedProjects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  // Timeline solver adjusts small speech rate factors or pauses
  project.segments.forEach(s => {
    if (s.tts_duration) {
      const diff = s.tts_duration - s.original_duration;
      if (diff > 0.5) {
        // slight adjustment simulation
        s.tts_duration = Number(Math.max(s.original_duration, s.tts_duration - 0.4).toFixed(1));
      }
      const newDelta = Number((s.tts_duration - s.original_duration).toFixed(1));
      s.sync = {
        status: Math.abs(newDelta) <= 0.4 ? "ideal" : "tolerable",
        delta_seconds: newDelta,
        suggested_action: "Synchronisé par étirement temporel haute qualité WSOLA"
      };
    }
  });

  project.status = "review";
  project.progress = Math.max(85, project.progress);
  project.updated_at = new Date().toISOString();

  res.json(project);
});

// POST /api/projects/:projectId/cleanup
app.post("/api/projects/:projectId/cleanup", (req, res) => {
  res.json({
    removed: 14,
    freed_mb: 342.5,
    message: "Cache temporaire et trames intermédiaires purgés"
  });
});

// ---------------- VITE MIDDLEWARE & STATIC SERVING ----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Manhwa Dub Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
