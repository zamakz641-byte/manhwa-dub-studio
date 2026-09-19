from __future__ import annotations

import json
import urllib.request


BASE = "http://127.0.0.1:8765/api/projects/apocalypse-revenge-test-10-minutes-29d1a0"
FIXES = {
    "seg_0004": "Avec ses souvenirs du futur et un pouvoir capable d'évoluer, Shu refuse de survivre comme avant. Désormais, il veut devenir assez puissant pour écraser ses ennemis.",
    "seg_0013": "Arme en main, Shu les avertit : cette porte ne tiendra plus longtemps. Les coups redoublent déjà de l'autre côté.",
    "seg_0020": "Kawakita révèle enfin sa jalousie. Shu est beaucoup trop puissant : tant qu'il restera vivant, Kawakita ne pourra jamais gravir les rangs ni prendre le commandement du groupe.",
    "seg_0022": "Une seconde balle frappe Shu en pleine poitrine. Il traite Kawakita de traître, mais derrière lui, la horde approche déjà, prête à le dévorer.",
    "seg_0026": "Shu se réveille, désorienté.",
    "seg_0031": "Le système lui explique la règle : chaque zombie éliminé peut lui offrir une capacité différente. En l'équipant, Shu augmentera directement sa puissance et deviendra toujours plus redoutable.",
    "seg_0039": "Priorité : trouver une arme.",
    "seg_0042": "Le directeur s'entourait d'étudiantes et livrait aux zombies tous ceux qui osaient lui résister. Sous son règne, personne n'était en sécurité.",
    "seg_0044": "Shu décide donc de commencer par ce salaud et marche droit vers son bureau.",
    "seg_0045": "Devant la porte, Shu entend le directeur marchander avec une élève. Notes parfaites, lettre de recommandation et bourse : il lui promet tout, à condition qu'elle devienne sa maîtresse.",
    "seg_0050": "Il s'avance malgré ses supplications. Elle lui ordonne de reculer, mais cette ordure insiste : selon lui, elle devrait simplement arrêter de résister et se soumettre.",
    "seg_0051": "Shu défonce la porte.",
    "seg_0058": "En sang, il nie avoir un pistolet.",
    "seg_0062": "Il fouille l'étagère et trouve son objectif.",
    "seg_0072": "Feu !",
    "seg_0074": "Les deux gardes s'enfuient.",
    "seg_0076": "Le directeur supplie Shu d'attendre. Pour se sauver, il accuse soudain l'étudiante de l'avoir volontairement séduit.",
    "seg_0078": "En larmes, elle nie tout. Elle préférerait abandonner ses études et conduire le camion de sa mère plutôt que rester une seconde de plus avec une ordure pareille.",
    "seg_0080": "Ce camion pourrait être utile.",
    "seg_0083": "Le directeur imagine qu'ils vont prévenir la police. Pris de panique, il comprend qu'il doit absolument les empêcher de quitter l'école.",
    "seg_0090": "Couverte de sang, elle raconte que plusieurs élèves ont soudain perdu la raison et se sont mis à mordre les autres. Puis elle avoue avoir elle-même été mordue.",
    "seg_0091": "La morsure est visible.",
    "seg_0095": "La femme s'approche encore. Shu la met aussitôt en joue et lui ordonne de rester loin d'eux avant qu'il ne soit trop tard.",
    "seg_0109": "Une fois équipée, Tir précis garantit un coup fatal à chaque quatrième balle tirée au pistolet, quelle que soit la résistance de son ennemi.",
    "seg_0114": "Mais il ne reste que six balles, et Tir précis ne s'activera qu'une fois tous les quatre coups.",
    "seg_0120": "Ton nom ?",
    "seg_0137": "Une voix les interrompt.",
    "seg_0158": "Ils jurent alors de le mettre en pièces.",
    "seg_0159": "Ai appelle Shu.",
}


def call(url: str, method: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=900) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    for index, (segment_id, text) in enumerate(FIXES.items(), 1):
        call(f"{BASE}/segments/{segment_id}", "PATCH", {"rewritten_text": text})
        result = call(f"{BASE}/segments/{segment_id}/tts", "POST")
        print(json.dumps({"done": index, "total": len(FIXES), "id": segment_id, "duration": result["tts_duration"], "sync": result["sync"]["status"]}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
