import http.server
import socketserver
import json
import asyncio
import edge_tts
import re
import os

PORT = int(os.environ.get("PORT", 3000))

# 7 Voice Personas: Pitch (strictly Hz), Rate (%), Volume (%)
PERSONA_CONFIGS = {
    "influencer": {
        "female": {
            "normal":  {"rate": "+10%", "pitch": "+20Hz", "volume": "+15%"},
            "bracket": {"rate": "+18%", "pitch": "+35Hz", "volume": "+25%"}
        },
        "male": {
            "normal":  {"rate": "+8%",  "pitch": "+15Hz", "volume": "+15%"},
            "bracket": {"rate": "+16%", "pitch": "+28Hz", "volume": "+25%"}
        }
    },
    "presenter": {
        "female": {
            "normal":  {"rate": "-1%", "pitch": "+0Hz", "volume": "+0%"},
            "bracket": {"rate": "+6%", "pitch": "+12Hz", "volume": "+10%"}
        },
        "male": {
            "normal":  {"rate": "-1%", "pitch": "-4Hz", "volume": "+0%"},
            "bracket": {"rate": "+5%", "pitch": "+8Hz", "volume": "+10%"}
        }
    },
    "vlogger": {
        "female": {
            "normal":  {"rate": "+4%", "pitch": "+8Hz",  "volume": "+8%"},
            "bracket": {"rate": "+12%", "pitch": "+20Hz", "volume": "+18%"}
        },
        "male": {
            "normal":  {"rate": "+3%", "pitch": "+5Hz",  "volume": "+8%"},
            "bracket": {"rate": "+10%", "pitch": "+16Hz", "volume": "+18%"}
        }
    },
    "sport": {
        "female": {
            "normal":  {"rate": "+22%", "pitch": "+25Hz", "volume": "+30%"},
            "bracket": {"rate": "+32%", "pitch": "+45Hz", "volume": "+40%"}
        },
        "male": {
            "normal":  {"rate": "+20%", "pitch": "+20Hz", "volume": "+30%"},
            "bracket": {"rate": "+30%", "pitch": "+40Hz", "volume": "+40%"}
        }
    },
    "trainer": {
        "female": {
            "normal":  {"rate": "+3%", "pitch": "-6Hz",  "volume": "+20%"},
            "bracket": {"rate": "+8%", "pitch": "+10Hz", "volume": "+28%"}
        },
        "male": {
            "normal":  {"rate": "+3%", "pitch": "-10Hz", "volume": "+20%"},
            "bracket": {"rate": "+8%", "pitch": "+8Hz",  "volume": "+28%"}
        }
    },
    "poem": {
        "female": {
            "normal":  {"rate": "-14%", "pitch": "-12Hz", "volume": "-10%"},
            "bracket": {"rate": "-20%", "pitch": "-22Hz", "volume": "-18%"}
        },
        "male": {
            "normal":  {"rate": "-16%", "pitch": "-16Hz", "volume": "-10%"},
            "bracket": {"rate": "-22%", "pitch": "-26Hz", "volume": "-18%"}
        }
    },
    "horror": {
        "female": {
            "normal":  {"rate": "-18%", "pitch": "-28Hz", "volume": "-30%"},
            "bracket": {"rate": "-26%", "pitch": "-40Hz", "volume": "-45%"}
        },
        "male": {
            "normal":  {"rate": "-20%", "pitch": "-32Hz", "volume": "-30%"},
            "bracket": {"rate": "-28%", "pitch": "-45Hz", "volume": "-45%"}
        }
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

def format_clean_text(text, persona):
    if not text:
        return ""

    for pattern, replacement in TECH_WORDS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    def convert_digits(match):
        digits = match.group(0)
        return "".join([BURMESE_NUMBERS.get(d, d) for d in digits]) + " "
    text = re.sub(r'\d+', convert_digits, text)

    # Cadence rhythm mapping
    if persona == "horror":
        text = re.sub(r'။\s*', '။ \n\n\n ', text)
        text = re.sub(r'၊\s*', '၊ \n ', text)
    elif persona == "sport":
        text = re.sub(r'။\s*', '။ \n ', text)
        text = re.sub(r'၊\s*', ' ', text)
    elif persona == "poem":
        text = re.sub(r'။\s*', '။ \n\n ', text)
    else:
        text = re.sub(r'။\s*', '။ \n\n ', text)

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

            bracket_pattern = r'([\(（][^()（）]+[\)）])'
            parts = re.split(bracket_pattern, raw_text)

            async def generate_speech_parts():
                final_audio = bytearray()
                for part in parts:
                    if not part or not part.strip():
                        continue

                    is_bracket = (part.startswith("(") and part.endswith(")")) or \
                                 (part.startswith("（") and part.endswith("）"))

                    target_text = part[1:-1] if is_bracket else part
                    clean_part = format_clean_text(target_text, persona)

                    if not clean_part:
                        continue

                    config = active_persona["bracket"] if is_bracket else active_persona["normal"]

                    communicate = edge_tts.Communicate(
                        text=clean_part,
                        voice=voice_name,
                        rate=config["rate"],
                        pitch=config["pitch"],
                        volume=config["volume"]
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

# Multi-threaded server for concurrent user requests
class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

print(f"--- Myanmar AI Voice Studio Running on Port {PORT} ---")
with ThreadedHTTPServer(("", PORT), StudioTTSHandler) as httpd:
    httpd.serve_forever()