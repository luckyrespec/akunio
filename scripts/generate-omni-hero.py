import base64
import io
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from PIL import Image

def load_env_file(filepath=".env"):
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"\'')
            if key not in os.environ:
                os.environ[key] = val

load_env_file()

def generate_omni_video(
    api_key: str,
    img_path: str,
    prompt: str,
    output_mp4_path: str
) -> bool:
    ctx = ssl.create_default_context()
    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    
    try:
        img = Image.open(img_path).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64_img = base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"Error opening image '{img_path}': {e}", file=sys.stderr)
        return False

    payload = {
        "model": "models/gemini-omni-flash-preview",
        "generation_config": {"thinking_level": "high"},
        "response_format": {"type": "video", "aspect_ratio": "16:9", "duration": "10s"},
        "input": [
            {"type": "text", "text": prompt + " No text, no titles, no subtitles, no overlays."},
            {"type": "image", "mime_type": "image/png", "data": b64_img}
        ]
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key
        }
    )
    
    print(f"Sending video generation request to Gemini Omni Flash for '{img_path}'...")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=300) as response:
            res = json.loads(response.read().decode("utf-8"))
            for step in res.get("steps", []):
                for item in step.get("content", []):
                    if item.get("type") == "video" or "video" in str(item.get("mime_type")):
                        os.makedirs(os.path.dirname(output_mp4_path) or ".", exist_ok=True)
                        with open(output_mp4_path, "wb") as f:
                            f.write(base64.b64decode(item["data"]))
                        print(f"Success! Video saved to '{output_mp4_path}'.")
                        return True
            print("No video data found in response payload:", json.dumps(res)[:300], file=sys.stderr)
            return False
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"API HTTP Error {e.code} ({e.reason}): {error_body}", file=sys.stderr)
        return False
    except urllib.error.URLError as e:
        print(f"Network / URL Error: {e.reason}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Unexpected error during video generation: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    api_key = os.environ.get("GEMINI_API_KEY", "").strip('"\'' )
    if not api_key:
        print("GEMINI_API_KEY is not set in environment or .env!", file=sys.stderr)
        sys.exit(1)
        
    img_path = "public/assets/hero_ref.png"
    output_path = "public/assets/hero.mp4"
    prompt = (
        "Smooth continuous editorial paper-matte cartoon animation showing an Indonesian merchant smiling at his desk. "
        "The loose crumpled paper receipts gently glide and organize themselves into a neat open ledger book with green balance marks. "
        "Camera slowly zooms out showing the approved bank credit document glowing with success. "
        "Warm paper texture, terracotta and deep green colors, crisp ink outlines."
    )
    
    success = generate_omni_video(api_key, img_path, prompt, output_path)
    if not success:
        sys.exit(1)
