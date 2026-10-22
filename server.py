import http.server
import socketserver
import json
import asyncio
import edge_tts
import re
import os

# Render ပေါ်ရောက်ရင် ပေးမည့် Port ကို အလိုအလျောက် ယူရန်
PORT = int(os.environ.get("PORT", 3000))

# သဘာဝကျသော လူစကားပြောဟန်အတွက် Pitch နှင့် Rate ကို အချိုးကျ ညှိထားခြင်း
VOICE_STYLES = {
    "female": {
        "voice": "my-MM-NilarNeural",
        "normal":  {"rate": "-2%", "pitch": "+0Hz"},
        "excited": {"rate": "+6%",  "pitch": "+10Hz"}  # အသံမပြဲဘဲ ချိုသာဆွဲဆောင်သော လေသံ
    },
    "male": {
        "voice": "my-MM-ThihaNeural",
        "normal":  {"rate": "-2%", "pitch": "-1Hz"},
        "excited": {"rate": "+5%",  "pitch": "+8Hz"}   # ယောက်ျားလေးအသံ မပျက်ဘဲ ပိုမိုအားပါတက်ကြွသော အသံ
    }
}

BURMESE_NUMBERS = {
    '0': ' သုည ', '1': ' တစ် ', '2': ' နှစ် ', '3': ' သုံး ', '4': ' လေး ',
    '5': ' ငါး ', '6': ' ခြောက် ', '7': ' ခုနစ် ', '8': ' ရှစ် ', '9': ' ကိုး '
}

TECH_WORDS = [
    (r'vibe', 'ဗိုက်ဘ်'),
    (r'bagan', 'ပုဂံ'),
    (r'keyboard', 'ကီးဘုတ်'),
    (r'application', 'အက်ပလီကေးရှင်း'),
    (r'app', 'အက်ပ်'),
    (r'facebook', 'ဖေ့စ်ဘွတ်ခ်'),
    (r'chat box', 'ချက်ဘောက်စ်'),
    (r'setting(s)?', 'ဆက်တင်'),
]

def format_clean_text(text):
    for pattern, replacement in TECH_WORDS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    def convert_digits(match):
        digits = match.group(0)
        return "".join([BURMESE_NUMBERS.get(d, d) + "၊ " for d in digits])
    text = re.sub(r'\d+', convert_digits, text)

    # ပုဒ်မ '။' တိုင်းတွင် သဘာဝအတိုင်း အသက်ရှူရပ်နားရန်
    text = re.sub(r'။\s*', '။ \n\n ', text)
    text = re.sub(r'[<>{}\[\]_\\/&"\']', ' ', text)
    return text.strip()

class NaturalExpressiveTTSHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/tts':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            req_json = json.loads(post_data.decode('utf-8'))
            
            raw_text = req_json.get('text', '')
            selected_voice = req_json.get('voiceProfile', 'female')
            
            gender = "male" if ("male" in selected_voice.lower() and "fe" not in selected_voice.lower()) else "female"
            v_config = VOICE_STYLES[gender]

            # စာသားများကို () ရော （） ပါ ကွင်းစကွင်းပိတ်များအလိုက် အပိုင်းခွဲထုတ်ခြင်း
            bracket_pattern = r'([\(（][^()（）]+[\)）])'
            parts = re.split(bracket_pattern, raw_text)

            async def generate_speech_parts():
                final_audio = bytearray()

                for part in parts:
                    if not part or part.strip() == "":
                        continue

                    is_bracket = (part.startswith("(") and part.endswith(")")) or (part.startswith("（") and part.endswith("）"))

                    # ၁။ () ကွင်းစကွင်းပိတ် စာသားဖြစ်ပါက -> သဘာဝကျကျ အသံအားပါတက်ကြွသော စကားပြောသံ
                    if is_bracket:
                        clean_sub = format_clean_text(part[1:-1])
                        if not clean_sub:
                            continue
                        communicate = edge_tts.Communicate(
                            text=clean_sub,
                            voice=v_config["voice"],
                            rate=v_config["excited"]["rate"],
                            pitch=v_config["excited"]["pitch"]
                        )
                    # ၂။ သာမန်စာသား ဖြစ်ပါက -> ပုံမှန် ချိုသာအေးဆေးသော အသံ
                    else:
                        clean_sub = format_clean_text(part)
                        if not clean_sub:
                            continue
                        communicate = edge_tts.Communicate(
                            text=clean_sub,
                            voice=v_config["voice"],
                            rate=v_config["normal"]["rate"],
                            pitch=v_config["normal"]["pitch"]
                        )

                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            final_audio.extend(chunk["data"])

                return final_audio

            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result_audio = loop.run_until_complete(generate_speech_parts())
                loop.close()

                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(result_audio)

            except Exception as e:
                print("TTS Error:", e)
                self.send_response(500)
                self.end_headers()
            return

        super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

print(f"--- Myanmar Natural Expressive AI Studio Running on Port {PORT} ---")
with socketserver.TCPServer(("", PORT), NaturalExpressiveTTSHandler) as httpd:
    httpd.serve_forever()