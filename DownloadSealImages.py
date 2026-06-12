import os
import json
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import urlparse
from time import sleep

# Constants
API_KEY = "c374ba941ac645ddaa8818ee93ef425a"
COLLECTION_SLUG = "sappy-seals"
CONTRACT_ADDRESS = "0x364C828eE171616a39897688A831c2499aD972ec"
CHAIN = "ethereum"
OUTPUT_DIR = os.path.expanduser("~/Pictures/sappy_tiles")

RESIZE_TO = (40, 40)  # Size suitable for mosaic use
TOTAL_SEALS = 9999

os.makedirs(OUTPUT_DIR, exist_ok=True)

headers = {
    "accept": "application/json",
    "x-api-key": API_KEY
}

# Check which IDs already exist to resume
existing_ids = {
    int(f.split('.')[0])
    for f in os.listdir(OUTPUT_DIR)
    if f.endswith('.png') and f.split('.')[0].isdigit()
}

# Download loop with resume and error handling
downloaded = 0
for seal_id in range(1, TOTAL_SEALS + 1):
    if seal_id in existing_ids:
        continue

    url = f"https://api.opensea.io/api/v2/chain/{CHAIN}/contract/{CONTRACT_ADDRESS}/nfts/{seal_id}"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        nft_data = response.json().get("nft")
        if not nft_data:
            print(f"[{seal_id}] No NFT data.")
            continue

        image_url = nft_data.get("image_url") or nft_data.get("display_image_url")
        if not image_url:
            print(f"[{seal_id}] No image URL found.")
            continue

        img_response = requests.get(image_url, stream=True)
        img_response.raise_for_status()
        img = Image.open(BytesIO(img_response.content)).convert("RGBA")
        img = img.resize(RESIZE_TO, Image.LANCZOS)

        file_path = os.path.join(OUTPUT_DIR, f"{seal_id:04d}.png")
        img.save(file_path, format="PNG")
        downloaded += 1

        if seal_id % 100 == 0:
            print(f"Downloaded {downloaded} seals so far...")

        sleep(0.2)  # Rate limit safety buffer

    except Exception as e:
        print(f"[{seal_id}] Error: {e}")
        sleep(1)  # Back off in case of API hiccup

downloaded
