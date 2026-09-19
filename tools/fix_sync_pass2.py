from fix_sync_pass import BASE, call


FIXES = {
    "seg_0044": "Shu décide donc de commencer par ce salaud et se dirige immédiatement vers son bureau.",
    "seg_0058": "En sang, il jure ne posséder aucun pistolet.",
    "seg_0072": "Shu tire !",
    "seg_0080": "Pour Shu, ce camion serait très utile.",
    "seg_0120": "Comment t'appelles-tu ?",
    "seg_0137": "Soudain, une voix les interrompt.",
    "seg_0159": "Ai appelle alors Shu.",
}


for index, (segment_id, text) in enumerate(FIXES.items(), 1):
    call(f"{BASE}/segments/{segment_id}", "PATCH", {"rewritten_text": text})
    result = call(f"{BASE}/segments/{segment_id}/tts", "POST")
    print({"done": index, "id": segment_id, "duration": result["tts_duration"], "sync": result["sync"]["status"]}, flush=True)
