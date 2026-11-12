import http.server
import socketserver
import json
import asyncio
import edge_tts
import re
import os

PORT = int(os.environ.get("PORT", 3000))

# 7 Voice Personas Configuration (Base Pitch & Rate + Bracket Pitch & Rate)
PERSONA_CONFIGS = {
    "influencer": {
        "female": {"normal": {"rate": "+8%", "pitch": "+3Hz"}, "bracket": {"rate": "+16%", "pitch": "+8Hz"}},
        "male":   {"normal": {"rate": "+6%", "pitch": "+2Hz"}, "bracket": {"rate": "+14%", "pitch": "+6Hz"}}
    },
    "presenter": {
        "female": {"normal": {"rate": "-1%", "pitch": "+0Hz"}, "bracket": {"rate": "+5%", "pitch": "+4Hz"}},
        "male":   {"normal": {"rate": "-1%", "pitch": "-1Hz"}, "bracket": {"rate": "+4%", "pitch": "+3Hz"}}
    },
    "vlogger": {
        "female": {"normal": {"rate": "+3%", "pitch": "+2Hz"}, "bracket": {"rate": "+10%", "pitch": "+6Hz"}},
        "male":   {"normal": {"rate": "+2%", "pitch": "+0Hz"}, "bracket": {"rate": "+8%", "pitch": "+5Hz"}}
    },
    "sport": {
        "female": {"normal": {"rate": "+18%", "pitch": "+6Hz"}, "bracket": {"rate": "+28%", "pitch": "+14Hz"}},
        "male":   {"normal": {"rate": "+18%", "pitch": "+4Hz"}, "bracket": {"rate": "+26%", "pitch": "+12Hz"}}
    },
    "trainer": {
        "female": {"normal": {"rate": "+3%", "pitch": "-1Hz"}, "bracket": {"rate": "+8%", "pitch": "+4Hz"}},
        "male":   {"normal": {"rate": "+3%", "pitch": "-3Hz"}, "bracket": {"rate": "+8%", "pitch": "+2Hz"}}
    },
    "poem": {
        "female": {"normal": {"rate": "-12%", "pitch": "-2Hz"}, "bracket": {"rate": "-18%", "pitch": "-4Hz"}},
        "male":   {"normal": {"rate": "-14%", "pitch": "-4Hz"}, "bracket": {"rate": "-20%", "pitch": "-6Hz"}}
    },
    "horror": {
        "female": {"normal": {"rate": "-15%", "pitch": "-6Hz"}, "bracket": {"rate": "-22%", "pitch": "-10Hz"}},
        "male":   {"normal": {"rate": "-18%", "pitch": "-8Hz"}, "bracket": {"rate": "-25%", "pitch": "-12Hz"}}
    }
}

BURMESE_NUMBERS = {
    '0': ' သုည ', '1': ' တစ် ', '2': ' နှစ် ', '3': ' သုံး ', '4': ' လေး ',
    '5': ' ငါး ', '6': ' ခြောက် ', '7': ' ခုနစ် ', '8': ' ရှစ် ', '9': ' ကိုး '
}

TECH_WORDS = [
    (r'\bvibe\b', 'ဗိုက်ဘ်'),
    (r'\bbagan\b', 'ပုဂံ'),
    (r'\bkeyboard\b', 'ကီးဘုတ်'),
    (r'\bapplication\b', 'အက်ပလီကေးရှင်း'),
    (r'\bapp\b', 'အက်ပ်'),
    (r'\bfacebook\b', 'ဖေ့စ်ဘွတ်ခ်'),
    (r'\bchat\s*box\b', 'ချက်ဘောက်စ်'),
    (r'\bsettings?\b', 'ဆက်တင်'),
    (r'\btiktok\b', 'တစ်တော့ခ်'),
    (r'\byoutube\b', 'ယူကျု'),
    (r'\bpage\b', 'ပေ့ခ်ျ')
]

def format_clean_text(text):
    if not text:
        return ""
    
    # 1. Phonetics / Loanwords mapping
    for pattern, replacement in TECH_WORDS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    # 2. Pronounce digits individually without unnatural pauses
    def convert_digits(match):
        digits = match.group(0)
        return "".join([BURMESE_NUMBERS.get(d, d) for d in digits]) + " "
    text = re.sub(r'\d+', convert_digits, text)

    # 3. Handle Natural sentence endings
    text = re.sub(r'။\s*', '။ \n\n ', text)
    
    # 4. Remove dangerous symbols that cause edge-tts crashes or speech leak
    text = re.sub(r'[<>{}\[\]_\\/&"\']', ' ', text)
    return text.strip()

class StudioTTSHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/tts':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                req_json = json.loads(post_data.decode('utf-8'))
            except Exception:
                self.send_error_response(400, "Invalid JSON body")
                return

            raw_text = req_json.get('text', '').strip()
            gender = req_json.get('gender', 'female').lower()
            persona = req_json.get('persona', 'presenter').lower()

            if not raw_text:
                self.send_error_response(400, "Text is empty")
                return

            if gender not in ["female", "male"]:
                gender = "female"
            if persona not in PERSONA_CONFIGS:
                persona = "presenter"

            voice_name = "my-MM-NilarNeural" if gender == "female" else "my-MM-ThihaNeural"
            active_persona = PERSONA_CONFIGS[persona][gender]

            # Split text by ( ... ) and （ ... ）
            bracket_pattern = r'([\(（][^()（）]+[\)）])'
            parts = re.split(bracket_pattern, raw_text)

            async def generate_speech_parts():
                final_audio = bytearray()
                for part in parts:
                    if not part or not part.strip():
                        continue

                    is_bracket = (part.startswith("(") and part.endswith(")")) or \
                                 (part.startswith("（") and part.endswith("）"))

                    if is_bracket:
                        clean_part = format_clean_text(part[1:-1])
                        rate = active_persona["bracket"]["rate"]
                        pitch = active_persona["bracket"]["pitch"]
                    else:
                        clean_part = format_clean_text(part)
                        rate = active_persona["normal"]["rate"]
                        pitch = active_persona["normal"]["pitch"]

                    if not clean_part:
                        continue

                    communicate = edge_tts.Communicate(
                        text=clean_part,
                        voice=voice_name,
                        rate=rate,
                        pitch=pitch
                    )

                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            final_audio.extend(chunk["data"])

                return final_audio

            try:
                result_audio = asyncio.run(generate_speech_parts())

                if not result_audio:
                    self.send_error_response(500, "No audio generated")
                    return

                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(len(result_audio)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(result_audio)

            except Exception as e:
                print("TTS Backend Error:", e)
                self.send_error_response(500, str(e))
            return

        super().do_POST()

    def send_error_response(self, code, msg):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

print(f"--- Myanmar AI Voice Studio Running on Port {PORT} ---")
with socketserver.TCPServer(("", PORT), StudioTTSHandler) as httpd:
    httpd.serve_forever()